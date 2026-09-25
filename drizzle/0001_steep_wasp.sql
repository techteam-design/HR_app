CREATE TABLE "leave_application_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"date" date NOT NULL,
	"portion" numeric(2, 1) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_application_days_application_id_date_unique" UNIQUE("application_id","date"),
	CONSTRAINT "leave_application_days_portion_check" CHECK ("leave_application_days"."portion" IN (0.5, 1.0))
);
--> statement-breakpoint
ALTER TABLE "leave_applications" ADD COLUMN "cancellation_note" text;--> statement-breakpoint
ALTER TABLE "leave_applications" ADD COLUMN "submitted_by" uuid;--> statement-breakpoint
ALTER TABLE "leave_application_days" ADD CONSTRAINT "leave_application_days_application_id_leave_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."leave_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leave_application_days_date_idx" ON "leave_application_days" USING btree ("date");--> statement-breakpoint
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_submitted_by_employees_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;