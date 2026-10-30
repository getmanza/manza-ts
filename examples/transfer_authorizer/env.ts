import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ENV_FILE = join(HERE, ".env");

// Loads .env from this directory, whatever the working directory (Node
// 20.12+ and Bun). The file wins over the shell, like Ruby's
// Dotenv.overload: a stale exported key must not mask the one in .env.
export function loadEnv(path: string = ENV_FILE): void {
  if (!existsSync(path)) return;
  Object.assign(process.env, parseEnv(readFileSync(path, "utf8")));
}
