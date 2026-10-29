// Your own record of the transfers you created, keyed by the
// client_reference you generated. A JSON file, so the creator
// (create_transfer.ts) and the authorizer (server.ts) can run as two
// processes. Swap it for your database in production.
//
//   { "po_8812": { "payment_id": "...", "amount": "2500.0",
//                  "currency_code": "MAD", "account_id": "...",
//                  "payee": "ext:..." } }

import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs";

export interface LedgerEntry {
  payment_id: string;
  amount: string;
  currency_code: string;
  account_id: string;
  payee: string;
}

const LOCK_TIMEOUT_MS = 5_000;

export class Ledger {
  readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  // Serializes writers on a separate lock file, writes the new ledger to a
  // temporary file and renames it over the old one: a reader sees the old
  // or the new ledger, never a half-written one, and a crash mid-write
  // leaves the old ledger intact.
  record(clientReference: string, entry: LedgerEntry): LedgerEntry {
    const unlock = this.#lock();
    try {
      const entries = this.#read();
      entries[clientReference] = entry;
      const tmp = `${this.path}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(entries, null, 2), { mode: 0o600 });
      renameSync(tmp, this.path);
    } finally {
      unlock();
    }
    return entry;
  }

  // The entry for `clientReference`, or null.
  find(clientReference: string): LedgerEntry | null {
    return this.#read()[clientReference] ?? null;
  }

  #read(): Record<string, LedgerEntry> {
    if (!existsSync(this.path)) return {};
    const json = readFileSync(this.path, "utf8");
    return json.trim() === "" ? {} : (JSON.parse(json) as Record<string, LedgerEntry>);
  }

  // Node has no flock: creating the lock file exclusively ("wx") is the
  // lock, and it holds the writer's pid so a lock left by a process that
  // died is taken over instead of blocking every later run.
  #lock(): () => void {
    const lock = `${this.path}.lock`;
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    for (;;) {
      try {
        const fd = openSync(lock, "wx", 0o600);
        writeSync(fd, String(process.pid));
        closeSync(fd);
        return () => rmSync(lock, { force: true });
      } catch (err) {
        if ((err as { code?: string }).code !== "EEXIST") throw err;
        const holder = lockHolder(lock);
        // Re-read just before removing: another run may have taken the
        // stale lock over already, and its lock must survive.
        if (holder !== null && !alive(holder) && lockHolder(lock) === holder) {
          rmSync(lock, { force: true });
          continue;
        }
        if (Date.now() >= deadline) {
          throw new Error(`${lock} is still held: delete it if no create_transfer.ts is running`);
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
      }
    }
  }
}

// The pid in the lock file, or null while it is being written or gone.
function lockHolder(lock: string): number | null {
  try {
    const pid = Number.parseInt(readFileSync(lock, "utf8"), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as { code?: string }).code === "EPERM";
  }
}
