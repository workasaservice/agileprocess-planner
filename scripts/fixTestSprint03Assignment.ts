#!/usr/bin/env tsx
/**
 * Fix TestSprint 03 - Assign iterations to teams
 * The iterations were created but not assigned to teams (500 error)
 */

import dotenv from "dotenv";
dotenv.config();

import { azureDevOpsMcpClient } from "../src/clients/azureDevOpsMcpClient";
import { neonMcpClient } from "../src/clients/neonMcpClient";

interface ProjectIteration {
  projectId: string;
  teamName: string;
  iterationId: string;
  iterationPath: string;
}

async function getTestSprint03Iterations(): Promise<ProjectIteration[]> {
  console.log("\n[Neon] Fetching TestSprint 03 iteration IDs...");
  
  const rows = await neonMcpClient.query<any>(
    `SELECT project_id, sprint_name, iteration_id, iteration_path
     FROM config_project_iterations
     WHERE sprint_name = 'TestSprint 03'
     ORDER BY project_id`,
    []
  );

  const iterations: ProjectIteration[] = [];
  
  for (const row of rows) {
    const teamName = row.project_id === "MotherOps-Alpha" 
      ? "MotherOps-Alpha Team" 
      : "MotherOps-Beta Team";
    
    iterations.push({
      projectId: row.project_id,
      teamName,
      iterationId: row.iteration_id,
      iterationPath: row.iteration_path
    });
    
    console.log(`  ✓ ${row.project_id}: ${row.iteration_id}`);
  }

  return iterations;
}

async function assignIterationToTeam(iter: ProjectIteration): Promise<void> {
  console.log(`\n[Azure] Assigning iteration to ${iter.teamName}...`);
  console.log(`  Project: ${iter.projectId}`);
  console.log(`  Iteration: ${iter.iterationPath}`);
  console.log(`  ID: ${iter.iterationId}`);

  try {
    await azureDevOpsMcpClient.callTool("mcp_microsoft_azu_work_assign_iterations", {
      project: iter.projectId,
      team: iter.teamName,
      iterations: [{
        identifier: iter.iterationId,
        path: iter.iterationPath
      }]
    });

    console.log(`  ✅ Successfully assigned!`);
  } catch (error: any) {
    console.error(`  ✗ Failed: ${error.message || error}`);
    console.error(`  Error details:`, error);
  }
}

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("ASSIGN TESTSPRINT 03 TO TEAMS");
  console.log("Fix the 500 error from sprint creation");
  console.log("=".repeat(70));

  const iterations = await getTestSprint03Iterations();
  
  if (iterations.length === 0) {
    console.error("\n✗ No TestSprint 03 iterations found in Neon!");
    process.exit(1);
  }

  console.log(`\nFound ${iterations.length} iterations to assign`);

  for (const iter of iterations) {
    await assignIterationToTeam(iter);
  }

  console.log("\n" + "=".repeat(70));
  console.log("✅ ITERATION ASSIGNMENT COMPLETE");
  console.log("=".repeat(70));
  console.log("\n📋 Next Steps:");
  console.log("  1. Open Azure DevOps Sprint view");
  console.log("  2. TestSprint 03 should now appear in dropdown");
  console.log("  3. Select it to see all work items");
  console.log("\n");
}

main().catch((error) => {
  console.error("\n✗ FATAL ERROR:", error);
  process.exit(1);
});
