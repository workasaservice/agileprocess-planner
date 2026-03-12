import { config } from "dotenv";
config();

import { azureDevOpsMcpClient } from "../src/clients/azureDevOpsMcpClient";

const PROJECTS = [
  {
    projectId: "MotherOps-Alpha",
    epicTitle: "Q2 2026 - Agile Process Automation (Alpha)",
    featureTitle: "Sprint Execution Framework",
    iterationPath: "MotherOps-Alpha\\TestSprint 03"
  },
  {
    projectId: "MotherOps-Beta",
    epicTitle: "Q2 2026 - Agile Process Automation (Beta)",
    featureTitle: "Sprint Execution Framework",
    iterationPath: "MotherOps-Beta\\TestSprint 03"
  }
];

async function createHierarchyForProject(project: typeof PROJECTS[0]) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`PROJECT: ${project.projectId}`);
  console.log('='.repeat(70));

  // Step 1: Create Epic
  console.log(`\n[Epic] Creating Epic...`);
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
      console.log(`  ✓ Epic created: ${epicId} - "${project.epicTitle}"`);
    } else {
      console.error(`  ✗ Epic creation returned no ID`);
      return;
    }
  } catch (error) {
    console.error(`  ✗ Epic creation failed: ${error}`);
    return;
  }

  // Step 2: Create Feature
  console.log(`\n[Feature] Creating Feature under Epic ${epicId}...`);
  let featureId: number | null = null;
  
  try {
    const featureResult: any = await azureDevOpsMcpClient.callTool("create-work-item", {
      project: project.projectId,
      type: "Feature",
      title: project.featureTitle,
      description: "Automated sprint planning, capacity tracking, and ceremony management",
      iterationPath: project.iterationPath,
      tags: "TestSprint03,Automation,Framework"
    });

    if (featureResult && featureResult.id) {
      featureId = featureResult.id;
      console.log(`  ✓ Feature created: ${featureId} - "${project.featureTitle}"`);
    } else {
      console.error(`  ✗ Feature creation returned no ID`);
      return;
    }
  } catch (error) {
    console.error(`  ✗ Feature creation failed: ${error}`);
    return;
  }

  // Step 3: Link Feature to Epic
  console.log(`\n[Link] Linking Feature ${featureId} → Epic ${epicId}...`);
  try {
    await azureDevOpsMcpClient.callTool("link-work-items", {
      project: project.projectId,
      sourceId: epicId,
      targetId: featureId,
      linkType: "System.LinkTypes.Hierarchy-Forward"
    });
    console.log(`  ✓ Feature linked to Epic`);
  } catch (error) {
    console.error(`  ✗ Linking failed: ${error}`);
  }

  // Step 4: Get all stories in the sprint
  console.log(`\n[Stories] Finding stories to link to Feature...`);
  try {
    const wiql = `
      SELECT [System.Id], [System.Title], [System.WorkItemType]
      FROM WorkItems
      WHERE [System.TeamProject] = '${project.projectId}'
        AND [System.IterationPath] = '${project.iterationPath}'
        AND [System.WorkItemType] = 'User Story'
      ORDER BY [System.Id]
    `;

    const queryResult: any = await azureDevOpsMcpClient.callTool("list-work-items", {
      project: project.projectId,
      wiql
    });

    if (!queryResult || !queryResult.workItems || queryResult.workItems.length === 0) {
      console.log(`  ⚠ No stories found in ${project.iterationPath}`);
      return;
    }

    console.log(`  Found ${queryResult.workItems.length} stories`);

    // Link each story to the Feature
    let linkedCount = 0;
    let errorCount = 0;

    for (const item of queryResult.workItems) {
      try {
        await azureDevOpsMcpClient.callTool("link-work-items", {
          project: project.projectId,
          sourceId: featureId,
          targetId: item.id,
          linkType: "System.LinkTypes.Hierarchy-Forward"
        });
        linkedCount++;
      } catch (linkError) {
        console.error(`  ✗ Failed to link story ${item.id}: ${linkError}`);
        errorCount++;
      }
    }

    console.log(`  ✓ Linked ${linkedCount} stories to Feature`);
    if (errorCount > 0) {
      console.log(`  ⚠ ${errorCount} stories failed to link`);
    }

  } catch (error) {
    console.error(`  ✗ Story linking failed: ${error}`);
  }

  console.log(`\n✅ ${project.projectId} HIERARCHY COMPLETE`);
  console.log(`   Epic ${epicId} → Feature ${featureId} → ${linkedCount || 0} Stories`);
}

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("TESTSPRINT 03 - ADD EPIC/FEATURE HIERARCHY");
  console.log("MCP-Only | Fix missing Epic/Feature structure");
  console.log("=".repeat(70));

  for (const project of PROJECTS) {
    await createHierarchyForProject(project);
  }

  console.log("\n" + "=".repeat(70));
  console.log("✅✅✅ HIERARCHY ADDITION COMPLETE ✅✅✅");
  console.log("=".repeat(70));
  console.log("\n📋 Next Steps:");
  console.log("  1. Open Azure DevOps Sprint view");
  console.log("  2. Select 'TestSprint 03' from dropdown");
  console.log("  3. Verify Epic → Feature → Stories hierarchy");
  console.log("");
}

main().catch(console.error);
