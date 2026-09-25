import { contentTypeOfKey, isOwnPhotoKey, photoKeyFor } from "@/lib/employees/photo-key";
import {
  createPresignedDownload,
  createPresignedUpload,
  deleteObject,
  getObjectInfo,
  isStorageConfigured,
} from "@/lib/storage/r2";
import { PHOTO_MAX_BYTES, type PhotoContentType } from "@/validations/employee";

import { employeeExists, getEmployeePhotoKey, setEmployeePhotoKey, type ServiceResult } from "./employee.service";

// Employee photos in a private R2 bucket. Everything degrades gracefully
// when R2 is not configured: no URLs, uploads return 503.
//
// Used by both the admin routes (any employee, manage_employees) and the
// self-service /api/me/photo routes (update_own_photo). The routes decide
// whose photo it is; these functions only ever act on the employeeId given
// and reject any key outside that employee's own prefix.

export const STORAGE_NOT_CONFIGURED = "Photo storage is not configured yet";

type PhotoError = { ok: false; status: 400 | 404 | 503; error: string };

const NOT_CONFIGURED: PhotoError = { ok: false, status: 503, error: STORAGE_NOT_CONFIGURED };
const NOT_FOUND: PhotoError = { ok: false, status: 404, error: "Employee not found" };

// Short-lived signed URL for a stored photo, or null (no photo, no storage,
// or signing failed — the UI then shows initials).
export async function photoUrlFor(photoKey: string | null | undefined): Promise<string | null> {
  if (!photoKey || !isStorageConfigured()) return null;
  try {
    return await createPresignedDownload(photoKey);
  } catch {
    return null;
  }
}

export async function withPhotoUrls<T extends { photoKey: string | null }>(
  items: T[],
): Promise<(T & { photoUrl: string | null })[]> {
  return Promise.all(items.map(async (item) => ({ ...item, photoUrl: await photoUrlFor(item.photoKey) })));
}

// Step 1: a presigned PUT URL for one new photo of one employee.
export async function requestPhotoUpload(
  employeeId: string,
  input: { contentType: PhotoContentType; size: number },
): Promise<ServiceResult<{ uploadUrl: string; key: string; headers: Record<string, string> }> | PhotoError> {
  if (!isStorageConfigured()) return NOT_CONFIGURED;
  if (!(await employeeExists(employeeId))) return NOT_FOUND;

  const key = photoKeyFor(employeeId, input.contentType, crypto.randomUUID());
  const upload = await createPresignedUpload(key, input.contentType, input.size);
  return { ok: true, uploadUrl: upload.url, key, headers: upload.headers };
}

// Step 2: after the browser uploaded, check the object and save it as the
// employee's photo, then delete the previous photo.
export async function confirmPhotoUpload(
  employeeId: string,
  key: string,
): Promise<ServiceResult<{ photoUrl: string | null }> | PhotoError> {
  if (!isStorageConfigured()) return NOT_CONFIGURED;

  const previousKey = await getEmployeePhotoKey(employeeId);
  if (previousKey === undefined) return NOT_FOUND;
  // Checked before touching storage: a key under another employee's prefix
  // is never read, saved or deleted.
  if (!isOwnPhotoKey(employeeId, key)) return { ok: false, status: 400, error: "Invalid photo reference" };

  const info = await getObjectInfo(key);
  if (!info) return { ok: false, status: 400, error: "The photo was not uploaded. Please try again." };

  if (info.size > PHOTO_MAX_BYTES || info.contentType !== contentTypeOfKey(key)) {
    await deleteObject(key).catch(() => undefined);
    return { ok: false, status: 400, error: "Photo must be a JPEG, PNG or WebP image of 2 MB or less" };
  }

  await setEmployeePhotoKey(employeeId, key);
  if (previousKey && previousKey !== key) {
    // Best effort: a leftover old object is harmless.
    await deleteObject(previousKey).catch(() => undefined);
  }
  return { ok: true, photoUrl: await photoUrlFor(key) };
}

// Removes the employee's photo: clears photo_key first (so the app stops
// showing it even if the delete fails), then deletes the object.
// Removing when there is no photo succeeds and changes nothing.
export async function removePhoto(employeeId: string): Promise<ServiceResult<object> | PhotoError> {
  if (!isStorageConfigured()) return NOT_CONFIGURED;

  const previousKey = await getEmployeePhotoKey(employeeId);
  if (previousKey === undefined) return NOT_FOUND;
  if (!previousKey) return { ok: true };

  await setEmployeePhotoKey(employeeId, null);
  // Best effort: a leftover object is harmless and no longer referenced.
  await deleteObject(previousKey).catch(() => undefined);
  return { ok: true };
}
