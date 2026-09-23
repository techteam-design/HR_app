export { ROLE_LABELS } from "@/lib/auth/rbac";

export const STATUS_LABELS = {
  active: "Active",
  probation: "Probation",
  inactive: "Inactive",
} as const;

export const CLASSIFICATION_LABELS = {
  local: "Local",
  foreign: "Foreign",
} as const;

export const GENDER_LABELS = {
  male: "Male",
  female: "Female",
} as const;

export type EmployeeStatus = keyof typeof STATUS_LABELS;
