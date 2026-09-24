import { ok, readJson, serviceError, validationError } from "@/server/api-response";
import { requireApiEmployee } from "@/server/auth.service";
import { updateBranch } from "@/server/branch.service";
import { updateBranchSchema } from "@/validations/branch";

// PATCH: rename and/or deactivate or reactivate. admin only (manage_org).
// Never deletes: deactivation is refused while active staff are assigned.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireApiEmployee("manage_org");
  if (!access.ok) return access.response;

  const parsed = updateBranchSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const { id } = await params;
  const result = await updateBranch(id, parsed.data);
  if (!result.ok) return serviceError(result);
  return ok({ id: result.id });
}
