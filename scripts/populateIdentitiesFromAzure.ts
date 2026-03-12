import 'dotenv/config';
import { azureDevOpsMcpClient } from '../src/clients/azureDevOpsMcpClient.js';
import { neonMcpClient } from '../src/clients/neonMcpClient.js';

async function main() {
  console.log('=== Fetching All Team Members via MCP ===\n');
  
  // Use MCP to get all team members
  const result = await azureDevOpsMcpClient.callTool('get-team-members', {
    project: 'MotherOps-Alpha',
    team: 'MotherOps-Alpha Team'
  });
  
  const members = result?.value || [];
  console.log(`Found ${members.length} members in Azure team\n`);
  
  if (members.length === 0) {
    console.log('❌ No members found');
    return;
  }
  
  console.log('=== Storing Azure Identities in Neon ===\n');
  
  let updated = 0;
  for (const member of members) {
    const email = member.identity?.uniqueName || member.identity?.displayName || '';
    const azureId = member.identity?.id || '';
    
    if (!email || !azureId) {
      console.log(`⚠ Skipping ${email}: missing ID`);
      continue;
    }
    
    // Try to update by email
    await neonMcpClient.query(
      `UPDATE config_users 
       SET azure_identity_id = $1, updated_at = NOW()
       WHERE user_principal_name ILIKE $2 OR user_id ILIKE $2 OR mail_nickname ILIKE $2`,
      [azureId, email]
    );
    
    console.log(`✓ ${email}`);
    updated++;
  }
  
  console.log(`\n✓ Updated ${updated} users with Azure identities\n`);
  
  console.log('=== Verification: Baker Family Members ===\n');
  const bakers = await neonMcpClient.query<any>(
    `SELECT user_principal_name, azure_identity_id, role_id
     FROM config_users
     WHERE user_principal_name LIKE '%baker@%' AND azure_identity_id IS NOT NULL
     ORDER BY user_principal_name`,
    []
  );
  
  for (const b of bakers) {
    console.log(`✓ ${b.user_principal_name.padEnd(35)} [${b.azure_identity_id.substring(0, 8)}...]`);
  }
  
  console.log(`\n✓ Total Baker family with identities: ${bakers.length}`);
}

main().catch(console.error);
