CREATE TYPE "public"."connection_mode" AS ENUM('direct', 'log_tail', 'both');--> statement-breakpoint
CREATE TYPE "public"."db_status" AS ENUM('pending', 'healthy', 'degraded', 'error');--> statement-breakpoint
CREATE TYPE "public"."pattern_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."slow_query_source" AS ENUM('direct_poll', 'auto_explain');--> statement-breakpoint
CREATE TYPE "public"."suggestion_impact" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."suggestion_status" AS ENUM('pending', 'applied', 'dismissed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alert_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid NOT NULL,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"database_id" uuid NOT NULL,
	"rule_type" text NOT NULL,
	"threshold" double precision NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "collector_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"database_id" uuid NOT NULL,
	"mode" "connection_mode" NOT NULL,
	"version" text NOT NULL,
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "explain_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slow_query_event_id" uuid NOT NULL,
	"plan_json" jsonb NOT NULL,
	"planning_time_ms" double precision,
	"execution_time_ms" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "index_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"database_id" uuid NOT NULL,
	"fingerprint_id" uuid NOT NULL,
	"suggested_ddl" text NOT NULL,
	"reasoning" text NOT NULL,
	"estimated_impact" "suggestion_impact" NOT NULL,
	"status" "suggestion_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitored_databases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"connection_mode" "connection_mode" DEFAULT 'both' NOT NULL,
	"dsn_encrypted" text NOT NULL,
	"ssl_mode" text DEFAULT 'verify-full' NOT NULL,
	"status" "db_status" DEFAULT 'pending' NOT NULL,
	"last_polled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "n_plus_one_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"database_id" uuid NOT NULL,
	"pattern_hash" text NOT NULL,
	"fingerprint_ids" jsonb NOT NULL,
	"occurrences_in_window" integer NOT NULL,
	"window_seconds" double precision NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "pattern_status" DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "query_fingerprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"database_id" uuid NOT NULL,
	"query_hash" text NOT NULL,
	"normalized_query" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "query_stats_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint_id" uuid NOT NULL,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"calls" integer NOT NULL,
	"total_exec_time_ms" double precision NOT NULL,
	"mean_exec_time_ms" double precision NOT NULL,
	"rows" integer NOT NULL,
	"shared_blks_hit" integer DEFAULT 0 NOT NULL,
	"shared_blks_read" integer DEFAULT 0 NOT NULL,
	"temp_blks_written" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "slow_query_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint_id" uuid NOT NULL,
	"database_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"duration_ms" double precision NOT NULL,
	"source" "slow_query_source" NOT NULL,
	"backend_pid" integer,
	"session_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alerts" ADD CONSTRAINT "alerts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alerts" ADD CONSTRAINT "alerts_database_id_monitored_databases_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."monitored_databases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "collector_agents" ADD CONSTRAINT "collector_agents_database_id_monitored_databases_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."monitored_databases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "explain_plans" ADD CONSTRAINT "explain_plans_slow_query_event_id_slow_query_events_id_fk" FOREIGN KEY ("slow_query_event_id") REFERENCES "public"."slow_query_events"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "index_suggestions" ADD CONSTRAINT "index_suggestions_database_id_monitored_databases_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."monitored_databases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "index_suggestions" ADD CONSTRAINT "index_suggestions_fingerprint_id_query_fingerprints_id_fk" FOREIGN KEY ("fingerprint_id") REFERENCES "public"."query_fingerprints"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "monitored_databases" ADD CONSTRAINT "monitored_databases_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "n_plus_one_patterns" ADD CONSTRAINT "n_plus_one_patterns_database_id_monitored_databases_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."monitored_databases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "query_fingerprints" ADD CONSTRAINT "query_fingerprints_database_id_monitored_databases_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."monitored_databases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "query_stats_snapshots" ADD CONSTRAINT "query_stats_snapshots_fingerprint_id_query_fingerprints_id_fk" FOREIGN KEY ("fingerprint_id") REFERENCES "public"."query_fingerprints"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "slow_query_events" ADD CONSTRAINT "slow_query_events_fingerprint_id_query_fingerprints_id_fk" FOREIGN KEY ("fingerprint_id") REFERENCES "public"."query_fingerprints"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "slow_query_events" ADD CONSTRAINT "slow_query_events_database_id_monitored_databases_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."monitored_databases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
