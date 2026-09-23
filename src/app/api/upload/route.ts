import { isStorageConfigured } from "@/lib/storage/r2";
import { ok, readJson, serviceError, validationError } from "@/server/api-response";
import { requireApiEmployee } from "@/server/auth.service";
import { requestPhotoUpload, STORAGE_NOT_CONFIGURED } from "@/server/employee-photo.service";
import { photoUploadRequestSchema } from "@/validations/employee";

// POST: presigned upload URL for an employee photo. admin only.
// Returns 503 while R2 is not configured.
export async function POST(request: Request) {
  const access = await requireApiEmployee("manage_employees");
  if (!access.ok) return access.response;

  if (!isStorageConfigured()) return serviceError({ status: 503, error: STORAGE_NOT_CONFIGURED });

  const parsed = photoUploadRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const result = await requestPhotoUpload(parsed.data);
  if (!result.ok) return serviceError(result);
  return ok({ uploadUrl: result.uploadUrl, key: result.key, headers: result.headers });
}
