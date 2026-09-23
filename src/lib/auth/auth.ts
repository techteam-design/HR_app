import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";

import { getDb, schema } from "@/db";
import { findEmployeeByUserId } from "@/server/employee.service";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/validations/auth";

import { isLoginAllowed } from "./rbac";

const ONE_DAY_SECONDS = 60 * 60 * 24;

// Shown for every failed sign-in, including blocked (inactive or unlinked)
// staff, so the response never reveals which accounts exist.
export const GENERIC_SIGN_IN_ERROR = "Invalid email or password";

function requireAuthEnv(name: "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is not set. Add it to .env.local for local development, ` +
        "or as a secret in the Cloudflare Worker for production (see .env.example).",
    );
  }
  return value;
}

function createAuth() {
  return betterAuth({
    secret: requireAuthEnv("BETTER_AUTH_SECRET"),
    baseURL: requireAuthEnv("BETTER_AUTH_URL"),
    database: drizzleAdapter(getDb(), { provider: "pg", schema }),

    // Email + password only. Logins are created by admins, never by sign-up.
    // Password hashing is Better Auth's DEFAULT (scrypt). Do not add a custom
    // hash/verify: the seeded logins (src/db/seed-helpers.ts) depend on it.
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
    },

    session: {
      expiresIn: ONE_DAY_SECONDS * 7,
      updateAge: ONE_DAY_SECONDS,
    },

    advanced: {
      useSecureCookies: process.env.NODE_ENV === "production",
      ipAddress: {
        // Cloudflare sets cf-connecting-ip; used as the rate-limit key.
        ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
      },
    },

    // In-memory storage: limits are per Worker instance, which slows brute
    // force but is not a hard global limit (database storage would need a
    // rateLimit table).
    rateLimit: {
      enabled: true,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
      },
    },

    databaseHooks: {
      session: {
        create: {
          // Runs for every new session (sign-in, and the fresh session after a
          // password change). Blocks staff with no employee record or inactive.
          before: async (session) => {
            const employee = await findEmployeeByUserId(session.userId);
            if (!isLoginAllowed(employee)) {
              throw new APIError("UNAUTHORIZED", { message: GENERIC_SIGN_IN_ERROR });
            }
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

let cachedAuth: Auth | undefined;

// Created lazily on first use and cached, never at module load (see CLAUDE.md),
// so builds and imports do not need the auth env vars or a database.
export function getAuth(): Auth {
  cachedAuth ??= createAuth();
  return cachedAuth;
}
