import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

// getTeamCalendar() with the database replaced by a query recorder: each
// select() returns the next queued result, and every where() condition is
// kept so the SQL can be checked. Checks what each role's output contains,
// above all that employees never receive pending leave, leave types or
// request details.

const db = vi.hoisted(() => ({ results: [] as unknown[][], wheres: [] as unknown[] }));

vi.mock("@/db", () => ({
  getDb: () => ({
    select: () => {
      const result = db.results.shift() ?? [];
      const chain: object = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "then") {
              return (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
                Promise.resolve(result).then(resolve, reject);
            }
            if (prop === "where") {
              return (condition: unknown) => {
                db.wheres.push(condition);
                return chain;
              };
            }
            return () => chain;
          },
        },
      );
      return chain;
    },
  }),
}));

vi.mock("@/server/employee-photo.service", () => ({
  withPhotoUrls: async <T extends { photoKey: string | null }>(items: T[]) =>
    items.map((item) => ({ ...item, photoUrl: item.photoKey ? `signed:${item.photoKey}` : null })),
}));

const queryApplications = vi.hoisted(() => vi.fn(async () => [] as unknown[]));
vi.mock("@/server/leave-application.service", () => ({ queryApplications }));
vi.mock("@/server/approval-route.service", () => ({
  loadRouteContext: async () => ({ employees: [] }),
  employeesApprovedBy: () => [],
}));

const { getTeamCalendar, calendarScopeFor } = await import("@/server/team-calendar.service");

const OWN_BRANCH = "b0000000-0000-4000-8000-00000000000a";

const dayRow = (overrides: Record<string, unknown>) => ({
  date: "2026-10-19",
  portion: "1.0",
  halfDaySlot: null,
  applicationId: "a0000000-0000-4000-8000-000000000001",
  startDate: "2026-10-19",
  endDate: "2026-10-20",
  employeeId: "maria",
  fullName: "Maria Santos",
  photoKey: "photos/maria.webp",
  branchName: "Branch A",
  departmentName: "Beauty Therapy",
  code: "mc",
  status: "approved",
  ...overrides,
});

const ROWS = [
  dayRow({}),
  // A pending request (the real query filters these out for employees; the
  // service must drop them too).
  dayRow({ applicationId: "a0000000-0000-4000-8000-000000000002", employeeId: "priya", fullName: "Priya Nair", code: "annual", status: "pending" }),
];
const DEPARTMENTS = [{ id: "d1", name: "Beauty Therapy" }];
const BRANCHES = [{ id: OWN_BRANCH, name: "Branch A" }];

const dialect = new PgDialect();
const render = (condition: unknown) => dialect.sqlToQuery(condition as Parameters<typeof dialect.sqlToQuery>[0]);

beforeEach(() => {
  db.results.length = 0;
  db.wheres.length = 0;
  queryApplications.mockClear();
});

describe("calendarScopeFor()", () => {
  it("maps each role to what it sees", () => {
    expect(calendarScopeFor("admin")).toBe("everyone");
    expect(calendarScopeFor("hr_viewer")).toBe("everyone");
    expect(calendarScopeFor("manager")).toBe("team");
    expect(calendarScopeFor("employee")).toBe("company");
  });
});

describe("getTeamCalendar() for an employee", () => {
  it("defaults to their own branch and asks the database for approved leave only", async () => {
    db.results.push([{ branchId: OWN_BRANCH }], ROWS, DEPARTMENTS, BRANCHES);
    const calendar = await getTeamCalendar({ id: "kelvin", role: "employee" }, "2026-10", {});

    expect(calendar.scope).toBe("company");
    expect(calendar.filter).toEqual({ branchId: OWN_BRANCH });
    const { sql, params } = render(db.wheres[1]);
    expect(sql).toContain('"leave_applications"."status" = ');
    expect(params).toContain("approved");
    expect(params).not.toContain("pending");
    expect(params).toContain(OWN_BRANCH);
  });

  it("returns approved leave only, without the type, status, request id or details", async () => {
    db.results.push([{ branchId: OWN_BRANCH }], ROWS, DEPARTMENTS, BRANCHES);
    const calendar = await getTeamCalendar({ id: "kelvin", role: "employee" }, "2026-10", {});

    expect(calendar.entries).toHaveLength(1);
    expect(calendar.entries[0]).toMatchObject({
      fullName: "Maria Santos",
      photoUrl: "signed:photos/maria.webp",
      departmentName: "Beauty Therapy",
      branchName: "Branch A",
      startDate: "2026-10-19",
      endDate: "2026-10-20",
      leave: null,
      applicationId: null,
    });
    expect(calendar.applications).toEqual([]);
    expect(queryApplications).not.toHaveBeenCalled();

    const json = JSON.stringify(calendar.entries);
    for (const hidden of ['"mc"', '"annual"', "pending", "approved", "a0000000-", "photoKey", '"code"', '"status"']) {
      expect(json).not.toContain(hidden);
    }
  });

  it('"all" shows every branch (no own-branch lookup, no branch condition)', async () => {
    db.results.push(ROWS, DEPARTMENTS, BRANCHES);
    const calendar = await getTeamCalendar({ id: "kelvin", role: "employee" }, "2026-10", { branchId: "all" });

    expect(calendar.filter).toEqual({ branchId: "all" });
    expect(db.wheres).toHaveLength(1);
    expect(render(db.wheres[0]).sql).not.toContain('"employees"."branch_id"');
    expect(calendar.departments).toEqual(DEPARTMENTS);
    expect(calendar.branches).toEqual(BRANCHES);
  });
});

describe("getTeamCalendar() for an admin", () => {
  it("keeps pending leave and the type, and loads the request details", async () => {
    db.results.push(ROWS, DEPARTMENTS, BRANCHES);
    const calendar = await getTeamCalendar({ id: "boss", role: "admin" }, "2026-10", {});

    expect(calendar.scope).toBe("everyone");
    expect(calendar.filter).toEqual({});
    expect(calendar.entries.map((e) => e.leave)).toEqual([
      { code: "mc", status: "approved" },
      { code: "annual", status: "pending" },
    ]);
    expect(render(db.wheres[0]).params).toEqual(expect.arrayContaining(["pending", "approved"]));
    expect(queryApplications).toHaveBeenCalledTimes(1);
  });
});
