#!/usr/bin/env tsx

import dotenv from "dotenv";
import { azureDevOpsMcpClient } from "../src/clients/azureDevOpsMcpClient";

dotenv.config();

async function verifyWorkItems(project: string, iterationPath: string): Promise<void> {
  const wiql = `SELECT [System.Id], [System.Title], [System.WorkItemType], [System.IterationPath]
                FROM workitems
                WHERE [System.TeamProject] = '${project}'
                AND [System.IterationPath] = '${iterationPath}'
                ORDER BY [System.Id]`;

  const result: any = await azureDevOpsMcpClient.callTool("list-work-items", {
    project,
    query: wiql
  });

  const items = Array.isArray(result?.workItems) ? result.workItems : [];
  console.log(`\n${project} -> ${iterationPath}`);
  console.log(`Count: ${items.length}`);

  for (const item of items) {
    const details: any = await azureDevOpsMcpClient.callTool("get-work-item", {
      project,
      id: item.id
    });
    const title = details?.fields?.["System.Title"] || "(no title)";
    const type = details?.fields?.["System.WorkItemType"] || "(unknown type)";
    console.log(`- ${item.id} [${type}] ${title}`);
  }
}

async function main() {
  await verifyWorkItems("MotherOps-Alpha", "MotherOps-Alpha\\TestSprint 01");
  await verifyWorkItems("MotherOps-Beta", "MotherOps-Beta\\TestSprint 01");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
