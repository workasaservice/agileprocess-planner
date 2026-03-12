import dotenv from "dotenv";
import { neonMcpClient } from "./src/clients/neonMcpClient";

dotenv.config();

async function main() {
  console.log("🔧 Fixing project names in Neon database...\n");

  // Update MotherOps-Alpha
  await neonMcpClient.query(
    `UPDATE config_projects 
     SET project_name = $1,
         project_full_name = $2,
         updated_at = NOW()
     WHERE project_id = $3`,
    ["MotherOps-Alpha", "MotherOps-Alpha", "MotherOps-Alpha"]
  );
  console.log("✅ Updated MotherOps-Alpha");

  // Update MotherOps-Beta
  await neonMcpClient.query(
    `UPDATE config_projects 
     SET project_name = $1,
         project_full_name = $2,
         updated_at = NOW()
     WHERE project_id = $3`,
    ["MotherOps-Beta", "MotherOps-Beta", "MotherOps-Beta"]
  );
  console.log("✅ Updated MotherOps-Beta");

  // Verify
  console.log("\n📊 Current project configuration:");
  const projects = await neonMcpClient.query(
    `SELECT project_id, project_name, project_full_name, team_name 
     FROM config_projects 
     WHERE project_id IN ('MotherOps-Alpha', 'MotherOps-Beta')
     ORDER BY project_id`
  );

  console.table(projects);
  console.log("\n✅ Project names fixed successfully!");
}

main().catch(console.error);
