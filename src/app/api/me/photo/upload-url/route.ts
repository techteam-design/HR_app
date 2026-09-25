import { isStorageConfigured } from "@/lib/storage/r2";
import { ok, readJson, serviceError, validationError } from "@/server/api-response";
import { requireApiEmployee } from "@/server/auth.service";
import { requestPhotoUpload, STORAGE_NOT_CONFIGURED } from "@/server/employee-photo.service";
import { photoFileSchema } from "@/validations/employee";

// POST: presigned upload URL for the signed-in employee's OWN photo. Every
// role. The employee id comes only from the session; any id in the body is
// stripped by the schema and never read.
export async function POST(request: Request) {
  const access = await requireApiEmployee("update_own_photo");
  if (!access.ok) return access.response;

  if (!isStorageConfigured()) return serviceError({ status: 503, error: STORAGE_NOT_CONFIGURED });

  const parsed = photoFileSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const result = await requestPhotoUpload(access.employee.id, parsed.data);
  if (!result.ok) return serviceError(result);
  return ok({ uploadUrl: result.uploadUrl, key: result.key, headers: result.headers });
}
