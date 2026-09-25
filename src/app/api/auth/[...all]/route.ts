import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/lib/auth/auth";

// Better Auth is created lazily inside each request, never at module load.
const handler = toNextJsHandler((request: Request) => getAuth().handler(request));

export const { GET } = handler;

// TODO(before production): remove this sign-in timing log. It is a temporary
// staging diagnostic for comparing with Cloudflare's CPU time metrics.
// Logs only the path, status and duration: never the body, email or headers.
// On Workers, timers only advance during I/O (a Spectre mitigation), so this
// shows wall time around database calls, not the scrypt CPU time itself:
// read CPU time from the Cloudflare dashboard.
export async function POST(request: Request) {
  const { pathname } = new URL(request.url);
  if (!pathname.endsWith("/sign-in/email")) return handler.POST(request);

  const started = performance.now();
  const response = await handler.POST(request);
  console.log(
    JSON.stringify({
      event: "sign_in_timing",
      status: response.status,
      durationMs: Math.round(performance.now() - started),
    }),
  );
  return response;
}
