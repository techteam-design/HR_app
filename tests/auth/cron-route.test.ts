import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { constantTimeEqual, isCronAuthorized } from "@/lib/auth/cron-secret";

// The daily entitlement route with the service mocked: only a request with
// the exact "Bearer <CRON_SECRET>" header may run the job.

const service = vi.hoisted(() => ({
  ensureAllEntitlements: vi.fn(async (onDate: string) => ({
    onDate,
    employeesChecked: 14,
    employeesSkipped: 1,
    created: 39,
    alreadyExisted: 0,
  })),
}));
vi.mock("@/server/entitlement.service", () => service);

const reminderService = vi.hoisted(() => ({
  sendApprovalReminders: vi.fn(async () => ({ afterDays: 2, approvers: 2, requests: 3, sent: 2, failed: 0, skipped: 0, duplicate: 0 })),
}));
vi.mock("@/server/reminder.service", () => reminderService);

const { GET, POST } = await import("@/app/api/cron/entitlements/route");

const SECRET = "test-cron-secret-0123456789abcdef";

function request(authorization?: string, method = "POST") {
  return new Request("http://app/api/cron/entitlements", {
    method,
    headers: authorization === undefined ? {} : { authorization },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/api/cron/entitlements", () => {
  it("rejects a missing Authorization header", async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(service.ensureAllEntitlements).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    for (const header of [`Bearer ${SECRET}x`, `Bearer ${SECRET.slice(0, -1)}`, SECRET, `bearer ${SECRET}`, "Bearer "]) {
      expect((await POST(request(header))).status).toBe(401);
    }
    expect(service.ensureAllEntitlements).not.toHaveBeenCalled();
  });

  it("rejects everything when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await POST(request("Bearer "))).status).toBe(401);
    expect(service.ensureAllEntitlements).not.toHaveBeenCalled();
  });

  it("runs the job for today in Brunei with the right secret (POST and GET)", async () => {
    const response = await POST(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ created: 39, employeesSkipped: 1 });
    expect(service.ensureAllEntitlements).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));

    expect((await GET(request(`Bearer ${SECRET}`, "GET"))).status).toBe(200);
  });
});

describe("constantTimeEqual()", () => {
  it("compares strings exactly", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("ab", "abc")).toBe(false);
    expect(constantTimeEqual("abcd", "abc")).toBe(false);
  });

  it("never authorises with a short or missing secret", () => {
    expect(isCronAuthorized("Bearer short", "short")).toBe(false);
    expect(isCronAuthorized(null, SECRET)).toBe(false);
  });
});

describe("/api/cron/reminders", () => {
  it("needs the cron secret and runs the reminder job for today in Brunei (POST and GET)", async () => {
    const reminders = await import("@/app/api/cron/reminders/route");
    expect((await reminders.POST(new Request("http://app/api/cron/reminders", { method: "POST" }))).status).toBe(401);
    expect(reminderService.sendApprovalReminders).not.toHaveBeenCalled();

    const authorised = (method: string) =>
      new Request("http://app/api/cron/reminders", { method, headers: { authorization: `Bearer ${SECRET}` } });
    const response = await reminders.POST(authorised("POST"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ sent: 2 });
    expect(reminderService.sendApprovalReminders).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), null);
    expect((await reminders.GET(authorised("GET"))).status).toBe(200);
  });

  describe("?minDays= (testing override)", () => {
    const withMinDays = (value: string, authorization = `Bearer ${SECRET}`) =>
      new Request(`http://app/api/cron/reminders?minDays=${value}`, { method: "POST", headers: { authorization } });

    afterEach(() => vi.unstubAllEnvs());

    it("outside production, passes the override to the job", async () => {
      vi.stubEnv("APP_ENV", "");
      const reminders = await import("@/app/api/cron/reminders/route");
      expect((await reminders.POST(withMinDays("0"))).status).toBe(200);
      expect(reminderService.sendApprovalReminders).toHaveBeenCalledWith(expect.any(String), 0);
    });

    it("still needs the cron secret", async () => {
      vi.stubEnv("APP_ENV", "");
      const reminders = await import("@/app/api/cron/reminders/route");
      expect((await reminders.POST(withMinDays("0", "Bearer wrong"))).status).toBe(401);
      expect(reminderService.sendApprovalReminders).not.toHaveBeenCalled();
    });

    it("is refused in production and for invalid values, without running the job", async () => {
      const reminders = await import("@/app/api/cron/reminders/route");
      vi.stubEnv("APP_ENV", "production");
      expect((await reminders.POST(withMinDays("0"))).status).toBe(400);
      vi.stubEnv("APP_ENV", "staging");
      expect((await reminders.POST(withMinDays("31"))).status).toBe(400);
      expect(reminderService.sendApprovalReminders).not.toHaveBeenCalled();
    });
  });
});
