// Roles and permissions. Pure: no database calls, safe to import anywhere.
// UI uses this to hide links; the server uses it (via requireEmployee /
// requireApiEmployee) to enforce access. Hiding UI is not security.

export const ROLES = ["employee", "manager", "admin", "hr_viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ACTIONS = [
  "view_own_profile",
  "apply_leave",
  "approve_leave",
  "view_team_calendar",
  "manage_employees",
  "manage_org",
  "manage_policies",
  "manage_approval_config",
  "override_notice",
  "view_all_records",
  "view_reports",
  "export_data",
] as const;
export type Action = (typeof ACTIONS)[number];

// "self": acting on your own records (profile, own leave).
// "read": viewing other people's data.
// "write": changing other people's data or company configuration.
export const ACTION_KIND: Record<Action, "self" | "read" | "write"> = {
  view_own_profile: "self",
  apply_leave: "self",
  approve_leave: "write",
  view_team_calendar: "read",
  manage_employees: "write",
  manage_org: "write",
  manage_policies: "write",
  manage_approval_config: "write",
  override_notice: "write",
  view_all_records: "read",
  view_reports: "read",
  export_data: "read",
};

const EMPLOYEE_ACTIONS: readonly Action[] = ["view_own_profile", "apply_leave"];

const PERMISSIONS: Record<Role, ReadonlySet<Action>> = {
  employee: new Set(EMPLOYEE_ACTIONS),
  manager: new Set([...EMPLOYEE_ACTIONS, "approve_leave", "view_team_calendar"]),
  admin: new Set(ACTIONS),
  // Read-only across the company. May manage only their own leave.
  hr_viewer: new Set([...EMPLOYEE_ACTIONS, "view_all_records", "view_reports"]),
};

export function can(role: Role, action: Action): boolean {
  return PERMISSIONS[role].has(action);
}

export function actionsFor(role: Role): Action[] {
  return ACTIONS.filter((action) => can(role, action));
}

export const ROLE_LABELS: Record<Role, string> = {
  employee: "Employee",
  manager: "Manager",
  admin: "Admin",
  hr_viewer: "HR Viewer",
};

// Staff with no linked employee record, or marked inactive, cannot sign in.
export function isLoginAllowed(
  employee: { status: "active" | "inactive" | "probation" } | null | undefined,
): boolean {
  return !!employee && employee.status !== "inactive";
}

// Sidebar groups, in display order.
export const NAV_SECTIONS = ["My work", "Team", "People", "Admin", "Reports"] as const;
export type NavSection = (typeof NAV_SECTIONS)[number];

export type NavItem = {
  href: string;
  label: string;
  section: NavSection;
  // null: every signed-in employee sees it.
  action: Action | null;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard", section: "My work", action: null },
  { href: "/leave/apply", label: "Apply for leave", section: "My work", action: "apply_leave" },
  { href: "/leave/history", label: "My leave history", section: "My work", action: "apply_leave" },
  { href: "/profile", label: "My profile", section: "My work", action: "view_own_profile" },
  { href: "/approvals", label: "Approvals", section: "Team", action: "approve_leave" },
  { href: "/team-calendar", label: "Team calendar", section: "Team", action: "view_team_calendar" },
  { href: "/admin/employees", label: "Employees", section: "People", action: "view_all_records" },
  { href: "/admin/departments", label: "Departments & branches", section: "Admin", action: "manage_org" },
  { href: "/admin/org-chart", label: "Org chart", section: "Admin", action: "manage_org" },
  { href: "/admin/leave-policies", label: "Leave policies", section: "Admin", action: "manage_policies" },
  { href: "/admin/approval-config", label: "Approval setup", section: "Admin", action: "manage_approval_config" },
  { href: "/reports", label: "Reports", section: "Reports", action: "view_reports" },
  { href: "/reports/calendar", label: "Leave calendar", section: "Reports", action: "view_reports" },
];

export function navigationFor(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.action === null || can(role, item.action));
}
