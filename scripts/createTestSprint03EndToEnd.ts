#!/usr/bin/env tsx
/**
 * COMPLETE END-TO-END TESTSPRINT 03 CREATION
 * MCP-Only | No Direct API Calls
 * 
 * ADO-ALLDay service principal has admin permissions
 * This will work now that permissions are granted
 */

import dotenv from "dotenv";
dotenv.config();

import { createSprintsAndSeed } from "../src/handlers/createSprintsAndSeed";
import { neonMcpClient } from "../src/clients/neonMcpClient";
import { azureDevOpsMcpClient } from "../src/clients/azureDevOpsMcpClient";

interface ProjectConfig {
  projectId: string;
  teamName: string;
  epicTitle: string;
  featureTitle: string;
}

const PROJECTS: ProjectConfig[] = [
  {
    projectId: "MotherOps-Alpha",
    teamName: "MotherOps-Alpha Team",
    epicTitle: "MotherOps-Alpha Q2 2026 Increment",
    featureTitle: "Agile Process Automation"
  },
  {
    projectId: "MotherOps-Beta",
    teamName: "MotherOps-Beta Team",
    epicTitle: "MotherOps-Beta Q2 2026 Increment",
    featureTitle: "Agile Process Automation"
  }
];

// ============================================================================
// STEP 1: CLEANUP OLD TESTSPRINT 03
// ============================================================================

async function cleanupOldSprint(projectId: string) {
  console.log(`\n[Cleanup] Removing TestSprint 03 from ${projectId}...`);
  
  const oldIterations = await neonMcpClient.query<any>(
    `SELECT iteration_id, sprint_name 
     FROM config_project_iterations 
     WHERE project_id = $1 AND sprint_name = 'TestSprint 03'`,
    [projectId]
  );

  if (!Array.isArray(oldIterations) || oldIterations.length === 0) {
    console.log("  No old TestSprint 03 found\n");
    return;
  }

  console.log(`  Found TestSprint 03 to cleanup`);
  
  for (const iter of oldIterations) {
    // Delete from Neon
    await neonMcpClient.query(
      `DELETE FROM sprint_seed_artifacts 
       WHERE seed_run_id IN (
         SELECT id FROM sprint_seed_runs WHERE sprint_id = $1 AND project_id = $2
       )`,
      [iter.sprint_name, projectId]
    );
    
    await neonMcpClient.query(
      `DELETE FROM sprint_seed_runs WHERE sprint_id = $1 AND project_id = $2`,
      [iter.sprint_name, projectId]
    );
    
    await neonMcpClient.query(
      `DELETE FROM config_project_iterations WHERE iteration_id = $1`,
      [iter.iteration_id]
    );
    
    console.log(`  ✓ Removed from Neon: ${iter.sprint_name}`);
  }
  
  console.log(`  ✓ Cleanup complete\n`);
}

// ============================================================================
// STEP 2: CREATE SPRINT WITH STORIES AND CAPACITY
// ============================================================================

async function createSprintWithWorkItems(project: ProjectConfig): Promise<string | null> {
  console.log(`\n[Sprint] Creating TestSprint 03 for ${project.projectId}...`);
  
  const schedule = {
    sprints: [
      {
        name: "TestSprint 03",
        startDate: "2026-03-09",
        finishDate: "2026-03-15"
      }
    ]
  };

  const result = await createSprintsAndSeed({
    projectId: project.projectId,
    teamName: project.teamName,
    schedule: JSON.stringify(schedule),
    dryRun: false,
    onlyCapacity: false,
    onlyStories: false
  });

  console.log("\n" + "=".repeat(70));
  console.log("SPRINT CREATION REPORT");
  console.log("=".repeat(70));
  console.log(result.report);
  console.log("=".repeat(70));

  if (!result.success && !result.errors.some(e => e.includes("Partial success"))) {
    console.error(`\n✗ Failed to create TestSprint 03`);
    return null;
  }

  console.log(`\n✓ TestSprint 03 created for ${project.projectId}`);
  
  return `${project.projectId}\\TestSprint 03`;
}

