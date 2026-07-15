CREATE TABLE "query_stats_daily_rollups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint_id" uuid NOT NULL,
	"bucket_date" date NOT NULL,
	"snapshot_count" integer NOT NULL,
	"first_collected_at" timestamp with time zone NOT NULL,
	"last_collected_at" timestamp with time zone NOT NULL,
	"first_calls" integer NOT NULL,
	"last_calls" integer NOT NULL,
	"first_total_exec_time_ms" double precision NOT NULL,
	"last_total_exec_time_ms" double precision NOT NULL,
	"first_rows" integer NOT NULL,
	"last_rows" integer NOT NULL,
	"avg_mean_exec_time_ms" double precision NOT NULL,
	"last_shared_blks_hit" integer NOT NULL,
	"last_shared_blks_read" integer NOT NULL,
	"last_temp_blks_written" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "query_stats_daily_rollups" ADD CONSTRAINT "query_stats_daily_rollups_fingerprint_id_query_fingerprints_id_fk" FOREIGN KEY ("fingerprint_id") REFERENCES "public"."query_fingerprints"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "query_stats_daily_rollups_fp_bucket_idx" ON "query_stats_daily_rollups" USING btree ("fingerprint_id","bucket_date");
