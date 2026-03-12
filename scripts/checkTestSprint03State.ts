import { config } from "dotenv";
config();

import { azureDevOpsMcpClient } from "../src/clients/azureDevOpsMcpClient";

async function checkTestSprint03() {
  console.log("\n" + "=".repeat(70));
  console.log("TESTSPRINT 03 - CURRENT STATE CHECK");
  console.log("=".repeat(70));

  for (const project of ["MotherOps-Alpha", "MotherOps-Beta"]) {
    console.log(`\n${project}:`);
    console.log("-".repeat(70));

    const wiql = `
      SELECT [System.Id], [System.Title], [System.WorkItemType]
      FROM WorkItems
      WHERE [System.TeamProject] = '${project}'
        AND [System.IterationPath] = '${project}\\TestSprint 03'
      ORDER BY [System.WorkItemType], [System.Id]
    `;

    try {
      const result: any = await azureDevOpsMcpClient.callTool("list-work-items", {
        project,
        wiql
      });

      if (!result || !result.workItems || result.workItems.length === 0) {
        console.log("  ⚠ No work items found");
        continue;
      }
        // Debug: show first item structure
        if (result.workItems.length > 100) {
          console.log(`  ⚠ Warning: ${result.workItems.length} items found - probably query issue`);
          console.log(`  Sample item:`, JSON.stringify(result.workItems[0], null, 2));
          continue;
        }

      const byType: Record<string, number> = {};
      for (const item of result.workItems) {
        const type = item.fields?.["System.WorkItemType"] || 
               item["System.WorkItemType"] ||
               (item.type) || 
               "Unknown";
        byType[type] = (byType[type] || 0) + 1;
      }

      console.log(`  Total: ${result.workItems.length} work items`);
      for (const [type, count] of Object.entries(byType).sort()) {
        console.log(`    ${type}: ${count}`);
      }

      // Check for Epic specifically
      const epics = result.workItems.filter((item: any) => 
        item.fields?.["System.WorkItemType"] === "Epic"
      );
      if (epics.length > 0) {
        console.log(`\n  Epic details:`);
        for (const epic of epics) {
          console.log(`    ID ${epic.id}: ${epic.fields?.["System.Title"]}`);
        }
      }

      // Check for Feature specifically
      const features = result.workItems.filter((item: any) => 
        item.fields?.["System.WorkItemType"] === "Feature"
      );
      if (features.length > 0) {
        console.log(`\n  Feature details:`);
        for (const feature of features) {
          console.log(`    ID ${feature.id}: ${feature.fields?.["System.Title"]}`);
        }
      }

    } catch (error) {
      console.error(`  ✗ Error: ${error}`);
    }
  }

  console.log("\n" + "=".repeat(70));
}

checkTestSprint03().catch(console.error);