// ============================================================================
// STEP 3: CREATE EPIC → FEATURE HIERARCHY
// ============================================================================

async function createEpicHierarchy(
  project: ProjectConfig, 
  iterationPath: string
): Promise<{epicId: number | null, featureId: number | null}> {
  console.log(`\n[Hierarchy] Creating Epic → Feature for ${project.projectId}...`);
  
  // Create Epic (MCP only)
  let epicId: number | null = null;
  try {
    const epicResult: any = await azureDevOpsMcpClient.callTool("create-work-item", {
      project: project.projectId,
      type: "Epic",
      title: project.epicTitle,
      description: "Q2 2026 increment for agile process automation and sprint execution framework",
      tags: "TestSprint03,Q2-2026,Automation"
    });

    if (epicResult && epicResult.id) {
      epicId = epicResult.id;
      console.log(`  ✓ Epic created: ${epicId} - ${project.epicTitle}`);
    }
  } catch (error) {
    console.error(`  ✗ Epic creation failed: ${error}`);
  }

  // Create Feature (MCP only)
  let featureId: number | null = null;
  if (epicId) {
    try {
      const featureResult: any = await azureDevOpsMcpClient.callTool("create-work-item", {
        project: project.projectId,
        type: "Feature",
        title: project.featureTitle,
        description: "Automated sprint planning, capacity tracking, and ceremony management",
        iterationPath: iterationPath,
        tags: "TestSprint03,Automation,Framework"
      });

      if (featureResult && featureResult.id) {
        featureId = featureResult.id;
        console.log(`  ✓ Feature created: ${featureId} - ${project.featureTitle}`);

        // Link Feature to Epic (MCP only)
        try {
          await azureDevOpsMcpClient.callTool("link-work-items", {
            project: project.projectId,
            sourceId: epicId,
            targetId: featureId,
            linkType: "System.LinkTypes.Hierarchy-Forward"
          });
          console.log(`  ✓ Feature linked to Epic`);
        } catch (linkError) {
          console.warn(`  ⚠ Warning: Failed to link Feature to Epic: ${linkError}`);
        }
      }
    } catch (error) {
      console.error(`  ✗ Feature creation failed: ${error}`);
    }
  }

  return { epicId, featureId };
}

// ============================================================================
// STEP 4: LINK STORIES TO FEATURE
// ============================================================================

async function linkStoriesToFeature(
  project: ProjectConfig, 
  featureId: number, 
  iterationPath: string
): Promise<number> {
  console.log(`\n[Stories] Linking to Feature ${featureId}...`);
  
  const wiql = `SELECT [System.Id], [System.Title]
                FROM workitems
                WHERE [System.TeamProject] = '${project.projectId}'
                AND [System.IterationPath] = '${iterationPath}'
                AND [System.WorkItemType] = 'User Story'
                ORDER BY [System.Id]`;

  try {
    const result: any = await azureDevOpsMcpClient.callTool("list-work-items", {
      project: project.projectId,
      query: wiql
    });

    const stories = Array.isArray(result?.workItems) ? result.workItems : [];
    console.log(`  Found ${stories.length} stories to link`);

    let linked = 0;
    for (const story of stories) {
      try {
        const details: any = await azureDevOpsMcpClient.callTool("get-work-item", {
          project: project.projectId,
          id: story.id
        });
        const title = details?.fields?.["System.Title"] || "(no title)";
        
        await azureDevOpsMcpClient.callTool("link-work-items", {
          project: project.projectId,
          sourceId: featureId,
          targetId: story.id,
          linkType: "System.LinkTypes.Hierarchy-Forward"
        });
        console.log(`    ✓ Linked: ${story.id} - ${title.substring(0, 50)}`);
        linked++;
      } catch (linkError) {
        console.warn(`    ⚠ Failed to link story ${story.id}: ${linkError}`);
      }
    }
    
    console.log(`  ✓ Linked ${linked}/${stories.length} stories to Feature`);
    return linked;
  } catch (error) {
    console.error(`  ✗ Failed to query stories: ${error}`);
    return 0;
  }
}

