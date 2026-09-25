import { ok, readJson, serviceError, validationError } from "@/server/api-response";
import { requireApiEmployee } from "@/server/auth.service";
import { loadLeavePolicies, updateLeavePolicy } from "@/server/leave-policy.service";
import { policyUpdateSchema } from "@/validations/leave";

// GET: every leave type with its policy. admin + hr_viewer.
export async function GET() {
  const access = await requireApiEmployee("view_all_records");
  if (!access.ok) return access.response;

  return ok({ policies: await loadLeavePolicies() });
}

// PATCH: update one leave type's policy (body.code picks which). admin only.
// Existing entitlement rows are not recalculated.
export async function PATCH(request: Request) {
  const access = await requireApiEmployee("manage_policies");
  if (!access.ok) return access.response;

  const parsed = policyUpdateSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const result = await updateLeavePolicy(access.employee, parsed.data);
  if (!result.ok) return serviceError(result);
  return ok({ ok: true });
}
