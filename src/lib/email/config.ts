// Email settings and the dev/staging safety rules. Pure: reads only the env
// object it is given.
//
// - EMAIL_ENABLED must be exactly "true", or nothing is sent.
// - APP_ENV=production marks the production Worker. Anything else (including
//   unset) is non-production, and there EMAIL_DEV_REDIRECT is REQUIRED: every
//   email goes to that one address, with the intended recipient shown at the
//   top. Without it, nothing is sent.
// - Test addresses (@example.test and similar) are never sent to, in any
//   environment: they bounce and hurt the sending domain's reputation.

export type EmailEnv = {
  APP_ENV?: string;
  EMAIL_ENABLED?: string;
  EMAIL_DEV_REDIRECT?: string;
  EMAIL_FROM?: string;
  RESEND_API_KEY?: string;
  BETTER_AUTH_URL?: string;
};

export type EmailConfig =
  | {
      ok: true;
      production: boolean;
      from: string;
      apiKey: string;
      // Every email goes here instead of the real recipient (required
      // outside production; optional in production).
      redirect: string | null;
      // Origin for links in emails, no trailing slash.
      appUrl: string;
    }
  | { ok: false; reason: string };

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

// Reserved test domains and the example.* domains: mail to them bounces.
const UNDELIVERABLE = /@(?:[^@]+\.)?(?:test|example|invalid|localhost)$|@(?:[^@]+\.)?example\.(?:com|org|net)$/i;

export function isValidEmail(value: string): boolean {
  return EMAIL.test(value);
}

export function isUndeliverable(email: string): boolean {
  return UNDELIVERABLE.test(email.trim());
}

export function emailConfig(env: EmailEnv): EmailConfig {
  if (env.EMAIL_ENABLED !== "true") return { ok: false, reason: 'Emails are off (EMAIL_ENABLED is not "true").' };
  const production = env.APP_ENV === "production";
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  const appUrl = env.BETTER_AUTH_URL?.trim().replace(/\/+$/, "");
  if (!apiKey) return { ok: false, reason: "RESEND_API_KEY is not set." };
  if (!from) return { ok: false, reason: "EMAIL_FROM is not set." };
  if (!appUrl) return { ok: false, reason: "BETTER_AUTH_URL is not set (needed for links)." };

  const redirect = env.EMAIL_DEV_REDIRECT?.trim() || null;
  if (redirect && (!isValidEmail(redirect) || isUndeliverable(redirect))) {
    return { ok: false, reason: "EMAIL_DEV_REDIRECT is not a deliverable email address." };
  }
  if (!production && !redirect) {
    return { ok: false, reason: "EMAIL_DEV_REDIRECT is required outside production (APP_ENV is not \"production\")." };
  }
  return { ok: true, production, from, apiKey, redirect, appUrl };
}

export type Recipient = { name: string; email: string };

export type Delivery =
  | {
      ok: true;
      // The address the provider is asked to send to.
      to: string;
      // "Intended for: Priya Nair <priya.nair@example.test>" when redirected.
      intendedFor: string | null;
      subjectPrefix: string;
    }
  | { ok: false; reason: string };

// Where one email really goes.
export function resolveDelivery(recipient: Recipient, config: Extract<EmailConfig, { ok: true }>): Delivery {
  if (config.redirect) {
    return {
      ok: true,
      to: config.redirect,
      intendedFor: `${recipient.name} <${recipient.email}>`,
      subjectPrefix: config.production ? "[REDIRECTED] " : "[DEV] ",
    };
  }
  // Only reachable in production (outside it the redirect is required).
  if (!isValidEmail(recipient.email)) return { ok: false, reason: "The recipient's email address is not valid." };
  if (isUndeliverable(recipient.email)) return { ok: false, reason: "The recipient has a test email address." };
  return { ok: true, to: recipient.email, intendedFor: null, subjectPrefix: "" };
}

// A link into the app: appUrl(config.appUrl, "/approvals").
export function appUrl(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
