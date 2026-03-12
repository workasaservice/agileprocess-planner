import 'dotenv/config';
import { azureDevOpsMcpClient } from '../clients/azureDevOpsMcpClient.js';
import { neonMcpClient } from '../clients/neonMcpClient.js';

export interface TeamMemberIdentity {
  email: string;
  azureId: string;
  displayName: string;
}

/**
 * Sync team members from Azure to Neon for a given project/team
 * Uses MCP exclusively - no raw API calls
 * Stores identities in config_users table for reuse
 */
export async function syncTeamMembersFromAzure(
  project: string,
  teamName: string
): Promise<TeamMemberIdentity[]> {
  console.log(`\n[Sync] Fetching ${teamName} members from Azure via MCP...`);
  
  // Get team members via MCP
  const membersResult = await azureDevOpsMcpClient.callTool('get-team-members', {
    project,
    team: teamName
  });
  
  const members = membersResult?.value || [];
  console.log(`[Sync] Found ${members.length} members in ${teamName}`);
  
  const identities: TeamMemberIdentity[] = [];
  
  for (const member of members) {
    const email = member.identity?.uniqueName || member.identity?.displayName || '';
    const azureId = member.identity?.id || member.id || '';
    const displayName = member.identity?.displayName || member.displayName || email;
    
    if (!email || !azureId) continue;
    
    identities.push({ email, azureId, displayName });
    
    // Store in Neon for persistence and future use
    // Only update existing users to avoid schema constraint violations
    try {
      const result = await neonMcpClient.query(
        `UPDATE config_users 
         SET azure_identity_id = $1, updated_at = NOW()
         WHERE user_principal_name ILIKE $2 OR user_id ILIKE $2 OR mail_nickname ILIKE $2`,
        [azureId, email]
      );
      console.log(`  ✓ ${email}`);
    } catch (err) {
      // If update fails, try inserting with defaults
      try {
        const mailNickname = email.split('@')[0];
        await neonMcpClient.query(
          `INSERT INTO config_users 
           (user_id, user_principal_name, display_name, mail_nickname, azure_identity_id, account_enabled, role_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, true, $6, NOW(), NOW())
           ON CONFLICT (user_id) DO UPDATE SET 
             azure_identity_id = EXCLUDED.azure_identity_id,
             display_name = EXCLUDED.display_name,
             updated_at = NOW()`,
          [email, email, displayName, mailNickname, azureId, 'engineer']
        );
        console.log(`  ✓ ${email} (created)`);
      } catch (insertErr) {
        console.log(`  ⚠ ${email}: ${insertErr}`);
      }
    }
  }
  
  return identities;
}

/**
 * Sync team members for multiple projects
 */
export async function syncMultipleTeams(
  teamConfigs: Array<{ project: string; teamName: string }>
): Promise<Map<string, TeamMemberIdentity[]>> {
  const results = new Map<string, TeamMemberIdentity[]>();
  
  for (const config of teamConfigs) {
    try {
      const identities = await syncTeamMembersFromAzure(config.project, config.teamName);
      const key = `${config.project}/${config.teamName}`;
      results.set(key, identities);
    } catch (err) {
      console.error(`Failed to sync ${config.project}/${config.teamName}: ${err}`);
    }
  }
  
  return results;
}

/**
 * Main: Sync teams for both Alpha and Beta projects
 */
async function main() {
  console.log('=== TEAM MEMBER SYNC (MCP-based) ===');
  
  const teamConfigs = [
    { project: 'MotherOps-Alpha', teamName: 'MotherOps-Alpha Team' },
    { project: 'MotherOps-Beta', teamName: 'MotherOps-Beta Team' }
  ];
  
  const results = await syncMultipleTeams(teamConfigs);
  
  console.log('\n=== SYNC COMPLETE ===');
  console.log(`✓ Synced ${results.size} teams to Neon\n`);
  
  // Verify Baker family members
  console.log('=== Baker Family Members in Neon ===\n');
  const bakers = await neonMcpClient.query<any>(
    `SELECT DISTINCT user_principal_name, azure_identity_id, account_enabled
     FROM config_users
     WHERE user_principal_name LIKE '%baker@%' AND azure_identity_id IS NOT NULL
     ORDER BY user_principal_name`,
    []
  );
  
  console.log(`Found ${bakers.length} baker family members with Azure identities:\n`);
  for (const b of bakers) {
    console.log(`✓ ${b.user_principal_name.padEnd(35)} [${b.azure_identity_id.substring(0, 8)}...]`);
  }
}

main().catch(console.error);
