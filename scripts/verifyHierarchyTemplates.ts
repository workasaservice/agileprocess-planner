import dotenv from "dotenv";
import { neonMcpClient } from "../src/clients/neonMcpClient";

dotenv.config();

async function verify() {
  const sql = `
    SELECT project_id, template_name, work_item_type, parent_template_id, is_active, story_order
    FROM sprint_story_templates
    WHERE project_id IN ('MotherOps-Alpha','MotherOps-Beta')
      AND (
        template_name LIKE 'meetings-%'
        OR template_name LIKE 'unplanned-%'
        OR template_name IN ('meetings-parent','unplanned-parent')
      )
    ORDER BY project_id, story_order, template_name
  `;

  const r: any = await neonMcpClient.callTool("run_sql", { sql, params: [] });
  const text = r?.content?.[0]?.text || "[]";
  const rows = JSON.parse(text);

  console.log(`rows=${rows.length}`);
  console.log(rows.slice(0, 8));
}

verify().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
