import { todayIsoInSingapore } from "@/lib/utils/dates";
import { ok, readJson, serviceError, validationError } from "@/server/api-response";
import { requireApiEmployee } from "@/server/auth.service";
import { photoUrlFor } from "@/server/employee-photo.service";
import { getEmployeeDetail, updateEmployee } from "@/server/employee.service";
import { updateEmployeeSchema } from "@/validations/employee";

type Context = { params: Promise<{ id: string }> };

// GET: employee detail. admin + hr_viewer.
export async function GET(_request: Request, { params }: Context) {
  const access = await requireApiEmployee("view_all_records");
  if (!access.ok) return access.response;

  const { id } = await params;
  const employee = await getEmployeeDetail(id);
  if (!employee) return serviceError({ status: 404, error: "Employee not found" });
  return ok({ ...employee, photoUrl: await photoUrlFor(employee.photoKey) });
}

// PATCH: edit every profile field. admin only.
export async function PATCH(request: Request, { params }: Context) {
  const access = await requireApiEmployee("manage_employees");
  if (!access.ok) return access.response;

  const parsed = updateEmployeeSchema(todayIsoInSingapore()).safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const { id } = await params;
  const result = await updateEmployee(access.employee, id, parsed.data);
  if (!result.ok) return serviceError(result);
  return ok({ id: result.id });
}
