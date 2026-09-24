import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Build output and generated files: never linted.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cloudflare (OpenNext and Wrangler) build output:
    ".open-next/**",
    ".wrangler/**",
    // Test coverage reports:
    "coverage/**",
    // Dependencies (ESLint ignores these by default; listed to be explicit):
    "node_modules/**",
    // Drizzle migration snapshots:
    "drizzle/meta/**",
  ]),
]);

export default eslintConfig;
