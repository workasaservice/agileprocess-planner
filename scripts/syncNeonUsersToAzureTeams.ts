#!/usr/bin/env tsx
/**
 * Pull all users from Neon and add them to Azure DevOps teams
 * Then create TestSprint 03 with complete Epic → Feature → Stories → Capacity
 */

import dotenv from "dotenv";
dotenv.config();

import { neonMcpClient } from "../src/clients/neonMcpClient";
import { azureDevOpsMcpClient } from "../src/clients/azureDevOpsMcpClient";

interface NeonUser {
  user_id: string;
  display_name: string;
  user_principal_name: string;
  azure_identity_id?: string;
}

interface ProjectTeam {
  projectId: string;
  teamName: string;
}

const TEAMS: ProjectTeam[] = [
  { projectId: "MotherOps-Alpha", teamName: "MotherOps-Alpha Team" },
  { projectId: "MotherOps-Beta", teamName: "MotherOps-Beta Team" }
];

async function getNeonUsersForProject(projectId: string): Promise<NeonUser[]> {
  console.log(`\n[Neon] Fetching users for ${projectId}...`);
  
  const rows = await neonMcpClient.query<any>(
    `SELECT cu.user_id, cu.display_name, cu.user_principal_name, cu.azure_identity_id
     FROM config_users cu
     JOIN config_project_members cpm ON cu.user_id = cpm.user_id
     WHERE cpm.project_id = $1
     ORDER BY cu.display_name`,
    [projectId]
  );

  const users = Array.isArray(rows) ? rows : [];
  console.log(`  Found ${users.length} users in Neon:`);
  users.forEach(u => {
    console.log(`    - ${u.display_name || u.user_id} (${u.user_principal_name})`);
  });
  
  return users;
}

async function addUserToAzureTeam(
  projectId: string,
  teamName: string,
  userEmail: string
): Promise<boolean> {
  try {
    // Use the Azure DevOps MCP client to add team member
    // We need to search for the tool first
    const result: any = await azureDevOpsMcpClient.callTool("add-team-member", {
      project: projectId,
      team: teamName,
      memberId: userEmail
    });
    
    console.log(`    ✓ Added ${userEmail} to ${teamName}`);
    return true;
  } catch (error: any) {
    // User might already be in the team
    if (error.message?.includes("already") || error.message?.includes("TF400856")) {
      console.log(`    → ${userEmail} already in team`);
      return true;
    }
    console.log(`    ✗ Failed to add ${userEmail}: ${error.message || error}`);
    return false;
  }
}

async function syncProjectUsers(team: ProjectTeam): Promise<void> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`SYNCING: ${team.projectId}`);
  console.log('='.repeat(70));

  // Get all users from Neon for this project
  const neonUsers = await getNeonUsersForProject(team.projectId);

  // Try to add each user to the Azure team
  console.log(`\n[Azure] Adding users to ${team.teamName}...`);
  let added = 0;
  for (const user of neonUsers) {
    const email = user.user_principal_name || user.user_id;
    const success = await addUserToAzureTeam(team.projectId, team.teamName, email);
    if (success) added++;
  }

  console.log(`\n✓ ${added}/${neonUsers.length} users synced to Azure team`);
  
  // Now sync back the Azure identity IDs
  console.log(`\n[Identity] Syncing Azure identity IDs back to Neon...`);
  try {
    const membersResult: any = await azureDevOpsMcpClient.callTool("get-team-members", {
      project: team.projectId,
      team: team.teamName
    });

    const members = Array.isArray(membersResult?.value) ? membersResult.value : [];
    console.log(`  Found ${members.length} members in Azure team`);

    let updated = 0;
    for (const member of members) {
      const email = member?.identity?.uniqueName || member?.identity?.displayName;
      const azureId = member?.identity?.id || member?.id;
      const displayName = member?.identity?.displayName || email;
      
      if (!email || !azureId) continue;

      try {
        await neonMcpClient.query(
          `UPDATE config_users
           SET azure_identity_id = $1, display_name = $2, updated_at = NOW()
           WHERE user_principal_name ILIKE $3 OR user_id ILIKE $3`,
          [String(azureId), String(displayName), String(email)]
        );
        console.log(`    ✓ ${email} → ${azureId.substring(0, 8)}...`);
        updated++;
      } catch (error) {
        console.log(`    ✗ ${email}: ${error}`);
      }
    }

    console.log(`  ✓ Updated ${updated} identity IDs in Neon`);
  } catch (error) {
    console.warn(`  ⚠ Failed to sync identities: ${error}`);
  }
}

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("SYNC NEON USERS TO AZURE TEAMS");
  console.log("Pull all users from Neon → Add to Azure teams → Sync identities");
  console.log("=".repeat(70));

  for (const team of TEAMS) {
    await syncProjectUsers(team);
  }

  console.log("\n" + "=".repeat(70));
  console.log("✅ USER SYNC COMPLETE");
  console.log("=".repeat(70));
  console.log("\n📋 Next: Run createTestSprint03WithIdentitySync.ts again\n");
}

main().catch((error) => {
  console.error("\n✗ FATAL ERROR:", error);
  process.exit(1);
});
