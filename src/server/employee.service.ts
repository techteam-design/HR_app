import { and, asc, count, desc, eq, ilike, ne, or, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/db";
import {
  account,
  approvalWorkflows,
  branches,
  departments,
  employees,
  session,
  user,
} from "@/db/schema";
import { generateTemporaryPassword } from "@/lib/auth/temporary-password";
import { checkAdminChange } from "@/lib/employees/admin-guard";
import { wouldCreateReportingCycle } from "@/lib/employees/reporting";
import {
  EMPLOYEE_PAGE_SIZE,
  type CreateEmployeeInput,
  type EmployeeFieldsInput,
  type EmployeeListQuery,
} from "@/validations/employee";

import {
  buildCredentialLogin,
  findUserIdByEmail,
  generateBetterAuthId,
  hashLoginPassword,
} from "./login-account.service";
import { fail, UUID, type ServiceError, type ServiceResult } from "./service-result";

// ---------------------------------------------------------------------------
// Session lookup (used by auth.service and the Better Auth session hook)
// ---------------------------------------------------------------------------

// Fields needed to identify the signed-in employee and check access.
const sessionEmployeeColumns = {
  id: employees.id,
  userId: employees.userId,
  employeeCode: employees.employeeCode,
  fullName: employees.fullName,
  designation: employees.designation,
  email: employees.email,
  role: employees.role,
  status: employees.status,
  classification: employees.classification,
  mustChangePassword: employees.mustChangePassword,
  // For the signed-in user's own avatar in the navigation.
  photoKey: employees.photoKey,
};

export type SessionEmployee = NonNullable<Awaited<ReturnType<typeof findEmployeeByUserId>>>;

export async function findEmployeeByUserId(userId: string) {
  const [row] = await getDb()
    .select(sessionEmployeeColumns)
    .from(employees)
    .where(eq(employees.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function clearMustChangePassword(employeeId: string): Promise<void> {
  await getDb()
    .update(employees)
    .set({ mustChangePassword: false })
    .where(eq(employees.id, employeeId));
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type { ServiceError, ServiceResult };

const CHECK_FIELDS = "Please check the highlighted fields.";

type Statement = BatchItem<"pg">;

// Runs statements in one transaction (neon-http db.batch).
async function runBatch(statements: Statement[]): Promise<void> {
  if (statements.length === 0) return;
  await getDb().batch(statements as [Statement, ...Statement[]]);
}

// Maps a unique-constraint violation (a concurrent duplicate that slipped
// past the pre-checks) to a field error.
function uniqueViolation(error: unknown): ServiceError | null {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    const { code, constraint } = current as { code?: string; constraint?: string };
    if (code === "23505") {
      if (constraint?.includes("employee_code")) {
        return fail(409, CHECK_FIELDS, { fieldErrors: { employeeCode: "This employee code is already in use" } });
      }
      if (constraint?.includes("email")) {
        return fail(409, CHECK_FIELDS, { fieldErrors: { email: "This email is already in use" } });
      }
      return fail(409, "This record conflicts with an existing one.");
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function listEmployees(query: EmployeeListQuery) {
  const conditions: SQL[] = [];
  if (query.q) {
    const pattern = `%${escapeLike(query.q)}%`;
    conditions.push(
      or(
        ilike(employees.fullName, pattern),
        ilike(employees.email, pattern),
        ilike(employees.employeeCode, pattern),
      )!,
    );
  }
  if (query.department) conditions.push(eq(employees.departmentId, query.department));
  if (query.branch) conditions.push(eq(employees.branchId, query.branch));
  if (query.status) conditions.push(eq(employees.status, query.status));
  if (query.role) conditions.push(eq(employees.role, query.role));
  if (query.classification) conditions.push(eq(employees.classification, query.classification));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const direction = query.dir === "desc" ? desc : asc;
  const orderBy =
    query.sort === "joinDate"
      ? [direction(employees.joinDate), asc(employees.fullName)]
      : [direction(employees.fullName), asc(employees.employeeCode)];

  const db = getDb();
  const [items, totals] = await db.batch([
    db
      .select({
        id: employees.id,
        fullName: employees.fullName,
        employeeCode: employees.employeeCode,
        email: employees.email,
        designation: employees.designation,
        departmentName: departments.name,
        departmentIsActive: departments.isActive,
        branchName: branches.name,
        branchIsActive: branches.isActive,
        role: employees.role,
        status: employees.status,
        classification: employees.classification,
        joinDate: employees.joinDate,
        photoKey: employees.photoKey,
      })
      .from(employees)
      .innerJoin(departments, eq(departments.id, employees.departmentId))
      .innerJoin(branches, eq(branches.id, employees.branchId))
      .where(where)
      .orderBy(...orderBy)
      .limit(EMPLOYEE_PAGE_SIZE)
      .offset((query.page - 1) * EMPLOYEE_PAGE_SIZE),
    db.select({ total: count() }).from(employees).where(where),
  ]);

  const total = totals[0]?.total ?? 0;
  return {
    items,
    total,
    page: query.page,
    pageSize: EMPLOYEE_PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / EMPLOYEE_PAGE_SIZE)),
  };
}

export type EmployeeListItem = Awaited<ReturnType<typeof listEmployees>>["items"][number];

const manager = alias(employees, "manager");

export async function getEmployeeDetail(id: string) {
  if (!UUID.test(id)) return null;
  const [row] = await getDb()
    .select({
      id: employees.id,
      userId: employees.userId,
      employeeCode: employees.employeeCode,
      fullName: employees.fullName,
      email: employees.email,
      phone: employees.phone,
      dateOfBirth: employees.dateOfBirth,
      gender: employees.gender,
      joinDate: employees.joinDate,
      designation: employees.designation,
      departmentId: employees.departmentId,
      departmentName: departments.name,
      departmentIsActive: departments.isActive,
      branchId: employees.branchId,
      branchName: branches.name,
      branchIsActive: branches.isActive,
      classification: employees.classification,
      reportingManagerId: employees.reportingManagerId,
      reportingManagerName: manager.fullName,
      role: employees.role,
      status: employees.status,
      photoKey: employees.photoKey,
      mustChangePassword: employees.mustChangePassword,
      deactivatedAt: employees.deactivatedAt,
      createdAt: employees.createdAt,
    })
    .from(employees)
    .innerJoin(departments, eq(departments.id, employees.departmentId))
    .innerJoin(branches, eq(branches.id, employees.branchId))
    .leftJoin(manager, eq(manager.id, employees.reportingManagerId))
    .where(eq(employees.id, id))
    .limit(1);
  if (!row) return null;
  const { userId, ...rest } = row;
  return { ...rest, hasLogin: userId !== null };
}

export type EmployeeDetail = NonNullable<Awaited<ReturnType<typeof getEmployeeDetail>>>;

// Active and probation employees who report directly to this employee.
export async function listDirectReports(managerId: string) {
  return getDb()
    .select({
      id: employees.id,
      fullName: employees.fullName,
      designation: employees.designation,
      photoKey: employees.photoKey,
    })
    .from(employees)
    .where(and(eq(employees.reportingManagerId, managerId), ne(employees.status, "inactive")))
    .orderBy(asc(employees.fullName));
}

// Choices for the create/edit form and list filters.
export async function getEmployeeFormOptions(excludeEmployeeId?: string) {
  const db = getDb();
  const [departmentRows, branchRows, managerRows] = await db.batch([
    db
      .select({ id: departments.id, name: departments.name, isActive: departments.isActive })
      .from(departments)
      .orderBy(asc(departments.name)),
    db
      .select({ id: branches.id, name: branches.name, isActive: branches.isActive })
      .from(branches)
      .orderBy(asc(branches.name)),
    db
      .select({ id: employees.id, fullName: employees.fullName, employeeCode: employees.employeeCode })
      .from(employees)
      .where(ne(employees.status, "inactive"))
      .orderBy(asc(employees.fullName)),
  ]);
  return {
    departments: departmentRows,
    branches: branchRows,
    managers: managerRows.filter((m) => m.id !== excludeEmployeeId),
  };
}

export type EmployeeFormOptions = Awaited<ReturnType<typeof getEmployeeFormOptions>>;

// ---------------------------------------------------------------------------
// Validation against the database
// ---------------------------------------------------------------------------

async function activeAdminIds(): Promise<string[]> {
  const rows = await getDb()
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.role, "admin"), ne(employees.status, "inactive")));
  return rows.map((r) => r.id);
}

async function validateProfile(
  input: EmployeeFieldsInput,
  options: {
    employeeId: string | null;
    checkLoginEmail: boolean;
    ownUserId: string | null;
    // The employee's current department and branch stay allowed even if
    // they have since been deactivated.
    currentDepartmentId?: string;
    currentBranchId?: string;
  },
): Promise<Record<string, string>> {
  const db = getDb();
  const errors: Record<string, string> = {};
  const { employeeId } = options;
  const notSelf = (column: typeof employees.id) => (employeeId ? ne(column, employeeId) : undefined);

  const [emailTaken, codeTaken, department, branch] = await db.batch([
    db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.email, input.email), notSelf(employees.id)))
      .limit(1),
    db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.employeeCode, input.employeeCode), notSelf(employees.id)))
      .limit(1),
    db
      .select({ id: departments.id, isActive: departments.isActive })
      .from(departments)
      .where(eq(departments.id, input.departmentId))
      .limit(1),
    db
      .select({ id: branches.id, isActive: branches.isActive })
      .from(branches)
      .where(eq(branches.id, input.branchId))
      .limit(1),
  ]);

  if (emailTaken.length > 0) errors.email = "Another employee already uses this email";
  if (codeTaken.length > 0) errors.employeeCode = "This employee code is already in use";
  if (department.length === 0) {
    errors.departmentId = "Choose a department";
  } else if (!department[0].isActive && input.departmentId !== options.currentDepartmentId) {
    errors.departmentId = "This department is inactive. Choose an active department";
  }
  if (branch.length === 0) {
    errors.branchId = "Choose a branch";
  } else if (!branch[0].isActive && input.branchId !== options.currentBranchId) {
    errors.branchId = "This branch is inactive. Choose an active branch";
  }

  if (!errors.email && options.checkLoginEmail) {
    const loginUserId = await findUserIdByEmail(db, input.email);
    if (loginUserId && loginUserId !== options.ownUserId) {
      errors.email = "This email is already used by another login";
    }
  }

  if (input.reportingManagerId) {
    const [found] = await db
      .select({ id: employees.id, status: employees.status })
      .from(employees)
      .where(eq(employees.id, input.reportingManagerId))
      .limit(1);
    if (input.reportingManagerId === employeeId) {
      errors.reportingManagerId = "An employee cannot report to themself";
    } else if (!found) {
      errors.reportingManagerId = "Reporting manager not found";
    } else if (found.status === "inactive") {
      errors.reportingManagerId = "Reporting manager is inactive";
    } else if (employeeId) {
      const links = await db
        .select({ id: employees.id, managerId: employees.reportingManagerId })
        .from(employees);
      const managerOf = new Map(links.map((l) => [l.id, l.managerId]));
      if (wouldCreateReportingCycle(employeeId, input.reportingManagerId, managerOf)) {
        errors.reportingManagerId =
          "This would create a reporting loop: the chosen manager already reports up to this employee";
      }
    }
  }

  return errors;
}

