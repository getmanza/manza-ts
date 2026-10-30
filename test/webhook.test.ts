// Mirror of spec/manza/webhook_spec.rb.
//
// Fixed test vector, shared by every SDK in the family. Each SDK's
// verifier must accept exactly this delivery. The signature was
// computed independently with:
//
//   printf '%s' '1767225600.<payload>' | openssl dgst -sha256 -hmac 'whsec_test_vector_secret'

import { describe, expect, test } from "bun:test";
import { ManzaArgumentError, Webhook } from "../src/index.js";

const SECRET = "whsec_test_vector_secret";
const TIMESTAMP = "1767225600";
const PAYLOAD = '{"event":"test.ping","event_id":"0199a1b2-0000-7000-8000-000000000010"}';
const SIGNATURE = "970fdd13680015f73dbd172884498c6fd1e07d5b5c41aae081272598607fea75";
const NOW = new Date(1_767_225_600 * 1000);
// HMAC zero-pads its key to the block size, so a one-NUL key signs exactly
// like the empty key, which Web Crypto refuses to import. Ruby's spec
// forges with the empty secret itself.
const EMPTY_KEY = "\u0000";
const secondsAfter = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

describe("Webhook.sign", () => {
  test("signs the shared vector", async () => {
    expect(await Webhook.sign({ payload: PAYLOAD, timestamp: TIMESTAMP, secret: SECRET })).toBe(
      SIGNATURE,
    );
  });

  // Web Crypto refuses a zero-length HMAC key with a DOMException; the
  // SDK's argument error says what is wrong instead.
  test("throws ManzaArgumentError on an empty secret", async () => {
    await expect(
      Webhook.sign({ payload: PAYLOAD, timestamp: TIMESTAMP, secret: "" }),
    ).rejects.toThrow(new ManzaArgumentError("secret cannot be empty"));
  });

  test("accepts a numeric timestamp", async () => {
    expect(await Webhook.sign({ payload: PAYLOAD, timestamp: 1_767_225_600, secret: SECRET })).toBe(
      SIGNATURE,
    );
  });
});

describe("Webhook.verify", () => {
  const verify = (overrides: Record<string, unknown> = {}) =>
    Webhook.verify({
      payload: PAYLOAD,
      signature: SIGNATURE,
      timestamp: TIMESTAMP,
      secret: SECRET,
      now: NOW,
      ...overrides,
    } as Parameters<typeof Webhook.verify>[0]);

  test("accepts the shared vector", async () => {
    expect(await verify()).toBe(true);
  });

  test("rejects a wrong secret", async () => {
    expect(await verify({ secret: "whsec_other" })).toBe(false);
  });

  test("rejects a tampered payload", async () => {
    expect(await verify({ payload: PAYLOAD.replace("ping", "pong") })).toBe(false);
  });

  test("rejects a signature of the wrong length without throwing", async () => {
    expect(await verify({ signature: "abc" })).toBe(false);
  });

  test("rejects a timestamp 301 seconds old", async () => {
    expect(await verify({ now: secondsAfter(301) })).toBe(false);
  });

  test("rejects a timestamp 301 seconds in the future", async () => {
    expect(await verify({ now: secondsAfter(-301) })).toBe(false);
  });

  test("accepts a timestamp exactly at the tolerance", async () => {
    expect(await verify({ now: secondsAfter(300) })).toBe(true);
  });

  test("skips the timestamp check with tolerance: null", async () => {
    expect(await verify({ now: secondsAfter(86_400), tolerance: null })).toBe(true);
  });

  test("rejects a non-numeric timestamp", async () => {
    expect(await verify({ timestamp: "yesterday", tolerance: null })).toBe(false);
  });

  test("rejects null and undefined inputs", async () => {
    for (const key of ["signature", "timestamp", "payload", "secret"]) {
      expect(await verify({ [key]: null })).toBe(false);
      expect(await verify({ [key]: undefined })).toBe(false);
    }
  });

  test("rejects an empty secret, even with a signature made under it", async () => {
    const forged = await Webhook.sign({
      payload: PAYLOAD,
      timestamp: TIMESTAMP,
      secret: EMPTY_KEY,
    });

    expect(await verify({ secret: "", signature: forged })).toBe(false);
  });

  test("rejects a non-string payload", async () => {
    const forged = await Webhook.sign({ payload: "42", timestamp: TIMESTAMP, secret: SECRET });

    expect(await verify({ payload: 42, signature: forged })).toBe(false);
  });
});

