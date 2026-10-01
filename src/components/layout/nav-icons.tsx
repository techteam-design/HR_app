import {
  ApprovalFlowIcon,
  BuildingIcon,
  CalendarIcon,
  CalendarPlusIcon,
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
import { cn } from "@/lib/utils/cn";

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
};

export function iconFor(href: string): IconComponent {
  return NAV_ICONS[href] ?? HomeIcon;
}

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Count pill for a nav item (e.g. pending approvals). Callers hide it at 0.
export function NavBadge({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-plum-900 px-1.5 text-[11px] font-semibold text-surface",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
      <span className="sr-only"> pending</span>
    </span>
  );
}
