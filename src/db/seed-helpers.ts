import { TZDate } from "@date-fns/tz";
import { generateRandomString, hashPassword } from "better-auth/crypto";
import { format } from "date-fns";
import { eq } from "drizzle-orm";

import type { Database } from "./index";
import { account, branches, departments, user } from "./schema";

// Shared helpers for the seed scripts (src/db/seed*.ts). Not used by the app.

export const SINGAPORE_TZ = "Asia/Singapore";
export const MIN_SEED_PASSWORD_LENGTH = 12;

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set. Add it to .env.local (see .env.example).`);
  }
  return value;
}

export function requirePassword(name: string): string {
  // Not trimmed: spaces are valid password characters.
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Add it to .env.local (see .env.example).`);
  }
  if (value.length < MIN_SEED_PASSWORD_LENGTH) {
    throw new Error(
      `${name} must be at least ${MIN_SEED_PASSWORD_LENGTH} characters long.`,
    );
  }
  return value;
}

// Prints which database the script is about to write to, password masked.
// The Neon host (ep-...) identifies the branch.
export function printTarget(scriptName: string): void {
  const raw = requireEnv("DATABASE_URL");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL is not a valid connection string.");
  }
  const masked = `${url.protocol}//${url.username}:****@${url.host}${url.pathname}`;
  console.log(`[${scriptName}] Target database: ${masked}`);
  console.log(`[${scriptName}] Host:            ${url.hostname}\n`);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function todayInSingapore(): TZDate {
  return TZDate.tz(SINGAPORE_TZ);
}

// Formats a date as a DATE column value (YYYY-MM-DD) in its own time zone.
export function toDateColumn(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

// Same alphabet and length as Better Auth's internal generateId().
function generateBetterAuthId(): string {
  return generateRandomString(32, "a-z", "A-Z", "0-9");
}

// Builds the rows Better Auth's email sign-up would write (better-auth 1.7.5):
// a user with a lowercased email, and a "credential" account whose accountId
// is the user id and whose password is hashed with Better Auth's DEFAULT
// hasher (scrypt, from better-auth/crypto).
//
// IMPORTANT: the Better Auth config must use the default password hashing
// (no emailAndPassword.password.hash / verify overrides), or logins created
// here will fail to sign in.
export async function buildCredentialLogin(input: {
  name: string;
  email: string;
  password: string;
}) {
  const userId = generateBetterAuthId();
  const passwordHash = await hashPassword(input.password);

  const userRow: typeof user.$inferInsert = {
    id: userId,
    name: input.name,
    email: normalizeEmail(input.email),
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

export async function findUserIdByEmail(
  db: Database,
  email: string,
): Promise<string | undefined> {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, normalizeEmail(email)))
    .limit(1);
  return row?.id;
}

// Insert-if-missing by unique name. Returns the id and whether it was created.
export async function ensureBranch(db: Database, name: string) {
  const [inserted] = await db
    .insert(branches)
    .values({ name })
    .onConflictDoNothing({ target: branches.name })
    .returning({ id: branches.id });
  if (inserted) return { id: inserted.id, created: true };

  const [existing] = await db
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.name, name));
  if (!existing) throw new Error(`Branch "${name}" could not be created or found.`);
  return { id: existing.id, created: false };
}

export async function ensureDepartment(db: Database, name: string) {
  const [inserted] = await db
    .insert(departments)
    .values({ name })
    .onConflictDoNothing({ target: departments.name })
    .returning({ id: departments.id });
  if (inserted) return { id: inserted.id, created: true };

  const [existing] = await db
    .select({ id: departments.id })
    .from(departments)
    .where(eq(departments.name, name));
  if (!existing) {
    throw new Error(`Department "${name}" could not be created or found.`);
  }
  return { id: existing.id, created: false };
}

export function createSummary(scriptName: string) {
  const created: string[] = [];
  const updated: string[] = [];
  const existing: string[] = [];

  return {
    created: (line: string) => created.push(line),
    updated: (line: string) => updated.push(line),
    existing: (line: string) => existing.push(line),
    print() {
      const section = (title: string, lines: string[]) => {
        console.log(`\n${title} (${lines.length})`);
        for (const line of lines) console.log(`  - ${line}`);
      };
      console.log(`\n========== ${scriptName} summary ==========`);
      section("Inserted", created);
      if (updated.length) section("Updated", updated);
      section("Already existed (left unchanged)", existing);
      console.log("");
    },
  };
}

export function runSeed(scriptName: string, main: () => Promise<void>): void {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n[${scriptName}] FAILED: ${message}\n`);
    process.exitCode = 1;
  });
}
