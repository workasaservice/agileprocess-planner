import 'dotenv/config';
import axios from 'axios';
import { neonMcpClient } from '../src/clients/neonMcpClient.js';

async function main() {
  // Get org and PAT from env
  const org = process.env.AZURE_DEVOPS_ORG || 'workasaservice';
  const pat = process.env.AZURE_DEVOPS_PAT || '';
  
  if (!pat) {
    console.error('Error: AZURE_DEVOPS_PAT not set');
    process.exit(1);
  }
  
  console.log('=== Fetching Project Members (All Users) ===\n');
  
  // Create auth header
  const auth = Buffer.from(`:${pat}`).toString('base64');
  const headers = { 'Authorization': `Basic ${auth}` };
  
  // Query project members (all users in project)
  const response = await axios.get(
    `https://vsaex.dev.azure.com/${org}/_apis/projects/MotherOps-Alpha/teams`,
    {
      params: { 'api-version': '7.0' },
      headers
    }
  );
  
  console.log(`Found ${response.data.value.length} teams`);
  
  // Find MotherOps-Alpha Team
  const team = response.data.value.find((t: any) => t.name === 'MotherOps-Alpha Team');
  if (!team) {
    console.error('Team not found');
    return;
  }
  
  console.log(`\n=== Getting Members of ${team.name} ===\n`);
  
  // Get team members
  const membersResponse = await axios.get(
    `https://dev.azure.com/${org}/_apis/projects/MotherOps-Alpha/teams/${team.id}/members`,
    {
      params: { 'api-version': '7.0' },
      headers
    }
  );
  
  const members = membersResponse.data.value || [];
  console.log(`Team has ${members.length} members\n`);
  
  // Log all members
  for (const m of members) {
    const email = m.identity?.uniqueName || m.displayName || '';
    const id = m.identity?.id || m.id || '';
    console.log(`${email} (id: ${id.substring(0, 8)}...)`);
  }
  
  console.log('\n=== Storing Identities in Neon ===\n');
  
  let updated = 0;
  for (const m of members) {
    const email = m.identity?.uniqueName || m.displayName || '';
    const id = m.identity?.id || m.id || '';
    
    if (!email || !id) continue;
    
    try {
      await neonMcpClient.query(
        `UPDATE config_users 
         SET azure_identity_id = $1, updated_at = NOW()
         WHERE user_principal_name ILIKE $2 OR user_id ILIKE $2 OR mail_nickname ILIKE $2`,
        [id, email]
      );
      
      console.log(`✓ ${email}`);
      updated++;
    } catch (err) {
      console.log(`✗ ${email}: ${err}`);
    }
  }
  
  console.log(`\n✓ Stored ${updated} identities in Neon`);
}

main().catch(console.error);
