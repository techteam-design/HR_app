import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { cache } from "react";

import { getAuth } from "@/lib/auth/auth";
import { can, isLoginAllowed, type Action } from "@/lib/auth/rbac";
import type { ChangePasswordInput } from "@/validations/auth";

import {
  clearMustChangePassword,
  findEmployeeByUserId,
  type SessionEmployee,
} from "./employee.service";

// Where to send someone whose cookie exists but whose session is no longer
// valid (expired, revoked, or employee now inactive). The query flag stops
// the proxy from bouncing /login back to /dashboard because of the stale cookie.
const SESSION_ENDED_URL = "/login?session=expired";

type AccessOptions = {
  action?: Action;
  // Only the change-password page and API may be used while a password
  // change is pending.
  allowPendingPasswordChange?: boolean;
};

// Reads the Better Auth session from the request and loads the linked
// employee. Returns null when not signed in, or when the employee is missing
// or inactive. Cached per request (layout + page share one lookup).
export const getCurrentEmployee = cache(async (): Promise<SessionEmployee | null> => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;

  const employee = await findEmployeeByUserId(session.user.id);
  return isLoginAllowed(employee) ? employee : null;
});

// For pages and layouts: redirects instead of returning when access fails.
export async function requireEmployee(options: AccessOptions = {}): Promise<SessionEmployee> {
  const employee = await getCurrentEmployee();
  if (!employee) redirect(SESSION_ENDED_URL);

  if (employee.mustChangePassword && !options.allowPendingPasswordChange) {
    redirect("/change-password");
  }

  if (options.action && !can(employee.role, options.action)) {
    redirect("/dashboard?denied=1");
  }

  return employee;
}

type ApiAccess =
  | { ok: true; employee: SessionEmployee }
  | { ok: false; response: NextResponse };

// For API routes: returns a 401/403 JSON response instead of redirecting.
export async function requireApiEmployee(
  action?: Action,
  options: Omit<AccessOptions, "action"> = {},
): Promise<ApiAccess> {
  const employee = await getCurrentEmployee();
  if (!employee) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not signed in" }, { status: 401 }),
    };
  }

  if (employee.mustChangePassword && !options.allowPendingPasswordChange) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "You must change your password first", code: "PASSWORD_CHANGE_REQUIRED" },
        { status: 403 },
      ),
    };
  }

  if (action && !can(employee.role, action)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, employee };
}

type ChangePasswordResult =
  | { ok: true; setCookies: string[] }
  | { ok: false; error: string };

// Changes the signed-in user's password through Better Auth (which verifies
// the current password and revokes all other sessions), then clears the
// employee's must_change_password flag. Returns the new session cookies for
// the caller to forward on its response.
export async function changeOwnPassword(
  employee: SessionEmployee,
  input: ChangePasswordInput,
  requestHeaders: Headers,
): Promise<ChangePasswordResult> {
  let responseHeaders: Headers;
  try {
    const result = await getAuth().api.changePassword({
      body: {
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
        revokeOtherSessions: true,
      },
      headers: requestHeaders,
      returnHeaders: true,
    });
    responseHeaders = result.headers;
  } catch (error) {
    if (isAPIError(error)) {
      const code = (error.body as { code?: string } | undefined)?.code;
      if (code === "INVALID_PASSWORD") {
        return { ok: false, error: "Your current password is incorrect" };
      }
      if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG") {
        return { ok: false, error: "The new password does not meet the length rules" };
      }
    }
    throw error;
  }

  if (employee.mustChangePassword) {
    await clearMustChangePassword(employee.id);
  }

  return { ok: true, setCookies: responseHeaders.getSetCookie() };
}
