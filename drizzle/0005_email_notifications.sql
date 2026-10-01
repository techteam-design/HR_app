CREATE TYPE "public"."email_event" AS ENUM('request_submitted', 'request_submitted_on_behalf', 'level2_pending', 'level1_approved', 'request_approved', 'request_rejected', 'leave_cancelled', 'approval_revoked', 'request_reassigned', 'approval_reminder', 'test_email');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('pending', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event" "email_event" NOT NULL,
	"dedupe_key" text NOT NULL,
	"application_id" uuid,
	"recipient_id" uuid,
	"intended_email" text,
	"delivered_to" text,
	"subject" text,
	"status" "email_status" DEFAULT 'pending' NOT NULL,
	"provider_message_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_log_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "approval_settings" ADD COLUMN "reminder_after_days" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_application_id_leave_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."leave_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_recipient_id_employees_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_log_status_created_at_idx" ON "email_log" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "email_log_recipient_id_created_at_idx" ON "email_log" USING btree ("recipient_id","created_at");--> statement-breakpoint
ALTER TABLE "approval_settings" ADD CONSTRAINT "approval_settings_reminder_after_days_check" CHECK ("approval_settings"."reminder_after_days" BETWEEN 0 AND 30);