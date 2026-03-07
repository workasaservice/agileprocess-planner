import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { neonMcpClient } from "../src/clients/neonMcpClient";

dotenv.config();

type RunSqlResult = {
  content?: Array<{ type?: string; text?: string }>;
  isError?: boolean;
  [key: string]: unknown;
};

const REQUIRED_TABLES = [
  "config_users",
  "config_roles",
  "config_capacity",
  "config_projects",
  "config_project_members",
  "config_project_iterations",
  "config_credentials",
  "effort_tracking_config",
  "effort_tracking_history",
  "sprint_effort_summary",
  "estimation_accuracy",
  "program_increments",
  "backlog_hierarchy",
  "sprint_allocations",
  "planning_audit",
  "effort_variance_alerts",
  "planning_events",
  "organization_planning_summary",
];

function parseRows(result: RunSqlResult): any[] {
  const text = result?.content?.[0]?.text;
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function resolveNeonTarget(): { projectId: string; branchId: string } {
  const projectId = process.env.NEON_PROJECT_ID || "";
  const branchId = process.env.NEON_BRANCH_ID || "";

  if (!projectId || !branchId) {
    throw new Error(
      "NEON_PROJECT_ID and NEON_BRANCH_ID must be set to verify schemas via Neon MCP run_sql."
    );
  }

  return { projectId, branchId };
}

async function runSql(sql: string): Promise<RunSqlResult> {
  const target = resolveNeonTarget();
  const result = await neonMcpClient.callTool<RunSqlResult>("run_sql", {
    ...target,
    sql,
  });

  const firstText = result?.content?.[0]?.text || "";
  if (result.isError || firstText.startsWith("MCP error")) {
    throw new Error(firstText || "Neon MCP run_sql returned tool error");
  }

  return result;
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let dollarTag: string | null = null;

  while (i < sql.length) {
    const ch = sql[i] as string;
    const next = sql[i + 1] as string | undefined;

    // Line comments
    if (!inSingle && !inDouble && !dollarTag && ch === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") {
        current += sql[i];
        i++;
      }
      continue;
    }

    if (!inDouble && !dollarTag && ch === "'") {
      inSingle = !inSingle;
      current += ch;
      i++;
      continue;
    }

    if (!inSingle && !dollarTag && ch === '"') {
      inDouble = !inDouble;
      current += ch;
      i++;
      continue;
    }

    if (!inSingle && !inDouble && ch === "$") {
      if (!dollarTag) {
        const rest = sql.slice(i);
        const match = rest.match(/^\$[A-Za-z0-9_]*\$/);
        if (match && match[0]) {
          dollarTag = match[0];
          current += dollarTag;
          i += dollarTag.length;
          continue;
        }
      } else if (sql.slice(i, i + dollarTag.length) === dollarTag) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
    }

    if (!inSingle && !inDouble && !dollarTag && ch === ";") {
      const stmt = current.trim();
      if (stmt) statements.push(stmt);
      current = "";
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);

  return statements;
}

function isIgnorableMigrationError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("already exists") ||
    normalized.includes("duplicate key value")
  );
}

async function applyMigrationsViaMcp(): Promise<void> {
  const migrationsDir = path.resolve(process.cwd(), "db", "migrations");
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, "utf8").trim();
    if (!sql) continue;

    const statements = splitSqlStatements(sql);
    process.stdout.write(`Applying via MCP: ${file} (${statements.length} statements) ... `);
    for (const statement of statements) {
      try {
        await runSql(statement);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!isIgnorableMigrationError(message)) {
          throw error;
        }
      }
    }
    console.log("OK");
  }
}

async function verifyTables(): Promise<{ found: string[]; missing: string[] }> {
  const tableListSql = REQUIRED_TABLES.map((t) => `'${t}'`).join(", ");
  const sql = `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (${tableListSql})
    ORDER BY table_name;
  `;

  const result = await neonMcpClient.callTool<RunSqlResult>("run_sql", {
    ...resolveNeonTarget(),
    sql,
  });

  const firstText = result?.content?.[0]?.text || "";
  if (result.isError || firstText.startsWith("MCP error")) {
    throw new Error(firstText || "Neon MCP run_sql returned tool error");
  }

  const rows = parseRows(result);
  const found = rows
    .map((r) => String((r as any).table_name || ""))
    .filter(Boolean);
  const missing = REQUIRED_TABLES.filter((t) => !found.includes(t));

  return { found, missing };
}

async function main(): Promise<void> {
  if (!neonMcpClient.isConfigured()) {
    throw new Error("Neon MCP is not configured in this environment.");
  }

  await applyMigrationsViaMcp();
  const { found, missing } = await verifyTables();

  console.log("\nSchema verification summary:");
  console.log(`Found tables: ${found.length}`);
  if (found.length > 0) {
    console.log(found.join(", "));
  }

  if (missing.length > 0) {
    console.error(`\nMissing tables: ${missing.length}`);
    console.error(missing.join(", "));
    process.exitCode = 1;
    return;
  }

  console.log("\nAll required schemas/tables are present on Neon via MCP.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
