import * as dotenv from 'dotenv';
import { neonMcpClient } from './src/clients/neonMcpClient';
import * as fs from 'fs';

dotenv.config();

(async () => {
  try {
    console.log('Environment check:');
    console.log('- NEON_MCP_API_KEY:', process.env.NEON_MCP_API_KEY ? '✓ set' : '✗ not set');
    console.log('- NEON_PROJECT_ID:', process.env.NEON_PROJECT_ID || '(not set)');
    console.log('- NEON_BRANCH_ID:', process.env.NEON_BRANCH_ID || '(not set)');
    
    const sql = fs.readFileSync('db/migrations/004-sprint-automation-schema.sql', 'utf8');
    console.log('\nRunning migration via Neon MCP client...');
    
    const result = await neonMcpClient.callTool('run_sql', { sql });
    
    console.log('✓ Migration succeeded!');
    console.log('Result:', JSON.stringify(result, null, 2).substring(0, 500));
  } catch (e) {
    console.error('✗ Migration error:', (e as Error).message);
    process.exit(1);
  }
})();
