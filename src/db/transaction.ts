import { Pool } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";

import type { Database } from "./index";
import { instrumentPool } from "./perf-timing";
import * as schema from "./schema";

// Interactive transactions for balance-affecting writes only: submitting
// leave (own or on behalf), the final approval, cancelling, and balance
// adjustments. Everything else uses the neon-http driver (getDb()).
//
// neon-http only supports db.batch, which cannot read, decide and then
// write atomically. These writes use the Neon WebSocket driver instead:
// - A Pool is created, used and closed within ONE request (Workers cannot
//   keep a WebSocket open across requests), with a single connection.
// - The transaction first takes a per-employee advisory lock, so two writes
//   for the same employee run one after the other; the caller then re-reads
//   the balance and overlaps inside the transaction before writing.
// - pg_advisory_xact_lock is released automatically at commit or rollback,
//   so it is safe with the pooled (PgBouncer) connection string.
// - lock_timeout: a stuck lock fails after 5 s ("please try again")
//   instead of hanging the request.

export type Tx = Parameters<Parameters<NeonDatabase<typeof schema>["transaction"]>[0]>[0];

// Read access shared by getDb() and a transaction, for queries that must
// also run inside the locked transaction.
export type Reader = Pick<Database, "select" | "selectDistinct">;

// Namespace for the leave-balance lock (the first key of the two-key form).
export const LEAVE_BALANCE_LOCK = 5301;

export async function withEmployeeLock<T>(employeeId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");

  const pool = new Pool({ connectionString, max: 1 });
  instrumentPool(pool); // PERF_TIMING (temporary): no-op unless PERF_TIMING=1
  try {
    const db = drizzle({ client: pool, schema });
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${LEAVE_BALANCE_LOCK}::int, hashtext(${employeeId}::text))`);
      return work(tx);
    });
  } finally {
    await pool.end();
  }
}

// True for Postgres "lock_not_available" (lock_timeout reached).
export function isLockTimeout(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if ((current as { code?: string }).code === "55P03") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
