import { describe, expect, it } from "vitest";

import { formatServiceLength, lengthOfService } from "@/lib/employees/service-length";

describe("lengthOfService()", () => {
  it("is zero on the join date", () => {
    expect(lengthOfService("2026-09-24", "2026-09-24")).toEqual({ years: 0, months: 0 });
  });

  it("returns null when the join date is still in the future", () => {
    expect(lengthOfService("2026-10-01", "2026-09-24")).toBeNull();
  });

  it("completes a year exactly on the anniversary day, not the day before", () => {
    expect(lengthOfService("2023-09-24", "2026-09-23")).toEqual({ years: 2, months: 11 });
    expect(lengthOfService("2023-09-24", "2026-09-24")).toEqual({ years: 3, months: 0 });
    expect(lengthOfService("2023-09-24", "2026-09-25")).toEqual({ years: 3, months: 0 });
  });

  it("counts whole months", () => {
    expect(lengthOfService("2025-08-15", "2026-09-14")).toEqual({ years: 1, months: 0 });
    expect(lengthOfService("2025-08-15", "2026-09-15")).toEqual({ years: 1, months: 1 });
    expect(lengthOfService("2026-01-10", "2026-06-30")).toEqual({ years: 0, months: 5 });
  });

  it("crosses year ends correctly", () => {
    expect(lengthOfService("2025-11-20", "2026-01-19")).toEqual({ years: 0, months: 1 });
    expect(lengthOfService("2025-11-20", "2026-01-20")).toEqual({ years: 0, months: 2 });
  });

  it("completes a month on the last day of a shorter month", () => {
    expect(lengthOfService("2026-01-31", "2026-02-27")).toEqual({ years: 0, months: 0 });
    expect(lengthOfService("2026-01-31", "2026-02-28")).toEqual({ years: 0, months: 1 });
    expect(lengthOfService("2026-03-31", "2026-04-30")).toEqual({ years: 0, months: 1 });
  });

  describe("leap years", () => {
    it("a 29 February joiner completes a year on 28 February in a non-leap year", () => {
      expect(lengthOfService("2024-02-29", "2025-02-27")).toEqual({ years: 0, months: 11 });
      expect(lengthOfService("2024-02-29", "2025-02-28")).toEqual({ years: 1, months: 0 });
    });

    it("and on 29 February in the next leap year", () => {
      expect(lengthOfService("2024-02-29", "2028-02-28")).toEqual({ years: 3, months: 11 });
      expect(lengthOfService("2024-02-29", "2028-02-29")).toEqual({ years: 4, months: 0 });
    });

    it("a 31 January joiner completes a month on 29 February in a leap year", () => {
      expect(lengthOfService("2028-01-31", "2028-02-28")).toEqual({ years: 0, months: 0 });
      expect(lengthOfService("2028-01-31", "2028-02-29")).toEqual({ years: 0, months: 1 });
    });
  });
});

describe("formatServiceLength()", () => {
  it("always shows years and months", () => {
    expect(formatServiceLength({ years: 3, months: 0 })).toBe("3 years 0 months");
    expect(formatServiceLength({ years: 0, months: 5 })).toBe("0 years 5 months");
  });

  it("uses the singular for one", () => {
    expect(formatServiceLength({ years: 1, months: 1 })).toBe("1 year 1 month");
  });
});
