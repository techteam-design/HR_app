import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { EmployeeListQuery } from "@/validations/employee";

import { CLASSIFICATION_LABELS, ROLE_LABELS, STATUS_LABELS } from "./labels";

type Option = { id: string; name: string };

// Plain GET form: works without JavaScript and keeps filters in the URL.
export function EmployeeFilters({
  query,
  departments,
  branches,
}: {
  query: EmployeeListQuery;
  departments: Option[];
  branches: Option[];
}) {
  const hasFilters = Boolean(
    query.q || query.department || query.branch || query.status || query.role || query.classification,
  );

  return (
    <form method="get" action="/admin/employees" className="space-y-4 rounded-card border border-border bg-surface p-4 sm:p-5">
      <div className="space-y-2">
        <Label htmlFor="q">Search</Label>
        <Input id="q" name="q" type="search" defaultValue={query.q ?? ""} placeholder="Name, email or employee code" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="department">Department</Label>
          <Select id="department" name="department" defaultValue={query.department ?? ""}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="branch">Branch</Label>
          <Select id="branch" name="branch" defaultValue={query.branch ?? ""}>
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select id="status" name="status" defaultValue={query.status ?? ""}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="role">Role</Label>
          <Select id="role" name="role" defaultValue={query.role ?? ""}>
            <option value="">All roles</option>
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="classification">Classification</Label>
          <Select id="classification" name="classification" defaultValue={query.classification ?? ""}>
            <option value="">Local and foreign</option>
            {Object.entries(CLASSIFICATION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sort">Sort by</Label>
          <Select id="sort" name="sort" defaultValue={`${query.sort}:${query.dir}`}>
            <option value="name:asc">Name (A–Z)</option>
            <option value="name:desc">Name (Z–A)</option>
            <option value="joinDate:desc">Join date (newest)</option>
            <option value="joinDate:asc">Join date (oldest)</option>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">Apply</Button>
        {hasFilters && (
          <Link
            href="/admin/employees"
            className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-plum-700 hover:bg-lilac-50 focus-visible:outline-2 focus-visible:outline-plum-700"
          >
            Clear filters
          </Link>
        )}
      </div>
    </form>
  );
}
