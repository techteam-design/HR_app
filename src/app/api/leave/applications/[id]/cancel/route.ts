import { todayIsoInBrunei } from "@/lib/utils/dates";
import { ok, readJson, serviceError, validationError } from "@/server/api-response";
import { requireApiEmployee } from "@/server/auth.service";
import { cancelApplication } from "@/server/leave-application.service";
import { cancelApplicationSchema } from "@/validations/leave";

// POST: cancel a leave request. The employee may cancel their own (pending,
// or approved before its first day); an admin may cancel any, with a note.
// The service enforces who may cancel what.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireApiEmployee("apply_leave");
  if (!access.ok) return access.response;

  const parsed = cancelApplicationSchema.safeParse((await readJson(request)) ?? {});
  if (!parsed.success) return validationError(parsed.error);

  const { id } = await params;
  const result = await cancelApplication(access.employee, id, parsed.data, todayIsoInBrunei());
  if (!result.ok) return serviceError(result);
  return ok({ status: "cancelled" });
}
