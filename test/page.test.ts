import { describe, expect, test } from "bun:test";
import { ManzaArgumentError, ManzaResponse, Page } from "../src/index.js";

function makeResponse<T>(body: T): ManzaResponse<T> {
  return new ManzaResponse(new Response(null, { status: 200 }), body);
}

describe("Page", () => {
  test("exposes data, hasMore, nextCursor", () => {
    const response = makeResponse({
      data: [{ id: "1" }, { id: "2" }] as unknown[],
      has_more: true,
      next_cursor: "cursor-2",
    });
    const page = new Page<unknown>(response, async (): Promise<Page<unknown>> => {
      throw new Error("not used");
    });
    expect(page.data).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe("cursor-2");
  });

  test("throws when body has no data array", () => {
    const response = makeResponse({} as never);
    const fetcher = async (): Promise<Page<unknown>> => {
      throw new Error("not used");
    };
    expect(() => new Page<unknown>(response, fetcher)).toThrow(ManzaArgumentError);
  });

  test("returns null from next() when hasMore is false", async () => {
    const response = makeResponse({ data: [] as unknown[], has_more: false, next_cursor: null });
    const fetcher = async (): Promise<Page<unknown>> => {
      throw new Error("should not be called");
    };
    const page = new Page<unknown>(response, fetcher);
    expect(await page.next()).toBeNull();
  });

  test("calls fetcher with nextCursor when hasMore", async () => {
    const captured: { cursor: string | null } = { cursor: null };
    const response = makeResponse({
      data: [{ id: "1" }],
      has_more: true,
      next_cursor: "next",
    });
    const fetcher = async (cursor: string | null): Promise<Page<unknown>> => {
      captured.cursor = cursor;
      return new Page<unknown>(
        makeResponse({ data: [] as unknown[], has_more: false, next_cursor: null }),
        fetcher,
      );
    };
    const page = new Page<unknown>(response, fetcher);
    await page.next();
    expect(captured.cursor).toBe("next");
  });
});
