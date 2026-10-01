import { describe, expect, it } from "vitest";

import { appUrl, emailConfig, isUndeliverable, resolveDelivery, type EmailEnv } from "@/lib/email/config";

const BASE: EmailEnv = {
  EMAIL_ENABLED: "true",
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: "SBC HR <hr@notify.sbcwellness.com>",
  BETTER_AUTH_URL: "https://hr-app-staging.example.workers.dev/",
  EMAIL_DEV_REDIRECT: "owner@growwstacks.com",
};
const PRIYA = { name: "Priya Nair", email: "priya.nair@example.test" };

describe("emailConfig()", () => {
  it("is off unless EMAIL_ENABLED is exactly \"true\"", () => {
    for (const value of [undefined, "", "1", "TRUE", "yes"]) {
      expect(emailConfig({ ...BASE, EMAIL_ENABLED: value }).ok).toBe(false);
    }
  });

  it("needs the API key, the sender and the app URL", () => {
    expect(emailConfig({ ...BASE, RESEND_API_KEY: "" })).toEqual({ ok: false, reason: "RESEND_API_KEY is not set." });
    expect(emailConfig({ ...BASE, EMAIL_FROM: " " })).toEqual({ ok: false, reason: "EMAIL_FROM is not set." });
    expect(emailConfig({ ...BASE, BETTER_AUTH_URL: undefined }).ok).toBe(false);
  });

  it("refuses to send outside production without a redirect (APP_ENV unset or anything but production)", () => {
    for (const appEnv of [undefined, "", "staging", "development", "Production"]) {
      expect(emailConfig({ ...BASE, APP_ENV: appEnv, EMAIL_DEV_REDIRECT: undefined })).toEqual({
        ok: false,
        reason: 'EMAIL_DEV_REDIRECT is required outside production (APP_ENV is not "production").',
      });
    }
  });

  it("refuses a redirect to a test or invalid address", () => {
    for (const redirect of ["me@example.test", "someone@example.com", "not-an-email"]) {
      expect(emailConfig({ ...BASE, EMAIL_DEV_REDIRECT: redirect })).toEqual({
        ok: false,
        reason: "EMAIL_DEV_REDIRECT is not a deliverable email address.",
      });
    }
  });

  it("allows production without a redirect, and trims the app URL", () => {
    const config = emailConfig({ ...BASE, APP_ENV: "production", EMAIL_DEV_REDIRECT: undefined });
    expect(config).toMatchObject({ ok: true, production: true, redirect: null, appUrl: "https://hr-app-staging.example.workers.dev" });
  });
});

describe("resolveDelivery()", () => {
  it("outside production, every email goes to the redirect with the intended recipient shown", () => {
    const config = emailConfig(BASE);
    if (!config.ok) throw new Error(config.reason);
    expect(resolveDelivery(PRIYA, config)).toEqual({
      ok: true,
      to: "owner@growwstacks.com",
      intendedFor: "Priya Nair <priya.nair@example.test>",
      subjectPrefix: "[DEV] ",
    });
    expect(resolveDelivery({ name: "Real Person", email: "real@gmail.com" }, config)).toMatchObject({
      to: "owner@growwstacks.com",
    });
  });

  it("in production, sends to the real address but never to a test address", () => {
    const config = emailConfig({ ...BASE, APP_ENV: "production", EMAIL_DEV_REDIRECT: undefined });
    if (!config.ok) throw new Error(config.reason);
    expect(resolveDelivery({ name: "Real Person", email: "real@gmail.com" }, config)).toEqual({
      ok: true,
      to: "real@gmail.com",
      intendedFor: null,
      subjectPrefix: "",
    });
    expect(resolveDelivery(PRIYA, config)).toEqual({ ok: false, reason: "The recipient has a test email address." });
  });

  it("a redirect set in production still redirects (UAT on production)", () => {
    const config = emailConfig({ ...BASE, APP_ENV: "production" });
    if (!config.ok) throw new Error(config.reason);
    expect(resolveDelivery(PRIYA, config)).toMatchObject({ to: "owner@growwstacks.com", subjectPrefix: "[REDIRECTED] " });
  });
});

describe("helpers", () => {
  it("spots undeliverable test addresses", () => {
    expect(isUndeliverable("priya.nair@example.test")).toBe(true);
    expect(isUndeliverable("x@mail.example.org")).toBe(true);
    expect(isUndeliverable("x@localhost")).toBe(true);
    expect(isUndeliverable("owner@sbcwellness.com")).toBe(false);
    expect(isUndeliverable("someone@testing.com")).toBe(false);
  });

  it("builds app links", () => {
    expect(appUrl("https://hr.sbcwellness.com/", "/approvals")).toBe("https://hr.sbcwellness.com/approvals");
    expect(appUrl("https://hr.sbcwellness.com", "leave/history")).toBe("https://hr.sbcwellness.com/leave/history");
  });
});
