import { todayIsoInSingapore } from "@/lib/utils/dates";
import { ok, readJson, serviceError, validationError } from "@/server/api-response";
import { requireApiEmployee } from "@/server/auth.service";
import { withPhotoUrls } from "@/server/employee-photo.service";
import { createEmployee, listEmployees } from "@/server/employee.service";
import { createEmployeeSchema, employeeListQuerySchema } from "@/validations/employee";

// GET: list with search, filters, sorting and pagination. admin + hr_viewer.
export async function GET(request: Request) {
  const access = await requireApiEmployee("view_all_records");
  if (!access.ok) return access.response;

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const query = employeeListQuerySchema.parse(params);
  const result = await listEmployees(query);
  return ok({ ...result, items: await withPhotoUrls(result.items) });
}

// POST: create an employee (and optionally their login). admin only.
// The temporary password is in this response only; it is never stored or logged.
export async function POST(request: Request) {
  const access = await requireApiEmployee("manage_employees");
  if (!access.ok) return access.response;

  const parsed = createEmployeeSchema(todayIsoInSingapore()).safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const result = await createEmployee(parsed.data);
  if (!result.ok) return serviceError(result);
  return ok({ id: result.id, temporaryPassword: result.temporaryPassword }, 201);
}
