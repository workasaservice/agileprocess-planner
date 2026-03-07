import * as dotenv from 'dotenv';
import { neonMcpClient } from './src/clients/neonMcpClient';
import * as fs from 'fs';

dotenv.config();

async function runMigrationViaMcp() {
  const sql = fs.readFileSync('db/migrations/004-sprint-automation-schema.sql', 'utf8');
  
  // Split into individual statements (basic splitting by semicolon, skipping comments)
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--') &&  !s.startsWith('/*') && !s.startsWith('*'));
  
  console.log(`Found ${statements.length} SQL statements to execute`);
  
  let successCount = 0;
  let skipCount = 0;
  
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    
    if (!stmt) {
      skipCount++;
      continue;
    }
    
    // Skip comments and doc blocks
    if (stmt.includes('/**') || stmt.includes('**/') || stmt.trim().length < 10) {
      skipCount++;
      continue;
    }
    
    try {
      console.log(`\n[${i + 1}/${statements.length}] Executing: ${stmt.substring(0, 80)}...`);
      await neonMcpClient.callTool('run_sql', { sql: stmt });
      successCount++;
      console.log('✓ Success');
    } catch (e) {
      const error = e as Error;
      // Ignore "already exists" errors
      if (error.message.includes('already exists')) {
        console.log('⊙ Skipped (already exists)');
        skipCount++;
      } else {
        console.error(`✗ Error: ${error.message}`);
        throw error;
      }
    }
  }
  
  console.log(`\n✓ Migration complete: ${successCount} created, ${skipCount} skipped`);
}

runMigrationViaMcp().catch(e => {
  console.error('Migration failed:', (e as Error).message);
  process.exit(1);
});
