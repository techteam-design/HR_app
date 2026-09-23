import { describe, expect, it } from "vitest";

import { formatLongDate, greetingFor, singaporeHour } from "@/lib/utils/dates";

// Singapore is UTC+8 with no daylight saving.
const sgt = (isoUtc: string) => new Date(isoUtc);

describe("singaporeHour()", () => {
  it("converts UTC to Singapore time", () => {
    expect(singaporeHour(sgt("2026-09-23T00:00:00Z"))).toBe(8);
    expect(singaporeHour(sgt("2026-09-23T16:00:00Z"))).toBe(0);
  });
});

describe("greetingFor()", () => {
  it("says good morning from 05:00 to 11:59 SGT", () => {
    expect(greetingFor(sgt("2026-09-22T21:00:00Z"))).toBe("Good morning"); // 05:00
    expect(greetingFor(sgt("2026-09-23T03:59:00Z"))).toBe("Good morning"); // 11:59
  });

  it("says good afternoon from 12:00 to 17:59 SGT", () => {
    expect(greetingFor(sgt("2026-09-23T04:00:00Z"))).toBe("Good afternoon"); // 12:00
    expect(greetingFor(sgt("2026-09-23T09:59:00Z"))).toBe("Good afternoon"); // 17:59
  });

  it("says good evening from 18:00 to 04:59 SGT", () => {
    expect(greetingFor(sgt("2026-09-23T10:00:00Z"))).toBe("Good evening"); // 18:00
    expect(greetingFor(sgt("2026-09-23T16:30:00Z"))).toBe("Good evening"); // 00:30
    expect(greetingFor(sgt("2026-09-23T20:59:00Z"))).toBe("Good evening"); // 04:59
  });
});

describe("formatLongDate()", () => {
  it("uses the Singapore calendar date", () => {
    // 23 Sep 17:00 UTC is already 24 Sep in Singapore.
    expect(formatLongDate(sgt("2026-09-23T17:00:00Z"))).toBe("Thursday, 24 September 2026");
  });
});
