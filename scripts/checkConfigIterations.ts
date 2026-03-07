import dotenv from "dotenv";
import { neonMcpClient } from "../src/clients/neonMcpClient";

dotenv.config();

async function main() {
  const iterResult: any = await neonMcpClient.callTool('run_sql', {
    sql: `SELECT id, project_id, sprint_name FROM config_project_iterations ORDER BY project_id, sprint_name LIMIT 50;`
  });
  const rows = JSON.parse(iterResult?.content?.[0]?.text || '[]');
  console.log('Config project iterations:', rows);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
