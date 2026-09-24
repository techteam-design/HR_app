import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";

import { EmployeeStatusBadge } from "./employee-status-badge";
import { ROLE_LABELS, unitLabel } from "./labels";

export type EmployeeRow = {
  id: string;
  fullName: string;
  employeeCode: string;
  designation: string;
  departmentName: string;
  departmentIsActive: boolean;
  branchName: string;
  branchIsActive: boolean;
  role: keyof typeof ROLE_LABELS;
  status: "active" | "inactive" | "probation";
  photoUrl: string | null;
};

// Table on desktop, stacked cards on mobile.
export function EmployeeList({ rows }: { rows: EmployeeRow[] }) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-card border border-border bg-surface md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-lilac-50">
            <tr>
              <th scope="col" className="eyebrow px-5 py-3 text-plum-700">Employee</th>
              <th scope="col" className="eyebrow px-4 py-3 text-plum-700">Department</th>
              <th scope="col" className="eyebrow px-4 py-3 text-plum-700">Branch</th>
              <th scope="col" className="eyebrow px-4 py-3 text-plum-700">Role</th>
              <th scope="col" className="eyebrow px-5 py-3 text-plum-700">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} className="transition-colors duration-150 hover:bg-bg">
                <td className="px-5 py-3">
                  <Link
                    href={`/admin/employees/${row.id}`}
                    className="flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-700"
                  >
                    <Avatar name={row.fullName} src={row.photoUrl} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-plum-900">{row.fullName}</span>
                      <span className="block truncate text-[13px] text-muted">
                        {row.employeeCode} · {row.designation}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-plum-900">{unitLabel(row.departmentName, row.departmentIsActive)}</td>
                <td className="px-4 py-3 text-plum-900">{unitLabel(row.branchName, row.branchIsActive)}</td>
                <td className="px-4 py-3 text-plum-900">{ROLE_LABELS[row.role]}</td>
                <td className="px-5 py-3">
                  <EmployeeStatusBadge status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/admin/employees/${row.id}`}
              className="flex items-start gap-3 rounded-card border border-border bg-surface p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-700"
            >
              <Avatar name={row.fullName} src={row.photoUrl} size="md" />
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="truncate font-semibold text-plum-900">{row.fullName}</span>
                  <EmployeeStatusBadge status={row.status} className="shrink-0" />
                </span>
                <span className="block truncate text-[13px] text-muted">
                  {row.employeeCode} · {row.designation}
                </span>
                <span className="mt-1 block text-[13px] text-plum-900">
                  {unitLabel(row.departmentName, row.departmentIsActive)} ·{" "}
                  {unitLabel(row.branchName, row.branchIsActive)} · {ROLE_LABELS[row.role]}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
