// MANZA_* environment lookup with a ZAZU_* fallback for all of 1.x.
// The fallback warns once per legacy variable per process.

// Shared through globalThis so the ESM and CJS builds, if both get loaded,
// still warn only once per variable.
const WARNED = Symbol.for("@getmanza/sdk.warnedLegacyEnv");
const store = globalThis as typeof globalThis & { [WARNED]?: Set<string> };
store[WARNED] ??= new Set<string>();
const warned = store[WARNED];

function rawEnv(name: string): string | undefined {
  // process.env on Node/Bun. Browsers don't have it — callers there must
  // pass options explicitly.
  if (typeof process !== "undefined" && process.env) return process.env[name];
  return undefined;
}

export function readEnv(name: string): string | undefined {
  const value = rawEnv(`MANZA_${name}`);
  if (value !== undefined) return value;

  const legacy = `ZAZU_${name}`;
  const legacyValue = rawEnv(legacy);
  if (legacyValue !== undefined && !warned.has(legacy)) {
    warned.add(legacy);
    console.warn(
      `[manza] ${legacy} is deprecated and will be removed in 2.0. Use MANZA_${name} instead.`,
    );
  }
  return legacyValue;
}

// Test hook: forget which deprecation warnings were already emitted.
export function resetDeprecationWarnings(): void {
  warned.clear();
}
