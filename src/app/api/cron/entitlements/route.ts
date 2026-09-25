import { NextResponse } from "next/server";

import { isCronAuthorized } from "@/lib/auth/cron-secret";
import { todayIsoInBrunei } from "@/lib/utils/dates";
import { NO_STORE } from "@/server/api-response";
import { ensureAllEntitlements } from "@/server/entitlement.service";

// Daily entitlement job. Called by the Cloudflare cron trigger (see
// custom-worker.ts) at 00:05 Brunei time, or manually with
//   Authorization: Bearer <CRON_SECRET>
// Idempotent: creates only the missing rows for "today" in Asia/Brunei,
// so it also catches up after a missed day and is safe to run twice.
// Not behind the session proxy (src/proxy.ts excludes /api/cron).

async function run(request: Request) {
  if (!isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const counts = await ensureAllEntitlements(todayIsoInBrunei());
  console.log("cron/entitlements", counts);
  return NextResponse.json(counts, { headers: NO_STORE });
}

export const POST = run;
export const GET = run;
