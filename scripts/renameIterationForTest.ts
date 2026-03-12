import dotenv from "dotenv";
import { neonMcpClient } from "../src/clients/neonMcpClient";

dotenv.config();

async function runSql(sql: string, params: any[] = []) {
  return neonMcpClient.callTool("run_sql", { sql, params });
}

async function renameIterationForTest() {
  const targetName = "TestIteration 001";

  // Rename the first sprint (2026-03-09 week) for both target projects.
  await runSql(
    `UPDATE config_project_iterations
     SET sprint_name = $3,
         iteration_path = CASE
           WHEN project_id = 'MotherOps-Alpha' THEN 'MotherOps-Alpha\\' || $3
           WHEN project_id = 'MotherOps-Beta' THEN 'MotherOps-Beta\\' || $3
           ELSE iteration_path
         END
     WHERE project_id IN ($1, $2)
       AND start_date::date = DATE '2026-03-09'`,
    ["MotherOps-Alpha", "MotherOps-Beta", targetName]
  );

  const verify: any = await runSql(
    `SELECT project_id, sprint_name, iteration_path, start_date, finish_date
     FROM config_project_iterations
     WHERE project_id IN ($1, $2)
       AND sprint_name = $3
     ORDER BY project_id`,
    ["MotherOps-Alpha", "MotherOps-Beta", targetName]
  );

  const text = verify?.content?.[0]?.text || "[]";
  const rows = JSON.parse(text);
  console.log(`Renamed rows: ${rows.length}`);
  console.log(rows);
}

renameIterationForTest().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
