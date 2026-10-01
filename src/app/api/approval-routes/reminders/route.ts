import { ok, readJson, validationError } from "@/server/api-response";
import { requireApiEmployee } from "@/server/auth.service";
import { saveReminderAfterDays } from "@/server/reminder.service";
import { reminderSettingSchema } from "@/validations/approval";

// PUT: "Remind approvers after N days" (0 = off). admin only.
export async function PUT(request: Request) {
  const access = await requireApiEmployee("manage_approval_config");
  if (!access.ok) return access.response;

  const parsed = reminderSettingSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  await saveReminderAfterDays(access.employee, parsed.data.reminderAfterDays);
  return ok({ saved: true });
}
