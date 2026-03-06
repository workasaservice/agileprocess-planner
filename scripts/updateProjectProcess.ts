/**
 * Update Project Process Template
 * Applies the WaaS process template to specified projects
 */

import { azureDevOpsMcpClient } from "../src/clients/azureDevOpsMcpClient";

async function findProcessId(processName: string): Promise<string | null> {
  console.log(`Looking for process: ${processName}`);
  
  try {
    const result = await azureDevOpsMcpClient.callTool("list-processes", {});
    const processes = result.value || [];
    
    const found = processes.find((p: any) => p.name === processName);
    
    if (found) {
      console.log(`✓ Found process: ${processName} (ID: ${found.typeId})`);
      return found.typeId;
    } else {
      console.log(`✗ Process not found: ${processName}`);
      return null;
    }
  } catch (error) {
    console.error(`Error checking process existence:`, error);
    return null;
  }
}

async function applyProcessToProject(
  processId: string,
  projectName: string
): Promise<void> {
  console.log(`\nApplying process to project: ${projectName}`);

  try {
    await azureDevOpsMcpClient.callTool("update-project-process", {
      projectId: projectName,
      processId,
    });

    console.log(`✓ Process applied to project: ${projectName}`);
  } catch (error: any) {
    if (error.message?.includes("already using")) {
      console.log(`⊙ Project already using this process: ${projectName}`);
    } else {
      console.error(`✗ Failed to apply process to ${projectName}:`, error.message);
      throw error;
    }
  }
}

async function main() {
  console.log("=== Updating Project Process Templates ===\n");

  // Configuration
  const processName = "WaaS";
  const projects = ["MotherOps-Alpha", "MotherOps-Beta"];

  // Step 1: Find the WaaS process
  const processId = await findProcessId(processName);
  
  if (!processId) {
    console.error(`\n✗ Cannot proceed: Process "${processName}" not found.`);
    console.error(`  Please ensure the WaaS process template exists in your Azure DevOps organization.`);
    process.exit(1);
  }

  // Step 2: Apply to each project
  for (const project of projects) {
    try {
      await applyProcessToProject(processId, project);
    } catch (error) {
      console.error(`Failed to update ${project}, continuing with next project...`);
    }
  }

  console.log("\n=== Process Update Complete ===\n");
}

// Run the script
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
