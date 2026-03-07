import dotenv from "dotenv";
import { neonMcpClient } from "../src/clients/neonMcpClient";

dotenv.config();

async function main() {
  const sql = `
    INSERT INTO program_increments 
      (pi_id, project_id, pi_name, pi_description, start_date, end_date, duration_sprints, capability_goal, success_criteria)
    VALUES 
      (gen_random_uuid(), $1, $2, $3, $4::date, $5::date, $6, $7, $8::jsonb)
    ON CONFLICT (project_id, pi_name) DO NOTHING
    RETURNING pi_id;
  `;
  
  const params = [
    'TEST-PROJECT',
    'Test PI',
    'Test description',
    '2026-03-01',
    '2026-05-31',
    6,
    'Test capability',
    JSON.stringify({ test: true })
  ];
  
  const result: any = await neonMcpClient.callTool('run_sql', { sql, params });
  const textContent = result?.content?.[0]?.text || '';
  console.log('Raw result text:', textContent);
  if (!textContent.startsWith('[') && !textContent.startsWith('{')) {
    console.error('Neon returned non-JSON:', textContent);
    return;
  }
  console.log('Result:', JSON.parse(textContent));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
