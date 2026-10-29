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

  // Node has no flock: creating the lock file exclusively ("wx") is the lock.
  #lock(): () => void {
    const lock = `${this.path}.lock`;
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    for (;;) {
      try {
        closeSync(openSync(lock, "wx", 0o600));
        return () => rmSync(lock, { force: true });
      } catch (err) {
        if ((err as { code?: string }).code !== "EEXIST") throw err;
        if (Date.now() >= deadline) {
          throw new Error(`${lock} is still held: delete it if no create_transfer.ts is running`);
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
      }
    }
  }
}
