// Result shape shared by services: API routes turn a ServiceError into a
// JSON error response (see api-response.ts).

export type ServiceError = {
  ok: false;
  status: 400 | 404 | 409;
  error: string;
  fieldErrors?: Record<string, string>;
  // Extra lines shown under the error, e.g. who needs reassigning.
  details?: string[];
};

export type ServiceResult<T extends object = object> = ({ ok: true } & T) | ServiceError;

export function fail(
  status: ServiceError["status"],
  error: string,
  extra: Pick<ServiceError, "fieldErrors" | "details"> = {},
): ServiceError {
  return { ok: false, status, error, ...extra };
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// True for a Postgres unique-constraint violation (code 23505), which the
// driver may wrap in one or more `cause` errors.
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if ((current as { code?: string }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
