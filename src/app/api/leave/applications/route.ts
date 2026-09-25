import { todayIsoInBrunei } from "@/lib/utils/dates";
import { ok, readJson, serviceError, validationError } from "@/server/api-response";
import { requireApiEmployee } from "@/server/auth.service";
import { listApplications, submitApplication } from "@/server/leave-application.service";
import { applicationSchema, historyFilterSchema } from "@/validations/leave";

// Own leave requests. The employee always comes from the session, never from
// the request.

// GET: own requests, newest first. Optional ?type=&status=&year= filters.
export async function GET(request: Request) {
  const access = await requireApiEmployee("apply_leave");
  if (!access.ok) return access.response;

  const params = new URL(request.url).searchParams;
  const filter = historyFilterSchema.parse({
    type: params.get("type") ?? undefined,
    status: params.get("status") ?? undefined,
    year: params.get("year") ?? undefined,
  });
  return ok({ applications: await listApplications(access.employee.id, filter) });
}

// POST: submit a request for the signed-in employee.
export async function POST(request: Request) {
  const access = await requireApiEmployee("apply_leave");
  if (!access.ok) return access.response;

  const parsed = applicationSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const result = await submitApplication(access.employee.id, parsed.data, todayIsoInBrunei(), { onBehalf: false });
  if (!result.ok) return serviceError(result);
  return ok({ id: result.id, status: result.status, totalDays: result.totalDays, approvers: result.approvers }, 201);
}
