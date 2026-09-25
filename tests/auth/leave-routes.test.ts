import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The leave application routes with the session and the service mocked:
// checks the permission each route asks for, that the employee always comes
// from the session (never the body or URL) for own requests, and that the
// notice override needs override_notice.

const MARIA = "11111111-1111-4111-8111-111111111111";
const KELVIN = "22222222-2222-4222-8222-222222222222";
const APPLICATION = "33333333-3333-4333-8333-333333333333";

const auth = vi.hoisted(() => ({ requireApiEmployee: vi.fn() }));
const service = vi.hoisted(() => ({
  submitApplication: vi.fn(async () => ({
    ok: true,
    id: "new-id",
    status: "pending",
    totalDays: 2,
    approvers: [{ level: 1, id: "x", name: "Siti" }],
  })),
  listApplications: vi.fn(async () => []),
  cancelApplication: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/server/auth.service", () => auth);
vi.mock("@/server/leave-application.service", () => service);

const ownRoute = await import("@/app/api/leave/applications/route");
const cancelRoute = await import("@/app/api/leave/applications/[id]/cancel/route");
const onBehalfRoute = await import("@/app/api/employees/[id]/applications/route");

const signedIn = (id: string, role: string) => ({ ok: true, employee: { id, role } });
const denied = (status: number) => ({ ok: false, response: NextResponse.json({ error: "no" }, { status }) });
const post = (url: string, body: unknown) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const BODY = {
  leaveType: "annual",
  startDate: "2026-10-12",
  endDate: "2026-10-13",
  dayType: "full",
  halfDaySlot: null,
  dates: ["2026-10-12", "2026-10-13"],
  reason: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.requireApiEmployee.mockResolvedValue(signedIn(MARIA, "employee"));
});

describe("POST /api/leave/applications (own)", () => {
  it("requires apply_leave and returns the denial as is", async () => {
    auth.requireApiEmployee.mockResolvedValueOnce(denied(401));
    const response = await ownRoute.POST(post("http://app/api/leave/applications", BODY));
    expect(auth.requireApiEmployee).toHaveBeenCalledWith("apply_leave");
    expect(response.status).toBe(401);
    expect(service.submitApplication).not.toHaveBeenCalled();
  });

  it("submits for the session employee, ignoring any employeeId in the body", async () => {
    const response = await ownRoute.POST(
      post("http://app/api/leave/applications", { ...BODY, employeeId: KELVIN, noticeOverride: true }),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ id: "new-id", status: "pending" });
    expect(service.submitApplication).toHaveBeenCalledWith(
      MARIA,
      expect.not.objectContaining({ employeeId: KELVIN }),
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      { onBehalf: false },
    );
  });

  it("rejects a malformed body before calling the service", async () => {
    const response = await ownRoute.POST(post("http://app/api/leave/applications", { ...BODY, startDate: "2026-02-30" }));
    expect(response.status).toBe(400);
    expect(service.submitApplication).not.toHaveBeenCalled();
  });
});

describe("GET /api/leave/applications (own)", () => {
  it("lists the session employee's requests with valid filters only", async () => {
    await ownRoute.GET(new Request(`http://app/api/leave/applications?type=mc&status=bogus&year=2026&employeeId=${KELVIN}`));
    expect(auth.requireApiEmployee).toHaveBeenCalledWith("apply_leave");
    expect(service.listApplications).toHaveBeenCalledWith(MARIA, { type: "mc", status: undefined, year: 2026 });
  });
});

describe("POST /api/leave/applications/[id]/cancel", () => {
  it("requires a session and passes the session employee as the actor", async () => {
    const response = await cancelRoute.POST(post("http://app/x", { note: " Duplicate " }), params(APPLICATION));
    expect(auth.requireApiEmployee).toHaveBeenCalledWith("apply_leave");
    expect(response.status).toBe(200);
    expect(service.cancelApplication).toHaveBeenCalledWith(
      { id: MARIA, role: "employee" },
      APPLICATION,
      { note: "Duplicate" },
      expect.any(String),
    );
  });

  it("returns the service refusal", async () => {
    service.cancelApplication.mockResolvedValueOnce({ ok: false, status: 404, error: "Leave request not found" } as never);
    const response = await cancelRoute.POST(post("http://app/x", {}), params(APPLICATION));
    expect(response.status).toBe(404);
  });

  it("refuses when not signed in", async () => {
    auth.requireApiEmployee.mockResolvedValueOnce(denied(401));
    expect((await cancelRoute.POST(post("http://app/x", {}), params(APPLICATION))).status).toBe(401);
    expect(service.cancelApplication).not.toHaveBeenCalled();
  });
});

describe("POST /api/employees/[id]/applications (admin on behalf)", () => {
  it("requires manage_employees", async () => {
    auth.requireApiEmployee.mockResolvedValueOnce(denied(403));
    const response = await onBehalfRoute.POST(post("http://app/x", BODY), params(KELVIN));
    expect(auth.requireApiEmployee).toHaveBeenCalledWith("manage_employees");
    expect(response.status).toBe(403);
    expect(service.submitApplication).not.toHaveBeenCalled();
  });

  it("submits for the employee in the URL, recording the admin", async () => {
    auth.requireApiEmployee.mockResolvedValueOnce(signedIn(MARIA, "admin"));
    const response = await onBehalfRoute.POST(
      post("http://app/x", { ...BODY, noticeOverride: true, overrideReason: "Family emergency" }),
      params(KELVIN),
    );
    expect(response.status).toBe(201);
    expect(service.submitApplication).toHaveBeenCalledWith(KELVIN, expect.objectContaining({ leaveType: "annual" }), expect.any(String), {
      onBehalf: true,
      admin: { id: MARIA },
      noticeOverride: true,
      overrideReason: "Family emergency",
    });
  });

  it("needs a reason for a notice override", async () => {
    auth.requireApiEmployee.mockResolvedValueOnce(signedIn(MARIA, "admin"));
    const response = await onBehalfRoute.POST(post("http://app/x", { ...BODY, noticeOverride: true }), params(KELVIN));
    expect(response.status).toBe(400);
    expect((await response.json()).fieldErrors).toHaveProperty("overrideReason");
  });

  it("refuses a notice override without override_notice", async () => {
    // A role that passed the route check but may not override (defensive).
    auth.requireApiEmployee.mockResolvedValueOnce(signedIn(MARIA, "hr_viewer"));
    const response = await onBehalfRoute.POST(
      post("http://app/x", { ...BODY, noticeOverride: true, overrideReason: "Because" }),
      params(KELVIN),
    );
    expect(response.status).toBe(403);
    expect(service.submitApplication).not.toHaveBeenCalled();
  });
});
