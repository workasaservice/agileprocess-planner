import 'dotenv/config';  
import { neonMcpClient } from '../src/clients/neonMcpClient.js';
import { createSprintsAndSeed } from '../src/handlers/createSprintsAndSeed.js';

async function main() {
  console.log('=== Delete OLD TestSprint 01 ===\n');
  
  // Clean up old artifacts
  const oldRuns = await neonMcpClient.query<any>(
    `SELECT id FROM sprint_seed_runs WHERE sprint_id = $1 AND project_id = $2`,
    ['TestSprint 01', 'MotherOps-Alpha']
  );
  
  if (Array.isArray(oldRuns) && oldRuns.length > 0) {
    for (const run of oldRuns) {
      await neonMcpClient.query(
        `DELETE FROM sprint_seed_artifacts WHERE seed_run_id = $1`,
        [run.id]
      );
    }
    await neonMcpClient.query(
      `DELETE FROM sprint_seed_runs WHERE sprint_id = $1 AND project_id = $2`,
      ['TestSprint 01', 'MotherOps-Alpha']
    );
  }
  
  const oldIter = await neonMcpClient.query<any>(
    `SELECT iteration_id FROM config_project_iterations WHERE sprint_name = $1`,
    ['TestSprint 01']
  );
  
  if (Array.isArray(oldIter) && oldIter.length > 0) {
    await neonMcpClient.query(
      `DELETE FROM config_project_iterations WHERE sprint_name = $1`,
      ['TestSprint 01']
    );
  }
  
  console.log('✓ Cleaned up old data\n');
  
  console.log('=== Creating TestSprint 01 with Full Capacity Seeding ===\n');
  
  const schedule = {
    sprints: [{
      name: 'TestSprint 01',
      startDate: '2026-04-27',
      finishDate: '2026-05-03'
    }]
  };
  
  const result = await createSprintsAndSeed({
    projectId: 'MotherOps-Alpha',
    teamName: 'MotherOps-Alpha Team',
    schedule: JSON.stringify(schedule),
    dryRun: false
  });
  
  console.log('\n=== RESULT ===');
  if (result && typeof result === 'string') {
    console.log(result);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch(console.error);
