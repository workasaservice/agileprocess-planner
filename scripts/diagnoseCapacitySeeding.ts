import 'dotenv/config';
import { neonMcpClient } from '../src/clients/neonMcpClient.js';

async function main() {
  console.log('=== Checking what team member data we have ===\n');
  
  // Check what tables relate to team members
  const tables = ['config_project_members', 'config_users', 'sprint_capacity_defaults'];
  
  for (const table of tables) {
    const schema = await neonMcpClient.query<any>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
      [table]
    );
    console.log(`${table}:`);
    for (const col of schema) {
      console.log(`  - ${col.column_name}`);
    }
    console.log('');
  }
  
  // Get MotherOps-Alpha project members
  console.log('=== MotherOps-Alpha Project Members ===\n');
  const projectMembers = await neonMcpClient.query<any>(
    `SELECT cpm.id, cpm.user_id, cu.user_principal_name, cu.role_id 
     FROM config_project_members cpm
     JOIN config_users cu ON cpm.user_id = cu.user_id
     WHERE cpm.project_id = $1
     ORDER BY cu.user_principal_name`,
    ['MotherOps-Alpha']
  );
  
  for (const m of projectMembers) {
    console.log(`${m.user_principal_name}`);
    console.log(`  id: ${m.id}`);
    console.log(`  user_id: ${m.user_id}`);
    console.log(`  role_id: ${m.role_id}`);
  }
  
  console.log(`\nTotal MotherOps-Alpha project members: ${projectMembers.length}`);
}

main().catch(console.error);
