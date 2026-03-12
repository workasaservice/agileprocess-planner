import dotenv from "dotenv";
import { azureDevOpsMcpClient } from "../src/clients/azureDevOpsMcpClient";

dotenv.config();

async function childCount(project: string, id: number) {
  const wi: any = await azureDevOpsMcpClient.callTool("get-work-item", { project, id });
  const rels = wi?.relations || [];
  return rels.filter((r: any) => r.rel === "System.LinkTypes.Hierarchy-Forward").length;
}

async function main() {
  const checks = [
    { project: "MotherOps-Alpha", id: 20971, label: "Meetings - TestIteration 001" },
    { project: "MotherOps-Alpha", id: 21218, label: "UnPlanned - TestIteration 001" },
    { project: "MotherOps-Beta", id: 21088, label: "Meetings - TestIteration 001" },
    { project: "MotherOps-Beta", id: 21335, label: "UnPlanned - TestIteration 001" },
  ];

  for (const c of checks) {
    const count = await childCount(c.project, c.id);
    console.log(`${c.project} #${c.id} ${c.label} -> children=${count}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
