import type { CreateOrgUnitInput, UpdateOrgUnitInput } from "@/validations/department";

import { createOrgUnit, listOrgUnits, updateOrgUnit } from "./org-unit.service";

// Branches: shared rules live in org-unit.service.

export function listBranches() {
  return listOrgUnits("branch");
}

export function createBranch(input: CreateOrgUnitInput) {
  return createOrgUnit("branch", input);
}

export function updateBranch(id: string, input: UpdateOrgUnitInput) {
  return updateOrgUnit("branch", id, input);
}
