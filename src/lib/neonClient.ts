// Copyright (c) 2026 AgilePlanner Contributors
// Licensed under the MIT License. See LICENSE file for details.

import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from "pg";

type PersistenceMode = "json" | "postgres";

function getPersistenceMode(): PersistenceMode {
  const mode = (process.env.PERSISTENCE_MODE || "json").toLowerCase();
  return mode === "postgres" ? "postgres" : "json";
}

function getDatabaseUrl(): string {
  const pooled = process.env.DATABASE_URL_POOLED?.trim();
  const direct = process.env.DATABASE_URL?.trim();

  if (pooled) {
    return pooled;
  }
  if (direct) {
    return direct;
  }

  throw new Error(
    "Missing database connection string. Set DATABASE_URL or DATABASE_URL_POOLED."
  );
}

let pool: Pool | null = null;

export function isPostgresModeEnabled(): boolean {
  return getPersistenceMode() === "postgres";
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      max: Number(process.env.DB_MAX_CONNECTIONS || 10),
      idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
      ssl:
        process.env.DB_SSL === "false"
          ? false
          : process.env.DB_SSL_INSECURE === "true"
          ? {
              rejectUnauthorized: false,
            }
          : {
              rejectUnauthorized: true,
            },
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export async function withTransaction<T>(
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabaseHealth(): Promise<{
  ok: boolean;
  mode: PersistenceMode;
  now?: string;
  error?: string;
}> {
  const mode = getPersistenceMode();

  if (mode !== "postgres") {
    return {
      ok: true,
      mode,
    };
  }

  try {
    const result = await query<{ now: string }>("SELECT NOW()::text AS now");
    const now = result.rows[0]?.now;
    return {
      ok: true,
      mode,
      ...(now ? { now } : {}),
    };
  } catch (error) {
    return {
      ok: false,
      mode,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
