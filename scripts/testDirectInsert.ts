import dotenv from "dotenv";
import { neonMcpClient } from "../src/clients/neonMcpClient";

dotenv.config();

async function main() {
  const sqlDirect = `
    INSERT INTO program_increments 
      (pi_id, project_id, pi_name, pi_description, start_date, end_date, duration_sprints, capability_goal, success_criteria)
    VALUES 
      (gen_random_uuid(), 'MotherOps-Hawaii', 'TEST PI Direct', 'Test direct insert', '2026-03-01'::date, '2026-05-31'::date, 6, 'Test capability', '{"test": true}'::jsonb)
    ON CONFLICT (project_id, pi_name) DO NOTHING
    RETURNING pi_id;
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
