import { isStorageConfigured } from "@/lib/storage/r2";
import { ok, readJson, serviceError, validationError } from "@/server/api-response";
import { requireApiEmployee } from "@/server/auth.service";
import { confirmPhotoUpload, removePhoto, STORAGE_NOT_CONFIGURED } from "@/server/employee-photo.service";
import { photoConfirmSchema } from "@/validations/employee";

// The signed-in employee's OWN photo. Every role. The employee id comes only
// from the session: nothing in the body, URL or query string is read as an id,
// and the service rejects any key outside the employee's own prefix.

// POST: after the browser uploaded to the URL from /api/me/photo/upload-url,
// verify the object and save it as the employee's photo.
export async function POST(request: Request) {
  const access = await requireApiEmployee("update_own_photo");
  if (!access.ok) return access.response;

  if (!isStorageConfigured()) return serviceError({ status: 503, error: STORAGE_NOT_CONFIGURED });

  const parsed = photoConfirmSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const result = await confirmPhotoUpload(access.employee.id, parsed.data.key);
  if (!result.ok) return serviceError(result);
  return ok({ photoUrl: result.photoUrl });
}

// DELETE: remove the employee's own photo.
export async function DELETE() {
  const access = await requireApiEmployee("update_own_photo");
  if (!access.ok) return access.response;

  if (!isStorageConfigured()) return serviceError({ status: 503, error: STORAGE_NOT_CONFIGURED });

  const result = await removePhoto(access.employee.id);
  if (!result.ok) return serviceError(result);
  return ok({ photoUrl: null });
}
