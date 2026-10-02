// Downloads the cassette tarball published by manza-ruby's release
// workflow. CI calls this before running tests so we don't have to
// commit cassettes into both repos.
//
//   bun scripts/fetch-cassettes.ts            # pinned release (PINNED_TAG)
//   bun scripts/fetch-cassettes.ts v1.0.0      # specific tag
//
// Cassettes land under test/fixtures/cassettes/.

import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { x as extractTar } from "tar";

const REPO = "getmanza/manza-ruby";
// Pinned so a new manza-ruby release cannot break every SDK's CI at once.
const PINNED_TAG = "v1.0.0";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEST = join(ROOT, "test/fixtures/cassettes");

const tag = process.argv[2] ?? PINNED_TAG;
const tarUrl = `https://github.com/${REPO}/releases/download/${tag}/cassettes-${tag}.tar.gz`;

console.log(`Fetching cassettes from ${tarUrl}`);

const headers: Record<string, string> = { Accept: "application/octet-stream" };
if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;

// GitHub's API weathers occasional 503 storms — retry rather than fail a CI run.
async function fetchWithRetry(url: string, init: RequestInit, attempts = 8): Promise<Response> {
  let last: Response | undefined;
  for (let i = 0; i < attempts; i++) {
    try {
      last = await fetch(url, init);
      if (last.ok) return last;
    } catch {
      // network error — fall through to retry
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  if (last) return last;
  throw new Error(`fetch failed after ${attempts} attempts: ${url}`);
}

const res = await fetchWithRetry(tarUrl, { headers });
if (!res.ok) {
  console.error(`Failed: ${res.status} ${res.statusText} (set GH_TOKEN if manza-ruby is private)`);
  process.exit(1);
}

const tarPath = join(tmpdir(), `manza-cassettes-${tag}.tar.gz`);
const buf = new Uint8Array(await res.arrayBuffer());
await writeFile(tarPath, buf);

await mkdir(DEST, { recursive: true });
await extractTar({ file: tarPath, cwd: dirname(DEST), strip: 0 });

console.log(`Cassettes extracted to ${DEST}`);
