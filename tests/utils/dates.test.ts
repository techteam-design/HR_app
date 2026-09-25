import { describe, expect, it } from "vitest";

import { bruneiHour, formatDateRange, formatDisplayDate, formatLongDate, formatWeekdayDate, greetingFor } from "@/lib/utils/dates";

// Brunei is UTC+8 with no daylight saving.
const bnt = (isoUtc: string) => new Date(isoUtc);

describe("bruneiHour()", () => {
  it("converts UTC to Brunei time", () => {
    expect(bruneiHour(bnt("2026-09-23T00:00:00Z"))).toBe(8);
    expect(bruneiHour(bnt("2026-09-23T16:00:00Z"))).toBe(0);
  });
});

describe("greetingFor()", () => {
  it("says good morning from 05:00 to 11:59 BNT", () => {
    expect(greetingFor(bnt("2026-09-22T21:00:00Z"))).toBe("Good morning"); // 05:00
    expect(greetingFor(bnt("2026-09-23T03:59:00Z"))).toBe("Good morning"); // 11:59
  });

  it("says good afternoon from 12:00 to 17:59 BNT", () => {
    expect(greetingFor(bnt("2026-09-23T04:00:00Z"))).toBe("Good afternoon"); // 12:00
    expect(greetingFor(bnt("2026-09-23T09:59:00Z"))).toBe("Good afternoon"); // 17:59
  });

  it("says good evening from 18:00 to 04:59 BNT", () => {
    expect(greetingFor(bnt("2026-09-23T10:00:00Z"))).toBe("Good evening"); // 18:00
    expect(greetingFor(bnt("2026-09-23T16:30:00Z"))).toBe("Good evening"); // 00:30
    expect(greetingFor(bnt("2026-09-23T20:59:00Z"))).toBe("Good evening"); // 04:59
  });
});

describe("formatLongDate()", () => {
  it("uses the Brunei calendar date", () => {
    // 23 Sep 17:00 UTC is already 24 Sep in Brunei.
    expect(formatLongDate(bnt("2026-09-23T17:00:00Z"))).toBe("Thursday, 24 September 2026");
  });
});

describe("short date formats", () => {
  it("uses three-letter months, including Sep", () => {
    expect(formatDisplayDate("2026-09-25")).toBe("25 Sep 2026");
    expect(formatDisplayDate("2027-01-01")).toBe("1 Jan 2027");
    expect(formatWeekdayDate("2026-09-28")).toBe("Mon 28 Sep");
    expect(formatDateRange("2026-09-30", "2026-10-02")).toBe("30 Sep – 2 Oct 2026");
    expect(formatDateRange("2026-09-14", "2026-09-18")).toBe("14 – 18 Sep 2026");
    expect(formatDateRange("2026-12-30", "2027-01-02")).toBe("30 Dec 2026 – 2 Jan 2027");
  });

  it("returns invalid values unchanged", () => {
    expect(formatDisplayDate("not-a-date")).toBe("not-a-date");
  });
});
