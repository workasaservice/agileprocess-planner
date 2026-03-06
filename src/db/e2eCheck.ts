// Copyright (c) 2026 AgilePlanner Contributors
// Licensed under the MIT License. See LICENSE file for details.

import dotenv from "dotenv";

import { checkDatabaseHealth, closePool, query } from "../lib/neonClient";

dotenv.config();

type CountRow = { count: string };

type CountableTable = "organizations" | "projects" | "teams" | "json_documents";

const ALLOWED_TABLES: ReadonlyArray<CountableTable> = [
  "organizations",
  "projects",
  "teams",
  "json_documents",
];

async function getTableCount(tableName: CountableTable): Promise<number> {
  if (!ALLOWED_TABLES.includes(tableName)) {
    throw new Error(`Invalid table name for count query: ${tableName}`);
  }
  const result = await query<CountRow>(`SELECT COUNT(*)::text AS count FROM ${tableName}`);
  return Number(result.rows[0]?.count || 0);
}

async function getInvalidJsonDocCount(): Promise<number> {
  const result = await query<CountRow>(
    "SELECT COUNT(*)::text AS count FROM json_documents WHERE is_valid_json = false"
  );
  return Number(result.rows[0]?.count || 0);
}

async function run() {
  const health = await checkDatabaseHealth();
  if (!health.ok) {
    throw new Error(`Database health check failed: ${health.error || "unknown"}`);
  }

  const organizations = await getTableCount("organizations");
  const projects = await getTableCount("projects");
  const teams = await getTableCount("teams");
  const jsonDocs = await getTableCount("json_documents");
  const invalidJsonDocs = await getInvalidJsonDocCount();

  const result = {
    health,
    counts: {
      organizations,
      projects,
      teams,
      json_documents: jsonDocs,
      invalid_json_documents: invalidJsonDocs,
    },
    checks: {
      hasOrgData: organizations > 0,
      hasProjectData: projects > 0,
      hasTeamData: teams > 0,
      hasJsonDocuments: jsonDocs > 0,
    },
  };

  console.log(JSON.stringify(result, null, 2));

  if (!result.checks.hasOrgData || !result.checks.hasProjectData || !result.checks.hasJsonDocuments) {
    process.exitCode = 1;
  }
}

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
