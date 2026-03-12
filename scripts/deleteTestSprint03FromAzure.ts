#!/usr/bin/env tsx
/**
 * Delete TestSprint 03 iterations from Azure DevOps
 * MCP-Only approach
 */

import dotenv from "dotenv";
dotenv.config();

import { azureDevOpsMcpClient } from "../src/clients/azureDevOpsMcpClient";

const PROJECTS = [
  { projectId: "MotherOps-Alpha", iterationPath: "\\MotherOps-Alpha\\Iteration\\TestSprint 03" },
  { projectId: "MotherOps-Beta", iterationPath: "\\MotherOps-Beta\\Iteration\\TestSprint 03" }
];

async function deleteIteration(projectId: string, iterationPath: string) {
  console.log(`\n[Delete] ${projectId}: ${iterationPath}`);
  
  try {
    await azureDevOpsMcpClient.callTool("delete-iteration", {
      project: projectId,
      path: iterationPath
    });
    console.log(`  ✓ Deleted from Azure DevOps`);
  } catch (error: any) {
    if (error.message?.includes("404") || error.message?.includes("not found")) {
      console.log(`  → Already deleted or doesn't exist`);
    } else {
      console.error(`  ✗ Failed: ${error.message || error}`);
    }
  }
}

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("DELETE TESTSPRINT 03 FROM AZURE DEVOPS");
  console.log("MCP-Only");
  console.log("=".repeat(70));

  for (const project of PROJECTS) {
    await deleteIteration(project.projectId, project.iterationPath);
  }

  console.log("\n" + "=".repeat(70));
  console.log("✅ CLEANUP COMPLETE");
  console.log("=".repeat(70));
  console.log("\nNow run: npx tsx scripts/createTestSprint03EndToEnd.ts\n");
}

main().catch(console.error);
