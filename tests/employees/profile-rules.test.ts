import { describe, expect, it } from "vitest";

import { isAtLeastAge, isJoinDateAllowed, isValidIsoDate } from "@/lib/employees/profile-rules";

const TODAY = "2026-09-23";

describe("isValidIsoDate()", () => {
  it("accepts real dates", () => {
    expect(isValidIsoDate("2026-09-23")).toBe(true);
    expect(isValidIsoDate("2024-02-29")).toBe(true);
  });

  it("rejects impossible or badly formatted dates", () => {
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2025-02-29")).toBe(false);
    expect(isValidIsoDate("23/09/2026")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
  });
});

describe("isAtLeastAge() — minimum 16", () => {
  it("allows someone turning 16 today", () => {
    expect(isAtLeastAge("2010-09-23", TODAY)).toBe(true);
  });

  it("blocks someone turning 16 tomorrow", () => {
    expect(isAtLeastAge("2010-09-24", TODAY)).toBe(false);
  });

  it("allows adults", () => {
    expect(isAtLeastAge("1990-01-01", TODAY)).toBe(true);
  });

  it("treats a 29 February birthday as 28 February in non-leap years", () => {
    // Born 2008-02-29, turns 16 on 2024-02-29 (leap year).
    expect(isAtLeastAge("2008-02-29", "2024-02-28")).toBe(false);
    expect(isAtLeastAge("2008-02-29", "2024-02-29")).toBe(true);
    // Born 2012-02-29, 16th birthday in 2028 (leap) — check a non-leap target age.
    expect(isAtLeastAge("2012-02-29", "2029-02-28", 17)).toBe(true);
  });
});

describe("isJoinDateAllowed() — at most 90 days ahead", () => {
  it("allows past and current dates", () => {
    expect(isJoinDateAllowed("2017-09-23", TODAY)).toBe(true);
    expect(isJoinDateAllowed(TODAY, TODAY)).toBe(true);
  });

  it("allows exactly 90 days ahead", () => {
    expect(isJoinDateAllowed("2026-12-22", TODAY)).toBe(true);
  });

  it("blocks 91 days ahead", () => {
    expect(isJoinDateAllowed("2026-12-23", TODAY)).toBe(false);
  });
});
