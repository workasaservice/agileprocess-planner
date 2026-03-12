#!/usr/bin/env tsx
/**
 * Associate TestSprint 03 with teams using azureDevOpsMcpClient's authentication
 * This makes the sprint appear in the Sprint dropdown
 */

import dotenv from "dotenv";
dotenv.config();

import axios, { AxiosInstance } from "axios";
import { ClientSecretCredential } from "@azure/identity";
import { neonMcpClient } from "../src/clients/neonMcpClient";

const AZURE_ORG = process.env.AZURE_DEVOPS_ORG_URL || "";
const TENANT_ID = process.env.AZURE_DEVOPS_TENANT_ID || "";
const CLIENT_ID = process.env.AZURE_DEVOPS_CLIENT_ID || "";
const CLIENT_SECRET = process.env.AZURE_DEVOPS_CLIENT_SECRET || "";

interface ProjectIteration {
  projectId: string;
  teamName: string;
  iterationId: string;
  iterationPath: string;
}

async function getAzureClient(): Promise<AxiosInstance> {
  const credential = new ClientSecretCredential(
    TENANT_ID,
    CLIENT_ID,
    CLIENT_SECRET
  );

  const tokenResponse = await credential.getToken([
    "499b84ac-1321-427f-aa17-267ca6975798/.default"
  ]);

  return axios.create({
    baseURL: AZURE_ORG,
    headers: {
      "Authorization": `Bearer ${tokenResponse.token}`,
      "Content-Type": "application/json"
    }
  });
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

async function associateIterationWithTeam(
  client: AxiosInstance,
  iter: ProjectIteration
): Promise<void> {
  console.log(`\n[Azure] ${iter.projectId}/${iter.teamName}...`);
  console.log(`  Iteration ID: ${iter.iterationId}`);

  const url = `/${iter.projectId}/${encodeURIComponent(iter.teamName)}/_apis/work/teamsettings/iterations`;
  
  try {
    const response = await client.post(
      url,
      { id: iter.iterationId },
      { params: { "api-version": "7.0" } }
    );

    console.log(`  ✅ Associated successfully!`);
  } catch (error: any) {
    if (error.response) {
      console.error(`  ✗ Azure API Error ${error.response.status}:`);
      console.error(`    ${JSON.stringify(error.response.data, null, 2)}`);
      
      // Check if it's already associated
      if (error.response.status === 400 && 
          error.response.data?.message?.includes("already exists")) {
        console.log(`  → Already associated (skipping)`);
      }
    } else {
      console.error(`  ✗ Failed: ${error.message}`);
    }
  }
}

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("ASSOCIATE TESTSPRINT 03 WITH TEAMS");
  console.log("Using Service Principal Authentication");
  console.log("=".repeat(70));

  if (!AZURE_ORG || !TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    console.error("\n✗ Missing environment variables!");
    process.exit(1);
  }

  console.log("\n[Auth] Getting Azure access token...");
  const client = await getAzureClient();
  console.log("  ✓ Authenticated");

  const iterations = await getTestSprint03Iterations();
  
  if (iterations.length === 0) {
    console.error("\n✗ No TestSprint 03 iterations found!");
    process.exit(1);
  }

  console.log(`\nFound ${iterations.length} iterations to associate`);

  for (const iter of iterations) {
    await associateIterationWithTeam(client, iter);
  }

  console.log("\n" + "=".repeat(70));
  console.log("✅ COMPLETE");
  console.log("=".repeat(70));
  console.log("\n📋 TestSprint 03 should now appear in the Sprint dropdown!");
  console.log("\n");
}

main().catch((error) => {
  console.error("\n✗ FATAL ERROR:", error);
  process.exit(1);
});
