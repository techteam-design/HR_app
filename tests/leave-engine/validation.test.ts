import { describe, expect, it } from "vitest";

import type { SelectedDay } from "@/lib/leave-engine/day-selection";
import type { PlanPolicy } from "@/lib/leave-engine/entitlement-plan";
import { addDays } from "@/lib/leave-engine/iso-date";
import {
  baseEntitlement,
  nextPeriodFor,
  periodRelation,
  projectedPeriodBalance,
  type PeriodBalance,
} from "@/lib/leave-engine/request-period";
import {
  APPROVAL_ROUTE_MISSING,
  issuesByField,
  validateApplication,
  type ApplicationRequest,
  type ValidationContext,
} from "@/lib/leave-engine/validation";

// "Today" is Thu 1 Oct 2026. The seed policies: annual 3 months local / 0
// foreign eligibility and 14 days' notice for foreign staff; MC 1 month.
const TODAY = "2026-10-01";
const ANNUAL = { eligibilityMonthsLocal: 3, eligibilityMonthsForeign: 0, advanceNoticeDaysForeign: 14 };
const MC = { eligibilityMonthsLocal: 1, eligibilityMonthsForeign: 1, advanceNoticeDaysForeign: 0 };
const UNPAID = { eligibilityMonthsLocal: 0, eligibilityMonthsForeign: 0, advanceNoticeDaysForeign: 0 };

const TABLE = [1, 2, 3, 4, 5, 6, 7, 8].map((serviceYear) => ({ serviceYear, days: serviceYear + 6 }));
const ANNUAL_PLAN: PlanPolicy = {
  code: "annual",
  entitlementTable: TABLE,
  fixedDays: null,
  carryForwardEnabled: true,
  carryForwardCap: 3,
  carryForwardExpiryMonths: null,
  prorateOnJoin: false,
  prorateRounding: null,
};
const MC_PLAN: PlanPolicy = { ...ANNUAL_PLAN, code: "mc", entitlementTable: null, fixedDays: 14, carryForwardEnabled: false, carryForwardCap: null, prorateOnJoin: true, prorateRounding: "up" };
const UNPAID_PLAN: PlanPolicy = { ...MC_PLAN, code: "unpaid", fixedDays: 7, prorateOnJoin: false };

// Kelvin (local) joined 25 Sep 2023: service year 4 runs 25 Sep 2026 – 24 Sep 2027.
const KELVIN = { joinDate: "2023-09-25", classification: "local" as const };
// Maria (foreign) joined 20 Oct 2023: service year 3 ends 19 Oct 2026.
const MARIA = { joinDate: "2023-10-20", classification: "foreign" as const };
// Nur Aisyah (local) joined 1 Aug 2026: annual leave from 1 Nov 2026.
const NUR = { joinDate: "2026-08-01", classification: "local" as const };

function stored(periodStart: string, periodEnd: string, available: number, pending = 0): PeriodBalance {
  return { periodStart, periodEnd, source: "stored", available, pending, availableAfterPending: available - pending };
}

const KELVIN_ANNUAL = stored("2026-09-25", "2027-09-24", 10);

function datesFrom(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}
const full = (dates: string[]): SelectedDay[] => dates.map((date) => ({ date, portion: 1 }));

function request(overrides: Partial<ApplicationRequest> = {}): ApplicationRequest {
  return {
    leaveType: "annual",
    startDate: "2026-10-12",
    endDate: "2026-10-16",
    halfDay: false,
    halfDaySlot: null,
    days: full(datesFrom("2026-10-12", 5)),
    ...overrides,
  };
}

// The request's dates come from start/end unless given.
function range(start: string, end: string, overrides: Partial<ApplicationRequest> = {}): ApplicationRequest {
  const count = (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;
  return request({ startDate: start, endDate: end, days: full(datesFrom(start, count)), ...overrides });
}

function context(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    today: TODAY,
    employee: KELVIN,
    policy: ANNUAL,
    balances: [KELVIN_ANNUAL],
    bookedDays: [],
    hasApprovalRoute: true,
    ...overrides,
  };
}

const rules = (req: ApplicationRequest, ctx: ValidationContext) => validateApplication(req, ctx).map((i) => i.rule);
const messages = (req: ApplicationRequest, ctx: ValidationContext) =>
  validateApplication(req, ctx).map((i) => i.message);

