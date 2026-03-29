CREATE TYPE "public"."diff_operation" AS ENUM('create', 'modify', 'delete');
CREATE TYPE "public"."diff_status" AS ENUM('pending', 'approved', 'rejected', 'blocked', 'applied', 'reverted');
CREATE TYPE "public"."model_result_status" AS ENUM('success', 'failed');
CREATE TYPE "public"."task_status" AS ENUM('submitted', 'routing', 'executing', 'completed', 'failed', 'cancelled');
CREATE TYPE "public"."task_type" AS ENUM('code_generation', 'debugging', 'refactoring', 'analysis', 'review');
CREATE TYPE "public"."team_role" AS ENUM('owner', 'admin', 'member');

CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"name" varchar(120) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid,
	"actor_id" uuid,
	"action" varchar(120) NOT NULL,
	"resource_type" varchar(120) NOT NULL,
	"resource_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "cost_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid,
	"model_result_id" uuid,
	"model_name" varchar(64) NOT NULL,
	"provider" varchar(32) NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"billing_period" varchar(7) NOT NULL,
	"request_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "diffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"model_result_id" uuid NOT NULL,
	"operation" "diff_operation" NOT NULL,
	"file_path" text NOT NULL,
	"before_content" text,
	"after_content" text,
	"unified_diff" text,
	"hunks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lines_added" integer DEFAULT 0 NOT NULL,
	"lines_removed" integer DEFAULT 0 NOT NULL,
	"status" "diff_status" DEFAULT 'pending' NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"safety_violations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approved_by_user_id" uuid,
	"rejected_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"reverted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flag_key" varchar(120) NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_flags_flag_key_unique" UNIQUE("flag_key")
);

CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"type" varchar(48) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "model_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"model_id" varchar(64) NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"status" "model_result_status" NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"raw_response" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"description" text,
	"auto_apply_changes" boolean DEFAULT false NOT NULL,
	"monthly_budget_cents" integer DEFAULT 0 NOT NULL,
	"safety_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "rate_limit_buckets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_id" uuid NOT NULL,
	"bucket_type" varchar(32) NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"submitted_by_key_id" uuid,
	"submitted_by_user_id" uuid,
	"prompt" text NOT NULL,
	"task_type" "task_type" NOT NULL,
	"preferred_model" varchar(64),
	"budget_cents" integer DEFAULT 0 NOT NULL,
	"timeout_seconds" integer DEFAULT 60 NOT NULL,
	"status" "task_status" DEFAULT 'submitted' NOT NULL,
	"model_id" varchar(64),
	"output_summary" text,
	"total_cost_cents" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"routing_reasoning" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "team_billing_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"billing_period" varchar(7) NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "team_members" (
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "team_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);

CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"plan" varchar(32) DEFAULT 'starter' NOT NULL,
	"monthly_budget_cents" integer DEFAULT 0 NOT NULL,
	"current_month_spend_cents" integer DEFAULT 0 NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_slug_unique" UNIQUE("slug")
);

CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"display_name" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"url" text NOT NULL,
	"secret" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "cost_logs" ADD CONSTRAINT "cost_logs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "cost_logs" ADD CONSTRAINT "cost_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "cost_logs" ADD CONSTRAINT "cost_logs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "cost_logs" ADD CONSTRAINT "cost_logs_model_result_id_model_results_id_fk" FOREIGN KEY ("model_result_id") REFERENCES "public"."model_results"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "diffs" ADD CONSTRAINT "diffs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "diffs" ADD CONSTRAINT "diffs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "diffs" ADD CONSTRAINT "diffs_model_result_id_model_results_id_fk" FOREIGN KEY ("model_result_id") REFERENCES "public"."model_results"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "diffs" ADD CONSTRAINT "diffs_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "diffs" ADD CONSTRAINT "diffs_rejected_by_user_id_users_id_fk" FOREIGN KEY ("rejected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "model_results" ADD CONSTRAINT "model_results_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "projects" ADD CONSTRAINT "projects_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "rate_limit_buckets" ADD CONSTRAINT "rate_limit_buckets_key_id_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_submitted_by_key_id_api_keys_id_fk" FOREIGN KEY ("submitted_by_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "team_billing_history" ADD CONSTRAINT "team_billing_history_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "api_keys_key_hash_idx" ON "api_keys" USING btree ("key_hash");
CREATE INDEX "api_keys_project_idx" ON "api_keys" USING btree ("project_id");
CREATE INDEX "cost_logs_team_billing_idx" ON "cost_logs" USING btree ("team_id","billing_period");
CREATE INDEX "cost_logs_model_started_idx" ON "cost_logs" USING btree ("model_name","request_started_at");
CREATE INDEX "diffs_task_idx" ON "diffs" USING btree ("task_id");
CREATE INDEX "diffs_project_idx" ON "diffs" USING btree ("project_id");
CREATE INDEX "diffs_status_idx" ON "diffs" USING btree ("status");
CREATE INDEX "diffs_blocked_idx" ON "diffs" USING btree ("blocked","flagged");
CREATE INDEX "model_results_task_idx" ON "model_results" USING btree ("task_id");
CREATE UNIQUE INDEX "rate_limit_buckets_key_window_idx" ON "rate_limit_buckets" USING btree ("key_id","bucket_type","window_start");
CREATE INDEX "tasks_team_status_idx" ON "tasks" USING btree ("team_id","status");
CREATE INDEX "tasks_project_created_idx" ON "tasks" USING btree ("project_id","created_at");
CREATE UNIQUE INDEX "team_billing_history_team_period_idx" ON "team_billing_history" USING btree ("team_id","billing_period");
CREATE INDEX "team_members_user_idx" ON "team_members" USING btree ("user_id");