import { ok, readJson, serviceError, validationError } from "@/server/api-response";
import { resetOverrides, saveOverrides } from "@/server/approval-route.service";
import { requireApiEmployee } from "@/server/auth.service";
import { UUID } from "@/server/service-result";
import { routeSchema } from "@/validations/approval";

type Params = { params: Promise<{ id: string }> };

// PUT: set a per-employee override route. Their pending requests move to it.
export async function PUT(request: Request, { params }: Params) {
  const access = await requireApiEmployee("manage_approval_config");
  if (!access.ok) return access.response;

  const parsed = routeSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const { id } = await params;
  if (!UUID.test(id)) return serviceError({ status: 404, error: "Employee not found" });
  const result = await saveOverrides(access.employee, [id], parsed.data);
  if (!result.ok) return serviceError(result);
  return ok({ saved: true });
}

// DELETE: reset to the default route (manager rule or branch default).
export async function DELETE(_request: Request, { params }: Params) {
  const access = await requireApiEmployee("manage_approval_config");
  if (!access.ok) return access.response;

  const { id } = await params;
  if (!UUID.test(id)) return serviceError({ status: 404, error: "Employee not found" });
  const result = await resetOverrides(access.employee, [id]);
  if (!result.ok) return serviceError(result);
  return ok({ reset: result.updated });
}