describe("validateApplication(): a valid request", () => {
  it("passes with no issues", () => {
    expect(validateApplication(request(), context())).toEqual([]);
  });

  it("counts only the ticked dates", () => {
    // Mon 12 – Fri 16 Oct with Wed 14 unticked: 4 days.
    const ticked = request({ days: full(["2026-10-12", "2026-10-13", "2026-10-15", "2026-10-16"]) });
    expect(validateApplication(ticked, context({ balances: [stored("2026-09-25", "2027-09-24", 4)] }))).toEqual([]);
    expect(rules(ticked, context({ balances: [stored("2026-09-25", "2027-09-24", 3.5)] }))).toEqual(["balance"]);
  });
});

describe("validateApplication(): shape of the request", () => {
  it("needs an approval route", () => {
    const issues = validateApplication(request(), context({ hasApprovalRoute: false }));
    expect(issues).toEqual([{ field: "form", rule: "approval-route", message: APPROVAL_ROUTE_MISSING }]);
    expect(APPROVAL_ROUTE_MISSING).toBe("Your approval route hasn't been set up yet. Please contact HR.");
  });

  it("refuses an end date before the start date", () => {
    expect(rules(request({ startDate: "2026-10-16", endDate: "2026-10-12", days: [] }), context())).toContain(
      "date-order",
    );
  });

  it("allows at most 60 days in the range", () => {
    const big = [stored("2026-09-25", "2027-09-24", 100)];
    expect(validateApplication(range("2026-10-12", "2026-12-10"), context({ balances: big }))).toEqual([]);
    const tooLong = request({ startDate: "2026-10-12", endDate: "2026-12-11", days: full(datesFrom("2026-10-12", 61)) });
    expect(messages(tooLong, context({ balances: big }))).toContain(
      "A request can cover at most 60 days. Please split it into shorter requests.",
    );
  });

  it("needs at least half a day selected", () => {
    expect(messages(request({ days: [] }), context())).toEqual(["Select at least one day."]);
  });

  it("refuses dates outside the chosen range", () => {
    expect(rules(request({ days: full(["2026-10-12", "2026-10-20"]) }), context())).toEqual(["days-in-range"]);
  });
});

describe("validateApplication(): half days", () => {
  const half = (overrides: Partial<ApplicationRequest> = {}) =>
    request({
      startDate: "2026-10-14",
      endDate: "2026-10-14",
      halfDay: true,
      halfDaySlot: "morning",
      days: [{ date: "2026-10-14", portion: 0.5 }],
      ...overrides,
    });

  it("accepts a single-date half day with a slot (0.5 day)", () => {
    expect(validateApplication(half(), context({ balances: [stored("2026-09-25", "2027-09-24", 0.5)] }))).toEqual([]);
  });

  it("needs a single date", () => {
    const multi = half({ endDate: "2026-10-15", days: [{ date: "2026-10-14", portion: 0.5 }] });
    expect(rules(multi, context())).toContain("half-day-single-date");
  });

  it("needs a slot", () => {
    expect(messages(half({ halfDaySlot: null }), context())).toEqual(["Choose morning or afternoon."]);
  });

  it("refuses a half-day portion on a full-day request", () => {
    expect(rules(request({ days: [{ date: "2026-10-12", portion: 0.5 }] }), context())).toEqual(["days-in-range"]);
  });
});

describe("validateApplication(): eligibility", () => {
  const nurContext = context({ employee: NUR, balances: [stored("2026-08-01", "2027-07-31", 7)] });

  it("refuses annual leave before the eligible-from date", () => {
    expect(messages(range("2026-10-26", "2026-10-26"), nurContext)).toEqual(["You can take annual leave from 1 Nov 2026."]);
  });

  it("allows it from the eligible-from date", () => {
    expect(validateApplication(range("2026-11-01", "2026-11-02"), nurContext)).toEqual([]);
  });

  it("uses the MC eligibility for MC", () => {
    const mc = range("2026-10-02", "2026-10-02", { leaveType: "mc" });
    expect(
      validateApplication(mc, context({ employee: NUR, policy: MC, balances: [stored("2026-01-01", "2026-12-31", 6)] })),
    ).toEqual([]);
  });

  it("refuses before the join date", () => {
    expect(messages(request(), context({ employee: { ...NUR, joinDate: "2026-10-05" }, today: TODAY }))).toEqual([
      "You can apply for leave from your join date, 5 Oct 2026.",
    ]);
  });
});

