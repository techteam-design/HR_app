// Sends one email through Resend's HTTP API with plain fetch (Workers-native,
// no SDK). The only place that talks to the provider. Callers must pass the
// address from resolveDelivery() (src/lib/email/config.ts).
//
// Idempotency-Key: Resend ignores a repeat with the same key for 24 hours, so
// a retry of the same log row never sends twice.

export type OutgoingEmail = {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
};

export type SendResult = { ok: true; id: string | null } | { ok: false; error: string };

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

export async function sendViaResend(email: OutgoingEmail, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  try {
    const response = await fetchImpl(RESEND_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${email.apiKey}`,
        "content-type": "application/json",
        "idempotency-key": email.idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify({
        from: email.from,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null;
    if (!response.ok) {
      // Resend's error message; never the request (it carries the API key).
      const detail = body?.message ?? body?.name ?? response.statusText;
      return { ok: false, error: `Resend ${response.status}: ${String(detail).slice(0, 300)}` };
    }
    return { ok: true, id: body?.id ?? null };
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : "unknown error";
    return { ok: false, error: `Resend request failed (${message.slice(0, 300)})` };
  }
}
