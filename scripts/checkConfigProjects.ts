import dotenv from "dotenv";
import { neonMcpClient } from "../src/clients/neonMcpClient";

dotenv.config();

async function main() {
  const result: any = await neonMcpClient.callTool('run_sql', {
    sql: `SELECT project_id, project_name FROM config_projects ORDER BY project_id;`
  });
  const rows = JSON.parse(result?.content?.[0]?.text || '[]');
  console.log('Config projects:', rows);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