function profileValues(input: EmployeeFieldsInput) {
  return {
    fullName: input.fullName,
    employeeCode: input.employeeCode,
    email: input.email,
    phone: input.phone,
    dateOfBirth: input.dateOfBirth,
    gender: input.gender,
    joinDate: input.joinDate,
    designation: input.designation,
    departmentId: input.departmentId,
    branchId: input.branchId,
    classification: input.classification,
    reportingManagerId: input.reportingManagerId,
    role: input.role,
  };
}

type Actor = { id: string };

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

// Creates the employee and, optionally, their login in one transaction.
// The temporary password is returned once and never stored in plain text.
export async function createEmployee(
  input: CreateEmployeeInput,
): Promise<ServiceResult<{ id: string; temporaryPassword: string | null }>> {
  const fieldErrors = await validateProfile(input, {
    employeeId: null,
    checkLoginEmail: input.createLogin,
    ownUserId: null,
  });
  if (Object.keys(fieldErrors).length > 0) return fail(400, CHECK_FIELDS, { fieldErrors });

  const id = crypto.randomUUID();
  const values = { id, ...profileValues(input), status: input.status };

  try {
    if (!input.createLogin) {
      await getDb().insert(employees).values({ ...values, mustChangePassword: true });
      return { ok: true, id, temporaryPassword: null };
    }

    const temporaryPassword = generateTemporaryPassword();
    const login = await buildCredentialLogin({
      name: input.fullName,
      email: input.email,
      password: temporaryPassword,
    });
    const db = getDb();
    await runBatch([
      db.insert(user).values(login.userRow),
      db.insert(account).values(login.accountRow),
      db.insert(employees).values({ ...values, userId: login.userId, mustChangePassword: true }),
    ]);
    return { ok: true, id, temporaryPassword };
  } catch (error) {
    const mapped = uniqueViolation(error);
    if (mapped) return mapped;
    throw error;
  }
}

