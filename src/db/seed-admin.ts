// Creates the first admin login. Safe for production.
// Idempotent: if a Better Auth user with SEED_ADMIN_EMAIL already exists,
// nothing is changed.
//
// Required env: SEED_ADMIN_EMAIL, SEED_ADMIN_NAME, SEED_ADMIN_PASSWORD (12+ chars)
// Optional env: SEED_ADMIN_EMPLOYEE_CODE (default "ADMIN-001"),
//               SEED_ADMIN_JOIN_DATE (YYYY-MM-DD, default today in Asia/Singapore)
//
// NOTE: the Better Auth config written later must use the DEFAULT password
// hashing (no emailAndPassword.password.hash / verify overrides), or this
// admin will not be able to log in.
//
// Run: npm run db:seed:admin

import { config } from "dotenv";
import { eq } from "drizzle-orm";

import { getDb } from "./index";
import { account, employees, user } from "./schema";
import {
  buildCredentialLogin,
  createSummary,
  ensureBranch,
  ensureDepartment,
  findUserIdByEmail,
  normalizeEmail,
  printTarget,
  requireEnv,
  requirePassword,
  runSeed,
  toDateColumn,
  todayInSingapore,
} from "./seed-helpers";

// getDb() is lazy, so loading env here (after imports) is early enough.
config({ path: ".env.local", quiet: true });

const SCRIPT = "seed-admin";

// Placeholder profile values for fields the admin must edit later in the app.
const PLACEHOLDER = {
  employeeCode: "ADMIN-001",
  branch: "Main Branch",
  department: "Management",
  designation: "Administrator",
  dateOfBirth: "1900-01-01",
  gender: "female",
  classification: "local",
} as const;

function readJoinDate(): string {
  const value = process.env.SEED_ADMIN_JOIN_DATE?.trim();
  if (!value) return toDateColumn(todayInSingapore());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error("SEED_ADMIN_JOIN_DATE must be a date in YYYY-MM-DD format.");
  }
  return value;
}

async function main() {
  printTarget(SCRIPT);

  const email = normalizeEmail(requireEnv("SEED_ADMIN_EMAIL"));
  const name = requireEnv("SEED_ADMIN_NAME");
  const password = requirePassword("SEED_ADMIN_PASSWORD");
  const employeeCode =
    process.env.SEED_ADMIN_EMPLOYEE_CODE?.trim() || PLACEHOLDER.employeeCode;
  const joinDate = readJoinDate();

  const db = getDb();
  const summary = createSummary(SCRIPT);

  const existingUserId = await findUserIdByEmail(db, email);
  if (existingUserId) {
    const [linked] = await db
      .select({ employeeCode: employees.employeeCode })
      .from(employees)
      .where(eq(employees.userId, existingUserId));
    summary.existing(`user: ${email} (nothing changed)`);
    if (linked) {
      summary.existing(`employees: ${linked.employeeCode} linked to ${email}`);
    } else {
      console.warn(
        `[${SCRIPT}] WARNING: user ${email} exists but no employee row is linked to it.`,
      );
    }
    summary.print();
    return;
  }

  const [existingEmployee] = await db
    .select({ id: employees.id, userId: employees.userId, code: employees.employeeCode })
    .from(employees)
    .where(eq(employees.email, email));

  if (existingEmployee?.userId) {
    throw new Error(
      `Employee ${existingEmployee.code} (${email}) is already linked to a different login. ` +
        "Resolve this manually before seeding the admin.",
    );
  }

  if (!existingEmployee) {
    const [codeTaken] = await db
      .select({ email: employees.email })
      .from(employees)
      .where(eq(employees.employeeCode, employeeCode));
    if (codeTaken) {
      throw new Error(
        `Employee code "${employeeCode}" is already used by ${codeTaken.email}. ` +
          "Set SEED_ADMIN_EMPLOYEE_CODE to a different code.",
      );
    }
  }

  const login = await buildCredentialLogin({ name, email, password });

  if (existingEmployee) {
    // Link the existing employee row and promote it to an active admin.
    // db.batch runs all statements in one transaction.
    await db.batch([
      db.insert(user).values(login.userRow),
      db.insert(account).values(login.accountRow),
      db
        .update(employees)
        .set({
          userId: login.userId,
          role: "admin",
          status: "active",
          mustChangePassword: true,
          deactivatedAt: null,
        })
        .where(eq(employees.id, existingEmployee.id)),
    ]);
    summary.created(`user + credential account: ${email}`);
    summary.updated(
      `employees: ${existingEmployee.code} linked to ${email}, set to admin / active / must change password`,
    );
  } else {
    const branch = await ensureBranch(db, PLACEHOLDER.branch);
    const department = await ensureDepartment(db, PLACEHOLDER.department);
    (branch.created ? summary.created : summary.existing)(
      `branches: ${PLACEHOLDER.branch}`,
    );
    (department.created ? summary.created : summary.existing)(
      `departments: ${PLACEHOLDER.department}`,
    );

    await db.batch([
      db.insert(user).values(login.userRow),
      db.insert(account).values(login.accountRow),
      db.insert(employees).values({
        userId: login.userId,
        employeeCode,
        fullName: name,
        email,
        phone: null,
        dateOfBirth: PLACEHOLDER.dateOfBirth,
        gender: PLACEHOLDER.gender,
        joinDate,
        designation: PLACEHOLDER.designation,
        departmentId: department.id,
        branchId: branch.id,
        classification: PLACEHOLDER.classification,
        reportingManagerId: null,
        role: "admin",
        status: "active",
        mustChangePassword: true,
      }),
    ]);
    summary.created(`user + credential account: ${email}`);
    summary.created(`employees: ${employeeCode} (${name}, admin)`);
    console.warn(
      `[${SCRIPT}] Edit these placeholder profile values in the app: ` +
        `date of birth (${PLACEHOLDER.dateOfBirth}), gender (${PLACEHOLDER.gender}), ` +
        `designation (${PLACEHOLDER.designation}), classification (${PLACEHOLDER.classification}), ` +
        `branch (${PLACEHOLDER.branch}), department (${PLACEHOLDER.department})` +
        (process.env.SEED_ADMIN_JOIN_DATE ? "" : `, join date (${joinDate})`) +
        (process.env.SEED_ADMIN_EMPLOYEE_CODE ? "" : `, employee code (${employeeCode})`),
    );
  }

  summary.print();
}

runSeed(SCRIPT, main);
