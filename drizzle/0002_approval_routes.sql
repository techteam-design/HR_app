CREATE TYPE "public"."approval_reassignment_cause" AS ENUM('branch_default', 'override', 'override_reset', 'employee_change', 'manager_approver');--> statement-breakpoint
ALTER TYPE "public"."adjustment_reason" ADD VALUE 'carry_forward_recalculation';--> statement-breakpoint
CREATE TABLE "approval_reassignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"level" integer NOT NULL,
	"from_approver_id" uuid,
	"to_approver_id" uuid,
	"cause" "approval_reassignment_cause" NOT NULL,
	"changed_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_reassignments_level_check" CHECK ("approval_reassignments"."level" IN (1, 2)),
	CONSTRAINT "approval_reassignments_changed_check" CHECK ("approval_reassignments"."from_approver_id" IS DISTINCT FROM "approval_reassignments"."to_approver_id")
);
--> statement-breakpoint
CREATE TABLE "approval_route_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"mode" "approval_mode" NOT NULL,
	"level1_approver_id" uuid NOT NULL,
	"level2_approver_id" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_route_overrides_employee_id_unique" UNIQUE("employee_id"),
	CONSTRAINT "approval_route_overrides_mode_check" CHECK (("approval_route_overrides"."mode" = 'single' AND "approval_route_overrides"."level2_approver_id" IS NULL) OR ("approval_route_overrides"."mode" = 'two_level' AND "approval_route_overrides"."level2_approver_id" IS NOT NULL)),
	CONSTRAINT "approval_route_overrides_distinct_approvers_check" CHECK ("approval_route_overrides"."level2_approver_id" IS NULL OR "approval_route_overrides"."level2_approver_id" <> "approval_route_overrides"."level1_approver_id"),
	CONSTRAINT "approval_route_overrides_not_own_approver_check" CHECK ("approval_route_overrides"."employee_id" <> "approval_route_overrides"."level1_approver_id" AND ("approval_route_overrides"."level2_approver_id" IS NULL OR "approval_route_overrides"."employee_id" <> "approval_route_overrides"."level2_approver_id"))
);
--> statement-breakpoint
CREATE TABLE "approval_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"managers_approver_id" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_settings_single_row_check" CHECK ("approval_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "branch_approval_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"mode" "approval_mode" NOT NULL,
	"level1_approver_id" uuid NOT NULL,
	"level2_approver_id" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_approval_routes_branch_id_unique" UNIQUE("branch_id"),
	CONSTRAINT "branch_approval_routes_mode_check" CHECK (("branch_approval_routes"."mode" = 'single' AND "branch_approval_routes"."level2_approver_id" IS NULL) OR ("branch_approval_routes"."mode" = 'two_level' AND "branch_approval_routes"."level2_approver_id" IS NOT NULL)),
	CONSTRAINT "branch_approval_routes_distinct_approvers_check" CHECK ("branch_approval_routes"."level2_approver_id" IS NULL OR "branch_approval_routes"."level2_approver_id" <> "branch_approval_routes"."level1_approver_id")
);
--> statement-breakpoint
ALTER TABLE "approval_reassignments" ADD CONSTRAINT "approval_reassignments_application_id_leave_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."leave_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_reassignments" ADD CONSTRAINT "approval_reassignments_from_approver_id_employees_id_fk" FOREIGN KEY ("from_approver_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_reassignments" ADD CONSTRAINT "approval_reassignments_to_approver_id_employees_id_fk" FOREIGN KEY ("to_approver_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_reassignments" ADD CONSTRAINT "approval_reassignments_changed_by_employees_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_route_overrides" ADD CONSTRAINT "approval_route_overrides_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_route_overrides" ADD CONSTRAINT "approval_route_overrides_level1_approver_id_employees_id_fk" FOREIGN KEY ("level1_approver_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_route_overrides" ADD CONSTRAINT "approval_route_overrides_level2_approver_id_employees_id_fk" FOREIGN KEY ("level2_approver_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_route_overrides" ADD CONSTRAINT "approval_route_overrides_updated_by_employees_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_settings" ADD CONSTRAINT "approval_settings_managers_approver_id_employees_id_fk" FOREIGN KEY ("managers_approver_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_settings" ADD CONSTRAINT "approval_settings_updated_by_employees_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_approval_routes" ADD CONSTRAINT "branch_approval_routes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_approval_routes" ADD CONSTRAINT "branch_approval_routes_level1_approver_id_employees_id_fk" FOREIGN KEY ("level1_approver_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_approval_routes" ADD CONSTRAINT "branch_approval_routes_level2_approver_id_employees_id_fk" FOREIGN KEY ("level2_approver_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_approval_routes" ADD CONSTRAINT "branch_approval_routes_updated_by_employees_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_reassignments_application_id_idx" ON "approval_reassignments" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "approval_actions_approver_id_acted_at_idx" ON "approval_actions" USING btree ("approver_id","acted_at");--> statement-breakpoint
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_approval_mode_check" CHECK (("leave_applications"."approval_mode" = 'single' AND "leave_applications"."level2_approver_id" IS NULL AND "leave_applications"."current_level" = 1) OR ("leave_applications"."approval_mode" = 'two_level' AND "leave_applications"."level2_approver_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_not_own_approver_check" CHECK ("leave_applications"."employee_id" <> "leave_applications"."level1_approver_id" AND ("leave_applications"."level2_approver_id" IS NULL OR "leave_applications"."employee_id" <> "leave_applications"."level2_approver_id"));--> statement-breakpoint
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_reject_remarks_check" CHECK ("approval_actions"."action" <> 'rejected' OR length(btrim(coalesce("approval_actions"."remarks", ''))) > 0);