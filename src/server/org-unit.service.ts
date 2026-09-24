import { and, asc, eq, ne, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { branches, departments, employees } from "@/db/schema";
import { checkUnitDeactivation, findNameConflict } from "@/lib/org/org-units";
import type { CreateOrgUnitInput, UpdateOrgUnitInput } from "@/validations/department";

import { fail, isUniqueViolation, UUID, type ServiceResult } from "./service-result";

// Departments and branches share one set of rules, so department.service and
// branch.service both call into this module. They are never hard-deleted:
// deactivate instead.

export type OrgUnitKind = "department" | "branch";

const UNITS = {
  department: { table: departments, employeeColumn: employees.departmentId, label: "department" },
  branch: { table: branches, employeeColumn: employees.branchId, label: "branch" },
} as const;

const CHECK_FIELDS = "Please check the highlighted fields.";

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function duplicateNameError(kind: OrgUnitKind, name: string) {
  return fail(409, CHECK_FIELDS, {
    fieldErrors: { name: `A ${UNITS[kind].label} called "${name}" already exists` },
  });
}

// Every department or branch (active and inactive), A–Z, with how many
// active or probation employees are assigned to each.
export async function listOrgUnits(kind: OrgUnitKind) {
  const { table, employeeColumn } = UNITS[kind];
  return getDb()
    .select({
      id: table.id,
      name: table.name,
      isActive: table.isActive,
      activeEmployeeCount: sql<number>`count(${employees.id})::int`,
    })
    .from(table)
    .leftJoin(employees, and(eq(employeeColumn, table.id), ne(employees.status, "inactive")))
    .groupBy(table.id)
    .orderBy(asc(sql`lower(${table.name})`));
}

export type OrgUnitRow = Awaited<ReturnType<typeof listOrgUnits>>[number];

async function allNames(kind: OrgUnitKind) {
  const { table } = UNITS[kind];
  return getDb().select({ id: table.id, name: table.name }).from(table);
}

export async function createOrgUnit(
  kind: OrgUnitKind,
  input: CreateOrgUnitInput,
): Promise<ServiceResult<{ id: string }>> {
  const { table } = UNITS[kind];
  const conflict = findNameConflict(input.name, await allNames(kind));
  if (conflict) return duplicateNameError(kind, conflict.name);

  const id = crypto.randomUUID();
  try {
    await getDb().insert(table).values({ id, name: input.name });
  } catch (error) {
    // A concurrent create with the same name.
    if (isUniqueViolation(error)) return duplicateNameError(kind, input.name);
    throw error;
  }
  return { ok: true, id };
}

// Rename and/or change active status. Deactivation is refused while any
// active or probation employee is still assigned.
export async function updateOrgUnit(
  kind: OrgUnitKind,
  id: string,
  input: UpdateOrgUnitInput,
): Promise<ServiceResult<{ id: string }>> {
  const { table, employeeColumn, label } = UNITS[kind];
  const notFound = fail(404, `${capitalise(label)} not found`);
  if (!UUID.test(id)) return notFound;

  const db = getDb();
  const [current] = await db
    .select({ id: table.id, name: table.name, isActive: table.isActive })
    .from(table)
    .where(eq(table.id, id))
    .limit(1);
  if (!current) return notFound;

  const changes: { name?: string; isActive?: boolean } = {};

  if (input.name !== undefined && input.name !== current.name) {
    const conflict = findNameConflict(input.name, await allNames(kind), id);
    if (conflict) return duplicateNameError(kind, conflict.name);
    changes.name = input.name;
  }

  if (input.isActive !== undefined && input.isActive !== current.isActive) {
    if (!input.isActive) {
      const assigned = await db
        .select({ fullName: employees.fullName, employeeCode: employees.employeeCode })
        .from(employees)
        .where(and(eq(employeeColumn, id), ne(employees.status, "inactive")))
        .orderBy(asc(employees.fullName));
      const check = checkUnitDeactivation(assigned);
      if (!check.allowed) {
        const count = assigned.length;
        return fail(
          409,
          `${current.name} still has ${count} active employee${count === 1 ? "" : "s"}. Move them to another ${label} before deactivating it:`,
          { details: check.details },
        );
      }
    }
    changes.isActive = input.isActive;
  }

  if (Object.keys(changes).length === 0) return { ok: true, id };

  try {
    await db.update(table).set(changes).where(eq(table.id, id));
  } catch (error) {
    if (isUniqueViolation(error)) return duplicateNameError(kind, changes.name ?? current.name);
    throw error;
  }
  return { ok: true, id };
}
