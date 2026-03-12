#!/usr/bin/env tsx
/**
 * Check if TestSprint 03 is visible in Azure DevOps
 */

import dotenv from "dotenv";
dotenv.config();

import { azureDevOpsMcpClient } from "../src/clients/azureDevOpsMcpClient";

async function checkSprint(project: string, teamName: string) {
  console.log(`\n━━━ ${project} ━━━`);
  
  // Query all work items in TestSprint 03
  const wiql = `SELECT [System.Id], [System.Title], [System.WorkItemType]
                FROM workitems
                WHERE [System.TeamProject] = '${project}'
                AND [System.IterationPath] = '${project}\\\\TestSprint 03'`;

  try {
    const result: any = await azureDevOpsMcpClient.callTool("list-work-items", {
      project,
      query: wiql
    });

    const items = Array.isArray(result?.workItems) ? result.workItems : [];
    console.log(`✅ Found ${items.length} work items in TestSprint 03`);
    
    if (items.length > 0) {
      const byType: Record<string, number> = {};
      for (const item of items.slice(0, 5)) {
        const details: any = await azureDevOpsMcpClient.callTool("get-work-item", {
          project,
          id: item.id
        });
        const type = details?.fields?.["System.WorkItemType"] || "Unknown";
        const title = details?.fields?.["System.Title"] || "";
        const iter = details?.fields?.["System.IterationPath"] || "";
        console.log(`  - ${type} #${item.id}: ${title}`);
        console.log(`    Iteration: ${iter}`);
        byType[type] = (byType[type] || 0) + 1;
      }
      
      if (items.length > 5) console.log (`  ... and ${items.length - 5} more`);
    }
  } catch (error) {
    console.error(`✗ Failed to query:`, error);
  }
}

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("CHECK TESTSPRINT 03 VISIBILITY");
  console.log("=".repeat(70));

  await checkSprint("MotherOps-Alpha", "MotherOps-Alpha Team");
  await checkSprint("MotherOps-Beta", "MotherOps-Beta Team");

  console.log("\n" + "=".repeat(70) + "\n");
}

main().catch(console.error);
