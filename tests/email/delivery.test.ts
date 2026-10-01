import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendViaResend } from "@/lib/email/resend";
import { testEmail } from "@/lib/email/templates/leave";

// deliver(): the one path every email takes. The database is a recorder and
// fetch is mocked, so we can see exactly what would reach Resend.

const db = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  claimed: true,
}));

vi.mock("@/db", () => ({
  getDb: () => ({
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        db.inserts.push(values);
        const result = {
          onConflictDoNothing: () => ({
            returning: async () => (db.claimed ? [{ id: "log-1" }] : []),
            then: (resolve: (value: unknown) => unknown) => resolve(undefined),
          }),
        };
        return result;
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        db.updates.push(values);
        return { where: async () => undefined };
      },
    }),
  }),
}));

const { deliver } = await import("@/server/notification.service");

const PRIYA = { id: "priya", name: "Priya Nair", email: "priya.nair@example.test", status: "active" as const };
const CONTENT = testEmail({ name: "Priya Nair", url: "https://hr.example/dashboard" });
const fetchMock = vi.fn();

function input(recipient = PRIYA) {
  return { event: "test_email" as const, dedupeKey: "test_email:priya:1", applicationId: null, recipient, content: CONTENT };
}

beforeEach(() => {
  db.inserts = [];
  db.updates = [];
  db.claimed = true;
  fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ id: "msg_123" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("EMAIL_ENABLED", "true");
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("EMAIL_FROM", "SBC HR <hr@notify.sbcwellness.com>");
  vi.stubEnv("BETTER_AUTH_URL", "https://hr.example");
  vi.stubEnv("EMAIL_DEV_REDIRECT", "owner@growwstacks.com");
  vi.stubEnv("APP_ENV", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body as string);

describe("deliver() outside production", () => {
  it("sends only to the redirect, with the intended recipient at the top", async () => {
    const outcome = await deliver(input());
    expect(outcome).toEqual({ status: "sent", deliveredTo: "owner@growwstacks.com" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = sentBody();
    expect(body.to).toEqual(["owner@growwstacks.com"]);
    expect(body.subject).toBe("[DEV] Test email from SBC HR");
    expect(body.text).toContain("Intended for: Priya Nair <priya.nair@example.test>");
    expect(fetchMock.mock.calls[0][1].headers["idempotency-key"]).toBe("test_email:priya:1");
    expect(db.inserts[0]).toMatchObject({ status: "pending", intendedEmail: "priya.nair@example.test", deliveredTo: "owner@growwstacks.com" });
    expect(db.updates[0]).toMatchObject({ status: "sent", providerMessageId: "msg_123" });
  });

  it("refuses to send without EMAIL_DEV_REDIRECT, and logs it as skipped", async () => {
    vi.stubEnv("EMAIL_DEV_REDIRECT", "");
    const outcome = await deliver(input());
    expect(outcome.status).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.inserts[0]).toMatchObject({ status: "skipped" });
  });
});

describe("deliver() skips and duplicates", () => {
  it("sends nothing when emails are off", async () => {
    vi.stubEnv("EMAIL_ENABLED", "");
    expect((await deliver(input())).status).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips inactive recipients", async () => {
    expect(await deliver(input({ ...PRIYA, status: "inactive" as never }))).toEqual({
      status: "skipped",
      reason: "The recipient is inactive.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never sends the same event twice (the log row is claimed first)", async () => {
    db.claimed = false;
    expect(await deliver(input())).toEqual({ status: "duplicate" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records a provider failure without throwing", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: "Domain not verified" }), { status: 403 }));
    const outcome = await deliver(input());
    expect(outcome).toEqual({ status: "failed", reason: "Resend 403: Domain not verified" });
    expect(db.updates[0]).toEqual({ status: "failed", error: "Resend 403: Domain not verified" });
  });
});

describe("sendViaResend()", () => {
  it("turns a network error into a result, never a throw", async () => {
    const failing = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const result = await sendViaResend(
      { apiKey: "k", from: "f", to: "t@x.com", subject: "s", html: "h", text: "t", idempotencyKey: "i" },
      failing,
    );
    expect(result).toEqual({ ok: false, error: "Resend request failed (TypeError: fetch failed)" });
  });
});
