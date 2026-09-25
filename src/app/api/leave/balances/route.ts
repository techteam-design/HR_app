import { todayIsoInSingapore } from "@/lib/utils/dates";
import { ok, serviceError } from "@/server/api-response";
import { requireApiEmployee } from "@/server/auth.service";
import { getEmployeeBalances } from "@/server/leave-balance.service";

// GET: the signed-in employee's own current balances. Every role. The
// employee always comes from the session, never from the request.
export async function GET() {
  const access = await requireApiEmployee();
  if (!access.ok) return access.response;

  const balances = await getEmployeeBalances(access.employee.id, todayIsoInSingapore());
  if (!balances) return serviceError({ status: 404, error: "Employee not found" });
  return ok(balances);
}
