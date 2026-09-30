import { ok, readJson, serviceError, validationError } from "@/server/api-response";
import { removeBranchDefault, saveBranchDefault } from "@/server/approval-route.service";
import { requireApiEmployee } from "@/server/auth.service";
import { routeSchema } from "@/validations/approval";

type Params = { params: Promise<{ branchId: string }> };

// PUT: set a branch's default route. Pending requests of that branch's staff
// (without an override, and not managers) move to the new approvers.
export async function PUT(request: Request, { params }: Params) {
  const access = await requireApiEmployee("manage_approval_config");
  if (!access.ok) return access.response;

  const parsed = routeSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const { branchId } = await params;
  const result = await saveBranchDefault(access.employee, branchId, parsed.data);
  if (!result.ok) return serviceError(result);
  return ok({ saved: true });
}

// DELETE: remove a branch's default route (its staff show "No route").
export async function DELETE(_request: Request, { params }: Params) {
  const access = await requireApiEmployee("manage_approval_config");
  if (!access.ok) return access.response;

  const { branchId } = await params;
  const result = await removeBranchDefault(access.employee, branchId);
  if (!result.ok) return serviceError(result);
  return ok({ removed: true });
}
