import { afterEach, describe, expect, it, vi } from "vitest";

import { perfTimingEnabled, timedFetch, withRequestTiming } from "@/db/perf-timing";

// The temporary PERF_TIMING diagnostic: SQL text only (never parameter
// values, headers or the connection string), one log line per request and a
// Server-Timing header.

const SECRET_URL = "postgresql://user:secret-password@host/db";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubNeon() {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
}

function neonCall(body: unknown) {
  return timedFetch("https://neon.example/sql", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Neon-Connection-String": SECRET_URL },
  });
}

async function runRequest(work: () => Promise<unknown>, headers: Record<string, string> = {}) {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const response = await withRequestTiming(new Request("https://app.example/dashboard?secret=1", { headers }), async () => {
    await work();
    return new Response("page body");
  });
  const text = await response.text();
  const lines = log.mock.calls.map(([line]) => JSON.parse(String(line)));
  return { response, text, lines };
}

describe("perfTimingEnabled()", () => {
  it('is on only for "1"', () => {
    expect(perfTimingEnabled("1")).toBe(true);
    expect(perfTimingEnabled(undefined)).toBe(false);
    expect(perfTimingEnabled("0")).toBe(false);
    expect(perfTimingEnabled("true")).toBe(false);
  });
});

describe("withRequestTiming()", () => {
  it("logs one line per request with the SQL text only", async () => {
    stubNeon();
    const { response, text, lines } = await runRequest(async () => {
      await neonCall({ query: 'select "id" from "session" where "token" = $1', params: ["tok-123"] });
      await Promise.all([
        neonCall({ queries: [{ query: "select 1", params: ["p-1"] }, { query: "select 2", params: ["p-2"] }] }),
        neonCall({ query: "select count(*) from leave_applications", params: [] }),
      ]);
    }, { rsc: "1" });

    expect(text).toBe("page body");
    expect(lines).toHaveLength(1);
    const [line] = lines;
    expect(line).toMatchObject({ event: "perf_timing", method: "GET", path: "/dashboard", kind: "rsc", status: 200 });
    expect(line.db.count).toBe(3);
    expect(line.queries.map((q: { via: string; sql: string }) => [q.via, q.sql])).toEqual(
      expect.arrayContaining([
        ["http", 'select "id" from "session" where "token" = $1'],
        ["http-batch", "batch[2]: select 1 ; select 2"],
        ["http", "select count(*) from leave_applications"],
      ]),
    );

    const json = JSON.stringify(line);
    for (const hidden of ["tok-123", "p-1", "p-2", "secret-password", "secret=1", "Neon-Connection-String"]) {
      expect(json).not.toContain(hidden);
    }
    expect(response.headers.get("Server-Timing")).toMatch(/^total;dur=\d+, db;dur=\d+;desc="3 queries"$/);
  });

  it("marks prefetches and requests without database calls", async () => {
    const { lines, response } = await runRequest(async () => {}, { rsc: "1", "next-router-prefetch": "1" });
    expect(lines[0]).toMatchObject({ kind: "prefetch", db: { count: 0, waitMs: 0, sumMs: 0 }, queries: [] });
    expect(response.headers.get("Server-Timing")).toContain('desc="0 queries"');
  });

  it("does not record queries outside a request", async () => {
    stubNeon();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await neonCall({ query: "select 1", params: [] });
    expect(log).not.toHaveBeenCalled();
  });
});
