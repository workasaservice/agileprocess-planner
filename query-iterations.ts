import dotenv from "dotenv";
import { neonMcpClient } from "./src/clients/neonMcpClient";

dotenv.config();

async function main() {
  console.log("🔍 Querying iterations for MotherOps projects...\n");

  const iterations = await neonMcpClient.query(
    `SELECT 
       project_id,
       sprint_name,
       iteration_path,
       start_date,
       finish_date
     FROM config_project_iterations 
     WHERE project_id IN ('MotherOps-Alpha', 'MotherOps-Beta')
     ORDER BY project_id, start_date`
  );

  console.log(`Found ${iterations.length} iterations\n`);
  
  const alphaIterations = iterations.filter((i: any) => i.project_id === 'MotherOps-Alpha');
  const betaIterations = iterations.filter((i: any) => i.project_id === 'MotherOps-Beta');

  console.log(`\n📋 MotherOps-Alpha: ${alphaIterations.length} iterations`);
  alphaIterations.forEach((iter: any, idx: number) => {
    console.log(`  ${idx + 1}. ${iter.sprint_name}`);
    console.log(`     Path: ${iter.iteration_path}`);
    console.log(`     Dates: ${iter.start_date} to ${iter.finish_date}\n`);
  });

  console.log(`\n📋 MotherOps-Beta: ${betaIterations.length} iterations`);
  betaIterations.forEach((iter: any, idx: number) => {
    console.log(`  ${idx + 1}. ${iter.sprint_name}`);
    console.log(`     Path: ${iter.iteration_path}`);
    console.log(`     Dates: ${iter.start_date} to ${iter.finish_date}\n`);
  });
}

main().catch(console.error);
