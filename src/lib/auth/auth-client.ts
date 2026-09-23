import { createAuthClient } from "better-auth/react";

// Browser client for sign-in, sign-out and session. Same origin as the app,
// so no baseURL is needed.
export const authClient = createAuthClient();

export const { signIn, signOut, useSession } = authClient;
