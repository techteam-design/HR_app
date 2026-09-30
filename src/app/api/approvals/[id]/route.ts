import { todayIsoInBrunei } from "@/lib/utils/dates";
import { ok, readJson, serviceError, validationError } from "@/server/api-response";
import { decideApplication } from "@/server/approval.service";
import { requireApiEmployee } from "@/server/auth.service";
import { decisionSchema } from "@/validations/approval";

// POST: approve or reject a leave request at its current level. Only the
// approver of that level, or an admin (recorded as the admin), may decide;
// the service checks the level and re-validates the balance at the final
// approval. Remarks are required to reject.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireApiEmployee("approve_leave");
  if (!access.ok) return access.response;

  const parsed = decisionSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const { id } = await params;
  const result = await decideApplication(access.employee, id, parsed.data, todayIsoInBrunei());
  if (!result.ok) return serviceError(result);
  return ok({ status: result.status, currentLevel: result.currentLevel });
}
