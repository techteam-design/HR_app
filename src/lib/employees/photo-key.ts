// Storage keys for employee photos. Pure: no database or storage calls.
// Every photo lives under its owner's prefix, employees/{employeeId}/, so a
// key can be checked against the employee it is being saved for.

import { PHOTO_TYPES, type PhotoContentType } from "@/validations/employee";

const RANDOM_ID = /^[0-9a-f-]{36}$/;

export function photoKeyFor(employeeId: string, contentType: PhotoContentType, randomId: string): string {
  return `employees/${employeeId}/${randomId}.${PHOTO_TYPES[contentType]}`;
}

// True only for a key made by photoKeyFor() for this employee: right prefix,
// a random id and a known image extension. Anything else, including another
// employee's key or a path trick like "..", is rejected.
export function isOwnPhotoKey(employeeId: string, key: string): boolean {
  const parts = key.split("/");
  if (parts.length !== 3 || parts[0] !== "employees" || parts[1] !== employeeId) return false;
  const match = /^(.+)\.([a-z]+)$/.exec(parts[2]);
  return !!match && RANDOM_ID.test(match[1]) && Object.values(PHOTO_TYPES).includes(match[2] as never);
}

// The content type an extension stands for, e.g. "png" -> "image/png".
export function contentTypeOfKey(key: string): PhotoContentType | undefined {
  const extension = key.split(".").pop();
  return (Object.keys(PHOTO_TYPES) as PhotoContentType[]).find((type) => PHOTO_TYPES[type] === extension);
}
