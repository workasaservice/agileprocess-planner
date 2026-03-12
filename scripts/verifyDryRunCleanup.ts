import dotenv from "dotenv";
import { azureDevOpsMcpClient } from "../src/clients/azureDevOpsMcpClient";

dotenv.config();

async function main() {
  const query = `SELECT [System.Id]
                 FROM workitems
                 WHERE [System.TeamProject] = 'MotherOps-Alpha'
                   AND (
                     [System.Title] CONTAINS 'DryRun TestIteration 001'
                     OR [System.IterationPath] = 'MotherOps-Alpha\\Iteration\\DryRun TestIteration 001'
                     OR [System.IterationPath] = 'MotherOps-Alpha\\DryRun TestIteration 001'
                   )`;

  const result: any = await azureDevOpsMcpClient.callTool("list-work-items", { query });
  const workItems = Array.isArray(result?.workItems) ? result.workItems : [];

  console.log(JSON.stringify({ count: workItems.length, workItems }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
