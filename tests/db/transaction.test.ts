import { beforeEach, describe, expect, it, vi } from "vitest";

// withEmployeeLock with the Neon Pool and the drizzle WebSocket driver
// mocked: checks the statements run in order inside ONE transaction (lock
// timeout, then the per-employee advisory lock, then the caller's work) and
// that the pool is always closed, even when the work fails.

const calls = vi.hoisted(() => ({ log: [] as string[], poolEnded: 0 }));

vi.mock("@neondatabase/serverless", () => ({
  Pool: class {
    constructor(readonly options: { connectionString: string; max: number }) {
      calls.log.push(`pool max=${options.max}`);
    }
    async end() {
      calls.poolEnded += 1;
    }
  },
}));

vi.mock("drizzle-orm/neon-serverless", async () => {
  const { PgDialect } = await import("drizzle-orm/pg-core");
  type Query = Parameters<InstanceType<typeof PgDialect>["sqlToQuery"]>[0];
  const dialect = new PgDialect();
  const tx = {
    execute: async (query: Query) => {
      const { sql, params } = dialect.sqlToQuery(query);
      calls.log.push(`${sql} ${JSON.stringify(params)}`);
    },
  };
  return {
    drizzle: () => ({
      transaction: async (work: (t: typeof tx) => Promise<unknown>) => {
        calls.log.push("begin");
        try {
          const result = await work(tx);
          calls.log.push("commit");
          return result;
        } catch (error) {
          calls.log.push("rollback");
          throw error;
        }
      },
    }),
  };
});

const { withEmployeeLock, LEAVE_BALANCE_LOCK } = await import("@/db/transaction");
const { runLocked } = await import("@/server/leave-period.service");

const EMPLOYEE = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  calls.log.length = 0;
  calls.poolEnded = 0;
  process.env.DATABASE_URL = "postgres://user:secret@example.test/db";
});

describe("withEmployeeLock()", () => {
  it("sets a lock timeout, takes the employee's advisory lock, then runs the work, in one transaction", async () => {
    const result = await withEmployeeLock(EMPLOYEE, async () => {
      calls.log.push("work");
      return "done";
    });
    expect(result).toBe("done");
    expect(calls.log).toEqual([
      "pool max=1",
      "begin",
      "SET LOCAL lock_timeout = '5s' []",
      `SELECT pg_advisory_xact_lock($1::int, hashtext($2::text)) [${LEAVE_BALANCE_LOCK},"${EMPLOYEE}"]`,
      "work",
      "commit",
    ]);
    expect(calls.poolEnded).toBe(1);
  });

  it("rolls back and still closes the pool when the work fails", async () => {
    await expect(
      withEmployeeLock(EMPLOYEE, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(calls.log.at(-1)).toBe("rollback");
    expect(calls.poolEnded).toBe(1);
  });

  it("refuses to run without DATABASE_URL", async () => {
    delete process.env.DATABASE_URL;
    await expect(withEmployeeLock(EMPLOYEE, async () => "x")).rejects.toThrow("DATABASE_URL");
  });
});

describe("runLocked()", () => {
  it("turns a lock timeout into a 409 'try again'", async () => {
    const result = await runLocked(EMPLOYEE, async () => {
      throw Object.assign(new Error("canceling statement due to lock timeout"), { code: "55P03" });
    });
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(calls.poolEnded).toBe(1);
  });

  it("returns a refusal from the work as is (nothing written)", async () => {
    const result = await runLocked(EMPLOYEE, async () => ({ ok: false as const, status: 409 as const, error: "No balance" }));
    expect(result).toEqual({ ok: false, status: 409, error: "No balance" });
  });

  it("rethrows other errors", async () => {
    await expect(
      runLocked(EMPLOYEE, async () => {
        throw new Error("network down");
      }),
    ).rejects.toThrow("network down");
  });
});
