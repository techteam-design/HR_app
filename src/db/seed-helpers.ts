import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { eq } from "drizzle-orm";

import { BUSINESS_TIME_ZONE } from "../lib/utils/dates";
import { normalizeLoginEmail } from "../server/login-account.service";

import type { Database } from "./index";
import { branches, departments } from "./schema";

// Login creation (Better Auth user + credential account, default hashing)
// lives in src/server/login-account.service.ts and is shared with the app.
export { buildCredentialLogin, findUserIdByEmail } from "../server/login-account.service";

// Shared helpers for the seed scripts (src/db/seed*.ts). Not used by the app.

export { BUSINESS_TIME_ZONE };
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
  return normalizeLoginEmail(email);
}

export function todayInBusinessZone(): TZDate {
  return TZDate.tz(BUSINESS_TIME_ZONE);
}

// Formats a date as a DATE column value (YYYY-MM-DD) in its own time zone.
export function toDateColumn(date: Date): string {
  return format(date, "yyyy-MM-dd");
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
