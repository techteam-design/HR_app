import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "./columns";
import { employees } from "./employees";
import { emailEventEnum, emailStatusEnum } from "./enums";
import { leaveApplications } from "./leave";

// One row per email per recipient (src/server/notification.service.ts).
// The send is claimed by inserting the row (status pending) BEFORE calling
// the provider; the unique dedupe_key means the same event is never emailed
// twice, e.g. "request_approved:{applicationId}:{recipientId}",
// "request_reassigned:{reassignmentId}", "approval_reminder:{approverId}:{date}".
export const emailLog = pgTable(
  "email_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    event: emailEventEnum("event").notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    // Null for reminder digests and test emails.
    applicationId: uuid("application_id").references(() => leaveApplications.id, {
      onDelete: "cascade",
    }),
    recipientId: uuid("recipient_id").references(() => employees.id, {
      onDelete: "restrict",
    }),
    // The real recipient, and where the email actually went (the dev
    // redirect address outside production).
    intendedEmail: text("intended_email"),
    deliveredTo: text("delivered_to"),
    subject: text("subject"),
    status: emailStatusEnum("status").notNull().default("pending"),
    providerMessageId: text("provider_message_id"),
    // Why it failed or was skipped. Never contains secrets.
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("email_log_status_created_at_idx").on(table.status, table.createdAt),
    index("email_log_recipient_id_created_at_idx").on(table.recipientId, table.createdAt),
  ],
);
