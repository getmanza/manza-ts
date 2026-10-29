// The authorizer process (key B), on node:http: no framework, runs on Bun
// and Node.
//
//   bun server.ts            # or, on Node: npx tsx server.ts
//
// Listens on PORT (default 4599); point your tunnel at it.

import { createServer } from "node:http";
import { join } from "node:path";
import { createAuthorizer } from "./authorizer.js";
import { ENV_FILE, HERE, loadEnv } from "./env.js";
import { Ledger } from "./ledger.js";
import { Manza } from "./sdk.js";

loadEnv();

const missing = ["MANZA_AUTHORIZER_API_KEY", "MANZA_AUTHORIZER_SECRET"].filter(
  (name) => !process.env[name],
);
if (missing.length > 0) {
  console.error(`Set ${missing.join(" and ")} in ${ENV_FILE}`);
  process.exit(1);
}

const handle = createAuthorizer({
  client: new Manza({ apiKey: process.env.MANZA_AUTHORIZER_API_KEY }),
  secret: process.env.MANZA_AUTHORIZER_SECRET ?? "",
  ledger: new Ledger(join(HERE, "ledger.json")),
  allowNewPayees: !["false", "0", "no"].includes(
    (process.env.ALLOW_NEW_PAYEES ?? "true").trim().toLowerCase(),
  ),
});

const port = Number(process.env.PORT || 4599);
const MAX_BODY_BYTES = 1024 * 1024;

createServer((req, res) => {
  // The signature covers the raw bytes: read the body as is, never re-serialize it.
  // Capped: anyone can reach the tunnel, and a webhook is a few kilobytes.
  const chunks: Buffer[] = [];
  let size = 0;
  req.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      res.writeHead(413, { "content-type": "text/plain", connection: "close" }).end("too large");
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => {
    handle(Buffer.concat(chunks).toString("utf8"), req.headers)
      .then(({ status, body }) => res.writeHead(status, { "content-type": "text/plain" }).end(body))
      .catch((err: unknown) => {
        console.error(err);
        res.writeHead(500, { "content-type": "text/plain" }).end("error");
      });
  });
  // Loopback only: the tunnel connects locally, nothing else should reach it.
}).listen(port, "127.0.0.1", () => console.log(`authorizer listening on http://127.0.0.1:${port}`));
