import {
  createPresignedDownload,
  createPresignedUpload,
  deleteObject,
  getObjectInfo,
  isStorageConfigured,
} from "@/lib/storage/r2";
import { PHOTO_MAX_BYTES, PHOTO_TYPES, type PhotoContentType } from "@/validations/employee";

import { employeeExists, getEmployeePhotoKey, setEmployeePhotoKey, type ServiceResult } from "./employee.service";

// Employee photos in a private R2 bucket. Everything degrades gracefully
// when R2 is not configured: no URLs, uploads return 503.

export const STORAGE_NOT_CONFIGURED = "Photo storage is not configured yet";

type PhotoError = { ok: false; status: 400 | 404 | 503; error: string };

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

function keyPattern(employeeId: string): RegExp {
  return new RegExp(`^employees/${employeeId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`);
}

// Step 1: a presigned PUT URL for one new photo of one employee.
export async function requestPhotoUpload(input: {
  employeeId: string;
  contentType: PhotoContentType;
  size: number;
}): Promise<ServiceResult<{ uploadUrl: string; key: string; headers: Record<string, string> }> | PhotoError> {
  if (!isStorageConfigured()) return { ok: false, status: 503, error: STORAGE_NOT_CONFIGURED };
  if (!(await employeeExists(input.employeeId))) return { ok: false, status: 404, error: "Employee not found" };

  const key = `employees/${input.employeeId}/${crypto.randomUUID()}.${PHOTO_TYPES[input.contentType]}`;
  const upload = await createPresignedUpload(key, input.contentType, input.size);
  return { ok: true, uploadUrl: upload.url, key, headers: upload.headers };
}

// Step 2: after the browser uploaded, check the object and save it as the
// employee's photo, then delete the previous photo.
export async function confirmPhotoUpload(
  employeeId: string,
  key: string,
): Promise<ServiceResult<{ photoUrl: string | null }> | PhotoError> {
  if (!isStorageConfigured()) return { ok: false, status: 503, error: STORAGE_NOT_CONFIGURED };

  const previousKey = await getEmployeePhotoKey(employeeId);
  if (previousKey === undefined) return { ok: false, status: 404, error: "Employee not found" };
  if (!keyPattern(employeeId).test(key)) return { ok: false, status: 400, error: "Invalid photo reference" };

  const info = await getObjectInfo(key);
  if (!info) return { ok: false, status: 400, error: "The photo was not uploaded. Please try again." };

  const extension = key.split(".").pop();
  const expectedType = Object.entries(PHOTO_TYPES).find(([, ext]) => ext === extension)?.[0];
  if (info.size > PHOTO_MAX_BYTES || info.contentType !== expectedType) {
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
