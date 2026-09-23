import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { employees } from "@/db/schema";

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
