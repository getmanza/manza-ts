// Your own record of the transfers you created, keyed by the
// client_reference you generated. A JSON file, so the creator
// (create_transfer.ts) and the authorizer (server.ts) can run as two
// processes. Swap it for your database in production.
//
//   { "po_8812": { "payment_id": "...", "amount": "2500.0",
//                  "currency_code": "MAD", "account_id": "...",
//                  "payee": "ext:..." } }

import { existsSync, linkSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";

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

  // Node has no flock, so the lock is a file naming its holder's pid:
  // - acquire: write the pid to a private file, then link() it to the lock
  //   name. link fails when the lock exists, and the lock never exists
  //   without a pid in it.
  // - a dead holder's lock is taken over by renaming it aside (atomic: of
  //   two waiters, one rename wins and the other finds nothing to move). A
  //   lock that turns out to name someone else is linked back.
  #lock(): () => void {
    const lock = `${this.path}.lock`;
    const mine = `${lock}.${process.pid}`;
    writeFileSync(mine, String(process.pid), { mode: 0o600 });
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    try {
      for (;;) {
        try {
          linkSync(mine, lock);
          return () => rmSync(lock, { force: true });
        } catch (err) {
          if ((err as { code?: string }).code !== "EEXIST") throw err;
        }
        const holder = lockHolder(lock);
        if (holder !== null && !alive(holder)) {
          takeOver(lock, holder);
          continue;
        }
        if (Date.now() >= deadline) {
          throw new Error(`${lock} is still held: delete it if no create_transfer.ts is running`);
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
      }
    } finally {
      rmSync(mine, { force: true });
    }
  }
}

function takeOver(lock: string, deadHolder: number): void {
  const aside = `${lock}.stale.${process.pid}`;
  try {
    renameSync(lock, aside);
  } catch {
    return; // another waiter moved it first
  }
  if (lockHolder(aside) !== deadHolder) {
    // A live holder replaced the stale lock in between: put it back.
    try {
      linkSync(aside, lock);
    } catch {
      // A third run already took the free name; it holds the lock now.
    }
  }
  rmSync(aside, { force: true });
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
