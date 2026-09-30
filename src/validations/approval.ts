import { z } from "zod";

// Shared by the approval API routes (server) and the forms (client). The
// business rules (approvers active managers or admins, nobody approves
// themself...) are checked by src/lib/approvals/route-config.ts in the
// service; these schemas only check the shape.

const uuid = (message: string) => z.uuid({ error: message });

// "" or missing means "none".
const optionalUuid = (message: string) =>
  z.preprocess((value) => (value === "" || value === undefined ? null : value), uuid(message).nullable());

export const APPROVAL_MODES = ["single", "two_level"] as const;

export const routeSchema = z
  .object({
    mode: z.enum(APPROVAL_MODES, { error: "Choose single level or two levels" }),
    level1ApproverId: uuid("Choose the level 1 approver"),
    level2ApproverId: optionalUuid("Choose the level 2 approver"),
  })
  .superRefine((value, context) => {
    if (value.mode !== "two_level") return;
    if (!value.level2ApproverId) {
      context.addIssue({ code: "custom", path: ["level2ApproverId"], message: "Choose the level 2 approver" });
    } else if (value.level2ApproverId === value.level1ApproverId) {
      context.addIssue({
        code: "custom",
        path: ["level2ApproverId"],
        message: "Level 1 and level 2 must be different people",
      });
    }
  })
  // A single-level route has no level 2 approver.
  .transform((value) => (value.mode === "single" ? { ...value, level2ApproverId: null } : value));

export type RouteInput = z.infer<typeof routeSchema>;

export const managersApproverSchema = z.object({
  managersApproverId: optionalUuid("Choose an active admin"),
});

export const MAX_BULK_EMPLOYEES = 200;

const employeeIds = z
  .array(uuid("Invalid employee"), { error: "Select at least one employee" })
  .min(1, "Select at least one employee")
  .max(MAX_BULK_EMPLOYEES, `Select at most ${MAX_BULK_EMPLOYEES} employees`)
  .transform((ids) => [...new Set(ids)]);

export const bulkRouteSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set"), employeeIds, route: routeSchema }),
  z.object({ action: z.literal("reset"), employeeIds }),
]);

export type BulkRouteInput = z.infer<typeof bulkRouteSchema>;

export const MIN_REMARKS_LENGTH = 3;

// Remarks are optional to approve and required to reject.
export const decisionSchema = z
  .object({
    action: z.enum(["approve", "reject"], { error: "Choose approve or reject" }),
    remarks: z.preprocess(
      (value) => (typeof value === "string" ? value.trim() || null : (value ?? null)),
      z.string().max(500, "Remarks must be at most 500 characters").nullable(),
    ),
    // The level the approver saw; a request that moved on is refused.
    expectedLevel: z.union([z.literal(1), z.literal(2)], { error: "Invalid level" }),
  })
  .superRefine((value, context) => {
    if (value.action === "reject" && (value.remarks?.length ?? 0) < MIN_REMARKS_LENGTH) {
      context.addIssue({
        code: "custom",
        path: ["remarks"],
        message: `Remarks are required to reject (at least ${MIN_REMARKS_LENGTH} characters)`,
      });
    }
  });

export type DecisionInput = z.infer<typeof decisionSchema>;

// Query-string filters; anything invalid means "all".
const optionalFilterId = z.uuid().optional().catch(undefined);

export const setupFilterSchema = z.object({
  departmentId: optionalFilterId,
  branchId: optionalFilterId,
  problems: z
    .enum(["1"])
    .optional()
    .catch(undefined)
    .transform((value) => value === "1"),
});

export const calendarFilterSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .catch(undefined),
  departmentId: optionalFilterId,
  branchId: optionalFilterId,
});

export const QUEUE_VIEWS = ["mine", "all", "decided"] as const;
export type QueueView = (typeof QUEUE_VIEWS)[number];

export const queueViewSchema = z.enum(QUEUE_VIEWS).catch("mine");
