import { ok, readJson, serviceError, validationError } from "@/server/api-response";
import { requireApiEmployee } from "@/server/auth.service";
import { cancelApplication } from "@/server/leave-application.service";
import { cancelApplicationSchema } from "@/validations/leave";

// POST: cancel a leave request. The employee may cancel their own pending
// request; an approver on the request's route may cancel approved leave, and
// an admin any pending or approved request, both with a note. Any signed-in
// employee may call it (admins take no leave, so no apply_leave): the
// service enforces who may cancel what, per request.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireApiEmployee();
  if (!access.ok) return access.response;

  const parsed = cancelApplicationSchema.safeParse((await readJson(request)) ?? {});
  if (!parsed.success) return validationError(parsed.error);

  const { id } = await params;
  const result = await cancelApplication(access.employee, id, parsed.data);
  if (!result.ok) return serviceError(result);
  return ok({ status: "cancelled" });
}
