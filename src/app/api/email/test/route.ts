import { ok } from "@/server/api-response";
import { requireApiEmployee } from "@/server/auth.service";
import { sendTestEmail } from "@/server/notification.service";

// POST: send one sample email to the signed-in admin through the full email
// path (EMAIL_* settings, dev redirect, email_log, Resend). admin only.
// Always 200: the body says whether it was sent, skipped (and why) or failed.
export async function POST() {
  const access = await requireApiEmployee("manage_approval_config");
  if (!access.ok) return access.response;

  return ok(await sendTestEmail(access.employee));
}
