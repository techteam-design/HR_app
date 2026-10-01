CREATE TYPE "public"."approval_override_kind" AS ENUM('approval_revoked', 'rejection_overridden');--> statement-breakpoint
ALTER TYPE "public"."leave_application_status" ADD VALUE 'revoked';--> statement-breakpoint
CREATE TABLE "half_day_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"local_morning_start" time NOT NULL,
	"local_morning_end" time NOT NULL,
	"local_afternoon_start" time NOT NULL,
	"local_afternoon_end" time NOT NULL,
	"foreign_morning_start" time NOT NULL,
	"foreign_morning_end" time NOT NULL,
	"foreign_afternoon_start" time NOT NULL,
	"foreign_afternoon_end" time NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "half_day_settings_single_row_check" CHECK ("half_day_settings"."id" = 1),
	CONSTRAINT "half_day_settings_local_check" CHECK ("half_day_settings"."local_morning_start" < "half_day_settings"."local_morning_end" AND "half_day_settings"."local_morning_end" <= "half_day_settings"."local_afternoon_start" AND "half_day_settings"."local_afternoon_start" < "half_day_settings"."local_afternoon_end"),
	CONSTRAINT "half_day_settings_foreign_check" CHECK ("half_day_settings"."foreign_morning_start" < "half_day_settings"."foreign_morning_end" AND "half_day_settings"."foreign_morning_end" <= "half_day_settings"."foreign_afternoon_start" AND "half_day_settings"."foreign_afternoon_start" < "half_day_settings"."foreign_afternoon_end")
);
--> statement-breakpoint
CREATE TABLE "approval_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" "approval_override_kind" NOT NULL,
	"admin_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"from_status" "leave_application_status" NOT NULL,
	"to_status" "leave_application_status" NOT NULL,
	"acted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_overrides_reason_check" CHECK (length(btrim("approval_overrides"."reason")) > 0),
	CONSTRAINT "approval_overrides_kind_check" CHECK (("approval_overrides"."kind" = 'approval_revoked' AND "approval_overrides"."from_status" = 'approved') OR ("approval_overrides"."kind" = 'rejection_overridden' AND "approval_overrides"."from_status" = 'rejected' AND "approval_overrides"."to_status" = 'approved'))
);
--> statement-breakpoint
ALTER TABLE "leave_applications" DROP CONSTRAINT "leave_applications_half_day_check";--> statement-breakpoint
ALTER TABLE "leave_applications" ADD COLUMN "half_day_start" time;--> statement-breakpoint
ALTER TABLE "leave_applications" ADD COLUMN "half_day_end" time;--> statement-breakpoint
-- Hand-added: the default timings row (local 8:30-12:30 / 13:30-17:30,
-- foreign 9:30-13:30 / 14:30-18:30). updated_by stays null (not changed in the app).
INSERT INTO "half_day_settings" ("id", "local_morning_start", "local_morning_end", "local_afternoon_start", "local_afternoon_end", "foreign_morning_start", "foreign_morning_end", "foreign_afternoon_start", "foreign_afternoon_end")
VALUES (1, '08:30', '12:30', '13:30', '17:30', '09:30', '13:30', '14:30', '18:30')
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
-- Hand-added: backfill existing half days with the default times for the
-- employee's (current) classification and the booked slot.
UPDATE "leave_applications" AS la
SET "half_day_start" = CASE
      WHEN e."classification" = 'local' AND la."half_day_slot" = 'morning' THEN TIME '08:30'
      WHEN e."classification" = 'local' AND la."half_day_slot" = 'afternoon' THEN TIME '13:30'
      WHEN e."classification" = 'foreign' AND la."half_day_slot" = 'morning' THEN TIME '09:30'
      WHEN e."classification" = 'foreign' AND la."half_day_slot" = 'afternoon' THEN TIME '14:30'
    END,
    "half_day_end" = CASE
      WHEN e."classification" = 'local' AND la."half_day_slot" = 'morning' THEN TIME '12:30'
      WHEN e."classification" = 'local' AND la."half_day_slot" = 'afternoon' THEN TIME '17:30'
      WHEN e."classification" = 'foreign' AND la."half_day_slot" = 'morning' THEN TIME '13:30'
      WHEN e."classification" = 'foreign' AND la."half_day_slot" = 'afternoon' THEN TIME '18:30'
    END
FROM "employees" AS e
WHERE e."id" = la."employee_id" AND la."is_half_day";--> statement-breakpoint
ALTER TABLE "half_day_settings" ADD CONSTRAINT "half_day_settings_updated_by_employees_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_overrides" ADD CONSTRAINT "approval_overrides_application_id_leave_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."leave_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_overrides" ADD CONSTRAINT "approval_overrides_admin_id_employees_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_overrides_application_id_idx" ON "approval_overrides" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "approval_overrides_admin_id_acted_at_idx" ON "approval_overrides" USING btree ("admin_id","acted_at");--> statement-breakpoint
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_half_day_check" CHECK (("leave_applications"."is_half_day" AND "leave_applications"."half_day_slot" IS NOT NULL AND "leave_applications"."half_day_start" IS NOT NULL AND "leave_applications"."half_day_end" IS NOT NULL AND "leave_applications"."half_day_start" < "leave_applications"."half_day_end" AND "leave_applications"."start_date" = "leave_applications"."end_date" AND "leave_applications"."total_days" = 0.5) OR (NOT "leave_applications"."is_half_day" AND "leave_applications"."half_day_slot" IS NULL AND "leave_applications"."half_day_start" IS NULL AND "leave_applications"."half_day_end" IS NULL));