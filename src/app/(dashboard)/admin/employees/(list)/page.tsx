import Link from "next/link";

import { EmployeeFilters } from "@/components/employees/employee-filters";
import { EmployeeList } from "@/components/employees/employee-list";
import { Pagination } from "@/components/employees/pagination";
import { ButtonLink } from "@/components/ui/button";
import { PlusIcon, UsersIcon } from "@/components/ui/icons";
import { AccentTitle, PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/rbac";
import { requireEmployee } from "@/server/auth.service";
import { withPhotoUrls } from "@/server/employee-photo.service";
import { getEmployeeFormOptions, listEmployees } from "@/server/employee.service";
import { employeeListQuerySchema, type EmployeeListQuery } from "@/validations/employee";

type SearchParams = Record<string, string | string[] | undefined>;

// The sort select sends "field:direction" in one value.
function parseQuery(searchParams: SearchParams): EmployeeListQuery {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") flat[key] = value;
  }
  if (flat.sort?.includes(":")) {
    const [sort, dir] = flat.sort.split(":");
    flat.sort = sort;
    flat.dir = dir;
  }
  return employeeListQuerySchema.parse(flat);
}

function hrefFor(query: EmployeeListQuery, page: number): string {
  const params = new URLSearchParams();
  for (const key of ["q", "department", "branch", "status", "role", "classification"] as const) {
    const value = query[key];
    if (value) params.set(key, value);
  }
  params.set("sort", `${query.sort}:${query.dir}`);
  if (page > 1) params.set("page", String(page));
  return `/admin/employees?${params.toString()}`;
}

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await requireEmployee({ action: "view_all_records" });
  const query = parseQuery(await searchParams);

  const [result, options] = await Promise.all([listEmployees(query), getEmployeeFormOptions()]);
  const rows = await withPhotoUrls(result.items);
  const canManage = can(viewer.role, "manage_employees");
  const filtered = Boolean(
    query.q || query.department || query.branch || query.status || query.role || query.classification,
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title={<AccentTitle text="Employees" />}
        action={
          canManage ? (
            <ButtonLink href="/admin/employees/new">
              <PlusIcon width={18} height={18} />
              Add employee
            </ButtonLink>
          ) : undefined
        }
      />

      <EmployeeFilters query={query} departments={options.departments} branches={options.branches} />

      {rows.length === 0 ? (
        <div className="rounded-card bg-lilac-50 px-6 py-12 text-center">
          <UsersIcon width={28} height={28} className="mx-auto text-plum-500" />
          <h2 className="mt-4 font-display text-section-title font-medium text-plum-900">
            {filtered ? "No employees match" : "No employees yet"}
          </h2>
          <p className="mt-2 text-[15px] text-muted">
            {filtered
              ? "Try a different search or clear the filters."
              : canManage
                ? "Add your first employee to get started."
                : "Employees added by an admin will appear here."}
          </p>
          {filtered && (
            <Link
              href="/admin/employees"
              className="mt-4 inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-plum-700 hover:bg-lilac-100 focus-visible:outline-2 focus-visible:outline-plum-700"
            >
              Clear filters
            </Link>
          )}
        </div>
      ) : (
        <>
          <EmployeeList rows={rows} />
          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            hrefFor={(page) => hrefFor(query, page)}
          />
        </>
      )}
    </div>
  );
}
