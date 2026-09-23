import { NextResponse } from "next/server";

import { changeOwnPassword, requireApiEmployee } from "@/server/auth.service";
import { changePasswordSchema } from "@/validations/auth";

// Changes the signed-in user's password, signs out their other sessions and
// clears must_change_password, all in one request.
export async function POST(request: Request) {
  const access = await requireApiEmployee(undefined, { allowPendingPasswordChange: true });
  if (!access.ok) return access.response;

  const parsed = changePasswordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const result = await changeOwnPassword(access.employee, parsed.data, request.headers);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  // Forward the new session cookie issued after other sessions were revoked.
  for (const cookie of result.setCookies) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}
