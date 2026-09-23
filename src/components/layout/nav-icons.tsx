import {
  ApprovalFlowIcon,
  BuildingIcon,
  CalendarIcon,
  CalendarPlusIcon,
  CalendarRangeIcon,
  ChartIcon,
  CheckCircleIcon,
  HistoryIcon,
  HomeIcon,
  OrgChartIcon,
  PolicyIcon,
  UserIcon,
  UsersIcon,
  type IconComponent,
} from "@/components/ui/icons";

// Icon per navigation route. Which routes a role sees is decided by rbac.ts.
const NAV_ICONS: Record<string, IconComponent> = {
  "/dashboard": HomeIcon,
  "/leave/apply": CalendarPlusIcon,
  "/leave/history": HistoryIcon,
  "/profile": UserIcon,
  "/approvals": CheckCircleIcon,
  "/team-calendar": CalendarIcon,
  "/admin/employees": UsersIcon,
  "/admin/departments": BuildingIcon,
  "/admin/org-chart": OrgChartIcon,
  "/admin/leave-policies": PolicyIcon,
  "/admin/approval-config": ApprovalFlowIcon,
  "/reports": ChartIcon,
  "/reports/calendar": CalendarRangeIcon,
};

export function iconFor(href: string): IconComponent {
  return NAV_ICONS[href] ?? HomeIcon;
}

// "/reports" must not stay active on "/reports/calendar".
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/reports" && pathname.startsWith(`${href}/`));
}
