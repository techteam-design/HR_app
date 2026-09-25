import { todayIsoInBrunei } from "@/lib/utils/dates";
import { ok, serviceError } from "@/server/api-response";
import { requireApiEmployee } from "@/server/auth.service";
import { getEmployeeBalances, listAdjustments } from "@/server/leave-balance.service";

// GET: current-period balances and adjustment history. admin + hr_viewer.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireApiEmployee("view_all_records");
  if (!access.ok) return access.response;

  const { id } = await params;
  const balances = await getEmployeeBalances(id, todayIsoInBrunei());
  if (!balances) return serviceError({ status: 404, error: "Employee not found" });
  return ok({ ...balances, adjustments: await listAdjustments(id) });
}
