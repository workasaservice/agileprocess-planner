import 'dotenv/config';
import { azureDevOpsMcpClient } from '../src/clients/azureDevOpsMcpClient.js';

async function main() {
  console.log('=== Checking All Teams via MCP ===\n');
  
  // List all sprints/iterations first to understand project structure
  const sprintsResult = await azureDevOpsMcpClient.callTool('list-sprints', {
    project: 'MotherOps-Alpha'
  });
  
  const sprints = sprintsResult?.value || [];
  console.log(`Found ${sprints.length} iterations/sprints\n`);
  
  // Try to get team members again with explicit output
  console.log('=== MotherOps-Alpha Team Members (via MCP) ===\n');
  
  const members = await azureDevOpsMcpClient.callTool('get-team-members', {
    project: 'MotherOps-Alpha',
    team: 'MotherOps-Alpha Team'
  });
  
  console.log(`Raw response:`, JSON.stringify(members, null, 2));
  
  const memberList = members?.value || [];
  console.log(`\nTotal members: ${memberList.length}`);
  
  for (const m of memberList) {
    const email = m.identity?.uniqueName || m.identity?.displayName || m.displayName || '?';
    const id = m.identity?.id || m.id || '?';
    console.log(`  - ${email.padEnd(35)} [${id.substring(0, 8)}...]`);
  }
}

main().catch(console.error);
