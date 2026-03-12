import 'dotenv/config';
import { syncMultipleTeams } from '../src/services/teamMemberSync.js';
import { neonMcpClient } from '../src/clients/neonMcpClient.js';

async function main() {
  console.log('=== SYNC TEAM MEMBERS FROM AZURE TO NEON ===\n');
  
  const teamConfigs = [
    { project: 'MotherOps-Alpha', teamName: 'MotherOps-Alpha Team' },
    { project: 'MotherOps-Beta', teamName: 'MotherOps-Beta Team' }
  ];
  
  const results = await syncMultipleTeams(teamConfigs);
  
  console.log('\n=== SYNC COMPLETE ===');
  let totalMembers = 0;
  for (const [key, identities] of results) {
    console.log(`✓ ${key}: ${identities.length} members`);
    totalMembers += identities.length;
  }
  
  console.log(`\n✓ Total members synced: ${totalMembers}\n`);
  
  // Verify Baker family members
  console.log('=== Baker Family Members in Neon (with Azure identities) ===\n');
  const bakers = await neonMcpClient.query<any>(
    `SELECT DISTINCT user_principal_name, azure_identity_id, account_enabled
     FROM config_users
     WHERE user_principal_name LIKE '%baker@%' AND azure_identity_id IS NOT NULL
     ORDER BY user_principal_name`,
    []
  );
  
  console.log(`Found ${bakers.length} baker family members:\n`);
  for (const b of bakers) {
    const status = b.account_enabled ? '✓' : '✗';
    console.log(`${status} ${b.user_principal_name.padEnd(35)} [${b.azure_identity_id.substring(0, 8)}...]`);
  }
}

main().catch(console.error);
