import { todayIsoInBrunei } from "@/lib/utils/dates";
import { ok, readJson, serviceError, validationError } from "@/server/api-response";
import { requireApiEmployee } from "@/server/auth.service";
import { addAdjustment } from "@/server/leave-balance.service";
import { adjustmentSchema } from "@/validations/leave";

// POST: add an opening balance or correction to the employee's current
// period. admin only. Adjustments are append-only (no PATCH or DELETE).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireApiEmployee("manage_employees");
  if (!access.ok) return access.response;

  const parsed = adjustmentSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const { id } = await params;
  const result = await addAdjustment(access.employee, id, parsed.data, todayIsoInBrunei());
  if (!result.ok) return serviceError(result);
  return ok({ id: result.id, available: result.available }, 201);
}