describe("Webhook.constructEvent", () => {
  const construct = (headers: unknown, overrides: Record<string, unknown> = {}) =>
    Webhook.constructEvent({
      payload: PAYLOAD,
      headers,
      secret: SECRET,
      now: NOW,
      ...overrides,
    } as Parameters<typeof Webhook.constructEvent>[0]);

  const signedHeaders = async (body: string, secret = SECRET) => ({
    // An empty key cannot be imported; EMPTY_KEY signs identically.
    "X-Manza-Signature": await Webhook.sign({
      payload: body,
      timestamp: TIMESTAMP,
      secret: secret === "" ? EMPTY_KEY : secret,
    }),
    "X-Manza-Timestamp": TIMESTAMP,
  });

  test("returns the parsed event for X-Manza-* headers", async () => {
    const event = await construct({
      "X-Manza-Signature": SIGNATURE,
      "X-Manza-Timestamp": TIMESTAMP,
    });

    expect(event).toEqual({
      event: "test.ping",
      event_id: "0199a1b2-0000-7000-8000-000000000010",
    });
  });

  test("reads mixed-case header names", async () => {
    const event = await construct({
      "x-MANZA-signature": SIGNATURE,
      "X-manza-Timestamp": TIMESTAMP,
    });

    expect(event.event).toBe("test.ping");
  });

  test("reads the Rack env form", async () => {
    const event = await construct({
      HTTP_X_MANZA_SIGNATURE: SIGNATURE,
      HTTP_X_MANZA_TIMESTAMP: TIMESTAMP,
    });

    expect(event.event).toBe("test.ping");
  });

  test("reads a Fetch Headers object", async () => {
    const headers = new Headers({ "X-Manza-Signature": SIGNATURE, "X-Manza-Timestamp": TIMESTAMP });

    expect((await construct(headers)).event).toBe("test.ping");
  });

  test("reads Node's IncomingHttpHeaders, taking the first of repeated values", async () => {
    const headers = {
      "x-manza-signature": [SIGNATURE, "0".repeat(64)],
      "x-manza-timestamp": TIMESTAMP,
      "x-other": undefined,
    };

    expect((await construct(headers)).event).toBe("test.ping");
  });

  test("falls back to X-Zazu-* headers", async () => {
    const event = await construct({ "X-Zazu-Signature": SIGNATURE, "X-Zazu-Timestamp": TIMESTAMP });

    expect(event.event).toBe("test.ping");
  });

  test("prefers X-Manza-* over X-Zazu-*", async () => {
    const event = await construct({
      "X-Manza-Signature": SIGNATURE,
      "X-Manza-Timestamp": TIMESTAMP,
      "X-Zazu-Signature": "0".repeat(64),
      "X-Zazu-Timestamp": "1",
    });

    expect(event.event).toBe("test.ping");
  });

  test("throws on a missing signature header", async () => {
    await expect(construct({ "X-Manza-Timestamp": TIMESTAMP })).rejects.toThrow(
      new ManzaArgumentError("missing X-Manza-Signature header"),
    );
  });

  test("throws on a missing timestamp header", async () => {
    await expect(construct({ "X-Manza-Signature": SIGNATURE })).rejects.toThrow(
      new ManzaArgumentError("missing X-Manza-Timestamp header"),
    );
  });

  test("throws on a bad signature", async () => {
    await expect(
      construct({ "X-Manza-Signature": "0".repeat(64), "X-Manza-Timestamp": TIMESTAMP }),
    ).rejects.toThrow(new ManzaArgumentError("invalid webhook signature"));
  });

  test("throws on a stale timestamp", async () => {
    await expect(
      construct(
        { "X-Manza-Signature": SIGNATURE, "X-Manza-Timestamp": TIMESTAMP },
        { now: secondsAfter(301) },
      ),
    ).rejects.toThrow(new ManzaArgumentError("webhook timestamp outside tolerance"));
  });

  test("accepts a stale timestamp with tolerance: null", async () => {
    const event = await construct(
      { "X-Manza-Signature": SIGNATURE, "X-Manza-Timestamp": TIMESTAMP },
      { now: secondsAfter(301), tolerance: null },
    );

    expect(event.event).toBe("test.ping");
  });

  test("throws on a body that is not JSON", async () => {
    const body = "not json";

    await expect(construct(await signedHeaders(body), { payload: body })).rejects.toThrow(
      new ManzaArgumentError("webhook payload is not JSON"),
    );
  });

  test("throws ManzaArgumentError on a signed non-string payload", async () => {
    await expect(construct(await signedHeaders("42"), { payload: 42 })).rejects.toThrow(
      new ManzaArgumentError("invalid webhook signature"),
    );
  });

  test("throws on an empty secret", async () => {
    await expect(construct(await signedHeaders(PAYLOAD, ""), { secret: "" })).rejects.toThrow(
      new ManzaArgumentError("invalid webhook signature"),
    );
  });

  test("throws on a body that is valid JSON but not an object", async () => {
    for (const body of ["[]", "null", "42"]) {
      await expect(construct(await signedHeaders(body), { payload: body })).rejects.toThrow(
        new ManzaArgumentError("webhook payload is not a JSON object"),
      );
    }
  });

  test("throws ManzaArgumentError, not another error type", async () => {
    await expect(construct({})).rejects.toBeInstanceOf(ManzaArgumentError);
  });
});
