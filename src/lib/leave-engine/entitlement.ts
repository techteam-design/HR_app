// Annual leave entitlement by service year. Pure: no database.
// The policy table lists days per service year (seed: years 1–8 = 7…14).
// Any year beyond the highest entry uses that highest entry.

export type EntitlementTable = { serviceYear: number; days: number }[];

export function annualEntitlement(serviceYear: number, table: EntitlementTable): number {
  if (table.length === 0) throw new Error("The annual entitlement table is empty");
  const sorted = [...table].sort((a, b) => a.serviceYear - b.serviceYear);

  let days = sorted[0].days;
  for (const row of sorted) {
    if (row.serviceYear > serviceYear) break;
    days = row.days;
  }
  return days;
}
