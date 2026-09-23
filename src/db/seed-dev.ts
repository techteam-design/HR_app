// Dummy data for the DEV Neon branch only. NEVER run against production.
// Refuses to run unless ALLOW_DEV_SEED is exactly "true".
// Idempotent: rows are matched by unique keys (branch/department name,
// employee_code, approval_workflows.employee_id, user email); existing rows
// are left unchanged.
//
// Required env: ALLOW_DEV_SEED=true, SEED_DEV_PASSWORD (12+ chars, shared by
// all dev logins).
// Does NOT create leave_entitlements, leave_applications, approval_actions or
// leave_adjustments (the leave engine creates entitlements in Sprint 2).
//
// Run: npm run db:seed:dev

import { TZDate } from "@date-fns/tz";
import { config } from "dotenv";
import {
  addDays,
  differenceInCalendarDays,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from "date-fns";
import { eq } from "drizzle-orm";

import { getDb } from "./index";
import { account, approvalWorkflows, employees, user } from "./schema";
import {
  buildCredentialLogin,
  createSummary,
  ensureBranch,
  ensureDepartment,
  findUserIdByEmail,
  printTarget,
  requirePassword,
  runSeed,
  SINGAPORE_TZ,
  toDateColumn,
  todayInSingapore,
} from "./seed-helpers";

// getDb() is lazy, so loading env here (after imports) is early enough.
config({ path: ".env.local", quiet: true });

const SCRIPT = "seed-dev";
const EMAIL_DOMAIN = "example.test";

const BRANCHES = ["Branch A", "Branch B", "Branch C"] as const;
const DEPARTMENTS = ["Management", "Beauty Therapy", "Front Desk", "Operations"] as const;

type Approval =
  | { mode: "single"; level1: string }
  | { mode: "two_level"; level1: string; level2: string };

type DevEmployee = {
  key: string;
  code: string;
  fullName: string;
  gender: "male" | "female";
  dateOfBirth: string;
  joinDate: string;
  designation: string;
  branch: (typeof BRANCHES)[number];
  department: (typeof DEPARTMENTS)[number];
  classification: "local" | "foreign";
  role: "employee" | "manager" | "admin" | "hr_viewer";
  status: "active" | "inactive" | "probation";
  // Key of the reporting manager; must appear earlier in the list.
  managerKey: string | null;
  approval: Approval;
  login: boolean;
  scenario: string;
};

function buildEmployees(): DevEmployee[] {
  const today = todayInSingapore();
  const d = toDateColumn;

  // Mid-year joiner for MC pro-rating: 1 July this year, or (if 1 July is
  // still in the future) halfway between 1 January and today.
  const julyFirst = new TZDate(today.getFullYear(), 6, 1, SINGAPORE_TZ);
  const midYearJoin =
    today >= julyFirst
      ? d(julyFirst)
      : d(
          addDays(
            startOfYear(today),
            Math.floor(differenceInCalendarDays(today, startOfYear(today)) / 2),
          ),
        );

  return [
    {
      key: "admin",
      code: "DEV-001",
      fullName: "Aisha Rahman",
      gender: "female",
      dateOfBirth: "1980-04-12",
      joinDate: d(subYears(today, 9)),
      designation: "General Manager",
      branch: "Branch A",
      department: "Management",
      classification: "local",
      role: "admin",
      status: "active",
      managerKey: null,
      // Most senior person: approved by the longest-serving branch manager.
      approval: { mode: "single", level1: "managerA" },
      login: true,
      scenario: "Admin, 9 years service (14 days annual)",
    },
    {
      key: "hrViewer",
      code: "DEV-002",
      fullName: "Grace Lim",
      gender: "female",
      dateOfBirth: "1988-09-03",
      joinDate: d(subYears(today, 4)),
      designation: "HR Executive",
      branch: "Branch A",
      department: "Management",
      classification: "local",
      role: "hr_viewer",
      status: "active",
      managerKey: "admin",
      approval: { mode: "single", level1: "admin" },
      login: true,
      scenario: "HR viewer (read-only)",
    },
    {
      key: "managerA",
      code: "DEV-003",
      fullName: "Daniel Tan",
      gender: "male",
      dateOfBirth: "1984-01-22",
      joinDate: d(subYears(today, 6)),
      designation: "Branch Manager",
      branch: "Branch A",
      department: "Operations",
      classification: "local",
      role: "manager",
      status: "active",
      managerKey: "admin",
      approval: { mode: "single", level1: "admin" },
      login: true,
      scenario: "Manager, Branch A; Level 2 approver for the team head's staff",
    },
    {
      key: "managerB",
      code: "DEV-004",
      fullName: "Priya Nair",
      gender: "female",
      dateOfBirth: "1986-06-15",
      joinDate: d(subYears(today, 5)),
      designation: "Branch Manager",
      branch: "Branch B",
      department: "Operations",
      classification: "local",
      role: "manager",
      status: "active",
      managerKey: "admin",
      approval: { mode: "single", level1: "admin" },
      login: false,
      scenario: "Manager, Branch B (also covers Branch C)",
    },
    {
      key: "teamHead",
      code: "DEV-005",
      fullName: "Chua Mei Ling",
      gender: "female",
      dateOfBirth: "1990-11-08",
      joinDate: d(subMonths(today, 54)),
      designation: "Senior Beauty Therapist (Team Head)",
      branch: "Branch A",
      department: "Beauty Therapy",
      classification: "local",
      role: "manager",
      status: "active",
      managerKey: "managerA",
      approval: { mode: "single", level1: "managerA" },
      login: true,
      scenario: "Team head (role manager); Level 1 approver for therapists",
    },
    {
      key: "newLocal",
      code: "DEV-006",
      fullName: "Nur Aisyah Binte Salleh",
      gender: "female",
      dateOfBirth: "2001-02-17",
      joinDate: d(subMonths(today, 2)),
      designation: "Beauty Therapist",
      branch: "Branch A",
      department: "Beauty Therapy",
      classification: "local",
      role: "employee",
      status: "active",
      managerKey: "teamHead",
      approval: { mode: "two_level", level1: "teamHead", level2: "managerA" },
      login: false,
      scenario: "Local, joined 2 months ago: not yet eligible for annual leave",
    },
    {
      key: "veryNewLocal",
      code: "DEV-007",
      fullName: "Siti Hajar Binte Osman",
      gender: "female",
      dateOfBirth: "2003-07-29",
      joinDate: d(subDays(today, 20)),
      designation: "Receptionist",
      branch: "Branch A",
      department: "Front Desk",
      classification: "local",
      role: "employee",
      status: "active",
      managerKey: "managerA",
      approval: { mode: "single", level1: "managerA" },
      login: false,
      scenario: "Local, joined 20 days ago: not yet eligible for MC",
    },
    {
      key: "midYearLocal",
      code: "DEV-008",
      fullName: "Rachel Goh",
      gender: "female",
      dateOfBirth: "1997-05-05",
      joinDate: midYearJoin,
      designation: "Receptionist",
      branch: "Branch B",
      department: "Front Desk",
      classification: "local",
      role: "employee",
      status: "active",
      managerKey: "managerB",
      approval: { mode: "single", level1: "managerB" },
      login: false,
      scenario: "Local, joined mid-year: MC pro-rating",
    },
    {
      key: "anniversaryLocal",
      code: "DEV-009",
      fullName: "Kelvin Ong",
      gender: "male",
      dateOfBirth: "1992-12-01",
      joinDate: d(subYears(today, 3)),
      designation: "Operations Executive",
      branch: "Branch B",
      department: "Operations",
      classification: "local",
      role: "employee",
      status: "active",
      managerKey: "managerB",
      approval: { mode: "single", level1: "managerB" },
      login: false,
      scenario: "Local, joined exactly 3 years ago: anniversary boundary",
    },
    {
      key: "foreign3y",
      code: "DEV-010",
      fullName: "Maria Santos",
      gender: "female",
      dateOfBirth: "1991-03-30",
      joinDate: d(subYears(today, 3)),
      designation: "Beauty Therapist",
      branch: "Branch A",
      department: "Beauty Therapy",
      classification: "foreign",
      role: "employee",
      status: "active",
      managerKey: "teamHead",
      approval: { mode: "two_level", level1: "teamHead", level2: "managerA" },
      login: true,
      scenario: "Foreign, 3 years: 14-day notice, foreign half-day slots, two-level",
    },
    {
      key: "foreign14m",
      code: "DEV-011",
      fullName: "Nguyen Thi Linh",
      gender: "female",
      dateOfBirth: "1996-08-19",
      joinDate: d(subMonths(today, 14)),
      designation: "Beauty Therapist",
      branch: "Branch A",
      department: "Beauty Therapy",
      classification: "foreign",
      role: "employee",
      status: "active",
      managerKey: "teamHead",
      approval: { mode: "two_level", level1: "teamHead", level2: "managerA" },
      login: false,
      scenario: "Foreign, 1 year 2 months: second leave year, carry-forward",
    },
    {
      key: "probation",
      code: "DEV-012",
      fullName: "Arjun Kumar",
      gender: "male",
      dateOfBirth: "1999-10-10",
      joinDate: d(subMonths(today, 4)),
      designation: "Receptionist",
      branch: "Branch C",
      department: "Front Desk",
      classification: "local",
      role: "employee",
      status: "probation",
      managerKey: "managerB",
      approval: { mode: "single", level1: "managerB" },
      login: false,
      scenario: "Status probation (joined 4 months ago)",
    },
    {
      key: "inactive",
      code: "DEV-013",
      fullName: "Jason Lee",
      gender: "male",
      dateOfBirth: "1994-04-04",
      joinDate: d(subYears(today, 2)),
      designation: "Beauty Therapist",
      branch: "Branch C",
      department: "Beauty Therapy",
      classification: "local",
      role: "employee",
      status: "inactive",
      managerKey: "managerB",
      approval: { mode: "single", level1: "managerB" },
      login: false,
      scenario: "Status inactive (deactivated, kept for records)",
    },
  ];
}

function emailFor(fullName: string): string {
  const local = fullName
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .trim()
    .split(/\s+/)
    .join(".");
  return `${local}@${EMAIL_DOMAIN}`;
}

// Fails fast on a bad hierarchy or approval setup before anything is written.
function validate(list: DevEmployee[]): void {
  const keys = new Set<string>();
  for (const e of list) {
    if (e.managerKey && !keys.has(e.managerKey)) {
      throw new Error(`${e.key}: manager "${e.managerKey}" must be listed before them.`);
    }
    keys.add(e.key);
  }
  for (const e of list) {
    const approvers =
      e.approval.mode === "single"
        ? [e.approval.level1]
        : [e.approval.level1, e.approval.level2];
    for (const a of approvers) {
      if (!keys.has(a)) throw new Error(`${e.key}: unknown approver "${a}".`);
      if (a === e.key) throw new Error(`${e.key}: cannot be their own approver.`);
    }
    if (e.approval.mode === "two_level" && e.approval.level1 === e.approval.level2) {
      throw new Error(`${e.key}: Level 1 and Level 2 approvers must differ.`);
    }
  }
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
  validate(list);

  const db = getDb();
  const summary = createSummary(SCRIPT);

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

  // Employees, in hierarchy order so each manager already has an id.
  const employeeIds = new Map<string, string>();
  for (const e of list) {
    const [inserted] = await db
      .insert(employees)
      .values({
        employeeCode: e.code,
        fullName: e.fullName,
        email: emailFor(e.fullName),
        phone: `+65 9000 ${e.code.slice(-3).padStart(4, "0")}`,
        dateOfBirth: e.dateOfBirth,
        gender: e.gender,
        joinDate: e.joinDate,
        designation: e.designation,
        departmentId: departmentIds.get(e.department)!,
        branchId: branchIds.get(e.branch)!,
        classification: e.classification,
        reportingManagerId: e.managerKey ? employeeIds.get(e.managerKey)! : null,
        role: e.role,
        status: e.status,
        // Dev logins share SEED_DEV_PASSWORD, so no forced change on first login.
        mustChangePassword: !e.login,
        deactivatedAt: e.status === "inactive" ? new Date() : null,
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

  // Approval workflows.
  for (const e of list) {
    const [inserted] = await db
      .insert(approvalWorkflows)
      .values({
        employeeId: employeeIds.get(e.key)!,
        mode: e.approval.mode,
        level1ApproverId: employeeIds.get(e.approval.level1)!,
        level2ApproverId:
          e.approval.mode === "two_level" ? employeeIds.get(e.approval.level2)! : null,
      })
      .onConflictDoNothing({ target: approvalWorkflows.employeeId })
      .returning({ id: approvalWorkflows.id });
    (inserted ? summary.created : summary.existing)(
      `approval_workflows: ${e.code} (${e.approval.mode})`,
    );
  }

  // Logins: one per role (admin, manager, team head, employee, hr_viewer).
  for (const e of list.filter((x) => x.login)) {
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
      await db
        .update(employees)
        .set({ userId: existingUserId })
        .where(eq(employees.id, employeeId));
      summary.updated(`employees: ${e.code} linked to existing login ${email}`);
      continue;
    }

    const login = await buildCredentialLogin({ name: e.fullName, email, password });
    await db.batch([
      db.insert(user).values(login.userRow),
      db.insert(account).values(login.accountRow),
      db.update(employees).set({ userId: login.userId }).where(eq(employees.id, employeeId)),
    ]);
    summary.created(`login: ${email} (${e.role}${e.key === "teamHead" ? ", team head" : ""})`);
  }

  summary.print();
}

runSeed(SCRIPT, main);
