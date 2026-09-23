import { ok, readJson, serviceError, validationError } from "@/server/api-response";
import { requireApiEmployee } from "@/server/auth.service";
import { confirmPhotoUpload } from "@/server/employee-photo.service";
import { photoConfirmSchema } from "@/validations/employee";

// POST: after the browser uploaded to the presigned URL from /api/upload,
// verify the object and save it as the employee's photo. admin only.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireApiEmployee("manage_employees");
  if (!access.ok) return access.response;

  const parsed = photoConfirmSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const { id } = await params;
  const result = await confirmPhotoUpload(id, parsed.data.key);
  if (!result.ok) return serviceError(result);
  return ok({ photoUrl: result.photoUrl });
}
