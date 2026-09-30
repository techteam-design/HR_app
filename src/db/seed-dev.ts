// Small, clean dummy dataset for the DEV Neon branch only. NEVER run against
// production. Refuses to run unless ALLOW_DEV_SEED is exactly "true".
// Normally run by `npm run db:reset:dev` (after db:seed and db:seed:admin),
// which starts from an empty database.
//
// Team: the seed-admin login is the ONLY admin (Branch A, Management), plus
// one HR viewer, one manager and five employees. Join dates are relative to
// today in Brunei, so the scenarios stay true whenever the reset runs.
// Routes: Branch A single level (Daniel), Branch B two-level (Daniel, then
// the admin), managers' leave approver = the admin, no overrides.
// No leave applications are seeded.
//
// Idempotent: rows are matched by unique keys (branch/department name,
// employee_code, branch_id, user email, the single approval_settings row);
// existing rows are left unchanged. Siti's opening balance is added once.
//
// Required env: ALLOW_DEV_SEED=true, SEED_DEV_PASSWORD (12+ chars, shared by
// all dev logins), SEED_ADMIN_EMAIL (the admin created by db:seed:admin).
//
// Run: npm run db:seed:dev

import { config } from "dotenv";
import { subDays, subMonths, subYears } from "date-fns";
import { and, eq, ne } from "drizzle-orm";

import { addAdjustment } from "../server/leave-balance.service";

import { getDb } from "./index";
import {
  account,
  approvalSettings,
  branchApprovalRoutes,
  branches,
  employees,
  leaveAdjustments,
  user,
} from "./schema";
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
  todayInBusinessZone,
} from "./seed-helpers";

// getDb() is lazy, so loading env here (after imports) is early enough.
config({ path: ".env.local", quiet: true });

const SCRIPT = "seed-dev";
const EMAIL_DOMAIN = "example.test";

const BRANCHES = ["Branch A", "Branch B"] as const;
// "Management" is also the department db:seed:admin creates for the admin.
const DEPARTMENTS = ["Management", "Beauty Therapy"] as const;
// Placeholder branch created by db:seed:admin; removed once the admin moves.
const ADMIN_PLACEHOLDER_BRANCH = "Main Branch";

type Branch = (typeof BRANCHES)[number];
type Department = (typeof DEPARTMENTS)[number];

type DevEmployee = {
  key: string;
  code: string;
  fullName: string;
  gender: "male" | "female";
  dateOfBirth: string;
  joinDate: string;
  designation: string;
  branch: Branch;
  department: Department;
  classification: "local" | "foreign";
  role: "employee" | "manager" | "hr_viewer";
  // "admin" is the seed-admin login; other keys must appear earlier.
  managerKey: string;
  scenario: string;
};

function buildEmployees(): DevEmployee[] {
  const today = todayInBusinessZone();
  const d = toDateColumn;
  // A few weeks past the anniversary, so nobody is on a leave-year boundary.
  const yearsAgo = (years: number, extraDays: number) => d(subDays(subYears(today, years), extraDays));

  return [
    {
      key: "grace",
      code: "DEV-002",
      fullName: "Grace Lim",
      gender: "female",
      dateOfBirth: "1988-09-03",
      joinDate: yearsAgo(4, 40),
      designation: "HR Executive",
      branch: "Branch A",
      department: "Management",
      classification: "local",
      role: "hr_viewer",
      managerKey: "admin",
      scenario: "HR viewer, local, about 4 years (service year 5: 11 days)",
    },
    {
      key: "daniel",
      code: "DEV-003",
      fullName: "Daniel Tan",
      gender: "male",
      dateOfBirth: "1984-01-22",
      joinDate: yearsAgo(6, 30),
      designation: "Branch Manager",
      branch: "Branch A",
      department: "Management",
      classification: "local",
      role: "manager",
      managerKey: "admin",
      scenario: "Manager, local, about 6 years; approves Branch A (level 1) and Branch B (level 1)",
    },
    {
      key: "priya",
      code: "DEV-004",
      fullName: "Priya Nair",
      gender: "female",
      dateOfBirth: "1982-06-15",
      joinDate: yearsAgo(9, 60),
      designation: "Senior Therapist",
      branch: "Branch A",
      department: "Beauty Therapy",
      classification: "local",
      role: "employee",
      managerKey: "daniel",
      scenario: "Local, about 9 years (14 days annual)",
    },
    {
      key: "siti",
      code: "DEV-005",
      fullName: "Siti Rahman",
      gender: "female",
      dateOfBirth: "1995-11-08",
      joinDate: yearsAgo(2, 30),
      designation: "Therapist",
      branch: "Branch A",
      department: "Beauty Therapy",
      classification: "local",
      role: "employee",
      managerKey: "daniel",
      scenario: "Local, about 2 years (9 days annual) + 2 days opening balance",
    },
    {
      key: "kelvin",
      code: "DEV-006",
      fullName: "Kelvin Ong",
      gender: "male",
      dateOfBirth: "1999-03-27",
      joinDate: d(subMonths(today, 2)),
      designation: "Therapist",
      branch: "Branch B",
      department: "Beauty Therapy",
      classification: "local",
      role: "employee",
      managerKey: "daniel",
      scenario: "Local, joined 2 months ago: annual not yet eligible, MC eligible",
    },
    {
      key: "maria",
      code: "DEV-007",
      fullName: "Maria Santos",
      gender: "female",
      dateOfBirth: "1990-07-19",
      joinDate: yearsAgo(3, 50),
      designation: "Therapist",
      branch: "Branch B",
      department: "Beauty Therapy",
      classification: "foreign",
      role: "employee",
      managerKey: "daniel",
      scenario: "Foreign, about 3 years: 14-day notice, foreign half-day slots, two-level",
    },
    {
      key: "nguyen",
      code: "DEV-008",
      fullName: "Nguyen Thi Lan",
      gender: "female",
      dateOfBirth: "2000-12-02",
      joinDate: d(subDays(today, 14)),
      designation: "Therapist",
      branch: "Branch B",
      department: "Beauty Therapy",
      classification: "foreign",
      role: "employee",
      managerKey: "daniel",
      scenario: "Foreign, joined 2 weeks ago: annual allowed from join, MC not yet",
    },
  ];
}

