import { z } from "zod";

import { normalizeUnitName, ORG_UNIT_NAME_MAX, ORG_UNIT_NAME_MIN } from "@/lib/org/org-units";

// Shared by departments and branches (same rules), used by the API routes
// (server) and the manage dialogs (client). Names are trimmed and runs of
// spaces collapsed before the length check.
export const orgUnitNameSchema = z.preprocess(
  (value) => (typeof value === "string" ? normalizeUnitName(value) : value),
  z
    .string({ error: "Name is required" })
    .min(1, "Name is required")
    .min(ORG_UNIT_NAME_MIN, `Name must be at least ${ORG_UNIT_NAME_MIN} characters`)
    .max(ORG_UNIT_NAME_MAX, `Name must be at most ${ORG_UNIT_NAME_MAX} characters`),
);

export const createOrgUnitSchema = z.object({ name: orgUnitNameSchema });

// PATCH: rename, change active/inactive, or both.
export const updateOrgUnitSchema = z
  .object({
    name: orgUnitNameSchema.optional(),
    isActive: z.boolean({ error: "isActive must be true or false" }).optional(),
  })
  .refine((value) => value.name !== undefined || value.isActive !== undefined, {
    message: "Nothing to update",
    path: ["form"],
  });

export type CreateOrgUnitInput = z.infer<typeof createOrgUnitSchema>;
export type UpdateOrgUnitInput = z.infer<typeof updateOrgUnitSchema>;

export const createDepartmentSchema = createOrgUnitSchema;
export const updateDepartmentSchema = updateOrgUnitSchema;
