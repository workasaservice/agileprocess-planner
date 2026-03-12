#!/usr/bin/env tsx
/**
 * Add Epic → Feature hierarchy to TestSprint 03
 * Links all stories to the Feature
 */

import dotenv from "dotenv";
dotenv.config();

import { azureDevOpsMcpClient } from "../src/clients/azureDevOpsMcpClient";

interface ProjectConfig {
  projectId: string;
  iterationPath: string;
  epicTitle: string;
  featureTitle: string;
}

const PROJECTS: ProjectConfig[] = [
  {
    projectId: "MotherOps-Alpha",
    iterationPath: "MotherOps-Alpha\\TestSprint 03",
    epicTitle: "MotherOps-Alpha Q2 2026 Increment",
    featureTitle: "Agile Process Automation"
  },
  {
    projectId: "MotherOps-Beta",
    iterationPath: "MotherOps-Beta\\TestSprint 03",
    epicTitle: "MotherOps-Beta Q2 2026 Increment",
    featureTitle: "Agile Process Automation"
  }
];

async function createEpicAndFeature(project: ProjectConfig) {
  console.log(`\n━━━ ${project.projectId} ━━━`);
  
  // Create Epic (no iteration path for Epics)
  console.log(`\n[Epic] Creating "${project.epicTitle}"...`);
  const epicResult: any = await azureDevOpsMcpClient.callTool("create-work-item", {
    project: project.projectId,
    type: "Epic",
    title: project.epicTitle,
    description: "Q2 2026 increment for agile process automation and sprint execution framework",
    tags: "TestSprint03,Q2-2026,Automation"
  });

  const epicId = epicResult?.id;
  console.log(`  ✓ Epic ${epicId}: ${project.epicTitle}`);

  // Create Feature under Epic
  console.log(`\n[Feature] Creating "${project.featureTitle}"...`);
  const featureResult: any = await azureDevOpsMcpClient.callTool("create-work-item", {
    project: project.projectId,
    type: "Feature",
    title: project.featureTitle,
    description: "Automated sprint planning, capacity tracking, and ceremony management",
    iterationPath: project.iterationPath,
    tags: "TestSprint03,Automation,Framework"
  });

  const featureId = featureResult?.id;
  console.log(`  ✓ Feature ${featureId}: ${project.featureTitle}`);

  // Link Feature to Epic
  console.log(`\n[Link] Feature → Epic...`);
  await azureDevOpsMcpClient.callTool("link-work-items", {
    project: project.projectId,
    sourceId: epicId,
    targetId: featureId,
    linkType: "System.LinkTypes.Hierarchy-Forward"
  });
  console.log(`  ✓ Linked: Epic ${epicId} → Feature ${featureId}`);

  // Query all stories in TestSprint 03
  console.log(`\n[Stories] Querying sprint stories...`);
  const wiql = `SELECT [System.Id], [System.Title]
                FROM workitems
                WHERE [System.TeamProject] = '${project.projectId}'
                AND [System.IterationPath] = '${project.iterationPath}'
                AND [System.WorkItemType] = 'User Story'
                ORDER BY [System.Id]`;

  const result: any = await azureDevOpsMcpClient.callTool("list-work-items", {
    project: project.projectId,
    query: wiql
  });

  const stories = Array.isArray(result?.workItems) ? result.workItems : [];
  console.log(`  Found ${stories.length} stories`);

  // Link each story to Feature
  console.log(`\n[Link] Stories → Feature...`);
  let linked = 0;
  for (const story of stories) {
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
    console.log(`  ✓ ${story.id}: ${title}`);
    linked++;
  }

  console.log(`\n✅ Complete: Epic ${epicId} → Feature ${featureId} → ${linked} Stories`);
  return { epicId, featureId, storyCount: linked };
}

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("ADD EPIC HIERARCHY TO TESTSPRINT 03");
  console.log("=".repeat(70));

  const results: any[] = [];

  for (const project of PROJECTS) {
    const result = await createEpicAndFeature(project);
    results.push({ project: project.projectId, ...result });
  }

  console.log("\n" + "=".repeat(70));
  console.log("📊 FINAL SUMMARY");
  console.log("=".repeat(70));

  results.forEach(r => {
    console.log(`\n${r.project}:`);
    console.log(`  Epic: ${r.epicId}`);
    console.log(`  Feature: ${r.featureId}`);
    console.log(`  Stories linked: ${r.storyCount}`);
  });

  console.log("\n✅✅✅ EPIC HIERARCHY COMPLETE ✅✅✅\n");
}

main().catch(console.error);
