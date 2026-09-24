import type { SVGProps } from "react";

// Inline stroke icons (24×24, currentColor). Decorative by default; give the
// surrounding button or link an accessible label.
export type IconProps = SVGProps<SVGSVGElement>;
export type IconComponent = (props: IconProps) => React.ReactElement;

function Icon({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={22}
      height={22}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const HomeIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
  </Icon>
);

export const PlusIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const CalendarPlusIcon: IconComponent = (props) => (
  <Icon {...props}>
    <rect x="3" y="4.5" width="18" height="16.5" rx="3" />
    <path d="M8 2.5v4M16 2.5v4M3 9.5h18M12 12.5v5M9.5 15h5" />
  </Icon>
);

export const HistoryIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
    <path d="M3 3.5V8h4.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

export const UserIcon: IconComponent = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Icon>
);

export const UsersIcon: IconComponent = (props) => (
  <Icon {...props}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.5A6.5 6.5 0 0 1 21.5 20" />
  </Icon>
);

export const CheckCircleIcon: IconComponent = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.5 2.8 2.8L16.5 9.5" />
  </Icon>
);

export const CalendarIcon: IconComponent = (props) => (
  <Icon {...props}>
    <rect x="3" y="4.5" width="18" height="16.5" rx="3" />
    <path d="M8 2.5v4M16 2.5v4M3 9.5h18" />
  </Icon>
);

export const CalendarRangeIcon: IconComponent = (props) => (
  <Icon {...props}>
    <rect x="3" y="4.5" width="18" height="16.5" rx="3" />
    <path d="M8 2.5v4M16 2.5v4M3 9.5h18M7 14h4M13 17h4" />
  </Icon>
);

export const BuildingIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
    <path d="M16 9h2a2 2 0 0 1 2 2v10M2.5 21h19" />
    <path d="M8 7h4M8 11h4M8 15h4" />
  </Icon>
);

export const OrgChartIcon: IconComponent = (props) => (
  <Icon {...props}>
    <rect x="9" y="3" width="6" height="5" rx="1.5" />
    <rect x="3" y="16" width="6" height="5" rx="1.5" />
    <rect x="15" y="16" width="6" height="5" rx="1.5" />
    <path d="M12 8v4M6 16v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
  </Icon>
);

export const PolicyIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </Icon>
);

export const ApprovalFlowIcon: IconComponent = (props) => (
  <Icon {...props}>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <path d="M8.5 6H14a4 4 0 0 1 4 4v5.5" />
    <path d="m15.5 13 2.5 2.5 2.5-2.5" />
  </Icon>
);

export const ChartIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M3.5 20.5h17" />
    <path d="M7 17v-5M12 17V7M17 17v-8" />
  </Icon>
);

export const MoreIcon: IconComponent = (props) => (
  <Icon {...props}>
    <circle cx="5.5" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1.2" fill="currentColor" />
  </Icon>
);

export const ChevronDownIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const SearchIcon: IconComponent = (props) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
);

export const CloseIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const KeyIcon: IconComponent = (props) => (
  <Icon {...props}>
    <circle cx="8" cy="15" r="4.5" />
    <path d="m11.2 11.8 8.3-8.3M16.5 6.5l2.5 2.5M14 9l2 2" />
  </Icon>
);

export const LogOutIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </Icon>
);

// Four-point sparkle used in dividers.
export const SparkleIcon: IconComponent = (props) => (
  <Icon strokeWidth={1.25} {...props}>
    <path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7Z" />
  </Icon>
);
