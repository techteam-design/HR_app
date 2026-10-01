// The one email layout: wordmark, heading, paragraphs, a details block, an
// optional quote (remarks, reason or note), an optional list, one button.
// Renders an HTML version (inline styles, table layout, mobile-friendly)
// and a plain-text version. Pure. Every value is escaped here, so templates
// pass plain text only.

import { EMAIL_FONTS, EMAIL_THEME as C } from "./theme";

export type EmailContent = {
  subject: string;
  heading: string;
  // Plain-text paragraphs.
  intro: string[];
  details?: { label: string; value: string }[];
  // e.g. { label: "Remarks from Daniel Tan", text: "Enjoy the break" }
  quote?: { label: string; text: string } | null;
  // e.g. the reminder digest's requests.
  items?: { title: string; lines: string[] }[];
  button: { label: string; url: string };
  // Small print under the button.
  footnote?: string;
};

export type RenderOptions = {
  // "Intended for: Priya Nair <priya.nair@example.test>" (dev redirect).
  intendedFor: string | null;
  subjectPrefix: string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const WORDMARK = "Shosha Beauty Company";
const FOOTER = "SBC HR · This is an automatic message. Please don't reply to this email.";

export function renderEmail(content: EmailContent, options: RenderOptions): RenderedEmail {
  const e = escapeHtml;
  const p = (text: string) =>
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${C.plum900};">${e(text)}</p>`;

  const banner = options.intendedFor
    ? `<tr><td style="padding:12px 24px;background:${C.blush50};color:${C.blush700};font-size:13px;font-weight:600;">` +
      `Intended for: ${e(options.intendedFor)}</td></tr>`
    : "";

  const details = content.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;background:${C.lilac50};border-radius:14px;">` +
      content.details
        .map(
          (row) =>
            `<tr><td style="padding:8px 16px;font-size:13px;color:${C.muted};width:38%;vertical-align:top;">${e(row.label)}</td>` +
            `<td style="padding:8px 16px;font-size:14px;color:${C.plum900};font-weight:600;vertical-align:top;">${e(row.value)}</td></tr>`,
        )
        .join("") +
      `</table>`
    : "";

  const quote = content.quote
    ? `<p style="margin:0 0 4px;font-size:13px;color:${C.muted};">${e(content.quote.label)}</p>` +
      `<p style="margin:0 0 18px;padding:10px 14px;border-left:3px solid ${C.brandLilac};font-size:15px;line-height:1.5;color:${C.plum900};">` +
      `${e(content.quote.text)}</p>`
    : "";

  const items = content.items?.length
    ? content.items
        .map(
          (item) =>
            `<div style="margin:0 0 10px;padding:12px 16px;border:1px solid ${C.border};border-radius:14px;">` +
            `<p style="margin:0 0 4px;font-size:15px;font-weight:600;color:${C.plum900};">${e(item.title)}</p>` +
            item.lines.map((line) => `<p style="margin:0;font-size:13px;color:${C.muted};">${e(line)}</p>`).join("") +
            `</div>`,
        )
        .join("") + `<div style="height:8px;"></div>`
    : "";

  const button =
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 6px;"><tr>` +
    `<td style="border-radius:999px;background:${C.plum700};">` +
    `<a href="${e(content.button.url)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:${C.surface};text-decoration:none;border-radius:999px;">` +
    `${e(content.button.label)}</a></td></tr></table>`;

  const footnote = content.footnote
    ? `<p style="margin:10px 0 0;font-size:12px;color:${C.muted};">${e(content.footnote)}</p>`
    : "";

  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(content.subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${C.bg};font-family:${EMAIL_FONTS.body};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.surface};border:1px solid ${C.border};border-radius:24px;overflow:hidden;">` +
    banner +
    `<tr><td style="padding:22px 24px 0;">` +
    `<p style="margin:0;font-family:${EMAIL_FONTS.display};font-size:20px;font-style:italic;color:${C.plum700};">${WORDMARK}</p>` +
    `<div style="margin:10px 0 0;height:3px;width:56px;background:${C.brandLilac};border-radius:3px;"></div></td></tr>` +
    `<tr><td style="padding:20px 24px 24px;">` +
    `<h1 style="margin:0 0 14px;font-family:${EMAIL_FONTS.display};font-size:24px;font-weight:500;line-height:1.3;color:${C.plum900};">${e(content.heading)}</h1>` +
    content.intro.map(p).join("") +
    details +
    quote +
    items +
    button +
    footnote +
    `</td></tr></table>` +
    `<p style="margin:16px 0 0;font-size:12px;color:${C.muted};">${e(FOOTER)}</p>` +
    `</td></tr></table></body></html>`;

  const text = [
    options.intendedFor ? `Intended for: ${options.intendedFor}\n` : null,
    WORDMARK.toUpperCase(),
    "",
    content.heading,
    "",
    ...content.intro.flatMap((line) => [line, ""]),
    ...(content.details?.length ? [...content.details.map((row) => `${row.label}: ${row.value}`), ""] : []),
    ...(content.quote ? [`${content.quote.label}:`, `"${content.quote.text}"`, ""] : []),
    ...(content.items?.length ? [...content.items.flatMap((item) => [`- ${item.title}`, ...item.lines.map((l) => `  ${l}`)]), ""] : []),
    `${content.button.label}: ${content.button.url}`,
    ...(content.footnote ? ["", content.footnote] : []),
    "",
    FOOTER,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return { subject: `${options.subjectPrefix}${content.subject}`, html, text };
}
