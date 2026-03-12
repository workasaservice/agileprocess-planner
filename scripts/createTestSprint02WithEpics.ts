#!/usr/bin/env tsx
/**
 * Create TestSprint 02 with full Epic-level hierarchy
 * Demonstrates complete MCP-only + Neon-seeded automation
 * 
 * Hierarchy:
 * Epic → Features → Stories (Meetings, UnPlanned) → Tasks
 */

import * as dotenv from "dotenv";
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
    epicTitle: "MotherOps-Alpha Product Increment",
    featureTitle: "Sprint Execution Framework"
  },
  {
    projectId: "MotherOps-Beta",
    teamName: "MotherOps-Beta Team",
    epicTitle: "MotherOps-Beta Product Increment",
    featureTitle: "Sprint Execution Framework"
  }
];

async function cleanupOldIterations(projectId: string) {
  console.log(`\n=== CLEANING UP OLD ITERATIONS FOR ${projectId} ===\n`);
  
  const oldIterations = await neonMcpClient.query<any>(
    `SELECT iteration_id, sprint_name, iteration_path 
     FROM config_project_iterations 
     WHERE project_id = $1
     ORDER BY created_at DESC`,
    [projectId]
  );

  if (!Array.isArray(oldIterations) || oldIterations.length === 0) {
    console.log("No old iterations found");
    return;
  }

  console.log(`Found ${oldIterations.length} old iterations to clean up`);
  
  for (const iter of oldIterations) {
    console.log(`  Removing: ${iter.sprint_name}`);
    
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
  
  console.log(`\n✓ Cleanup complete: ${oldIterations.length} iterations removed\n`);
}

async function createEpic(project: ProjectConfig): Promise<number | null> {
  console.log(`\n=== CREATING EPIC FOR ${project.projectId} ===\n`);
  
  try {
    const epicResult: any = await azureDevOpsMcpClient.callTool("create-work-item", {
      project: project.projectId,
      type: "Epic",
      title: project.epicTitle,
      description: "Top-level epic for sprint execution framework and team ceremonies"
    });

    if (epicResult && epicResult.id) {
      console.log(`✓ Epic created: ${project.epicTitle} (ID: ${epicResult.id})`);
      return epicResult.id;
    }
    
    console.error("Failed to create epic: No ID returned");
    return null;
  } catch (error) {
    console.error(`Failed to create epic: ${error}`);
    return null;
  }
}

async function createFeature(project: ProjectConfig, epicId: number, iterationPath: string): Promise<number | null> {
  console.log(`\n=== CREATING FEATURE UNDER EPIC ${epicId} ===\n`);
  
  try {
    const featureResult: any = await azureDevOpsMcpClient.callTool("create-work-item", {
      project: project.projectId,
      type: "Feature",
      title: project.featureTitle,
      description: "Sprint execution framework including ceremonies, capacity tracking, and unplanned work",
      iterationPath: iterationPath
    });

    if (!featureResult || !featureResult.id) {
      console.error("Failed to create feature: No ID returned");
      return null;
    }

    const featureId = featureResult.id;
    console.log(`✓ Feature created: ${project.featureTitle} (ID: ${featureId})`);

    // Link feature to epic
    try {
      await azureDevOpsMcpClient.callTool("link-work-items", {
        project: project.projectId,
        sourceId: epicId,
        targetId: featureId,
        linkType: "System.LinkTypes.Hierarchy-Forward"
      });
      console.log(`✓ Feature linked to Epic ${epicId}`);
    } catch (linkError) {
      console.warn(`Warning: Failed to link feature to epic: ${linkError}`);
    }

    return featureId;
  } catch (error) {
    console.error(`Failed to create feature: ${error}`);
    return null;
  }
}

async function linkStoriesToFeature(project: ProjectConfig, featureId: number, iterationPath: string): Promise<void> {
  console.log(`\n=== LINKING STORIES TO FEATURE ${featureId} ===\n`);
  
  try {
    // Find Meetings and UnPlanned stories
    const wiql = `SELECT [System.Id], [System.Title], [System.WorkItemType]
                  FROM workitems
                  WHERE [System.TeamProject] = '${project.projectId}'
                  AND [System.IterationPath] = '${iterationPath}'
                  AND [System.WorkItemType] = 'User Story'
                  AND ([System.Title] CONTAINS 'Meetings' OR [System.Title] CONTAINS 'UnPlanned')`;

    const result: any = await azureDevOpsMcpClient.callTool("list-work-items", {
      project: project.projectId,
      query: wiql
    });

    const stories = Array.isArray(result?.workItems) ? result.workItems : [];
    console.log(`Found ${stories.length} parent stories to link`);

    for (const story of stories) {
      try {
        await azureDevOpsMcpClient.callTool("link-work-items", {
          project: project.projectId,
          sourceId: featureId,
          targetId: story.id,
          linkType: "System.LinkTypes.Hierarchy-Forward"
        });
        console.log(`  ✓ Linked story ${story.id} to feature`);
      } catch (linkError) {
        console.warn(`  Warning: Failed to link story ${story.id}: ${linkError}`);
      }
    }
  } catch (error) {
    console.error(`Failed to link stories: ${error}`);
  }
}

async function processProject(project: ProjectConfig): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`PROCESSING PROJECT: ${project.projectId}`);
  console.log('='.repeat(60));

  try {
    // Step 1: Clean up old iterations
    await cleanupOldIterations(project.projectId);

    // Step 2: Create TestSprint 02 iteration with stories and capacity
    console.log(`\n=== CREATING TESTSPRINT 02 FOR ${project.projectId} ===\n`);
    
    const schedule = {
      sprints: [
        {
          name: "TestSprint 02",
          startDate: "2026-05-04",
          finishDate: "2026-05-10"
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

    console.log("\n=== SPRINT CREATION REPORT ===");
    console.log(result.report);

    if (result.success || result.errors.some(e => e.includes("Partial success"))) {
      console.log(`\n✓ TestSprint 02 created for ${project.projectId} (${result.success ? 'full success' : 'partial success - stories created'})`);
    } else {
      console.error(`\n✗ Failed to create TestSprint 02 for ${project.projectId}`);
      console.error("Errors:", result.errors);
      console.log("\nContinuing with Epic creation anyway...");
    }

    // Step 3: Create Epic
    const epicId = await createEpic(project);
    if (!epicId) {
      console.error("Cannot create feature without epic, skipping hierarchy");
      return;
    }

    // Step 4: Create Feature under Epic
    const iterationPath = `${project.projectId}\\TestSprint 02`;
    const featureId = await createFeature(project, epicId, iterationPath);
    if (!featureId) {
      console.error("Cannot link stories without feature, skipping");
      return;
    }

    // Step 5: Link existing stories to Feature
    await linkStoriesToFeature(project, featureId, iterationPath);

    // Step 6: Verify final state
    console.log(`\n=== VERIFICATION FOR ${project.projectId} ===\n`);
    await verifyWorkItems(project.projectId, iterationPath);

    console.log(`\n✓✓✓ ${project.projectId} COMPLETE ✓✓✓\n`);
  } catch (error) {
    console.error(`\n✗✗✗ ERROR PROCESSING ${project.projectId} ✗✗✗`);
    console.error(error);
  }
}

async function verifyWorkItems(projectId: string, iterationPath: string): Promise<void> {
  const wiql = `SELECT [System.Id], [System.Title], [System.WorkItemType]
                FROM workitems
                WHERE [System.TeamProject] = '${projectId}'
                AND ([System.IterationPath] = '${iterationPath}' OR [System.WorkItemType] = 'Epic')
                ORDER BY [System.WorkItemType] DESC, [System.Id]`;

  try {
    const result: any = await azureDevOpsMcpClient.callTool("list-work-items", {
      project: projectId,
      query: wiql
    });

    const items = Array.isArray(result?.workItems) ? result.workItems : [];
    console.log(`Total work items: ${items.length}`);

    const byType: Record<string, number> = {};
    for (const item of items) {
      const details: any = await azureDevOpsMcpClient.callTool("get-work-item", {
        project: projectId,
        id: item.id
      });
      const type = details?.fields?.["System.WorkItemType"] || "Unknown";
      const title = details?.fields?.["System.Title"] || "(no title)";
      
      byType[type] = (byType[type] || 0) + 1;
      console.log(`  [${type}] ${item.id}: ${title}`);
    }

    console.log("\nSummary by type:");
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
  } catch (error) {
    console.error(`Verification failed: ${error}`);
  }
}

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("TESTSPRINT 02 - FULL EPIC HIERARCHY CREATION");
  console.log("MCP-Only + Neon-Seeded Automation");
  console.log("=".repeat(60));

  for (const project of PROJECTS) {
    await processProject(project);
  }

  console.log("\n" + "=".repeat(60));
  console.log("ALL PROJECTS PROCESSED");
  console.log("=".repeat(60) + "\n");
}

main().catch((error) => {
  console.error("\n✗✗✗ FATAL ERROR ✗✗✗");
  console.error(error);
  process.exit(1);
});
