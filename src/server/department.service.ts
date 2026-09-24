import type { CreateOrgUnitInput, UpdateOrgUnitInput } from "@/validations/department";

import { createOrgUnit, listOrgUnits, updateOrgUnit } from "./org-unit.service";

// Departments: shared rules live in org-unit.service.

export function listDepartments() {
  return listOrgUnits("department");
}

export function createDepartment(input: CreateOrgUnitInput) {
  return createOrgUnit("department", input);
}

export function updateDepartment(id: string, input: UpdateOrgUnitInput) {
  return updateOrgUnit("department", id, input);
}
