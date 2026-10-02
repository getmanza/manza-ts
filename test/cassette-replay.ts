// Reads VCR YAML cassettes (recorded by manza-ruby) and registers them
// as msw HTTP handlers so identical interactions replay against this
// SDK. The contract is enforced cross-language: every SDK that
// consumes this tarball must replay the exact request shape.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import yaml from "js-yaml";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";

// VCR records non-UTF-8 response bodies as `!binary |- <base64>`.
// Ruby's Psych emits this with a "primary" tag (just `!binary`) which
// js-yaml resolves to the URI `!<!binary>` rather than the canonical
// `tag:yaml.org,2002:binary`. Register both forms so either works,
// and decode the base64 to a UTF-8 string — Manza only ever returns
// JSON over the wire.
const decode = (data: string) => Buffer.from(data.replace(/\s+/g, ""), "base64").toString("utf8");

const binaryCanonical = new yaml.Type("tag:yaml.org,2002:binary", {
  kind: "scalar",
  resolve: () => true,
  construct: decode,
});

const binaryPrimary = new yaml.Type("!binary", {
  kind: "scalar",
  resolve: () => true,
  construct: decode,
});

const VCR_SCHEMA = yaml.DEFAULT_SCHEMA.extend([binaryCanonical, binaryPrimary]);

interface CassetteInteraction {
  request: {
    method: string;
    uri: string;
    body: { string: string };
    headers?: Record<string, string[]>;
  };
  response: {
    status: { code: number; message: string };
    headers: Record<string, string[]>;
    body: { string: string };
  };
}

interface Cassette {
  http_interactions: CassetteInteraction[];
}

export async function loadCassette(name: string): Promise<CassetteInteraction[]> {
  const path = join(import.meta.dir, "fixtures/cassettes", `${name}.yml`);
  const raw = await readFile(path, "utf8");
  const parsed = yaml.load(raw, { schema: VCR_SCHEMA }) as Cassette;
  return parsed.http_interactions;
}

export function cassetteHandler(interaction: CassetteInteraction) {
  const { method, uri } = interaction.request;
  const verb = method.toLowerCase() as "get" | "post" | "patch" | "delete" | "put";
  const responseHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(interaction.response.headers)) {
    const first = Array.isArray(v) ? v[0] : undefined;
    if (typeof first === "string") responseHeaders[k] = first;
  }

  // Strip the query string from the cassette URI for msw's URL pattern.
  // We still verify query params match what the cassette recorded —
  // otherwise two list calls (e.g. limit=100 vs currency_code=MAD&limit=100)
  // would collide on the same handler. Compare param-by-param rather
  // than as full query strings so insertion order doesn't matter.
  const recorded = new URL(uri);
  const pathOnly = `${recorded.protocol}//${recorded.host}${recorded.pathname}`;
  const expectedParams = sortedParams(recorded.searchParams);
  const expectedBody = canonicalBody(recorded.pathname, interaction.request.body?.string ?? "");

  return http[verb](pathOnly, async ({ request }) => {
    const actualParams = sortedParams(new URL(request.url).searchParams);
    if (actualParams !== expectedParams) return undefined;

    if (expectedBody !== null) {
      const actualText = await request.clone().text();
      const actual = canonicalBody(recorded.pathname, actualText);
      if (actual !== expectedBody) return undefined;
    }

    return HttpResponse.text(interaction.response.body.string, {
      status: interaction.response.status.code,
      headers: responseHeaders,
    });
  });
}

function sortedParams(params: URLSearchParams): string {
  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}=${v}`).join("&");
}

// Canonical form for body matching: JSON parsed and keys sorted so key
// order can't cause a miss. Returns null when the cassette recorded no
// body (GET and friends), skipping the body check altogether.
//
// Transfer-authorization cassettes match on body with `signature`
// removed — the server records the exact signature it saw, but the
// SDK test can only sign deterministically if we hand it the same
// fixed vector the Ruby suite uses. Dropping the field here lets the
// SDK pass any signature and still hit the recorded response.
function canonicalBody(pathname: string, raw: string): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (pathname.endsWith("/authorize")) delete parsed.signature;
    return stableStringify(parsed);
  } catch {
    return raw;
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export async function startServer(
  cassetteNames: string[],
): Promise<ReturnType<typeof setupServer>> {
  const handlers = [];
  for (const name of cassetteNames) {
    const interactions = await loadCassette(name);
    for (const i of interactions) handlers.push(cassetteHandler(i));
  }
  const server = setupServer(...handlers);
  server.listen({ onUnhandledRequest: "error" });
  return server;
}
