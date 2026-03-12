import 'dotenv/config';
import { neonMcpClient } from '../src/clients/neonMcpClient.js';
import { azureDevOpsMcpClient } from '../src/clients/azureDevOpsMcpClient.js';

async function main() {
  console.log('=== Adding azure_identity_id to config_users ===\n');
  
  // Step 1: Add column if it doesn't exist
  console.log('[1] Adding azure_identity_id column to config_users...');
  try {
    await neonMcpClient.query(
      `ALTER TABLE config_users ADD COLUMN azure_identity_id VARCHAR(255)`,
      []
    );
    console.log('✓ Column added');
  } catch (err: any) {
    if (err.message?.includes('already exists')) {
      console.log('✓ Column already exists');
    } else {
      throw err;
    }
  }
  
  // Step 2: Get Azure team members to populate the identities
  console.log('\n[2] Fetching Azure team member identities...');
  
  const membersList = await azureDevOpsMcpClient.callTool('get-team-members', {
    project: 'MotherOps-Alpha',
    team: 'MotherOps-Alpha Team'
  });
  
  const members = membersList?.value || membersList?.result?.value || [];
  
  console.log(`Found ${members.length} Azure team members`);
  
  // Step 3: Update config_users with Azure identity IDs
  console.log('\n[3] Updating config_users with Azure identity IDs...');
  let updated = 0;
  
  for (const member of members) {
    const email = member.identity?.displayName || member.displayName;
    const azureId = member.identity?.id || member.id;
    
    if (!email || !azureId) {
      console.log(`  ⚠ Skipping member: missing email or ID`);
      continue;
    }
    
    await neonMcpClient.query(
      `UPDATE config_users 
       SET azure_identity_id = $1, updated_at = NOW()
       WHERE user_principal_name = $2 OR user_id = $2`,
      [azureId, email]
    );
    console.log(`  ✓ ${email}`);
    updated++;
  }
  
  console.log(`\n✓ Updated ${updated} users with Azure identity IDs`);
  
  // Step 4: Verify
  console.log('\n[4] Verification:');
  const verified = await neonMcpClient.query<any>(
    `SELECT user_principal_name, azure_identity_id, role_id
     FROM config_users
     WHERE user_principal_name LIKE '%.baker@workasaservice.ai'
     AND project_ids @> '["MotherOps-Alpha"]'::jsonb
     ORDER BY user_principal_name`,
    []
  );
  
  for (const u of verified) {
    console.log(`  ${u.user_principal_name}: ${u.azure_identity_id ? '✓ ID set' : '✗ NO ID'}`);
  }
}

main().catch(console.error);
