// Pure rules for departments and branches ("org units"). No database:
// callers pass the existing names or the assigned employees.

export const ORG_UNIT_NAME_MIN = 2;
export const ORG_UNIT_NAME_MAX = 60;
// How many assigned employees to name when deactivation is blocked.
export const BLOCKER_NAME_LIMIT = 10;

// Trims and collapses runs of spaces: "  Front   desk " → "Front desk".
export function normalizeUnitName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

// Comparison key: names are unique case-insensitively, so "Front desk" and
// "front  DESK" are the same department.
export function unitNameKey(name: string): string {
  return normalizeUnitName(name).toLocaleLowerCase("en");
}

// The existing unit that already uses this name, ignoring `excludeId` (the
// unit being renamed, so changing only its capitalisation is allowed).
export function findNameConflict<T extends { id: string; name: string }>(
  name: string,
  existing: readonly T[],
  excludeId?: string,
): T | null {
  const key = unitNameKey(name);
  return existing.find((unit) => unit.id !== excludeId && unitNameKey(unit.name) === key) ?? null;
}

export type DeactivationCheck = { allowed: true } | { allowed: false; details: string[] };

// A department or branch cannot be deactivated while any active or
// probation employee is assigned to it. `assigned` must already exclude
// inactive employees. Names the first 10, then "and N more".
export function checkUnitDeactivation(
  assigned: readonly { fullName: string; employeeCode: string }[],
  limit = BLOCKER_NAME_LIMIT,
): DeactivationCheck {
  if (assigned.length === 0) return { allowed: true };
  const details = assigned.slice(0, limit).map((e) => `${e.fullName} (${e.employeeCode})`);
  const more = assigned.length - limit;
  if (more > 0) details.push(`and ${more} more`);
  return { allowed: false, details };
}
