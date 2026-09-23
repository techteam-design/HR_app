import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/lib/auth/auth";

// Better Auth is created lazily inside each request, never at module load.
const handler = toNextJsHandler((request: Request) => getAuth().handler(request));

export const { GET, POST } = handler;