// Branch default routes, by employee key.
const BRANCH_ROUTES: Record<Branch, { mode: "single" | "two_level"; level1: string; level2: string | null }> = {
  "Branch A": { mode: "single", level1: "daniel", level2: null },
  "Branch B": { mode: "two_level", level1: "daniel", level2: "admin" },
};

const SITI_OPENING_BALANCE = { leaveType: "annual", days: 2, reason: "opening_balance", note: "Opening balance" } as const;

function emailFor(fullName: string): string {
  const local = fullName
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .trim()
    .split(/\s+/)
    .join(".");
  return `${local}@${EMAIL_DOMAIN}`;
}

// The admin created by db:seed:admin, who must be the only active admin.
async function findSeedAdmin(): Promise<{ id: string }> {
  const db = getDb();
  const email = normalizeEmail(requireEnv("SEED_ADMIN_EMAIL"));
  const userId = await findUserIdByEmail(db, email);
  const [admin] = userId
    ? await db
        .select({ id: employees.id, role: employees.role })
        .from(employees)
        .where(eq(employees.userId, userId))
    : [];
  if (!admin || admin.role !== "admin") {
    throw new Error(`No admin login for ${email}. Run npm run db:seed:admin first.`);
  }
  const others = await db
    .select({ code: employees.employeeCode })
    .from(employees)
    .where(and(eq(employees.role, "admin"), ne(employees.id, admin.id)));
  if (others.length > 0) {
    throw new Error(
      `Other admins exist (${others.map((o) => o.code).join(", ")}). ` +
        "The dev dataset has exactly one admin: run npm run db:reset:dev.",
    );
  }
  return { id: admin.id };
}

