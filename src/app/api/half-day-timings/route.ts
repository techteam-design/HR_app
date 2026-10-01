import { ok, readJson, serviceError, validationError } from "@/server/api-response";
import { requireApiEmployee } from "@/server/auth.service";
import { loadHalfDayTimings, updateHalfDayTimings } from "@/server/half-day-timing.service";
import { halfDayTimingsSchema } from "@/validations/leave";

// GET: the half-day slot times. admin + hr_viewer.
export async function GET() {
  const access = await requireApiEmployee("view_all_records");
  if (!access.ok) return access.response;

  return ok(await loadHalfDayTimings());
}

// PUT: replace all four slots. admin only. Existing applications keep the
// times they were booked with.
export async function PUT(request: Request) {
  const access = await requireApiEmployee("manage_policies");
  if (!access.ok) return access.response;

  const parsed = halfDayTimingsSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const result = await updateHalfDayTimings(access.employee, parsed.data);
  if (!result.ok) return serviceError(result);
  return ok({ ok: true });
}
