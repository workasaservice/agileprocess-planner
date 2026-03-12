#!/usr/bin/env tsx

import dotenv from "dotenv";
dotenv.config();

import { azureDevOpsMcpClient } from "../src/clients/azureDevOpsMcpClient";

async function verify() {
  const projects = ["MotherOps-Alpha", "MotherOps-Beta"];
  
  for (const project of projects) {
    console.log(`\n=== ${project} - TestSprint 02 ===\n`);
    
    const wiql = `SELECT [System.Id], [System.Title], [System.WorkItemType]
            FROM workitems
            WHERE [System.TeamProject] = '${project}'
            AND [System.IterationPath] = '${project}\\TestSprint 02'
            ORDER BY [System.WorkItemType] DESC, [System.Id]`;
    
    try {
      const result: any = await azureDevOpsMcpClient.callTool("list-work-items", {
        project,
        query: wiql
      });
      
      const items = Array.isArray(result?.workItems) ? result.workItems : [];
      console.log(`Total: ${items.length} work items`);
      
      const byType: Record<string, number> = {};
      for (const item of items) {
        const details: any = await azureDevOpsMcpClient.callTool("get-work-item", {
          project,
          id: item.id
        });
        const type = details?.fields?.["System.WorkItemType"] || "Unknown";
        const title = details?.fields?.["System.Title"] || "(no title)";
        byType[type] = (byType[type] || 0) + 1;
        console.log(`  [${type}] ${item.id}: ${title}`);
      }
      
      console.log("\nSummary:");
      Object.entries(byType).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });
    } catch (error) {
      console.error(`Error: ${error}`);
    }
  }
}

verify().catch(console.error);
