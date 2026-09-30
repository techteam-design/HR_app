import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The approval API routes with the session and the services mocked: checks
// the permission each route asks for (server-side role checks), that input
// is validated before the service runs, and that the actor always comes
// from the session.

const ADMIN = "11111111-1111-4111-8111-111111111111";
const DANIEL = "22222222-2222-4222-8222-222222222222";
const PRIYA = "33333333-3333-4333-8333-333333333333";
const BRANCH = "44444444-4444-4444-8444-444444444444";
const APPLICATION = "55555555-5555-4555-8555-555555555555";

const auth = vi.hoisted(() => ({ requireApiEmployee: vi.fn() }));
const routes = vi.hoisted(() => ({
  saveManagersApprover: vi.fn(async () => ({ ok: true })),
  saveBranchDefault: vi.fn(async () => ({ ok: true })),
  removeBranchDefault: vi.fn(async () => ({ ok: true })),
  saveOverrides: vi.fn(async () => ({ ok: true, updated: 1 })),
  resetOverrides: vi.fn(async () => ({ ok: true, updated: 1 })),
}));
const approvals = vi.hoisted(() => ({
  decideApplication: vi.fn(async () => ({ ok: true, status: "approved", currentLevel: 1 })),
}));
vi.mock("@/server/auth.service", () => auth);
vi.mock("@/server/approval-route.service", () => routes);
vi.mock("@/server/approval.service", () => approvals);

const settingsRoute = await import("@/app/api/approval-routes/settings/route");
const branchRoute = await import("@/app/api/approval-routes/branches/[branchId]/route");
const employeeRoute = await import("@/app/api/approval-routes/employees/[id]/route");
const bulkRoute = await import("@/app/api/approval-routes/employees/bulk/route");
const decideRoute = await import("@/app/api/approvals/[id]/route");

