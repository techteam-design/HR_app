import { generateRandomString, hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";

import type { Database } from "@/db";
import { account, user } from "@/db/schema";

// Better Auth login rows (user + credential account), shared by the admin
// employee screens and the seed scripts.
//
// IMPORTANT: passwords are hashed with Better Auth's DEFAULT hasher (scrypt,
// from better-auth/crypto). The Better Auth config must keep the default
// hashing (no emailAndPassword.password.hash / verify overrides), or logins
// created here will fail to sign in.

// Same alphabet and length as Better Auth's internal generateId().
export function generateBetterAuthId(): string {
  return generateRandomString(32, "a-z", "A-Z", "0-9");
}

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashLoginPassword(password: string): Promise<string> {
  return hashPassword(password);
}

// Builds the rows Better Auth's email sign-up would write (better-auth 1.7.5):
// a user with a lowercased email, and a "credential" account whose accountId
// is the user id. The caller inserts them, usually in one db.batch together
// with the employee link.
export async function buildCredentialLogin(input: {
  name: string;
  email: string;
  password: string;
}) {
  const userId = generateBetterAuthId();
  const passwordHash = await hashLoginPassword(input.password);

  const userRow: typeof user.$inferInsert = {
    id: userId,
    name: input.name,
    email: normalizeLoginEmail(input.email),
    emailVerified: false,
  };

  const accountRow: typeof account.$inferInsert = {
    id: generateBetterAuthId(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: passwordHash,
  };

  return { userId, userRow, accountRow };
}

export async function findUserIdByEmail(db: Database, email: string): Promise<string | undefined> {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, normalizeLoginEmail(email)))
    .limit(1);
  return row?.id;
}
