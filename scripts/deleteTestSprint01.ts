import 'dotenv/config';
import { azureDevOpsMcpClient } from '../src/clients/azureDevOpsMcpClient.js';

async function main() {
  console.log('=== Deleting TestSprint 01 from Azure DevOps ===\n');
  
  try {
    const result = await azureDevOpsMcpClient.callTool('delete-iteration', {
      project: 'MotherOps-Alpha',
      name: 'TestSprint 01'
    });
    
    console.log('✓ Iteration deleted');
  } catch (err: any) {
    console.log('Error:', err.message);
  }
}

main().catch(console.error);
