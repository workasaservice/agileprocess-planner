#!/usr/bin/env tsx
import dotenv from "dotenv";
dotenv.config();

import { neonMcpClient } from "../src/clients/neonMcpClient";

async function showUsers() {
  console.log("\n" + "=".repeat(70));
  console.log("USERS IN NEON DATABASE");
  console.log("=".repeat(70));

  const alpha = await neonMcpClient.query<any>(
    `SELECT cu.user_id, cu.display_name, cu.user_principal_name, cu.azure_identity_id
     FROM config_users cu
     JOIN config_project_members cpm ON cu.user_id = cpm.user_id
     WHERE cpm.project_id = $1
     ORDER BY cu.display_name`,
    ['MotherOps-Alpha']
  );
  console.log('\nMotherOps-Alpha Users:');
  alpha.forEach((u: any) => {
    const hasId = u.azure_identity_id ? '✓' : '✗';
    console.log(`  ${hasId} ${u.display_name || u.user_id} (${u.user_principal_name})`);
  });
  console.log(`  Total: ${alpha.length} users`);
  
  const beta = await neonMcpClient.query<any>(
    `SELECT cu.user_id, cu.display_name, cu.user_principal_name, cu.azure_identity_id
     FROM config_users cu
     JOIN config_project_members cpm ON cu.user_id = cpm.user_id
     WHERE cpm.project_id = $1
     ORDER BY cu.display_name`,
    ['MotherOps-Beta']
  );
  console.log('\nMotherOps-Beta Users:');
  beta.forEach((u: any) => {
    const hasId = u.azure_identity_id ? '✓' : '✗';
    console.log(`  ${hasId} ${u.display_name || u.user_id} (${u.user_principal_name})`);
  });
  console.log(`  Total: ${beta.length} users`);
  
  console.log("\n" + "=".repeat(70) + "\n");
}

showUsers().catch(console.error);
