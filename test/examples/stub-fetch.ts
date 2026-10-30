// A `fetch` for the example tests, handed to `new Manza({ fetch })`: each
// route answers with stubbed documented responses. The examples are not
// part of the cassette contract (manza-ruby's example specs stub WebMock
// the same way), so no cassette and no network.

export interface StubReply {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface RecordedCall {
  method: string;
  url: string;
  authorization: string | null;
  body: Record<string, unknown> | null;
}

export function stubFetch() {
  const routes = new Map<string, StubReply[]>();
  const calls: RecordedCall[] = [];

  const fetchImpl = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const url = String(input);
    const headers = new Headers(init.headers);
    calls.push({
      method,
      url,
      authorization: headers.get("authorization"),
      body:
        typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    });

    const key = `${method} ${url}`;
    const replies = routes.get(key);
    if (!replies || replies.length === 0) throw new TypeError(`unstubbed request: ${key}`);
    // The last reply repeats; earlier ones are used once each.
    const reply = (replies.length > 1 ? replies.shift() : replies[0]) as StubReply;
    return new Response(reply.body === undefined ? "" : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "content-type": "application/json", ...reply.headers },
    });
  };

  return {
    fetch: fetchImpl as typeof fetch,
    calls,
    on(method: string, url: string, ...replies: StubReply[]) {
      routes.set(`${method} ${url}`, replies);
    },
  };
}
