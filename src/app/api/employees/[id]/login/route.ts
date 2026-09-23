import { ok, serviceError } from "@/server/api-response";
import { requireApiEmployee } from "@/server/auth.service";
import { createEmployeeLogin } from "@/server/employee.service";

// POST: create a login for an employee who has none. admin only.
// The temporary password is in this response only; it is never stored or logged.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireApiEmployee("manage_employees");
  if (!access.ok) return access.response;

  const { id } = await params;
  const result = await createEmployeeLogin(id);
  if (!result.ok) return serviceError(result);
  return ok({ temporaryPassword: result.temporaryPassword }, 201);
}
