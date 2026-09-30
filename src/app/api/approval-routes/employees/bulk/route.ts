import { ok, readJson, serviceError, validationError } from "@/server/api-response";
import { resetOverrides, saveOverrides } from "@/server/approval-route.service";
import { requireApiEmployee } from "@/server/auth.service";
import { bulkRouteSchema } from "@/validations/approval";

// POST: set the same override for several employees ({ action: "set" }), or
// reset them to their default route ({ action: "reset" }).
export async function POST(request: Request) {
  const access = await requireApiEmployee("manage_approval_config");
  if (!access.ok) return access.response;

  const parsed = bulkRouteSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const input = parsed.data;
  const result =
    input.action === "set"
      ? await saveOverrides(access.employee, input.employeeIds, input.route)
      : await resetOverrides(access.employee, input.employeeIds);
  if (!result.ok) return serviceError(result);
  return ok({ updated: result.updated });
}
