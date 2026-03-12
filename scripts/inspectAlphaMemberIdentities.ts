#!/usr/bin/env tsx

import "dotenv/config";
import { neonMcpClient } from "../src/clients/neonMcpClient";

async function main() {
  const rows = await neonMcpClient.query<any>(
    `SELECT cpu.user_id as "userId", cu.display_name as "displayName", cu.role_id as "roleId", cu.azure_identity_id as "azureIdentityId"
     FROM config_project_members cpu
     JOIN config_users cu ON cpu.user_id = cu.user_id
     WHERE cpu.project_id = $1
     ORDER BY cpu.user_id`,
    ["MotherOps-Alpha"]
  );

  console.log(JSON.stringify(rows, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
