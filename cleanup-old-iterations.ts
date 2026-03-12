import dotenv from "dotenv";
import { neonMcpClient } from "./src/clients/neonMcpClient";

dotenv.config();

async function main() {
  console.log("🧹 Cleaning up old Sprint iterations...\n");

  // Delete old Sprint 1-6 iterations
  const result = await neonMcpClient.query(
    `DELETE FROM config_project_iterations 
     WHERE project_id IN ('MotherOps-Alpha', 'MotherOps-Beta')
     AND sprint_name IN ('Sprint 1', 'Sprint 2', 'Sprint 3', 'Sprint 4', 'Sprint 5', 'Sprint 6')
     RETURNING sprint_name, project_id`
  );

  console.log(`✅ Deleted ${result.length} old Sprint iterations:`);
  result.forEach((r: any) => console.log(`   - ${r.project_id}: ${r.sprint_name}`));

  // Verify remaining iterations
  const remaining = await neonMcpClient.query(
    `SELECT project_id, COUNT(*) as count
     FROM config_project_iterations 
     WHERE project_id IN ('MotherOps-Alpha', 'MotherOps-Beta')
     GROUP BY project_id
     ORDER BY project_id`
  );

  console.log("\n📊 Remaining iterations:");
  console.table(remaining);

  console.log("\n✅ Cleanup complete!");
}

main().catch(console.error);
