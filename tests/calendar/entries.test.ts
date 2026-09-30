import { describe, expect, it } from "vitest";

import {
  cellEntries,
  defaultLayout,
  detailedEntries,
  entryLabel,
  halfDayText,
  LEAVE_CODES,
  ON_LEAVE_LABEL,
  publicEntries,
  shortName,
  type CalendarRow,
} from "@/lib/calendar/entries";

const row = (overrides: Partial<CalendarRow>): CalendarRow => ({
  date: "2026-10-19",
  portion: 1,
  halfDaySlot: null,
  applicationId: "app-1",
  startDate: "2026-10-19",
  endDate: "2026-10-20",
  employeeId: "maria",
  fullName: "Maria Santos",
  photoUrl: null,
  departmentName: "Beauty Therapy",
  branchName: "Branch B",
  code: "mc",
  status: "approved",
  ...overrides,
});

// Exactly what an employee's browser may receive for one entry.
const PUBLIC_KEYS = [
  "applicationId",
  "branchName",
  "date",
  "departmentName",
  "employeeId",
  "endDate",
  "fullName",
  "halfDaySlot",
  "key",
  "leave",
  "photoUrl",
  "portion",
  "startDate",
];

describe("publicEntries() (employee view)", () => {
  const rows = [
    row({}),
    row({ applicationId: "app-2", employeeId: "priya", fullName: "Priya Nair", status: "pending", code: "annual" }),
    row({ applicationId: "app-3", employeeId: "siti", fullName: "Siti Rahman", code: "unpaid", portion: 0.5, halfDaySlot: "afternoon" }),
  ];
  const entries = publicEntries(rows);

  it("keeps approved leave only", () => {
    expect(entries.map((e) => e.fullName)).toEqual(["Maria Santos", "Siti Rahman"]);
  });

  it("strips the leave type, status and request id", () => {
    for (const entry of entries) {
      expect(Object.keys(entry).sort()).toEqual(PUBLIC_KEYS);
      expect(entry.leave).toBeNull();
      expect(entry.applicationId).toBeNull();
      expect(entry.key).not.toContain("app-");
    }
    const json = JSON.stringify(entries);
    for (const hidden of ['"mc"', '"unpaid"', '"annual"', "approved", "pending", "app-"]) {
      expect(json).not.toContain(hidden);
    }
  });

  it("keeps the person, dates and half day", () => {
    expect(entries[1]).toMatchObject({
      fullName: "Siti Rahman",
      departmentName: "Beauty Therapy",
      branchName: "Branch B",
      startDate: "2026-10-19",
      endDate: "2026-10-20",
      portion: 0.5,
      halfDaySlot: "afternoon",
    });
    expect(entryLabel(entries[0])).toBe(ON_LEAVE_LABEL);
  });

  it("ignores extra fields on the row (built field by field)", () => {
    const withExtra = { ...row({}), reason: "Family trip", cancellationNote: "x", balance: 3 } as CalendarRow;
    expect(Object.keys(publicEntries([withExtra])[0]).sort()).toEqual(PUBLIC_KEYS);
  });
});

describe("detailedEntries() (manager, HR viewer, admin)", () => {
  it("keeps pending and the type", () => {
    const entries = detailedEntries([row({}), row({ applicationId: "app-2", status: "pending", code: "annual" })]);
    expect(entries.map((e) => e.leave)).toEqual([
      { code: "mc", status: "approved" },
      { code: "annual", status: "pending" },
    ]);
    expect(entries[1].applicationId).toBe("app-2");
    expect(entries.map(entryLabel)).toEqual(["MC", "AL"]);
  });
});

describe("labels", () => {
  it("leave codes", () => {
    expect(LEAVE_CODES).toEqual({ annual: "AL", mc: "MC", unpaid: "UL" });
    expect(entryLabel({ leave: { code: "unpaid", status: "approved" } })).toBe("UL");
    expect(entryLabel({ leave: null })).toBe("On leave");
  });

  it("halfDayText", () => {
    expect(halfDayText(1, null)).toBe("");
    expect(halfDayText(0.5, "morning")).toBe("½ AM");
    expect(halfDayText(0.5, "afternoon")).toBe("½ PM");
    expect(halfDayText(0.5, null)).toBe("½");
  });

  it("shortName: first name and surname initial, never cut mid-word", () => {
    expect(shortName("Maria Santos")).toBe("Maria S.");
    expect(shortName("Nguyen Thi Lan")).toBe("Nguyen L.");
    expect(shortName("  priya   nair ")).toBe("priya N.");
    expect(shortName("Madonna")).toBe("Madonna");
    expect(shortName("")).toBe("");
  });
});

describe("cellEntries() (+N more)", () => {
  it("shows everything up to 3", () => {
    expect(cellEntries([1, 2, 3])).toEqual({ shown: [1, 2, 3], more: 0 });
    expect(cellEntries([])).toEqual({ shown: [], more: 0 });
  });

  it("shows 3, then +N for the rest", () => {
    expect(cellEntries([1, 2, 3, 4])).toEqual({ shown: [1, 2, 3], more: 1 });
    expect(cellEntries([1, 2, 3, 4, 5, 6, 7])).toEqual({ shown: [1, 2, 3], more: 4 });
  });

  it("takes another limit", () => {
    expect(cellEntries([1, 2, 3], 2)).toEqual({ shown: [1, 2], more: 1 });
  });
});

describe("defaultLayout()", () => {
  it("uses the remembered choice", () => {
    expect(defaultLayout("month", true)).toBe("month");
    expect(defaultLayout("list", false)).toBe("list");
  });

  it("otherwise List on narrow screens, Month on wide ones", () => {
    expect(defaultLayout(null, true)).toBe("list");
    expect(defaultLayout(null, false)).toBe("month");
    expect(defaultLayout("bogus", false)).toBe("month");
  });
});