export async function updateEmployee(
  actor: Actor,
  id: string,
  input: EmployeeFieldsInput,
): Promise<ServiceResult<{ id: string }>> {
  if (!UUID.test(id)) return fail(404, "Employee not found");
  const db = getDb();
  const [current] = await db
    .select({
      id: employees.id,
      userId: employees.userId,
      email: employees.email,
      fullName: employees.fullName,
      role: employees.role,
      status: employees.status,
      departmentId: employees.departmentId,
      branchId: employees.branchId,
    })
    .from(employees)
    .where(eq(employees.id, id))
    .limit(1);
  if (!current) return fail(404, "Employee not found");

  // Inactive employees stay inactive until reactivated.
  const nextStatus = current.status === "inactive" ? "inactive" : input.status;

  const adminError = checkAdminChange({
    actorId: actor.id,
    targetId: id,
    activeAdminIds: await activeAdminIds(),
    next: { role: input.role, status: nextStatus },
  });
  if (adminError) return fail(409, adminError, { fieldErrors: { role: adminError } });

  const emailChanged = input.email !== current.email;
  const fieldErrors = await validateProfile(input, {
    employeeId: id,
    checkLoginEmail: current.userId !== null && emailChanged,
    ownUserId: current.userId,
    currentDepartmentId: current.departmentId,
    currentBranchId: current.branchId,
  });
  if (Object.keys(fieldErrors).length > 0) return fail(400, CHECK_FIELDS, { fieldErrors });

  const statements: Statement[] = [
    db
      .update(employees)
      .set({ ...profileValues(input), status: nextStatus })
      .where(eq(employees.id, id)),
  ];
  // Keep the login in step so sign-in keeps working with the new email.
  if (current.userId && (emailChanged || input.fullName !== current.fullName)) {
    statements.push(
      db.update(user).set({ email: input.email, name: input.fullName }).where(eq(user.id, current.userId)),
    );
  }

  try {
    await runBatch(statements);
  } catch (error) {
    const mapped = uniqueViolation(error);
    if (mapped) return mapped;
    throw error;
  }
  return { ok: true, id };
}

