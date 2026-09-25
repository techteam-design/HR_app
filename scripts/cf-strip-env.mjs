// Runs after `opennextjs-cloudflare build` (see "cf:build" in package.json).
//
// OpenNext copies the values from .env, .env.production, .env.local and
// .env.production.local into .open-next/cloudflare/next-env.mjs, which is
// bundled into the Worker and used as a fallback for any variable not set on
// Cloudflare. For this app that would upload local secrets (dev database,
// auth secret, R2 keys, seed passwords) and let a forgotten `wrangler secret
// put` silently fall back to them. This replaces the file with empty values,
// so the Worker only ever sees variables set on Cloudflare (or in .dev.vars
// for `cf:preview`). The old contents are overwritten, never read or printed.

import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const file = path.join(".open-next", "cloudflare", "next-env.mjs");

if (!existsSync(file)) {
  console.error(`cf-strip-env: ${file} not found. Run "opennextjs-cloudflare build" first.`);
  process.exit(1);
}

writeFileSync(
  file,
  ["production", "development", "test"].map((mode) => `export const ${mode} = {};\n`).join(""),
);
console.log("cf-strip-env: removed .env* values from the Worker bundle.");
