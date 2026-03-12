import { config } from "dotenv";
config();

import { azureDevOpsMcpClient } from "../src/clients/azureDevOpsMcpClient";

async function checkSpecificWorkItems() {
  console.log("\n" + "=".repeat(70));
  console.log("TESTSPRINT 03 - CHECK EPIC/FEATURE");
  console.log("=".repeat(70));

  // Work items from the hierarchy creation script:
  // MotherOps-Alpha: Epic 21932, Feature 21933
  // MotherOps-Beta: Epic 21934, Feature 21935 (these appeared in output)
  
  const itemsToCheck = [
    { project: "MotherOps-Alpha", id: 21932, expected: "Epic" },
    { project: "MotherOps-Alpha", id: 21933, expected: "Feature" },
    { project: "MotherOps-Beta", id: 21934, expected: "Epic" },
    { project: "MotherOps-Beta", id: 21935, expected: "Feature" },
  ];

  for (const item of itemsToCheck) {
    console.log(`\n${item.project} - Work Item ${item.id} (expecting ${item.expected}):`);
    
    try {
      const result: any = await azureDevOpsMcpClient.callTool("get-work-item", {
        project: item.project,
        id: item.id
      });

      if (result && result.fields) {
        const type = result.fields["System.WorkItemType"];
        const title = result.fields["System.Title"];
        const state = result.fields["System.State"];
        const iterPath = result.fields["System.IterationPath"];
        
        console.log(`  ✓ Type: ${type}`);
        console.log(`  ✓ Title: ${title}`);
        console.log(`  ✓ State: ${state}`);
        console.log(`  ✓ Iteration: ${iterPath || "(none)"}`);
        
        // Check relations for parent/child links
        if (result.relations && result.relations.length > 0) {
          console.log(`  ✓ Relations: ${result.relations.length} links`);
          const parents = result.relations.filter((r: any) => 
            r.rel === "System.LinkTypes.Hierarchy-Reverse"
          );
          const children = result.relations.filter((r: any) => 
            r.rel === "System.LinkTypes.Hierarchy-Forward"
          );
          if (parents.length > 0) {
            console.log(`    - Parents: ${parents.length}`);
          }
          if (children.length > 0) {
            console.log(`    - Children: ${children.length}`);
          }
        } else {
          console.log(`  ⚠ No relations found`);
        }
      } else {
        console.log(`  ✗ No result or fields returned`);
      }
    } catch (error) {
      console.log(`  ✗ Error: ${error}`);
    }
  }

  console.log("\n" + "=".repeat(70));
}

checkSpecificWorkItems().catch(console.error);
