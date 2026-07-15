CREATE UNIQUE INDEX IF NOT EXISTS "index_suggestions_db_fp_ddl_idx" ON "index_suggestions" USING btree ("database_id","fingerprint_id","suggested_ddl");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "n_plus_one_patterns_pattern_hash_idx" ON "n_plus_one_patterns" USING btree ("pattern_hash");
