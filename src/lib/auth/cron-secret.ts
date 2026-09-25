// Checks the "Authorization: Bearer <CRON_SECRET>" header of a cron request.
// Pure: no database. The comparison takes the same time wherever the first
// difference is, so the secret cannot be guessed from response timings.

export function isCronAuthorized(authorizationHeader: string | null, secret: string | undefined): boolean {
  // An unset or very short secret never authorises anything.
  if (!secret || secret.length < 16 || !authorizationHeader) return false;
  return constantTimeEqual(authorizationHeader, `Bearer ${secret}`);
}

export function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  // Always walks the expected value's full length; a length difference is
  // folded into the result instead of returning early.
  let difference = left.length ^ right.length;
  for (let index = 0; index < right.length; index += 1) {
    difference |= (left[index] ?? 0) ^ right[index];
  }
  return difference === 0;
}
