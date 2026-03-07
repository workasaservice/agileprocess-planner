import dotenv from "dotenv";
import { neonMcpClient } from "../src/clients/neonMcpClient";

dotenv.config();

async function main() {
  const projectId = process.env.NEON_PROJECT_ID || "";
  const branchId = process.env.NEON_BRANCH_ID || "";
  if (!projectId || !branchId) {
    throw new Error("NEON_PROJECT_ID and NEON_BRANCH_ID are required");
  }

  const result = await neonMcpClient.callTool("run_sql", {
    projectId,
    branchId,
    sql: "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name LIMIT 20;",
  });

  const firstText = (result as any)?.content?.[0]?.text || "";
  if ((result as any)?.isError || firstText.startsWith("MCP error")) {
    throw new Error(firstText || "Neon MCP run_sql returned tool error");
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
