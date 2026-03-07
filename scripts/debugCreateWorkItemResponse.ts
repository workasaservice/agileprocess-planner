import dotenv from "dotenv";
import { azureDevOpsMcpClient } from "../src/clients/azureDevOpsMcpClient";

dotenv.config();

async function main() {
  const result = await azureDevOpsMcpClient.callTool("create-work-item", {
    project: "MotherOps-Hawaii",
    type: "Task",
    title: `Debug MCP shape ${new Date().toISOString()}`,
    description: "Debug response shape",
    tags: "debug,mcp-shape"
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
