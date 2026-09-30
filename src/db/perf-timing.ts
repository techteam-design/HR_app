import { AsyncLocalStorage } from "node:async_hooks";

import type { Pool } from "@neondatabase/serverless";

// TEMPORARY performance diagnostic. Remove before production: delete this file
// and its hooks in src/db/index.ts, src/db/transaction.ts and custom-worker.ts
// (each marked "PERF_TIMING").
//
// Off unless PERF_TIMING=1. When on, every database round trip is timed:
// - neon-http queries and batches (neonConfig.fetchFunction, see src/db/index.ts)
// - the WebSocket transaction (withEmployeeLock): connect and each statement
// and one JSON line per request is logged ("perf_timing"). Only the SQL text
// is recorded, never parameter values, headers or the connection string.
//
// Per-request scope:
// - Cloudflare Worker: custom-worker.ts wraps each request (withRequestTiming),
//   logs the line when the response body ends and adds a Server-Timing header.
// - Local `npm run dev` (no custom-worker.ts): queries are grouped by Next's
//   per-request store and logged from after() when the response has finished.
//   No Server-Timing header locally.
//
// On Workers, timers only advance during I/O: durations around database calls
// are accurate, but CPU time (e.g. scrypt) is not visible here; read it from
// the Cloudflare dashboard.

type Query = {
  // Start, in ms since the request (Worker) or the first query (local) began.
  at: number;
  ms: number;
  via: "http" | "http-batch" | "ws-connect" | "ws";
  sql: string;
};

type Collector = { startedAt: number; queries: Query[]; route?: string };

// Shared through globalThis: custom-worker.ts and the Next.js bundle each get
// their own copy of this module.
const STORAGE_KEY = Symbol.for("sbc.perfTiming.storage");
const storage: AsyncLocalStorage<Collector> = ((globalThis as Record<symbol, unknown>)[STORAGE_KEY] ??=
  new AsyncLocalStorage<Collector>()) as AsyncLocalStorage<Collector>;

const SQL_MAX = 160;

export function perfTimingEnabled(value: string | undefined = process.env.PERF_TIMING): boolean {
  return value === "1";
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

type NextScope = { after: (task: () => void) => void; requestKey: () => object | undefined };
let nextScope: NextScope | undefined;
const localCollectors = new WeakMap<object, Collector>();

// Local dev only: lets queries outside custom-worker.ts be grouped per request.
export function setNextRequestScope(scope: NextScope): void {
  nextScope = scope;
}

function currentCollector(): Collector | undefined {
  const workerCollector = storage.getStore();
  if (workerCollector) return workerCollector;
  if (!nextScope) return undefined;

  const key = nextScope.requestKey();
  if (!key) return undefined; // scripts, build: no request
  let collector = localCollectors.get(key);
  if (!collector) {
    // Next's route name, e.g. "/admin/employees/[id]" (no ids, no query string).
    const route = (key as { route?: unknown }).route;
    collector = { startedAt: performance.now(), queries: [], route: typeof route === "string" ? route : undefined };
    localCollectors.set(key, collector);
    const done = collector;
    try {
      nextScope.after(() =>
        console.log(JSON.stringify({ event: "perf_timing", source: "next-dev", route: done.route, ...summary(done) })),
      );
    } catch {
      // Outside a request (e.g. prerendering): nothing to log.
    }
  }
  return collector;
}

async function timed<T>(via: Query["via"], sql: string, run: () => Promise<T>): Promise<T> {
  const collector = currentCollector();
  if (!collector) return run();
  const started = performance.now();
  try {
    return await run();
  } finally {
    collector.queries.push({
      at: Math.round(started - collector.startedAt),
      ms: Math.round(performance.now() - started),
      via,
      sql,
    });
  }
}

function shortSql(text: unknown): string {
  if (typeof text !== "string") return "?";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > SQL_MAX ? `${flat.slice(0, SQL_MAX)}…` : flat;
}

// neon-http request body: { query, params } or { queries: [{ query, params }] }.
// Only the query text is kept.
function describeBody(body: unknown): { via: Query["via"]; sql: string } {
  try {
    const parsed = typeof body === "string" ? (JSON.parse(body) as { query?: unknown; queries?: { query?: unknown }[] }) : {};
    if (Array.isArray(parsed.queries)) {
      return {
        via: "http-batch",
        sql: `batch[${parsed.queries.length}]: ${parsed.queries.map((q) => shortSql(q.query)).join(" ; ")}`,
      };
    }
    return { via: "http", sql: shortSql(parsed.query) };
  } catch {
    return { via: "http", sql: "?" };
  }
}

// neonConfig.fetchFunction: times each neon-http round trip (until the
// response headers arrive).
export function timedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { via, sql } = describeBody(init?.body);
  return timed(via, sql, () => fetch(input, init));
}

