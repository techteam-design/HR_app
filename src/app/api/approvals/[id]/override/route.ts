import { todayIsoInBrunei } from "@/lib/utils/dates";
import { ok, readJson, serviceError, validationError } from "@/server/api-response";
import { overrideApplication } from "@/server/approval.service";
import { requireApiEmployee } from "@/server/auth.service";
import { overrideSchema } from "@/validations/approval";

// POST: an admin overrides a decision after the fact, with a required reason.
//   { action: "revoke" }  approved -> revoked ("Revoke approval")
//   { action: "approve" } rejected -> approved ("Approve anyway"; balance and
//                         overlap are re-checked like a final approval)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireApiEmployee("decide_any_leave");
  if (!access.ok) return access.response;

  const parsed = overrideSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const { id } = await params;
  const result = await overrideApplication(access.employee, id, parsed.data, todayIsoInBrunei());
  if (!result.ok) return serviceError(result);
  return ok({ status: result.status });
}
