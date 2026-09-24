import { ok, readJson, serviceError, validationError } from "@/server/api-response";
import { requireApiEmployee } from "@/server/auth.service";
import { createBranch, listBranches } from "@/server/branch.service";
import { createBranchSchema } from "@/validations/branch";

// GET: every branch with its active employee count. admin + hr_viewer.
export async function GET() {
  const access = await requireApiEmployee("view_all_records");
  if (!access.ok) return access.response;

  return ok({ items: await listBranches() });
}

// POST: add a branch. admin only (manage_org).
export async function POST(request: Request) {
  const access = await requireApiEmployee("manage_org");
  if (!access.ok) return access.response;

  const parsed = createBranchSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const result = await createBranch(parsed.data);
  if (!result.ok) return serviceError(result);
  return ok({ id: result.id }, 201);
}
