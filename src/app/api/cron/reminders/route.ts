import { NextResponse } from "next/server";

import { parseMinDaysOverride } from "@/lib/approvals/reminders";
import { isCronAuthorized } from "@/lib/auth/cron-secret";
import { todayIsoInBrunei } from "@/lib/utils/dates";
import { NO_STORE } from "@/server/api-response";
import { sendApprovalReminders } from "@/server/reminder.service";

// Daily approver reminders. Called by the Cloudflare cron trigger (see
// custom-worker.ts) at 09:00 Brunei time, or manually with
//   Authorization: Bearer <CRON_SECRET>
// Idempotent: one digest per approver per Brunei day (email_log dedupe key),
// so a second run the same day sends nothing.
// Testing only: ?minDays=N (0-30) replaces the reminder setting for this run,
// e.g. ?minDays=0 includes requests submitted today. Accepted only with a
// valid secret and when APP_ENV is not "production" (400 there). Test runs
// have their own dedupe key, so they never use up the real daily digest.
// Not behind the session proxy (src/proxy.ts excludes /api/cron).

async function run(request: Request) {
  if (!isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const override = parseMinDaysOverride(
    new URL(request.url).searchParams.get("minDays"),
    process.env.APP_ENV === "production",
  );
  if (!override.ok) {
    return NextResponse.json({ error: override.error }, { status: 400, headers: NO_STORE });
  }

  const result = await sendApprovalReminders(todayIsoInBrunei(), override.minDays);
  console.log("cron/reminders", result);
  return NextResponse.json(result, { headers: NO_STORE });
}

export const POST = run;
export const GET = run;
