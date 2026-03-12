import dotenv from "dotenv";
import { azureDevOpsMcpClient } from "../src/clients/azureDevOpsMcpClient";

dotenv.config();

async function main() {
  const list: any = await azureDevOpsMcpClient.callTool("list-work-items", {
    project: "MotherOps-Alpha",
    query: "SELECT [System.Id] FROM workitems WHERE [System.TeamProject] = 'MotherOps-Alpha' AND [System.Title] CONTAINS 'Meetings - Sprint 2026-03-16'",
  });

  const id = list?.workItems?.[0]?.id;
  if (!id) {
    console.log("No sample work item found");
    return;
  }

  const wi: any = await azureDevOpsMcpClient.callTool("get-work-item", {
    project: "MotherOps-Alpha",
    id,
  });

  console.log({
    id,
    title: wi?.fields?.["System.Title"],
    iterationPath: wi?.fields?.["System.IterationPath"],
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