const signedIn = (id: string, role: string) => ({ ok: true, employee: { id, role } });
const denied = (status: number) => ({ ok: false, response: NextResponse.json({ error: "no" }, { status }) });
const json = (method: string, body?: unknown) =>
  new Request("http://app/x", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const ROUTE = { mode: "two_level", level1ApproverId: DANIEL, level2ApproverId: ADMIN };

beforeEach(() => {
  vi.clearAllMocks();
  auth.requireApiEmployee.mockResolvedValue(signedIn(ADMIN, "admin"));
});

describe("approval route setup APIs need manage_approval_config", () => {
  const cases: [string, () => Promise<Response>][] = [
    ["PUT settings", () => settingsRoute.PUT(json("PUT", { managersApproverId: ADMIN }))],
    ["PUT branch", () => branchRoute.PUT(json("PUT", ROUTE), { params: Promise.resolve({ branchId: BRANCH }) })],
    ["DELETE branch", () => branchRoute.DELETE(json("DELETE"), { params: Promise.resolve({ branchId: BRANCH }) })],
    ["PUT override", () => employeeRoute.PUT(json("PUT", ROUTE), { params: Promise.resolve({ id: PRIYA }) })],
    ["DELETE override", () => employeeRoute.DELETE(json("DELETE"), { params: Promise.resolve({ id: PRIYA }) })],
    ["POST bulk", () => bulkRoute.POST(json("POST", { action: "reset", employeeIds: [PRIYA] }))],
  ];

  for (const [name, call] of cases) {
    it(`${name}: an HR viewer (read-only) gets the 403`, async () => {
      auth.requireApiEmployee.mockResolvedValueOnce(denied(403));
      const response = await call();
      expect(auth.requireApiEmployee).toHaveBeenCalledWith("manage_approval_config");
      expect(response.status).toBe(403);
      for (const service of Object.values(routes)) expect(service).not.toHaveBeenCalled();
    });
  }
});

describe("approval route setup APIs", () => {
  it("saves a branch default for the session admin", async () => {
    const response = await branchRoute.PUT(json("PUT", ROUTE), { params: Promise.resolve({ branchId: BRANCH }) });
    expect(response.status).toBe(200);
    expect(routes.saveBranchDefault).toHaveBeenCalledWith({ id: ADMIN, role: "admin" }, BRANCH, ROUTE);
  });

  it("validates the route before the service runs", async () => {
    const response = await employeeRoute.PUT(json("PUT", { ...ROUTE, level2ApproverId: DANIEL }), {
      params: Promise.resolve({ id: PRIYA }),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).fieldErrors).toHaveProperty("level2ApproverId");
    expect(routes.saveOverrides).not.toHaveBeenCalled();
  });

  it("an override for one employee goes through saveOverrides with that id", async () => {
    await employeeRoute.PUT(json("PUT", ROUTE), { params: Promise.resolve({ id: PRIYA }) });
    expect(routes.saveOverrides).toHaveBeenCalledWith({ id: ADMIN, role: "admin" }, [PRIYA], ROUTE);
  });

  it("bulk set and reset", async () => {
    await bulkRoute.POST(json("POST", { action: "set", employeeIds: [PRIYA, DANIEL], route: ROUTE }));
    expect(routes.saveOverrides).toHaveBeenCalledWith({ id: ADMIN, role: "admin" }, [PRIYA, DANIEL], ROUTE);
    await bulkRoute.POST(json("POST", { action: "reset", employeeIds: [PRIYA] }));
    expect(routes.resetOverrides).toHaveBeenCalledWith({ id: ADMIN, role: "admin" }, [PRIYA]);
  });

  it("returns the service refusal with its details", async () => {
    routes.saveOverrides.mockResolvedValueOnce({
      ok: false,
      status: 409,
      error: "This route can't be set for everyone selected:",
      details: ["Daniel Tan would approve their own leave."],
    } as never);
    const response = await bulkRoute.POST(json("POST", { action: "set", employeeIds: [DANIEL], route: ROUTE }));
    expect(response.status).toBe(409);
    expect((await response.json()).details).toEqual(["Daniel Tan would approve their own leave."]);
  });
});

describe("POST /api/approvals/[id]", () => {
  const params = { params: Promise.resolve({ id: APPLICATION }) };

  it("requires approve_leave", async () => {
    auth.requireApiEmployee.mockResolvedValueOnce(denied(403));
    const response = await decideRoute.POST(json("POST", { action: "approve", expectedLevel: 1 }), params);
    expect(auth.requireApiEmployee).toHaveBeenCalledWith("approve_leave");
    expect(response.status).toBe(403);
    expect(approvals.decideApplication).not.toHaveBeenCalled();
  });

  it("decides as the session employee, with today's Brunei date", async () => {
    auth.requireApiEmployee.mockResolvedValueOnce(signedIn(DANIEL, "manager"));
    const response = await decideRoute.POST(json("POST", { action: "approve", remarks: " Enjoy ", expectedLevel: 1 }), params);
    expect(response.status).toBe(200);
    expect(approvals.decideApplication).toHaveBeenCalledWith(
      { id: DANIEL, role: "manager" },
      APPLICATION,
      { action: "approve", remarks: "Enjoy", expectedLevel: 1 },
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
  });

  it("a rejection without remarks is refused before the service runs", async () => {
    const response = await decideRoute.POST(json("POST", { action: "reject", remarks: "", expectedLevel: 1 }), params);
    expect(response.status).toBe(400);
    expect((await response.json()).fieldErrors).toHaveProperty("remarks");
    expect(approvals.decideApplication).not.toHaveBeenCalled();
  });

  it("returns the service's refusal (e.g. balance no longer fits)", async () => {
    approvals.decideApplication.mockResolvedValueOnce({
      ok: false,
      status: 409,
      error: "Not enough balance: ...",
    } as never);
    const response = await decideRoute.POST(json("POST", { action: "approve", expectedLevel: 2 }), params);
    expect(response.status).toBe(409);
  });
});
