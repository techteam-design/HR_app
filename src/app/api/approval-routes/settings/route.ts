import { ok, readJson, serviceError, validationError } from "@/server/api-response";
import { saveManagersApprover } from "@/server/approval-route.service";
import { requireApiEmployee } from "@/server/auth.service";
import { managersApproverSchema } from "@/validations/approval";

// PUT: the managers' leave approver (must be an active admin; null = use the
// only active admin). Pending manager requests move to the new approver.
export async function PUT(request: Request) {
  const access = await requireApiEmployee("manage_approval_config");
  if (!access.ok) return access.response;

  const parsed = managersApproverSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const result = await saveManagersApprover(access.employee, parsed.data.managersApproverId);
  if (!result.ok) return serviceError(result);
  return ok({ saved: true });
}
