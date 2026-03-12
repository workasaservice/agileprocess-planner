#!/usr/bin/env tsx
/**
 * Verify complete Epic → Feature → Story → Task hierarchy for TestSprint 02
 */

import dotenv from "dotenv";
dotenv.config();

import { azureDevOpsMcpClient } from "../src/clients/azureDevOpsMcpClient";

async function verifyHierarchy(projectId: string, epicIds: number[]) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${projectId} - COMPLETE HIERARCHY`);
  console.log('='.repeat(70));

  for (const epicId of epicIds) {
    const epicDetails: any = await azureDevOpsMcpClient.callTool("get-work-item", {
      project: projectId,
      id: epicId
    });

    const epicTitle = epicDetails?.fields?.["System.Title"] || "(no title)";
    console.log(`\n📊 EPIC ${epicId}: ${epicTitle}`);

    // Get features under epic
    const relations = epicDetails?.relations || [];
    const childLinks = relations.filter((r: any) => 
      r.rel === "System.LinkTypes.Hierarchy-Forward"
    );

    for (const link of childLinks) {
      const childUrl = link.url;
      const childId = parseInt(childUrl.split('/').pop());
      
      const childDetails: any = await azureDevOpsMcpClient.callTool("get-work-item", {
        project: projectId,
        id: childId
      });

      const childType = childDetails?.fields?.["System.WorkItemType"];
      const childTitle = childDetails?.fields?.["System.Title"];

      if (childType === "Feature") {
        console.log(`  📋 FEATURE ${childId}: ${childTitle}`);

        // Get stories under feature
        const featureRelations = childDetails?.relations || [];
        const storyLinks = featureRelations.filter((r: any) => 
          r.rel === "System.LinkTypes.Hierarchy-Forward"
        );

        for (const storyLink of storyLinks) {
          const storyUrl = storyLink.url;
          const storyId = parseInt(storyUrl.split('/').pop());
          
          const storyDetails: any = await azureDevOpsMcpClient.callTool("get-work-item", {
            project: projectId,
            id: storyId
          });

          const storyTitle = storyDetails?.fields?.["System.Title"];
          console.log(`    📝 STORY ${storyId}: ${storyTitle}`);

          // Get tasks under story
          const storyRelations = storyDetails?.relations || [];
          const taskLinks = storyRelations.filter((r: any) => 
            r.rel === "System.LinkTypes.Hierarchy-Forward"
          );

          console.log(`       ├─ ${taskLinks.length} tasks`);
          
          // Show first 3 and last 3 tasks
          const taskIds = taskLinks.map((tl: any) => parseInt(tl.url.split('/').pop()));
          const displayTasks = taskIds.length <= 6 
            ? taskIds 
            : [...taskIds.slice(0, 3), '...', ...taskIds.slice(-3)];

          for (const taskId of displayTasks) {
            if (taskId === '...') {
              console.log(`       │  ... (${taskIds.length - 6} more tasks)`);
            } else {
              const taskDetails: any = await azureDevOpsMcpClient.callTool("get-work-item", {
                project: projectId,
                id: taskId as number
              });
              const taskTitle = taskDetails?.fields?.["System.Title"];
              console.log(`       ├─ ✓ TASK ${taskId}: ${taskTitle}`);
            }
          }
        }
      }
    }
  }

  console.log(`\n${'='.repeat(70)}\n`);
}

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("TESTSPRINT 02 - HIERARCHY VERIFICATION");
  console.log("Epic → Feature → Story → Task");
  console.log("=".repeat(70));

  // Alpha: Epic 21820
  await verifyHierarchy("MotherOps-Alpha", [21820]);

  // Beta: Epic 21822
  await verifyHierarchy("MotherOps-Beta", [21822]);

  console.log("✓✓✓ VERIFICATION COMPLETE ✓✓✓\n");
}

main().catch(console.error);
