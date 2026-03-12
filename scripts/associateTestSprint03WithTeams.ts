#!/usr/bin/env tsx
/**
 * Manually associate TestSprint 03 iterations with teams
 * Using direct Azure DevOps REST API
 */

import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import { neonMcpClient } from "../src/clients/neonMcpClient";

const AZURE_ORG = process.env.AZURE_DEVOPS_ORG_URL || "";
const AZURE_PAT = process.env.AZURE_PAT || process.env.AZURE_DEVOPS_PAT || "";

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

async function associateIterationWithTeam(iter: ProjectIteration): Promise<void> {
  console.log(`\n[Azure] Associating ${iter.projectId}/${iter.teamName}...`);
  console.log(`  Iteration ID: ${iter.iterationId}`);
  console.log(`  Path: ${iter.iterationPath}`);

  const url = `${AZURE_ORG}/${iter.projectId}/${iter.teamName}/_apis/work/teamsettings/iterations`;
  
  try {
    const response = await axios.post(
      url,
      { id: iter.iterationId },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${Buffer.from(`:${AZURE_PAT}`).toString("base64")}`
        },
        params: { "api-version": "7.0" }
      }
    );

    console.log(`  ✅ Successfully associated!`);
    console.log(`  Response:`, JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    if (error.response) {
      console.error(`  ✗ Azure API Error ${error.response.status}:`);
      console.error(`    ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.error(`  ✗ Failed: ${error.message}`);
    }
  }
}

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("ASSOCIATE TESTSPRINT 03 WITH TEAMS");
  console.log("Direct Azure DevOps REST API");
  console.log("=".repeat(70));

  if (!AZURE_ORG || !AZURE_PAT) {
    console.error("\n✗ Missing environment variables!");
    console.error("  AZURE_DEVOPS_ORG_URL:", AZURE_ORG ? "✓" : "✗");
    console.error("  AZURE_DEVOPS_PAT:", AZURE_PAT ? "✓" : "✗");
    process.exit(1);
  }

  const iterations = await getTestSprint03Iterations();
  
  if (iterations.length === 0) {
    console.error("\n✗ No TestSprint 03 iterations found in Neon!");
    process.exit(1);
  }

  console.log(`\nFound ${iterations.length} iterations to associate`);

  for (const iter of iterations) {
    await associateIterationWithTeam(iter);
  }

  console.log("\n" + "=".repeat(70));
  console.log("✅ ASSOCIATION COMPLETE");
  console.log("=".repeat(70));
  console.log("\n📋 Now TestSprint 03 should appear in the Sprint dropdown!");
  console.log("\n");
}

main().catch((error) => {
  console.error("\n✗ FATAL ERROR:", error);
 process.exit(1);
});
