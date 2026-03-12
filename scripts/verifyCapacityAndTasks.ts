#!/usr/bin/env tsx

import "dotenv/config";
import { neonMcpClient } from "../src/clients/neonMcpClient";
import { azureDevOpsMcpClient } from "../src/clients/azureDevOpsMcpClient";

async function latestIteration(projectId: string): Promise<string> {
  const rows = await neonMcpClient.query<any>(
    `SELECT iteration_id
     FROM config_project_iterations
     WHERE project_id = $1 AND sprint_name = 'TestSprint 01'
     ORDER BY created_at DESC
     LIMIT 1`,
    [projectId]
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`No TestSprint 01 iteration found for ${projectId}`);
  }
  return rows[0].iteration_id;
}

async function verifyProject(projectId: string, team: string, path: string): Promise<void> {
  const iterationId = await latestIteration(projectId);

  const caps: any = await azureDevOpsMcpClient.callTool("list-sprint-capacities", {
    project: projectId,
    team,
    iterationId
  });

  const capRows = Array.isArray(caps?.value) ? caps.value : [];
  console.log(`\n${projectId} capacity rows: ${capRows.length}`);
  for (const row of capRows) {
    const member = row?.teamMember?.displayName || row?.teamMember?.uniqueName || row?.teamMember?.id || "unknown";
    const dev = Array.isArray(row?.activities) ? row.activities.find((a: any) => a.name === "Development") : undefined;
    console.log(`- ${member}: ${dev?.capacityPerDay ?? 0}`);
  }

  const wiql = `SELECT [System.Id]
                FROM workitems
                WHERE [System.TeamProject] = '${projectId}'
                AND [System.IterationPath] = '${path}'
                ORDER BY [System.Id]`;

  const wis: any = await azureDevOpsMcpClient.callTool("list-work-items", { project: projectId, query: wiql });
  const items = Array.isArray(wis?.workItems) ? wis.workItems : [];

  console.log(`${projectId} work items in ${path}: ${items.length}`);
}

async function main() {
  await verifyProject("MotherOps-Alpha", "MotherOps-Alpha Team", "MotherOps-Alpha\\TestSprint 01");
  await verifyProject("MotherOps-Beta", "MotherOps-Beta Team", "MotherOps-Beta\\TestSprint 01");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