async function main() {
  console.warn(
    "\n" +
      "!!! WARNING: seed-dev inserts DUMMY employees and logins.\n" +
      "!!! It must only ever run against the DEV Neon branch, never production.\n" +
      "!!! Check the target host below before trusting the result.\n",
  );

  if (process.env.ALLOW_DEV_SEED !== "true") {
    throw new Error(
      'Refusing to run: ALLOW_DEV_SEED is not "true". Set it only for a dev-branch run.',
    );
  }

  printTarget(SCRIPT);

  const password = requirePassword("SEED_DEV_PASSWORD");
  const list = buildEmployees();
  const db = getDb();
  const summary = createSummary(SCRIPT);
  const admin = await findSeedAdmin();

  // Branches and departments.
  const branchIds = new Map<string, string>();
  for (const name of BRANCHES) {
    const branch = await ensureBranch(db, name);
    branchIds.set(name, branch.id);
    (branch.created ? summary.created : summary.existing)(`branches: ${name}`);
  }
  const departmentIds = new Map<string, string>();
  for (const name of DEPARTMENTS) {
    const department = await ensureDepartment(db, name);
    departmentIds.set(name, department.id);
    (department.created ? summary.created : summary.existing)(`departments: ${name}`);
  }

  // The admin moves to Branch A / Management and, like the other dev
  // logins, skips the forced password change. The placeholder branch from
  // db:seed:admin is then unused and removed.
  await db
    .update(employees)
    .set({
      branchId: branchIds.get("Branch A")!,
      departmentId: departmentIds.get("Management")!,
      mustChangePassword: false,
    })
    .where(eq(employees.id, admin.id));
  summary.updated("employees: admin moved to Branch A / Management, no forced password change");
  const [placeholder] = await db
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.name, ADMIN_PLACEHOLDER_BRANCH));
  if (placeholder) {
    const [inUse] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.branchId, placeholder.id))
      .limit(1);
    if (!inUse) {
      await db.delete(branches).where(eq(branches.id, placeholder.id));
      summary.updated(`branches: removed unused placeholder "${ADMIN_PLACEHOLDER_BRANCH}"`);
    }
  }

  // Employees, in hierarchy order so each manager already has an id.
  const employeeIds = new Map<string, string>([["admin", admin.id]]);
  for (const e of list) {
    const [inserted] = await db
      .insert(employees)
      .values({
        employeeCode: e.code,
        fullName: e.fullName,
        email: emailFor(e.fullName),
        phone: `+673 71${e.code.slice(-3)} 000`,
        dateOfBirth: e.dateOfBirth,
        gender: e.gender,
        joinDate: e.joinDate,
        designation: e.designation,
        departmentId: departmentIds.get(e.department)!,
        branchId: branchIds.get(e.branch)!,
        classification: e.classification,
        reportingManagerId: employeeIds.get(e.managerKey)!,
        role: e.role,
        status: "active",
        // Dev logins share SEED_DEV_PASSWORD, so no forced change on first login.
        mustChangePassword: false,
      })
      .onConflictDoNothing()
      .returning({ id: employees.id });

    if (inserted) {
      employeeIds.set(e.key, inserted.id);
      summary.created(`employees: ${e.code} ${e.fullName} (${e.scenario})`);
      continue;
    }

    const [existing] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.employeeCode, e.code));
    if (!existing) {
      throw new Error(
        `${e.code}: insert skipped but no employee has this code. ` +
          `Another employee probably already uses ${emailFor(e.fullName)}.`,
      );
    }
    employeeIds.set(e.key, existing.id);
    summary.existing(`employees: ${e.code} ${e.fullName}`);
  }

  // Logins for everyone except the admin (created by db:seed:admin).
  for (const e of list) {
    const employeeId = employeeIds.get(e.key)!;
    const email = emailFor(e.fullName);

    const [employee] = await db
      .select({ userId: employees.userId })
      .from(employees)
      .where(eq(employees.id, employeeId));
    if (employee?.userId) {
      summary.existing(`login: ${email}`);
      continue;
    }

    const existingUserId = await findUserIdByEmail(db, email);
    if (existingUserId) {
      await db.update(employees).set({ userId: existingUserId }).where(eq(employees.id, employeeId));
      summary.updated(`employees: ${e.code} linked to existing login ${email}`);
      continue;
    }

    const login = await buildCredentialLogin({ name: e.fullName, email, password });
    await db.batch([
      db.insert(user).values(login.userRow),
      db.insert(account).values(login.accountRow),
      db.update(employees).set({ userId: login.userId }).where(eq(employees.id, employeeId)),
    ]);
    summary.created(`login: ${email} (${e.role})`);
  }

  // Branch default routes.
  for (const branch of BRANCHES) {
    const route = BRANCH_ROUTES[branch];
    const [inserted] = await db
      .insert(branchApprovalRoutes)
      .values({
        branchId: branchIds.get(branch)!,
        mode: route.mode,
        level1ApproverId: employeeIds.get(route.level1)!,
        level2ApproverId: route.level2 ? employeeIds.get(route.level2)! : null,
        updatedBy: admin.id,
      })
      .onConflictDoNothing({ target: branchApprovalRoutes.branchId })
      .returning({ id: branchApprovalRoutes.id });
    (inserted ? summary.created : summary.existing)(`branch_approval_routes: ${branch} (${route.mode})`);
  }

  // Managers' leave approver = the admin.
  const [settings] = await db
    .insert(approvalSettings)
    .values({ id: 1, managersApproverId: admin.id, updatedBy: admin.id })
    .onConflictDoNothing({ target: approvalSettings.id })
    .returning({ id: approvalSettings.id });
  (settings ? summary.created : summary.existing)("approval_settings: managers' leave approver = admin");

  // Siti's opening balance, once. addAdjustment creates her entitlement rows first.
  const sitiId = employeeIds.get("siti")!;
  const [opening] = await db
    .select({ id: leaveAdjustments.id })
    .from(leaveAdjustments)
    .where(and(eq(leaveAdjustments.employeeId, sitiId), eq(leaveAdjustments.reason, "opening_balance")))
    .limit(1);
  if (opening) {
    summary.existing("leave_adjustments: Siti Rahman opening balance");
  } else {
    const result = await addAdjustment({ id: admin.id }, sitiId, SITI_OPENING_BALANCE, toDateColumn(todayInBusinessZone()));
    if (!result.ok) throw new Error(`Siti's opening balance failed: ${result.error}`);
    summary.created("leave_adjustments: Siti Rahman +2 annual (Opening balance)");
  }

  summary.print();
}

runSeed(SCRIPT, main);