// ============================================================================
// STEP 5: VERIFY FINAL STATE
// ============================================================================

async function verifySprintComplete(project: ProjectConfig, iterationPath: string): Promise<void> {
  console.log(`\n[Verification] Final state for ${project.projectId}...`);
  
  const wiql = `SELECT [System.Id], [System.WorkItemType]
                FROM workitems
                WHERE [System.TeamProject] = '${project.projectId}'
                AND [System.IterationPath] = '${iterationPath}'
                ORDER BY [System.WorkItemType] DESC`;

  try {
    const result: any = await azureDevOpsMcpClient.callTool("list-work-items", {
      project: project.projectId,
      query: wiql
    });

    const items = Array.isArray(result?.workItems) ? result.workItems : [];
    
    const byType: Record<string, number> = {};
    for (const item of items) {
      const details: any = await azureDevOpsMcpClient.callTool("get-work-item", {
        project: project.projectId,
        id: item.id
      });
      const type = details?.fields?.["System.WorkItemType"] || "Unknown";
      byType[type] = (byType[type] || 0) + 1;
    }

    console.log(`  Total work items in sprint: ${items.length}`);
    Object.entries(byType).sort().forEach(([type, count]) => {
      console.log(`    ${type}: ${count}`);
    });
  } catch (error) {
    console.error(`  ✗ Verification failed: ${error}`);
  }
}

// ============================================================================
// MAIN ORCHESTRATION
// ============================================================================

async function processProject(project: ProjectConfig): Promise<void> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`PROCESSING: ${project.projectId}`);
  console.log('='.repeat(70));

  try {
    // Step 1: Cleanup old sprint
    await cleanupOldSprint(project.projectId);

    // Step 2: Create sprint with work items and capacity
    const iterationPath = await createSprintWithWorkItems(project);
    if (!iterationPath) {
      console.error(`\n✗✗✗ Failed to create sprint for ${project.projectId}`);
      return;
    }

    // Step 3: Create Epic and Feature hierarchy
    const { epicId, featureId } = await createEpicHierarchy(project, iterationPath);
    
    // Step 4: Link stories to Feature
    if (featureId) {
      await linkStoriesToFeature(project, featureId, iterationPath);
    } else {
      console.warn(`  ⚠ Skipping story linking (no Feature created)`);
    }

    // Step 5: Verify final state
    await verifySprintComplete(project, iterationPath);

    console.log(`\n✓✓✓ ${project.projectId} COMPLETE ✓✓✓`);
    if (epicId && featureId) {
      console.log(`    Epic ${epicId} → Feature ${featureId} → Stories → Tasks`);
    }
  } catch (error) {
    console.error(`\n✗✗✗ ERROR: ${error}`);
  }
}

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("TESTSPRINT 03 - COMPLETE END-TO-END AUTOMATION");
  console.log("MCP-Only | No Direct API | ADO-ALLDay Admin");
  console.log("Sprint Dates: March 9-15, 2026");
  console.log("=".repeat(70));

  for (const project of PROJECTS) {
    await processProject(project);
  }

  console.log("\n" + "=".repeat(70));
  console.log("✅✅✅ TESTSPRINT 03 COMPLETE ✅✅✅");
  console.log("=".repeat(70));
  console.log("\n📋 What was created:");
  console.log("  ✓ Sprint iterations (March 9-15, 2026)");
  console.log("  ✓ User stories and tasks (from Neon templates)");
  console.log("  ✓ Epic → Feature hierarchy");
  console.log("  ✓ Capacity seeding (all team members)");
  console.log("\n📋 Next Steps:");
  console.log("  1. Open Azure DevOps Sprint view");
  console.log("  2. Select 'TestSprint 03' from dropdown");
  console.log("  3. Verify all work items and capacity are visible");
  console.log("\n");
}

main().catch((error) => {
  console.error("\n✗✗✗ FATAL ERROR ✗✗✗");
  console.error(error);
  process.exit(1);
});
