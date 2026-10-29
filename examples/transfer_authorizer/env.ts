import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ENV_FILE = join(HERE, ".env");

// Loads .env from this directory, whatever the working directory (Node
// 20.12+ and Bun). A variable already set in the shell wins.
export function loadEnv(): void {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
}