describe("validateApplication(): backdating", () => {
  const mcContext = context({ policy: MC, balances: [stored("2026-01-01", "2026-12-31", 14)] });

  it("refuses annual and unpaid leave starting in the past", () => {
    expect(messages(range("2026-09-30", "2026-10-02"), context())).toEqual(["Annual leave can't start in the past."]);
    const unpaid = range("2026-09-30", "2026-09-30", { leaveType: "unpaid" });
    expect(messages(unpaid, context({ policy: UNPAID, balances: [stored("2026-01-01", "2026-12-31", 7)] }))).toEqual([
      "Unpaid leave can't start in the past.",
    ]);
  });

  it("allows MC up to 14 days in the past (provisional)", () => {
    expect(validateApplication(range("2026-09-17", "2026-09-18", { leaveType: "mc" }), mcContext)).toEqual([]);
    expect(messages(range("2026-09-16", "2026-09-17", { leaveType: "mc" }), mcContext)).toEqual([
      "MC can start at most 14 days ago (17 Sep 2026 or later).",
    ]);
  });

  it("lets an admin applying on behalf backdate any type", () => {
    expect(validateApplication(range("2026-09-28", "2026-09-29"), context({ onBehalf: true }))).toEqual([]);
    expect(validateApplication(range("2026-09-01", "2026-09-01", { leaveType: "mc" }), { ...mcContext, onBehalf: true })).toEqual([]);
  });
});

describe("validateApplication(): foreign advance notice", () => {
  const mariaContext = context({ employee: MARIA, balances: [stored("2025-10-20", "2026-10-19", 9)] });

  it("needs annual leave to start at least 14 days after today", () => {
    expect(messages(range("2026-10-14", "2026-10-14"), mariaContext)).toEqual([
      "Foreign staff must apply for annual leave at least 14 days ahead. The earliest start date is 15 Oct 2026.",
    ]);
    expect(validateApplication(range("2026-10-15", "2026-10-16"), mariaContext)).toEqual([]);
  });

  it("is skipped with an admin override", () => {
    const overridden = { ...mariaContext, onBehalf: true, noticeOverridden: true };
    expect(validateApplication(range("2026-10-02", "2026-10-02"), overridden)).toEqual([]);
  });

  it("does not apply to local staff or to MC", () => {
    expect(validateApplication(range("2026-10-02", "2026-10-02"), context())).toEqual([]);
    const mc = range("2026-10-02", "2026-10-02", { leaveType: "mc" });
    expect(validateApplication(mc, { ...mariaContext, policy: MC, balances: [stored("2026-01-01", "2026-12-31", 14)] })).toEqual([]);
  });
});

describe("validateApplication(): one period per request", () => {
  it("refuses annual leave that crosses the leave-year boundary", () => {
    // Maria's leave year renews on 20 Oct 2026.
    const crossing = range("2026-10-18", "2026-10-21");
    expect(validateApplication(crossing, context({ employee: MARIA }))).toEqual([
      {
        field: "days",
        rule: "one-period",
        message:
          "These dates cross into a new leave year on 20 Oct 2026. Please split this into two requests: one up to 19 Oct 2026 and one from 20 Oct 2026.",
      },
    ]);
  });

  it("refuses MC that crosses 1 January", () => {
    const crossing = range("2026-12-30", "2027-01-02", { leaveType: "mc" });
    const issues = validateApplication(crossing, context({ today: "2026-12-10", policy: MC }));
    expect(issues.map((i) => i.rule)).toEqual(["one-period"]);
    expect(issues[0].message).toContain("new calendar year on 1 Jan 2027");
  });

  it("is fine when the unticked dates are the ones across the boundary", () => {
    const beforeOnly = request({
      startDate: "2026-10-18",
      endDate: "2026-10-21",
      days: full(["2026-10-18", "2026-10-19"]),
    });
    expect(validateApplication(beforeOnly, context({ employee: MARIA, balances: [stored("2025-10-20", "2026-10-19", 9)] }))).toEqual([]);
  });
});