async function loadTarget(id: string) {
  if (!UUID.test(id)) return null;
  const [row] = await getDb()
    .select({
      id: employees.id,
      userId: employees.userId,
      fullName: employees.fullName,
      email: employees.email,
      role: employees.role,
      status: employees.status,
    })
    .from(employees)
    .where(eq(employees.id, id))
    .limit(1);
  return row ?? null;
}

// Who would be left without a manager or approver if this employee left.
async function deactivationBlockers(id: string): Promise<string[]> {
  const db = getDb();
  const workflowOwner = alias(employees, "workflow_owner");
  const [reports, approverFor] = await db.batch([
    db
      .select({ fullName: employees.fullName, employeeCode: employees.employeeCode })
      .from(employees)
      .where(and(eq(employees.reportingManagerId, id), ne(employees.status, "inactive")))
      .orderBy(asc(employees.fullName)),
    db
      .select({
        fullName: workflowOwner.fullName,
        employeeCode: workflowOwner.employeeCode,
        level1: approvalWorkflows.level1ApproverId,
      })
      .from(approvalWorkflows)
      .innerJoin(workflowOwner, eq(workflowOwner.id, approvalWorkflows.employeeId))
      .where(or(eq(approvalWorkflows.level1ApproverId, id), eq(approvalWorkflows.level2ApproverId, id)))
      .orderBy(asc(workflowOwner.fullName)),
  ]);

  const details: string[] = [];
  if (reports.length > 0) {
    details.push(
      `Reporting manager of: ${reports.map((r) => `${r.fullName} (${r.employeeCode})`).join(", ")}`,
    );
  }
  if (approverFor.length > 0) {
    details.push(
      `Leave approver for: ${approverFor
        .map((r) => `${r.fullName} (${r.employeeCode}, level ${r.level1 === id ? 1 : 2})`)
        .join(", ")}`,
    );
  }
  return details;
}

