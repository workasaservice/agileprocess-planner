import 'dotenv/config';
import { createSprintsAndSeed } from '../src/handlers/createSprintsAndSeed.js';
import { neonMcpClient } from '../src/clients/neonMcpClient.js';

async function main() {
  console.log('=== Cleanup OLD TestSprint 01 ===\n');
  
  // Delete old TestSprint 01 artifacts
  const oldSeedRuns = await neonMcpClient.query<any>(
    `SELECT id FROM sprint_seed_runs WHERE sprint_id = $1 AND project_id = $2`,
    ['TestSprint 01', 'MotherOps-Alpha']
  );
  
  if (Array.isArray(oldSeedRuns) && oldSeedRuns.length > 0) {
    for (const run of oldSeedRuns) {
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
  
  console.log('✓ Cleaned up old artifacts\n');
  
  console.log('=== Creating TestSprint 01 with Neon-backed capacity ===\n');
  
  const schedule = {
    sprints: [{
      name: 'TestSprint 01',
      startDate: '2026-04-27',
      finishDate: '2026-05-03'
    }]
  };
  
  const result = await createSprintsAndSeed({
    projectId: 'MotherOps-Alpha',
    teamId: 'MotherOps-Alpha Team',
    schedule,
    dryRun: false,
    useNeonIdentities: true  // Use neon identities instead of resolving from Azure API
  });
  
  console.log('\n=== Result ===');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