describe("validateApplication(): balance", () => {
  it("checks annual leave against available after pending", () => {
    const withPending = context({ balances: [stored("2026-09-25", "2027-09-24", 10, 7)] });
    expect(messages(request(), withPending)).toEqual([
      "You have 3 days of annual leave available (after your pending requests); you selected 5 days.",
    ]);
  });

  it("checks MC", () => {
    const mc = range("2026-10-05", "2026-10-07", { leaveType: "mc" });
    expect(messages(mc, context({ policy: MC, balances: [stored("2026-01-01", "2026-12-31", 2)] }))).toEqual([
      "You have 2 days of MC available; you selected 3 days.",
    ]);
  });

  it("checks unpaid leave against the yearly allowance (7 + adjustments − used − pending)", () => {
    // 7 + 1 adjustment − 4 used − 2 pending = 2 left.
    const unpaid = range("2026-10-05", "2026-10-07", { leaveType: "unpaid" });
    const balances = [stored("2026-01-01", "2026-12-31", 4, 2)];
    expect(messages(unpaid, context({ policy: UNPAID, balances }))).toEqual([
      "Your unpaid leave allowance has 2 days left (after your pending requests); you selected 3 days.",
    ]);
  });

  it("refuses a period with no balance, unless the caller only knows some periods", () => {
    const mc = range("2026-09-20", "2026-09-20", { leaveType: "mc" });
    const noRow = context({ today: "2027-01-02", policy: MC, balances: [] });
    expect(rules(mc, { ...noRow, onBehalf: true })).toEqual(["no-balance"]);
    expect(rules(mc, { ...noRow, onBehalf: true, partialBalances: true })).toEqual([]);
  });
});

describe("validateApplication(): overlap per date", () => {
  it("refuses a ticked date that is already booked", () => {
    const booked = context({ bookedDays: [{ date: "2026-10-14", portion: 1 }, { date: "2026-11-02", portion: 1 }] });
    expect(messages(request(), booked)).toEqual([
      "You already have leave on 14 Oct 2026. Untick that date or cancel the other request.",
    ]);
  });

  it("refuses a second half day on a date that already has one", () => {
    const halfDay = request({
      startDate: "2026-10-14",
      endDate: "2026-10-14",
      halfDay: true,
      halfDaySlot: "afternoon",
      days: [{ date: "2026-10-14", portion: 0.5 }],
    });
    expect(messages(halfDay, context({ bookedDays: [{ date: "2026-10-14", portion: 0.5 }] }))).toEqual([
      "You already have a half day on 14 Oct 2026. To take the whole day, cancel that request and apply for a full day.",
    ]);
    expect(messages(halfDay, context({ bookedDays: [{ date: "2026-10-14", portion: 1 }] }))).toEqual([
      "You already have leave on 14 Oct 2026. Untick that date or cancel the other request.",
    ]);
  });

  it("allows it when that date is unticked", () => {
    const booked = context({ bookedDays: [{ date: "2026-10-14", portion: 1 }] });
    const unticked = request({ days: full(["2026-10-12", "2026-10-13", "2026-10-15", "2026-10-16"]) });
    expect(validateApplication(unticked, booked)).toEqual([]);
  });
});

