CREATE TYPE "public"."adjustment_reason" AS ENUM('opening_balance', 'correction');--> statement-breakpoint
CREATE TYPE "public"."approval_action" AS ENUM('approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."approval_mode" AS ENUM('single', 'two_level');--> statement-breakpoint
CREATE TYPE "public"."employee_classification" AS ENUM('local', 'foreign');--> statement-breakpoint
CREATE TYPE "public"."employee_role" AS ENUM('employee', 'manager', 'admin', 'hr_viewer');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('active', 'inactive', 'probation');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."half_day_slot" AS ENUM('morning', 'afternoon');--> statement-breakpoint
CREATE TYPE "public"."leave_application_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."leave_period_basis" AS ENUM('anniversary', 'calendar');--> statement-breakpoint
CREATE TYPE "public"."leave_type_code" AS ENUM('annual', 'mc', 'unpaid');--> statement-breakpoint
CREATE TYPE "public"."prorate_rounding" AS ENUM('up', 'down', 'nearest');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"employee_code" text NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"date_of_birth" date NOT NULL,
	"gender" "gender" NOT NULL,
	"join_date" date NOT NULL,
	"designation" text NOT NULL,
	"department_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"classification" "employee_classification" NOT NULL,
	"reporting_manager_id" uuid,
	"role" "employee_role" DEFAULT 'employee' NOT NULL,
	"status" "employee_status" DEFAULT 'active' NOT NULL,
	"photo_key" text,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "employees_employee_code_unique" UNIQUE("employee_code"),
	CONSTRAINT "employees_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "leave_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"entitlement_id" uuid NOT NULL,
	"days" numeric(5, 1) NOT NULL,
	"reason" "adjustment_reason" NOT NULL,
	"note" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_adjustments_days_non_zero_check" CHECK ("leave_adjustments"."days" <> 0)
);
--> statement-breakpoint
CREATE TABLE "leave_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_half_day" boolean DEFAULT false NOT NULL,
	"half_day_slot" "half_day_slot",
	"total_days" numeric(5, 1) NOT NULL,
	"reason" text,
	"status" "leave_application_status" DEFAULT 'pending' NOT NULL,
	"current_level" integer DEFAULT 1 NOT NULL,
	"approval_mode" "approval_mode" NOT NULL,
	"level1_approver_id" uuid NOT NULL,
	"level2_approver_id" uuid,
	"notice_overridden" boolean DEFAULT false NOT NULL,
	"override_by" uuid,
	"override_reason" text,
	"last_reminder_sent_at" timestamp with time zone,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_applications_date_range_check" CHECK ("leave_applications"."end_date" >= "leave_applications"."start_date"),
	CONSTRAINT "leave_applications_total_days_check" CHECK ("leave_applications"."total_days" > 0),
	CONSTRAINT "leave_applications_current_level_check" CHECK ("leave_applications"."current_level" IN (1, 2)),
	CONSTRAINT "leave_applications_half_day_check" CHECK (("leave_applications"."is_half_day" AND "leave_applications"."half_day_slot" IS NOT NULL AND "leave_applications"."start_date" = "leave_applications"."end_date" AND "leave_applications"."total_days" = 0.5) OR (NOT "leave_applications"."is_half_day" AND "leave_applications"."half_day_slot" IS NULL)),
	CONSTRAINT "leave_applications_cancelled_at_check" CHECK ("leave_applications"."status" <> 'cancelled' OR ("leave_applications"."cancelled_at" IS NOT NULL AND "leave_applications"."cancelled_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "leave_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"entitled_days" numeric(5, 1) NOT NULL,
	"carried_forward_days" numeric(5, 1) DEFAULT '0' NOT NULL,
	"forfeited_days" numeric(5, 1) DEFAULT '0' NOT NULL,
	"carry_forward_expires_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_entitlements_employee_type_period_unique" UNIQUE("employee_id","leave_type_id","period_start"),
	CONSTRAINT "leave_entitlements_id_employee_type_unique" UNIQUE("id","employee_id","leave_type_id"),
	CONSTRAINT "leave_entitlements_period_check" CHECK ("leave_entitlements"."period_end" >= "leave_entitlements"."period_start"),
	CONSTRAINT "leave_entitlements_days_non_negative_check" CHECK ("leave_entitlements"."entitled_days" >= 0 AND "leave_entitlements"."carried_forward_days" >= 0 AND "leave_entitlements"."forfeited_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "leave_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"entitlement_table" jsonb,
	"fixed_days" numeric(5, 1),
	"eligibility_months_local" integer NOT NULL,
	"eligibility_months_foreign" integer NOT NULL,
	"advance_notice_days_foreign" integer DEFAULT 0 NOT NULL,
	"carry_forward_enabled" boolean NOT NULL,
	"carry_forward_cap" numeric(5, 1),
	"carry_forward_expiry_months" integer,
	"prorate_on_join" boolean NOT NULL,
	"prorate_rounding" "prorate_rounding",
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_policies_leave_type_id_unique" UNIQUE("leave_type_id")
);
--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" "leave_type_code" NOT NULL,
	"name" text NOT NULL,
	"is_paid" boolean NOT NULL,
	"period_basis" "leave_period_basis" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "approval_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"approver_id" uuid NOT NULL,
	"level" integer NOT NULL,
	"action" "approval_action" NOT NULL,
	"remarks" text,
	"acted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_actions_level_check" CHECK ("approval_actions"."level" IN (1, 2))
);
--> statement-breakpoint
CREATE TABLE "approval_workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"mode" "approval_mode" NOT NULL,
	"level1_approver_id" uuid NOT NULL,
	"level2_approver_id" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_workflows_employee_id_unique" UNIQUE("employee_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_reporting_manager_id_employees_id_fk" FOREIGN KEY ("reporting_manager_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_entitlement_fk" FOREIGN KEY ("entitlement_id","employee_id","leave_type_id") REFERENCES "public"."leave_entitlements"("id","employee_id","leave_type_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_level1_approver_id_employees_id_fk" FOREIGN KEY ("level1_approver_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_level2_approver_id_employees_id_fk" FOREIGN KEY ("level2_approver_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_override_by_employees_id_fk" FOREIGN KEY ("override_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_cancelled_by_employees_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_entitlements" ADD CONSTRAINT "leave_entitlements_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_entitlements" ADD CONSTRAINT "leave_entitlements_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_updated_by_employees_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_application_id_leave_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."leave_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_approver_id_employees_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_workflows" ADD CONSTRAINT "approval_workflows_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_workflows" ADD CONSTRAINT "approval_workflows_level1_approver_id_employees_id_fk" FOREIGN KEY ("level1_approver_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_workflows" ADD CONSTRAINT "approval_workflows_level2_approver_id_employees_id_fk" FOREIGN KEY ("level2_approver_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_workflows" ADD CONSTRAINT "approval_workflows_updated_by_employees_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "employees_reporting_manager_id_idx" ON "employees" USING btree ("reporting_manager_id");--> statement-breakpoint
CREATE INDEX "employees_department_id_idx" ON "employees" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "employees_branch_id_idx" ON "employees" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "employees_status_idx" ON "employees" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leave_adjustments_employee_id_leave_type_id_idx" ON "leave_adjustments" USING btree ("employee_id","leave_type_id");--> statement-breakpoint
CREATE INDEX "leave_applications_employee_id_status_idx" ON "leave_applications" USING btree ("employee_id","status");--> statement-breakpoint
CREATE INDEX "leave_applications_status_current_level_idx" ON "leave_applications" USING btree ("status","current_level");--> statement-breakpoint
CREATE INDEX "leave_applications_start_date_idx" ON "leave_applications" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "leave_applications_level1_approver_id_idx" ON "leave_applications" USING btree ("level1_approver_id");--> statement-breakpoint
CREATE INDEX "leave_applications_level2_approver_id_idx" ON "leave_applications" USING btree ("level2_approver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_actions_application_id_level_uidx" ON "approval_actions" USING btree ("application_id","level");