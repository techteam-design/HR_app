import { NextResponse } from "next/server";

import { can } from "@/lib/auth/rbac";
import { todayIsoInBrunei } from "@/lib/utils/dates";
import { ok, readJson, serviceError, validationError } from "@/server/api-response";
import { requireApiEmployee } from "@/server/auth.service";
import { submitApplication } from "@/server/leave-application.service";
import { onBehalfApplicationSchema } from "@/validations/leave";

// POST: an admin applies for leave on an employee's behalf. Any leave type
// may be backdated; overriding the foreign advance-notice rule also needs
// override_notice and a reason. The admin is recorded as submitted_by.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireApiEmployee("manage_employees");
  if (!access.ok) return access.response;

  const parsed = onBehalfApplicationSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const { noticeOverride, overrideReason, ...input } = parsed.data;
  if (noticeOverride && !can(access.employee.role, "override_notice")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const result = await submitApplication(id, input, todayIsoInBrunei(), {
    onBehalf: true,
    admin: { id: access.employee.id },
    noticeOverride,
    overrideReason,
  });
  if (!result.ok) return serviceError(result);
  return ok({ id: result.id, status: result.status, totalDays: result.totalDays, approvers: result.approvers }, 201);
}
