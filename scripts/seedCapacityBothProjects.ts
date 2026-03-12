import 'dotenv/config';
import { createSprintsAndSeed } from '../src/handlers/createSprintsAndSeed.js';
import { neonMcpClient } from '../src/clients/neonMcpClient.js';
import { azureDevOpsMcpClient } from '../src/clients/azureDevOpsMcpClient.js';

interface CapacitySeedingConfig {
  projectId: string;
  teamName: string;
  scheduleJson: string;
}

/**
 * Repeatable, reusable capacity seeding for multiple projects
 * Uses MCP exclusively - no raw API calls
 * Seeds capacity for all team members with Azure identities in Neon
 */
async function seedCapacityForProjects(
  configs: CapacitySeedingConfig[],
  cleanup: boolean = true
): Promise<void> {
  console.log('=== REPEATABLE CAPACITY SEEDING PROCESS ===\n');
  
  for (const config of configs) {
    console.log(`\n[Seeding] Project: ${config.projectId}`);
    console.log(`[Seeding] Team: ${config.teamName}\n`);
    
    // Optional: Clean up old sprint data
    if (cleanup) {
      const sprintName = 'TestSprint 01';
      
      // Delete from Azure first
      console.log(`[Cleanup] Removing ${sprintName} from Azure DevOps...`);
      try {
        await azureDevOpsMcpClient.callTool('delete-iteration', {
          project: config.projectId,
          name: sprintName
        });
        console.log(`  ✓ Deleted from Azure`);
      } catch (err: any) {
        const msg = err.message || String(err);
        if (!msg.includes('does not exist') && !msg.includes('404')) {
          console.log(`  ⚠ Azure delete warning: ${msg}`);
        }
      }
      
      // Delete from Neon
      const oldRuns = await neonMcpClient.query<any>(
        `SELECT id FROM sprint_seed_runs WHERE sprint_id = $1 AND project_id = $2`,
        [sprintName, config.projectId]
      );
      
      if (Array.isArray(oldRuns) && oldRuns.length > 0) {
        console.log(`[Cleanup] Removing ${oldRuns.length} old seed run(s) from Neon...`);
        for (const run of oldRuns) {
          await neonMcpClient.query(
            `DELETE FROM sprint_seed_artifacts WHERE seed_run_id = $1`,
            [run.id]
          );
        }
        await neonMcpClient.query(
          `DELETE FROM sprint_seed_runs WHERE sprint_id = $1 AND project_id = $2`,
          [sprintName, config.projectId]
        );
      }
      
      const oldIter = await neonMcpClient.query<any>(
        `SELECT iteration_id FROM config_project_iterations WHERE sprint_name = $1 AND project_id = $2`,
        [sprintName, config.projectId]
      );
      
      if (Array.isArray(oldIter) && oldIter.length > 0) {
        console.log(`[Cleanup] Removing ${oldIter.length} old iteration(s) from Neon...`);
        await neonMcpClient.query(
          `DELETE FROM config_project_iterations WHERE sprint_name = $1 AND project_id = $2`,
          [sprintName, config.projectId]
        );
      }
    }
    
    // Create sprint and seed capacity
    console.log('[Seeding] Creating sprint and seeding capacity via createSprintsAndSeed...');
    
    const result = await createSprintsAndSeed({
      projectId: config.projectId,
      teamName: config.teamName,
      schedule: config.scheduleJson,
      dryRun: false
    });
    
    if (result.success || !result.success) {
      // Extract results from report
      const report = result.report || '';
      
      // Parse capacity results from logs
      const capacityMatch = report.match(/Capacity: ✓ \((\d+) seeded, (\d+) skipped\)/);
      const storiesMatch = report.match(/Stories: ✓ \((\d+) created, (\d+) skipped\)/);
      
      if (capacityMatch) {
        console.log(`[Result] Capacity: ${capacityMatch[1]} seeded, ${capacityMatch[2]} skipped`);
      }
      if (storiesMatch) {
        console.log(`[Result] Stories: ${storiesMatch[1]} created, ${storiesMatch[2]} skipped`);
      }
      
      if (result.errors && result.errors.length > 0) {
        console.log(`[Errors] ${result.errors.join('\n  ')}`);
      }
    }
  }
  
  console.log('\n=== SEEDING COMPLETE ===\n');
  
  // Final verification: Show all sprints created
  console.log('=== Verification: TestSprint 01 in Neon ===\n');
  const sprints = await neonMcpClient.query<any>(
    `SELECT sprint_name, project_id, iteration_id, created_at
     FROM config_project_iterations
     WHERE sprint_name = 'TestSprint 01'
     ORDER BY project_id`,
    []
  );
  
  for (const s of sprints) {
    console.log(`✓ ${s.project_id}: ${s.sprint_name} [${s.iteration_id.substring(0, 8)}...]`);
  }
}

/**
 * Main: Seed capacity for both Alpha and Beta projects
 */
async function main() {
  const schedule = {
    sprints: [{
      name: 'TestSprint 01',
      startDate: '2026-04-27',
      finishDate: '2026-05-03'
    }]
  };
  
  const configs: CapacitySeedingConfig[] = [
    {
      projectId: 'MotherOps-Alpha',
      teamName: 'MotherOps-Alpha Team',
      scheduleJson: JSON.stringify(schedule)
    },
    {
      projectId: 'MotherOps-Beta',
      teamName: 'MotherOps-Beta Team',
      scheduleJson: JSON.stringify(schedule)
    }
  ];
  
  await seedCapacityForProjects(configs, true);
}

main().catch(console.error);
