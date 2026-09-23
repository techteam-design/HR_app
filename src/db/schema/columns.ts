import { numeric, timestamp } from "drizzle-orm/pg-core";

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// Day counts allow half days (0.5), so they are exact decimals, never floats.
// Drizzle returns numeric values as strings (e.g. "7.5") to avoid precision loss.
export const dayCount = (name: string) =>
  numeric(name, { precision: 5, scale: 1 });