// Sets the employee inactive and signs them out everywhere, in one transaction.
export async function deactivateEmployee(actor: Actor, id: string): Promise<ServiceResult> {
  const target = await loadTarget(id);
  if (!target) return fail(404, "Employee not found");
  if (target.status === "inactive") return fail(409, "This employee is already inactive.");

  const adminError = checkAdminChange({
    actorId: actor.id,
    targetId: id,
    activeAdminIds: await activeAdminIds(),
    next: { role: target.role, status: "inactive" },
  });
  if (adminError) return fail(409, adminError);

  const details = await deactivationBlockers(id);
  if (details.length > 0) {
    return fail(409, `Reassign these before deactivating ${target.fullName}:`, { details });
  }

  const db = getDb();
  const statements: Statement[] = [
    db
      .update(employees)
      .set({ status: "inactive", deactivatedAt: new Date() })
      .where(eq(employees.id, id)),
  ];
  if (target.userId) statements.push(db.delete(session).where(eq(session.userId, target.userId)));
  await runBatch(statements);
  return { ok: true };
}

// Back to active; they can sign in again with their existing password.
export async function reactivateEmployee(id: string): Promise<ServiceResult> {
  const target = await loadTarget(id);
  if (!target) return fail(404, "Employee not found");
  if (target.status !== "inactive") return fail(409, "This employee is not inactive.");

  await getDb()
    .update(employees)
    .set({ status: "active", deactivatedAt: null })
    .where(eq(employees.id, id));
  return { ok: true };
}

// New temporary password, forced change on next sign-in, all sessions ended.
export async function resetEmployeePassword(
  actor: Actor,
  id: string,
): Promise<ServiceResult<{ temporaryPassword: string }>> {
  if (actor.id === id) {
    return fail(400, "To change your own password, use Change password.");
  }
  const target = await loadTarget(id);
  if (!target) return fail(404, "Employee not found");
  if (!target.userId) return fail(409, "This employee has no login yet. Create a login instead.");

  const db = getDb();
  const [credential] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, target.userId), eq(account.providerId, "credential")))
    .limit(1);

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashLoginPassword(temporaryPassword);

  await runBatch([
    credential
      ? db.update(account).set({ password: passwordHash }).where(eq(account.id, credential.id))
      : db.insert(account).values({
          id: generateBetterAuthId(),
          accountId: target.userId,
          providerId: "credential",
          userId: target.userId,
          password: passwordHash,
        }),
    db.update(employees).set({ mustChangePassword: true }).where(eq(employees.id, id)),
    db.delete(session).where(eq(session.userId, target.userId)),
  ]);
  return { ok: true, temporaryPassword };
}

// Creates a login for an employee who does not have one yet.
export async function createEmployeeLogin(
  id: string,
): Promise<ServiceResult<{ temporaryPassword: string }>> {
  const target = await loadTarget(id);
  if (!target) return fail(404, "Employee not found");
  if (target.userId) return fail(409, "This employee already has a login.");
  if (target.status === "inactive") return fail(409, "Reactivate this employee before creating a login.");

  const db = getDb();
  if (await findUserIdByEmail(db, target.email)) {
    return fail(409, "This email is already used by another login. Change the employee's email first.");
  }

  const temporaryPassword = generateTemporaryPassword();
  const login = await buildCredentialLogin({
    name: target.fullName,
    email: target.email,
    password: temporaryPassword,
  });
  try {
    await runBatch([
      db.insert(user).values(login.userRow),
      db.insert(account).values(login.accountRow),
      db
        .update(employees)
        .set({ userId: login.userId, mustChangePassword: true })
        .where(eq(employees.id, id)),
    ]);
  } catch (error) {
    const mapped = uniqueViolation(error);
    if (mapped) return mapped;
    throw error;
  }
  return { ok: true, temporaryPassword };
}

export async function employeeExists(id: string): Promise<boolean> {
  return (await loadTarget(id)) !== null;
}

export async function getEmployeePhotoKey(id: string): Promise<string | null | undefined> {
  if (!UUID.test(id)) return undefined;
  const [row] = await getDb()
    .select({ photoKey: employees.photoKey })
    .from(employees)
    .where(eq(employees.id, id))
    .limit(1);
  return row ? row.photoKey : undefined;
}

// null clears the photo.
export async function setEmployeePhotoKey(id: string, photoKey: string | null): Promise<void> {
  await getDb().update(employees).set({ photoKey }).where(eq(employees.id, id));
}