type QueryableClient = { query: (...args: unknown[]) => unknown };

// withEmployeeLock: times the WebSocket connect and every statement
// (BEGIN, SET LOCAL, the lock, reads, writes, COMMIT). No-op when off.
export function instrumentPool(pool: Pool): void {
  if (!perfTimingEnabled()) return;
  const target = pool as unknown as { connect: (...args: unknown[]) => unknown };
  const connect = target.connect.bind(pool);
  target.connect = (...args: unknown[]) => {
    if (args.length > 0) return connect(...args); // callback form: not used by drizzle
    return timed("ws-connect", "connect", async () => {
      const client = (await connect()) as QueryableClient;
      const query = client.query.bind(client);
      client.query = (...queryArgs: unknown[]) => {
        const [first] = queryArgs;
        const text = typeof first === "string" ? first : (first as { text?: unknown } | undefined)?.text;
        const result = query(...queryArgs);
        return result instanceof Promise ? timed("ws", shortSql(text), () => result) : result;
      };
      return client;
    });
  };
}

// ---------------------------------------------------------------------------
// Summary and the Worker wrapper
// ---------------------------------------------------------------------------

// Wall time spent waiting on the database: the union of the query intervals
// (parallel queries overlap, so this is less than the sum).
function waitMs(queries: Query[]): number {
  const spans = queries.map((q) => [q.at, q.at + q.ms] as const).sort((a, b) => a[0] - b[0]);
  let total = 0;
  let end = -Infinity;
  for (const [start, stop] of spans) {
    if (stop <= end) continue;
    total += stop - Math.max(start, end);
    end = stop;
  }
  return Math.round(total);
}

function summary(collector: Collector) {
  const queries = [...collector.queries].sort((a, b) => a.at - b.at);
  return {
    db: {
      count: queries.length,
      waitMs: waitMs(queries),
      sumMs: queries.reduce((sum, q) => sum + q.ms, 0),
    },
    queries,
  };
}

function requestKind(request: Request, pathname: string): string {
  if (request.headers.get("next-router-prefetch") === "1") return "prefetch";
  if (request.headers.get("rsc") === "1") return "rsc";
  if (pathname.startsWith("/api/")) return "api";
  return "document";
}

// custom-worker.ts: runs one request inside a timing scope, adds a
// Server-Timing header (time to headers) and logs one line when the body has
// been sent. Path only, never the query string.
export async function withRequestTiming(request: Request, handle: () => Promise<Response>): Promise<Response> {
  const collector: Collector = { startedAt: performance.now(), queries: [] };
  const response = await storage.run(collector, handle);

  const headersMs = Math.round(performance.now() - collector.startedAt);
  const atHeaders = summary(collector);
  const { pathname } = new URL(request.url);
  const log = () =>
    console.log(
      JSON.stringify({
        event: "perf_timing",
        method: request.method,
        path: pathname,
        kind: requestKind(request, pathname),
        status: response.status,
        headersMs,
        totalMs: Math.round(performance.now() - collector.startedAt),
        ...summary(collector),
      }),
    );

  // WebSocket upgrades cannot be re-wrapped.
  if (response.status === 101) {
    log();
    return response;
  }

  const headers = new Headers(response.headers);
  headers.append(
    "Server-Timing",
    `total;dur=${headersMs}, db;dur=${atHeaders.db.waitMs};desc="${atHeaders.db.count} queries"`,
  );

  let body = response.body;
  if (body) {
    body = body.pipeThrough(new TransformStream({ flush: log }));
  } else {
    log();
  }
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}
