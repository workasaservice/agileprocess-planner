/**
 * Create TestSprint 01 using existing MCP-based automation
 * Uses create-sprints-and-seed handler which has full MCP + Neon integration
 */

import * as dotenv from "dotenv";
dotenv.config();

import { createSprintsAndSeed } from "../src/handlers/createSprintsAndSeed";
import { neonMcpClient } from "../src/clients/neonMcpClient";

async function cleanupOldIterations() {
  console.log("\n=== CLEANING UP OLD ITERATIONS ===\n");
  
  // Get all old iterations from Neon
  const oldIterations = await neonMcpClient.query<any>(
    `SELECT iteration_id, sprint_name, iteration_path 
     FROM config_project_iterations 
     WHERE project_id = $1
     ORDER BY created_at DESC`,
    ["MotherOps-Alpha"]
  );

  if (!Array.isArray(oldIterations) || oldIterations.length === 0) {
    console.log("No old iterations found");
    return;
  }

  console.log(`Found ${oldIterations.length} old iterations to clean up`);
  
  for (const iter of oldIterations) {
    console.log(`  Removing: ${iter.sprint_name}`);
    
    // Delete seed artifacts (using sprint_id which is the sprint_name)
    await neonMcpClient.query(
      `DELETE FROM sprint_seed_artifacts 
       WHERE seed_run_id IN (
         SELECT id FROM sprint_seed_runs WHERE sprint_id = $1 AND project_id = $2
       )`,
      [iter.sprint_name, "MotherOps-Alpha"]
    );
    
    // Delete seed runs (using sprint_id)
    await neonMcpClient.query(
      `DELETE FROM sprint_seed_runs WHERE sprint_id = $1 AND project_id = $2`,
      [iter.sprint_name, "MotherOps-Alpha"]
    );
    
    // Delete iteration metadata (using iteration_id)
    await neonMcpClient.query(
      `DELETE FROM config_project_iterations WHERE iteration_id = $1`,
      [iter.iteration_id]
    );
    
    console.log(`  ✓ Removed from Neon: ${iter.sprint_name}`);
  }
  
  console.log(`\n✓ Cleanup complete: ${oldIterations.length} iterations removed from Neon\n`);
}

async function main() {
  console.log("\n=== TESTSPRINT 01 CREATION ===");
  console.log("Using MCP-based automation with Neon seeding\n");

  try {
    // Step 1: Clean up old iterations
    await cleanupOldIterations();

    // Step 2: Create TestSprint 01 with full automation
    console.log("\n=== CREATING TESTSPRINT 01 ===\n");
    
    const schedule = {
      sprints: [
        {
          name: "TestSprint 01",
          startDate: "2026-04-27",
          finishDate: "2026-05-03"
        }
      ]
    };

    const result = await createSprintsAndSeed({
      projectId: "MotherOps-Alpha",
      teamName: "MotherOps-Alpha Team",
      schedule: JSON.stringify(schedule),
      dryRun: false,
      onlyCapacity: false,
      onlyStories: false
    });

    console.log("\n=== CREATION COMPLETE ===");
    console.log(result.report);

    if (result.success || result.errors.some(e => e.includes("Partial success"))) {
      console.log("\n✓ TestSprint 01 created successfully");
      
      // Verify what was created
      const verification = await neonMcpClient.query<any>(
        `SELECT 
           i.sprint_name,
           i.iteration_id,
           (SELECT COUNT(*) FROM sprint_seed_artifacts 
            WHERE seed_run_id IN (
              SELECT id FROM sprint_seed_runs 
              WHERE sprint_id = i.sprint_name AND project_id = i.project_id
            ) AND artifact_type = 'story') as story_count,
           (SELECT COUNT(*) FROM sprint_seed_artifacts 
            WHERE seed_run_id IN (
              SELECT id FROM sprint_seed_runs 
              WHERE sprint_id = i.sprint_name AND project_id = i.project_id
            ) AND artifact_type = 'capacity') as capacity_count
         FROM config_project_iterations i
         WHERE i.sprint_name = $1 AND i.project_id = $2`,
        ["TestSprint 01", "MotherOps-Alpha"]
      );

      if (Array.isArray(verification) && verification.length > 0) {
        const v = verification[0];
        console.log("\n=== VERIFICATION ===");
        console.log(`Sprint Name: ${v.sprint_name}`);
        console.log(`Iteration ID: ${v.iteration_id}`);
        console.log(`Stories/Tasks Created: ${v.story_count}`);
        console.log(`Capacity Seeded: ${v.capacity_count} members`);
      }
    } else {
      console.error("\n✗ Creation failed");
      console.error(result.errors);
    }

  } catch (error) {
    console.error("\n✗ ERROR:", error);
    throw error;
  }
}

main().catch(console.error);
