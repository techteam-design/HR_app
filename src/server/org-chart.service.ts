import { asc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { branches, departments, employees } from "@/db/schema";

import { withPhotoUrls } from "./employee-photo.service";

// Everything the org chart needs in one round trip. With about 50 employees
// the whole company is sent to the page; the tree itself is built by the
// pure buildOrgTree() in src/lib/employees/org-tree.ts.
export async function getOrgChartData() {
  const db = getDb();
  const [people, departmentRows, branchRows] = await db.batch([
    db
      .select({
        id: employees.id,
        fullName: employees.fullName,
        designation: employees.designation,
        reportingManagerId: employees.reportingManagerId,
        status: employees.status,
        departmentId: employees.departmentId,
        departmentName: departments.name,
        departmentIsActive: departments.isActive,
        branchId: employees.branchId,
        branchName: branches.name,
        branchIsActive: branches.isActive,
        photoKey: employees.photoKey,
      })
      .from(employees)
      .innerJoin(departments, eq(departments.id, employees.departmentId))
      .innerJoin(branches, eq(branches.id, employees.branchId))
      .orderBy(asc(employees.fullName)),
    db
      .select({ id: departments.id, name: departments.name, isActive: departments.isActive })
      .from(departments)
      .orderBy(asc(departments.name)),
    db
      .select({ id: branches.id, name: branches.name, isActive: branches.isActive })
      .from(branches)
      .orderBy(asc(branches.name)),
  ]);

  const withPhotos = await withPhotoUrls(people);
  return {
    // The storage key stays on the server; the page only needs the URL.
    people: withPhotos.map((person) => {
      const rest: Omit<typeof person, "photoKey"> & { photoKey?: string | null } = { ...person };
      delete rest.photoKey;
      return rest as Omit<typeof person, "photoKey">;
    }),
    departments: departmentRows,
    branches: branchRows,
  };
}

export type OrgChartData = Awaited<ReturnType<typeof getOrgChartData>>;
export type OrgChartPerson = OrgChartData["people"][number];
