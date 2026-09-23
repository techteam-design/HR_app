import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next.js, so load .env.local ourselves.
config({ path: ".env.local", quiet: true });

// Direct (non-pooled) Neon connection string, used only for migrations.
const migrationUrl = process.env.DATABASE_URL_UNPOOLED;

if (!migrationUrl) {
  throw new Error(
    "DATABASE_URL_UNPOOLED is not set. Add the direct (non-pooled) Neon connection " +
      "string to .env.local. It is only used by drizzle-kit for migrations.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: migrationUrl,
  },
  strict: true,
  verbose: true,
});
