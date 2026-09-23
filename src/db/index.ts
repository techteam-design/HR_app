import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import * as schema from "./schema";

export type Database = NeonHttpDatabase<typeof schema>;

let cachedDb: Database | undefined;

// Created on first use, not at import time, so builds and modules that import
// this file do not need DATABASE_URL until a query actually runs.
export function getDb(): Database {
  if (cachedDb) return cachedDb;

  // Pooled Neon connection string, used by the app at runtime.
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set. Add the pooled Neon connection string to .env.local " +
        "for local development, or as a secret in the Cloudflare Worker for production.",
    );
  }

  cachedDb = drizzle({ client: neon(databaseUrl), schema });
  return cachedDb;
}

export { schema };
