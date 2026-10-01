// Email colours. Email clients cannot use the CSS tokens, so these are
// literal copies of the @theme tokens in src/app/globals.css: the ONLY place
// outside globals.css with hex colours. Change both together.

export const EMAIL_THEME = {
  bg: "#fbf8fc", // --color-bg
  surface: "#ffffff", // --color-surface
  lilac50: "#f1e6f6", // --color-lilac-50
  brandLilac: "#d5b3e4", // --color-brand-lilac (decorative only)
  plum900: "#3b2447", // --color-plum-900
  plum700: "#6a3f82", // --color-plum-700
  muted: "#6e5a78", // --color-muted
  border: "#eee3f3", // --color-border
  blush50: "#f8e8ee", // --color-blush-50
  blush700: "#86354f", // --color-blush-700
} as const;

export const EMAIL_FONTS = {
  display: "'Playfair Display', Georgia, 'Times New Roman', serif",
  body: "Montserrat, 'Segoe UI', Helvetica, Arial, sans-serif",
} as const;
