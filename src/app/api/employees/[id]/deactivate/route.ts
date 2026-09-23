import { ok, serviceError } from "@/server/api-response";
import { requireApiEmployee } from "@/server/auth.service";
import { deactivateEmployee } from "@/server/employee.service";

// POST: deactivate and sign out everywhere. admin only.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireApiEmployee("manage_employees");
  if (!access.ok) return access.response;

  const { id } = await params;
  const result = await deactivateEmployee(access.employee, id);
  if (!result.ok) return serviceError(result);
  return ok({ ok: true });
}
