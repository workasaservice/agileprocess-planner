import 'dotenv/config';
import { azureDevOpsMcpClient } from '../src/clients/azureDevOpsMcpClient.js';
import { neonMcpClient } from '../src/clients/neonMcpClient.js';

async function main() {
  const bakers = [
    'dadi.baker@workasaservice.ai',
    'henry.baker@workasaservice.ai',
    'jake.baker@workasaservice.ai',
    'jessica.baker@workasaservice.ai',
    'lorraine.baker@workasaservice.ai',
    'mark.baker@workasaservice.ai',
    'tom.baker@workasaservice.ai'
  ];
  
  console.log('=== Adding Baker Family to MotherOps-Alpha Team via MCP ===\n');
  
  for (const email of bakers) {
    try {
      console.log(`Adding: ${email}`);
      
      const result = await azureDevOpsMcpClient.callTool('add-team-member', {
        project: 'MotherOps-Alpha',
        team: 'MotherOps-Alpha Team',
        memberId: email
      });
      
      console.log(`  ✓ Added`);
    } catch (err: any) {
      const msg = err.message || String(err);
      if (msg.includes('already') || msg.includes('conflict') || msg.includes('409')) {
        console.log(`  ✓ Already a member`);
      } else {
        console.log(`  ✗ Error: ${msg}`);
      }
    }
  }
  
  console.log('\n=== Fetching Updated Team Member Identities ===\n');
  
  const membersList = await azureDevOpsMcpClient.callTool('get-team-members', {
    project: 'MotherOps-Alpha',
    team: 'MotherOps-Alpha Team'
  });
  
  const members = membersList?.value || [];
  console.log(`Team now has ${members.length} members\n`);
  
  console.log('=== Storing All Identities in Neon ===\n');
  
  let updated = 0;
  for (const member of members) {
    const email = member.identity?.uniqueName || member.identity?.displayName || '';
    const azureId = member.identity?.id || '';
    
    if (!email || !azureId) continue;
    
    await neonMcpClient.query(
      `UPDATE config_users 
       SET azure_identity_id = $1, updated_at = NOW()
       WHERE user_principal_name ILIKE $2 OR user_id ILIKE $2 OR mail_nickname ILIKE $2`,
      [azureId, email]
    );
    
    console.log(`✓ ${email}`);
    updated++;
  }
  
  console.log(`\n✓ Updated ${updated} users\n`);
  
  console.log('=== Verification: Baker Family Identities ===\n');
  const withIds = await neonMcpClient.query<any>(
    `SELECT user_principal_name, azure_identity_id
     FROM config_users
     WHERE user_principal_name LIKE '%baker@%' AND azure_identity_id IS NOT NULL
     ORDER BY user_principal_name`,
    []
  );
  
  console.log(`${withIds.length} baker family members with Azure identities:\n`);
  for (const b of withIds) {
    console.log(`✓ ${b.user_principal_name}`);
  }
}

main().catch(console.error);
