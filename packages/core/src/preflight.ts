export interface QueryExecutor {
  query(sql: string): Promise<unknown>;
}

export interface TargetPermissionResult {
  canReadStats: boolean;
  canReadStatements: boolean;
  errors: string[];
}

export interface SetupSqlInput {
  roleName: string;
  databaseName: string;
  password?: string;
}

export const TARGET_PERMISSION_FIXES = {
  stats: {
    label: "Can read pg_stat_activity",
    sql: "GRANT pg_read_all_stats TO {role};",
  },
  statements: {
    label: "Can read pg_stat_statements",
    sql:
      "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;\n" +
      "-- Then restart Postgres with shared_preload_libraries='pg_stat_statements'",
  },
} as const;

export async function checkTargetPermissions(
  executor: QueryExecutor
): Promise<TargetPermissionResult> {
  const errors: string[] = [];
  let canReadStats = false;
  let canReadStatements = false;

  try {
    await executor.query("SELECT 1 FROM pg_stat_activity LIMIT 1");
    canReadStats = true;
  } catch (err) {
    errors.push(`Cannot read pg_stat_activity: ${(err as Error).message}`);
  }

  try {
    await executor.query("SELECT 1 FROM pg_stat_statements LIMIT 1");
    canReadStatements = true;
  } catch (err) {
    errors.push(
      `Cannot read pg_stat_statements: ${(err as Error).message}. ` +
        "Is the extension created (CREATE EXTENSION pg_stat_statements) and is it in shared_preload_libraries?"
    );
  }

  return { canReadStats, canReadStatements, errors };
}

export function quotePostgresIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export function quotePostgresLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function buildSetupSql(input: SetupSqlInput): string {
  const role = quotePostgresIdentifier(input.roleName);
  const database = quotePostgresIdentifier(input.databaseName);
  const password = input.password ? quotePostgresLiteral(input.password) : "'<a strong password>'";

  return [
    `DO $$`,
    `BEGIN`,
    `  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${quotePostgresLiteral(input.roleName)}) THEN`,
    `    CREATE ROLE ${role} LOGIN PASSWORD ${password};`,
    `  END IF;`,
    `END $$;`,
    ``,
    `GRANT CONNECT ON DATABASE ${database} TO ${role};`,
    `GRANT pg_read_all_stats TO ${role};`,
    `GRANT USAGE ON SCHEMA public TO ${role};`,
    ``,
    `CREATE EXTENSION IF NOT EXISTS pg_stat_statements;`,
    ``,
    `-- Optional: only if you want live EXPLAIN support.`,
    `-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${role};`,
  ].join("\n");
}
