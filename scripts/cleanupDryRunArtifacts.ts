import dotenv from "dotenv";
import { azureDevOpsMcpClient } from "../src/clients/azureDevOpsMcpClient";
import { neonMcpClient } from "../src/clients/neonMcpClient";

dotenv.config();

const PROJECT = "MotherOps-Alpha";
const TARGET_SPRINT_NAME = "DryRun TestIteration 001";

async function cleanupWorkItems(): Promise<number[]> {
  const deletedIds: number[] = [];

  const wiqlResult: any = await azureDevOpsMcpClient.callTool("list-work-items", {
    query: `SELECT [System.Id]
            FROM workitems
            WHERE [System.TeamProject] = '${PROJECT}'
              AND ([System.Title] CONTAINS '${TARGET_SPRINT_NAME}'
                   OR [System.Title] = 'Meetings'
                   OR [System.Title] = 'UnPlanned')`
  });

  const candidates = Array.isArray(wiqlResult?.workItems)
    ? wiqlResult.workItems.map((w: any) => Number(w.id)).filter((id: number) => Number.isFinite(id))
    : [];

  for (const id of candidates) {
    try {
      const wi: any = await azureDevOpsMcpClient.callTool("get-work-item", {
        project: PROJECT,
        id
      });

      const title = wi?.fields?.["System.Title"] as string | undefined;
      const iterationPath = wi?.fields?.["System.IterationPath"] as string | undefined;
      const shouldDelete =
        (title && title.includes(TARGET_SPRINT_NAME)) ||
        (iterationPath && iterationPath.includes(TARGET_SPRINT_NAME));

      if (!shouldDelete) {
        continue;
      }

      await azureDevOpsMcpClient.callTool("delete-work-item", {
        project: PROJECT,
        id,
        hardDelete: true
      });

      deletedIds.push(id);
      console.log(`Deleted work item #${id} (${title || "unknown title"})`);
    } catch (error) {
      console.warn(`Skipping work item #${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return deletedIds;
}

async function cleanupIteration(): Promise<void> {
  try {
    await azureDevOpsMcpClient.callTool("delete-iteration", {
      project: PROJECT,
      name: TARGET_SPRINT_NAME
    });
    console.log(`Deleted iteration '${TARGET_SPRINT_NAME}' from Azure DevOps`);
  } catch (error) {
    console.warn(`Iteration delete skipped: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function cleanupNeonMetadata(): Promise<void> {
  const rows = await neonMcpClient.query<any>(
    `DELETE FROM config_project_iterations
     WHERE project_id = $1
       AND sprint_name = $2
     RETURNING iteration_id`,
    [PROJECT, TARGET_SPRINT_NAME]
  );

  console.log(`Deleted ${Array.isArray(rows) ? rows.length : 0} Neon iteration metadata rows`);
}

async function main() {
  const deletedWorkItems = await cleanupWorkItems();
  await cleanupIteration();
  await cleanupNeonMetadata();

  console.log(`Cleanup complete. Work items deleted: ${deletedWorkItems.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
