import dotenv from "dotenv";
import { neonMcpClient } from "../src/clients/neonMcpClient";

dotenv.config();

async function main() {
  const sqlDirect = `
    INSERT INTO config_projects 
      (project_id, project_name, description, organization, azure_devops_url, created_at, updated_at)
    VALUES 
      ('MotherOps-Hawaii', 'Family Trip Hawaii 2026', 'Hawaii family vacation planning project', 'MotherOps', 'https://dev.azure.com/MotherOps/MotherOps-Hawaii', NOW(), NOW())
    ON CONFLICT (project_id) DO NOTHING
    RETURNING project_id;
  `;

  const result: any = await neonMcpClient.callTool('run_sql', { sql: sqlDirect });
  const textContent = result?.content?.[0]?.text || '';
  console.log('Result:', textContent);
  if (textContent.startsWith('[') || textContent.startsWith('{')) {
    console.log('Parsed:', JSON.parse(textContent));
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