describe("validateApplication(): the next period (base entitlement only)", () => {
  const kelvinNext = nextPeriodFor("annual", KELVIN.joinDate, TODAY)!;

  it("finds the next period and its base entitlement without a stored row", () => {
    expect(kelvinNext).toEqual({ start: "2027-09-25", end: "2028-09-24", serviceYear: 5 });
    expect(baseEntitlement(ANNUAL_PLAN, KELVIN.joinDate, kelvinNext)).toBe(11);
    expect(periodRelation("annual", KELVIN.joinDate, TODAY, kelvinNext)).toBe("next");
  });

  const nextContext = (usage = { approved: 0, pending: 0 }) =>
    context({
      balances: [KELVIN_ANNUAL, projectedPeriodBalance(kelvinNext, baseEntitlement(ANNUAL_PLAN, KELVIN.joinDate, kelvinNext), usage)],
    });

  it("accepts a request within the base entitlement", () => {
    expect(validateApplication(range("2027-10-04", "2027-10-08"), nextContext())).toEqual([]);
  });

  it("refuses a request over the base entitlement, carry-forward ignored", () => {
    // Kelvin may carry up to 3 days into that year, but only the base 11 count.
    expect(messages(range("2027-10-04", "2027-10-15"), nextContext())).toEqual([
      "You have 11 days of annual leave available; you selected 12 days.",
    ]);
  });

  it("subtracts days already requested in that period", () => {
    expect(rules(range("2027-10-04", "2027-10-11"), nextContext({ approved: 0, pending: 4 }))).toEqual(["balance"]);
    expect(validateApplication(range("2027-10-04", "2027-10-10"), nextContext({ approved: 0, pending: 4 }))).toEqual([]);
  });

  it("refuses dates two or more periods ahead", () => {
    expect(messages(range("2028-10-02", "2028-10-03"), nextContext())).toEqual([
      "You can only request leave up to the end of your next leave year.",
    ]);
  });

  it("accepts MC and unpaid leave for next January", () => {
    const today = "2026-12-10";
    const mcNext = nextPeriodFor("mc", KELVIN.joinDate, today)!;
    expect(mcNext).toEqual({ start: "2027-01-01", end: "2027-12-31" });
    const mcBalance = projectedPeriodBalance(mcNext, baseEntitlement(MC_PLAN, KELVIN.joinDate, mcNext), { approved: 0, pending: 0 });
    expect(mcBalance.available).toBe(14);
    const mc = range("2027-01-04", "2027-01-05", { leaveType: "mc" });
    expect(validateApplication(mc, context({ today, policy: MC, balances: [mcBalance] }))).toEqual([]);

    const unpaidBalance = projectedPeriodBalance(mcNext, baseEntitlement(UNPAID_PLAN, KELVIN.joinDate, mcNext), {
      approved: 0,
      pending: 0,
    });
    expect(unpaidBalance.available).toBe(7);
    const unpaid = range("2027-01-04", "2027-01-08", { leaveType: "unpaid" });
    expect(validateApplication(unpaid, context({ today, policy: UNPAID, balances: [unpaidBalance] }))).toEqual([]);
  });

  it("gives a mid-year joiner the full MC next year", () => {
    const period = { start: "2027-01-01", end: "2027-12-31" };
    expect(baseEntitlement(MC_PLAN, "2026-07-01", period)).toBe(14);
  });

  it("lets a foreign employee book the first days of their next leave year 14+ days ahead", () => {
    const mariaNext = nextPeriodFor("annual", MARIA.joinDate, TODAY)!;
    expect(mariaNext.start).toBe("2026-10-20");
    const balances = [
      stored("2025-10-20", "2026-10-19", 9),
      projectedPeriodBalance(mariaNext, baseEntitlement(ANNUAL_PLAN, MARIA.joinDate, mariaNext), { approved: 0, pending: 0 }),
    ];
    expect(validateApplication(range("2026-10-20", "2026-10-22"), context({ employee: MARIA, balances }))).toEqual([]);
  });
});

describe("periodRelation()", () => {
  it("places periods relative to today's", () => {
    const at = (start: string, end: string) => periodRelation("annual", KELVIN.joinDate, TODAY, { start, end });
    expect(at("2026-09-25", "2027-09-24")).toBe("current");
    expect(at("2025-09-25", "2026-09-24")).toBe("past");
    expect(at("2027-09-25", "2028-09-24")).toBe("next");
    expect(at("2028-09-25", "2029-09-24")).toBe("beyond");
    expect(periodRelation("annual", "2026-11-01", TODAY, { start: "2026-11-01", end: "2027-10-31" })).toBeNull();
  });
});

describe("issuesByField()", () => {
  it("joins messages per field", () => {
    const issues = validateApplication(request(), context({ hasApprovalRoute: false, bookedDays: [{ date: "2026-10-12", portion: 1 }], balances: [stored("2026-09-25", "2027-09-24", 1)] }));
    const byField = issuesByField(issues);
    expect(byField.form).toBe(APPROVAL_ROUTE_MISSING);
    expect(byField.days).toContain("You have 1 day of annual leave available");
    expect(byField.days).toContain("You already have leave on 12 Oct 2026.");
  });
});
