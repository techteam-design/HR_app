// Pure reporting-line rules. No database: callers pass the current
// employee → manager map.

export type ManagerMap = ReadonlyMap<string, string | null>;

// True if making `managerId` the reporting manager of `employeeId` would
// create a loop (A → B → A, or any longer chain back to the employee),
// including an employee reporting to themself.
export function wouldCreateReportingCycle(
  employeeId: string,
  managerId: string | null,
  managerOf: ManagerMap,
): boolean {
  if (managerId === null) return false;
  if (managerId === employeeId) return true;

  const visited = new Set<string>();
  let current: string | null = managerId;
  while (current !== null) {
    if (current === employeeId) return true;
    // Stop on an existing loop that does not include this employee.
    if (visited.has(current)) return false;
    visited.add(current);
    current = managerOf.get(current) ?? null;
  }
  return false;
}
