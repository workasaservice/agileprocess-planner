#!/usr/bin/env tsx
/**
 * Add Epic and Feature hierarchy to existing TestSprint 02 work items
 * MCP-only approach
 */

import dotenv from "dotenv";
dotenv.config();

import { azureDevOpsMcpClient } from "../src/clients/azureDevOpsMcpClient";

interface ProjectConfig {
  projectId: string;
  epicTitle: string;
  featureTitle: string;
}

const PROJECTS: ProjectConfig[] = [
  {
    projectId: "MotherOps-Alpha",
    epicTitle: "MotherOps-Alpha Product Increment",
    featureTitle: "Sprint Execution Framework"
  },
  {
    projectId: "MotherOps-Beta",
    epicTitle: "MotherOps-Beta Product Increment",
    featureTitle: "Sprint Execution Framework"
  }
];

async function createEpic(project: ProjectConfig): Promise<number | null> {
  console.log(`\n[Epic] Creating for ${project.projectId}...`);
  
  try {
    const epicResult: any = await azureDevOpsMcpClient.callTool("create-work-item", {
      project: project.projectId,
      type: "Epic",
      title: project.epicTitle,
      description: "Top-level epic for sprint execution framework and team ceremonies",
      tags: "TestSprint02,Automation,Framework"
    });

    if (epicResult && epicResult.id) {
      console.log(`✓ Epic created: ${project.epicTitle} (ID: ${epicResult.id})`);
      return epicResult.id;
    }
    
    console.error("✗ Failed to create epic: No ID returned");
    return null;
  } catch (error) {
    console.error(`✗ Failed to create epic: ${error}`);
    return null;
  }
}

async function createFeature(project: ProjectConfig, epicId: number, iterationPath: string): Promise<number | null> {
  console.log(`\n[Feature] Creating under Epic ${epicId}...`);
  
  try {
    const featureResult: any = await azureDevOpsMcpClient.callTool("create-work-item", {
      project: project.projectId,
      type: "Feature",
      title: project.featureTitle,
      description: "Sprint execution framework including ceremonies, capacity tracking, and unplanned work",
      iterationPath: iterationPath,
      tags: "TestSprint02,Automation,Framework"
    });

    if (!featureResult || !featureResult.id) {
      console.error("✗ Failed to create feature: No ID returned");
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
      console.warn(`⚠ Warning: Failed to link feature to epic: ${linkError}`);
    }

    return featureId;
  } catch (error) {
    console.error(`✗ Failed to create feature: ${error}`);
    return null;
  }
}

async function linkStoriesToFeature(project: ProjectConfig, featureId: number, iterationPath: string): Promise<void> {
  console.log(`\n[Stories] Linking to Feature ${featureId}...`);
  
  try {
    const wiql = `SELECT [System.Id], [System.Title], [System.WorkItemType]
                  FROM workitems
                  WHERE [System.TeamProject] = '${project.projectId}'
                  AND [System.IterationPath] = '${iterationPath}'
                  AND [System.WorkItemType] = 'User Story'
                  ORDER BY [System.Id]`;

    const result: any = await azureDevOpsMcpClient.callTool("list-work-items", {
      project: project.projectId,
      query: wiql
    });

    const stories = Array.isArray(result?.workItems) ? result.workItems : [];
    console.log(`Found ${stories.length} stories to link`);

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
        console.log(`  ✓ Linked story ${story.id}: ${title}`);
        linked++;
      } catch (linkError) {
        console.warn(`  ⚠ Warning: Failed to link story ${story.id}: ${linkError}`);
      }
    }
    
    console.log(`✓ Linked ${linked}/${stories.length} stories to feature`);
  } catch (error) {
    console.error(`✗ Failed to link stories: ${error}`);
  }
}

async function processProject(project: ProjectConfig): Promise<void> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`ADDING EPIC HIERARCHY TO: ${project.projectId}`);
  console.log('='.repeat(70));

  const iterationPath = `${project.projectId}\\TestSprint 02`;

  // Step 1: Create Epic
  const epicId = await createEpic(project);
  if (!epicId) {
    console.error(`✗✗✗ Cannot proceed without epic for ${project.projectId}`);
    return;
  }

  // Step 2: Create Feature under Epic
  const featureId = await createFeature(project, epicId, iterationPath);
  if (!featureId) {
    console.error(`✗✗✗ Cannot link stories without feature for ${project.projectId}`);
    return;
  }

  // Step 3: Link existing stories to Feature
  await linkStoriesToFeature(project, featureId, iterationPath);

  console.log(`\n✓✓✓ ${project.projectId} HIERARCHY COMPLETE ✓✓✓`);
  console.log(`    Epic ${epicId} → Feature ${featureId} → 2 Stories (Meetings, UnPlanned)`);
}

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("TESTSPRINT 02 - ADD EPIC/FEATURE HIERARCHY");
  console.log("MCP-Only Automation");
  console.log("=".repeat(70));

  for (const project of PROJECTS) {
    await processProject(project);
  }

  console.log("\n" + "=".repeat(70));
  console.log("EPIC HIERARCHY CREATION COMPLETE");
  console.log("=".repeat(70) + "\n");
}

main().catch((error) => {
  console.error("\n✗✗✗ FATAL ERROR ✗✗✗");
  console.error(error);
  process.exit(1);
});
