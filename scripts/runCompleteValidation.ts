/**
 * Complete live validation of sprint automation with capacity fix
 * Creates one test sprint, seeds capacity + stories, then verifies and cleans up
 */

import * as dotenv from "dotenv";
dotenv.config();

import { createSprintsAndSeed } from "../src/handlers/createSprintsAndSeed";
import { azureDevOpsMcpClient } from "../src/clients/azureDevOpsMcpClient";
import { neonMcpClient } from "../src/clients/neonMcpClient";

async function main() {
  const timestamp = Date.now();
  const sprintName = `CompleteValidation_${timestamp}`;
  
  console.log("\n=== COMPLETE VALIDATION RUN ===");
  console.log(`Sprint: ${sprintName}`);
  console.log(`Project: MotherOps-Alpha`);
  console.log(`Date: ${new Date().toISOString()}\n`);

  try {
    // Step 1: Create sprint with full seeding (capacity + stories)
    console.log("STEP 1: Creating sprint with capacity and stories...");
    const schedule = {
      sprints: [
        {
          name: sprintName,
          startDate: "2026-04-20",
          finishDate: "2026-04-26"
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

    console.log("\n✓ Sprint creation complete");
    console.log(JSON.stringify(result, null, 2));

    // Step 2: Verify capacity seeding
    console.log("\nSTEP 2: Verifying capacity seeding...");
    
    // Get iteration ID from Neon
    const iterations = await neonMcpClient.query<any>(
      `SELECT iteration_id FROM config_project_iterations 
       WHERE project_id = $1 AND sprint_name = $2`,
      ["MotherOps-Alpha", sprintName]
    );

    if (!Array.isArray(iterations) || iterations.length === 0) {
      throw new Error("Sprint iteration not found in DB");
    }

    const iterationId = iterations[0].iteration_id;
    console.log(`Iteration ID: ${iterationId}`);

    // List all capacities for the sprint
    const capacities = await azureDevOpsMcpClient.callTool("list-sprint-capacities", {
      project: "MotherOps-Alpha",
      team: "MotherOps-Alpha Team",
      iterationId: iterationId
    });

    console.log(`\n✓ Capacity count: ${capacities.count || 0}`);
    if (capacities.value && capacities.value.length > 0) {
      console.log("Sample capacities:");
      capacities.value.slice(0, 3).forEach((cap: any) => {
        console.log(`  - ${cap.teamMember?.displayName}: ${cap.activities?.[0]?.capacityPerDay || 0}h/day`);
      });
    }

    // Step 3: Verify story creation
    console.log("\nSTEP 3: Verifying story creation...");
    
    const artifacts = await neonMcpClient.query<any>(
      `SELECT artifact_type, work_item_title, work_item_id 
       FROM sprint_seed_artifacts 
       WHERE seed_run_id = (
         SELECT id FROM sprint_seed_runs 
         WHERE sprint_id = $1 
         ORDER BY created_at DESC LIMIT 1
       )
       ORDER BY artifact_type, work_item_title`,
      [iterationId]
    );

    if (Array.isArray(artifacts)) {
      const stories = artifacts.filter(a => a.artifact_type === 'story');
      console.log(`\n✓ Stories created: ${stories.length}`);
      
      // Check parent stories
      const parents = stories.filter(s => s.work_item_title === 'Meetings' || s.work_item_title === 'UnPlanned');
      console.log(`Parent stories: ${parents.length}`);
      
      for (const parent of parents) {
        const workItem = await azureDevOpsMcpClient.callTool("get-work-item", {
          id: parent.work_item_id,
          project: "MotherOps-Alpha"
        });
        
        const childCount = workItem.relations?.filter((r: any) => r.rel === 'System.LinkTypes.Hierarchy-Forward').length || 0;
        const description = workItem.fields?.["System.Description"] || "";
        const hasRequirement = description.includes("Project requirement context:");
        
        console.log(`  - ${workItem.fields?.["System.Title"]}: ${childCount} children, requirement=${hasRequirement}`);
      }
    }

    // Summary
    console.log("\n=== VALIDATION SUMMARY ===");
    console.log(`✓ Sprint created: ${sprintName}`);
    console.log(`✓ Iteration ID: ${iterationId}`);
    console.log(`✓ Capacity seeded: ${capacities.count || 0} members`);
    console.log(`✓ Stories created: ${artifacts?.filter(a => a.artifact_type === 'story').length || 0}`);
    console.log(`✓ Capacity artifacts: ${artifacts?.filter(a => a.artifact_type === 'capacity').length || 0}`);

    // Step 4: Cleanup
    console.log("\nSTEP 4: Cleaning up validation artifacts...");
    
    // Delete work items
    if (Array.isArray(artifacts)) {
      const workItems = artifacts
        .filter(a => a.work_item_id)
        .map(a => a.work_item_id);
      
      console.log(`Deleting ${workItems.length} work items...`);
      for (const id of workItems) {
        await azureDevOpsMcpClient.callTool("delete-work-item", {
          id,
          project: "MotherOps-Alpha",
          hardDelete: true
        });
      }
      console.log("✓ Work items deleted");
    }

    // Delete iteration
    await azureDevOpsMcpClient.callTool("delete-iteration", {
      project: "MotherOps-Alpha",
      name: sprintName
    });
    console.log("✓ Iteration deleted");

    // Delete Neon metadata
    await neonMcpClient.query(
      `DELETE FROM config_project_iterations WHERE project_id = $1 AND sprint_name = $2`,
      ["MotherOps-Alpha", sprintName]
    );
    console.log("✓ Neon metadata deleted");

    console.log("\n=== VALIDATION COMPLETE ===\n");

  } catch (error) {
    console.error("\n✗ VALIDATION FAILED:", error);
    console.error("\nPartial cleanup may be required for sprint:", sprintName);
    throw error;
  }
}

main().catch(console.error);
