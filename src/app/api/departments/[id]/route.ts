import { ok, readJson, serviceError, validationError } from "@/server/api-response";
import { requireApiEmployee } from "@/server/auth.service";
import { updateDepartment } from "@/server/department.service";
import { updateDepartmentSchema } from "@/validations/department";

// PATCH: rename and/or deactivate or reactivate. admin only (manage_org).
// Never deletes: deactivation is refused while active staff are assigned.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireApiEmployee("manage_org");
  if (!access.ok) return access.response;

  const parsed = updateDepartmentSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const { id } = await params;
  const result = await updateDepartment(id, parsed.data);
  if (!result.ok) return serviceError(result);
  return ok({ id: result.id });
}
