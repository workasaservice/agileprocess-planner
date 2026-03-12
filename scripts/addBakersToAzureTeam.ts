import 'dotenv/config';
import { azureDevOpsMcpClient } from '../src/clients/azureDevOpsMcpClient.js';
import { neonMcpClient } from '../src/clients/neonMcpClient.js';

async function main() {
  console.log('=== Adding Baker Family Members to Azure Team ===\n');
  
  // Get members to add
  const bakersToAdd = [
    'dadi.baker@workasaservice.ai',
    'henry.baker@workasaservice.ai',
    'jake.baker@workasaservice.ai',
    'jessica.baker@workasaservice.ai',
    // kate.baker is already there
    'lorraine.baker@workasaservice.ai',
    'mark.baker@workasaservice.ai',
    'tom.baker@workasaservice.ai'
  ];
  
  // Add each member to Azure team
  console.log('Adding members to MotherOps-Alpha Team:\n');
  
  for (const email of bakersToAdd) {
    try {
      console.log(`  Adding: ${email}`);
      
      const result = await azureDevOpsMcpClient.callTool('add-team-member', {
        project: 'MotherOps-Alpha',
        team: 'MotherOps-Alpha Team',
        memberId: email
      });
      
      console.log(`    ✓ Added to team`);
    } catch (err: any) {
      const msg = err.message || String(err);
      if (msg.includes('already exists') || msg.includes('already') || msg.includes('already a member')) {
        console.log(`    ✓ Already a member`);
      } else {
        console.log(`    ⚠ Error: ${msg}`);
      }
    }
  }
  
  console.log('\n[Fetching updated team members...]');
  const membersList = await azureDevOpsMcpClient.callTool('get-team-members', {
    project: 'MotherOps-Alpha',
    team: 'MotherOps-Alpha Team'
  });
  
  const members = membersList?.value || [];
  console.log(`\n✓ Team now has ${members.length} members:\n`);
  
  const identityMap = new Map<string, string>();
  for (const m of members) {
    const email = m.identity?.uniqueName || m.identity?.displayName || '?';
    const id = m.identity?.id || m.id || '?';
    console.log(`  ${email} (id: ${id.substring(0, 8)}...)`);
    identityMap.set(email, id);
  }
  
  // Update Neon with all identities
  console.log('\n[Updating Neon with Azure identities...]');
  
  for (const [email, azureId] of identityMap) {
    await neonMcpClient.query(
      `UPDATE config_users 
       SET azure_identity_id = $1, updated_at = NOW()
       WHERE user_principal_name = $2 OR user_id = $2 OR mail_nickname = $2`,
      [azureId, email]
    );
  }
  
  console.log('✓ Neon updated with all Azure identities');
}

main().catch(console.error);
