import dotenv from "dotenv";
import { neonMcpClient } from "../src/clients/neonMcpClient";

dotenv.config();

async function main() {
  await neonMcpClient.callTool("run_sql", {
    sql: `UPDATE config_project_iterations
          SET iteration_path = CASE
            WHEN project_id = 'MotherOps-Alpha' THEN 'MotherOps-Alpha\\Sprint 2026-03-16'
            WHEN project_id = 'MotherOps-Beta' THEN 'MotherOps-Beta\\Sprint 2026-03-16'
            ELSE iteration_path
          END
          WHERE sprint_name = 'TestIteration 001'
            AND project_id IN ('MotherOps-Alpha', 'MotherOps-Beta')`,
    params: [],
  });

  const res: any = await neonMcpClient.callTool("run_sql", {
    sql: `SELECT project_id, sprint_name, iteration_path
          FROM config_project_iterations
          WHERE sprint_name = 'TestIteration 001'
          ORDER BY project_id`,
    params: [],
  });

  const text = res?.content?.[0]?.text || "[]";
  console.log(text);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
