import dotenv from "dotenv";
import { neonMcpClient } from "../src/clients/neonMcpClient";

dotenv.config();

async function main() {
  const tables = [
    "program_increments",
    "backlog_hierarchy",
    "sprint_allocations",
    "planning_audit",
    "planning_events",
    "organization_planning_summary",
  ];

  for (const table of tables) {
    const result: any = await neonMcpClient.callTool("run_sql", {
      sql: `SELECT COUNT(*)::int AS count FROM ${table};`,
    });
    const text = result?.content?.[0]?.text || "";
    console.log(`\n[${table}] raw:`);
    console.log(text);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
