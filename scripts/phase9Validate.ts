import dotenv from "dotenv";
import { neonMcpClient } from "../src/clients/neonMcpClient";

dotenv.config();

type RunSqlResult = {
  content?: Array<{ type?: string; text?: string }>;
  isError?: boolean;
};

async function runSql(sql: string): Promise<any[]> {
  const result = await neonMcpClient.callTool<RunSqlResult>("run_sql", { sql });
  const firstText = result?.content?.[0]?.text || "";
  if (result?.isError || firstText.startsWith("MCP error")) {
    throw new Error(firstText || "run_sql failed");
  }

  if (!firstText) return [];
  try {
    const parsed = JSON.parse(firstText);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const checks: Array<{ name: string; sql: string }> = [
    {
      name: "Program increments",
      sql: "SELECT COUNT(*)::int AS count FROM program_increments;",
    },
    {
      name: "Backlog hierarchy",
      sql: "SELECT COUNT(*)::int AS count FROM backlog_hierarchy;",
    },
    {
      name: "Sprint allocations",
      sql: "SELECT COUNT(*)::int AS count FROM sprint_allocations;",
    },
    {
      name: "Planning audit",
      sql: "SELECT COUNT(*)::int AS count FROM planning_audit;",
    },
    {
      name: "Planning events",
      sql: "SELECT COUNT(*)::int AS count FROM planning_events;",
    },
    {
      name: "Org planning summary",
      sql: "SELECT COUNT(*)::int AS count FROM organization_planning_summary;",
    },
  ];

  console.log("Phase 9 validation (Neon MCP):");
  for (const check of checks) {
    const rows = await runSql(check.sql);
    const count = rows[0]?.count ?? 0;
    console.log(`- ${check.name}: ${count}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
