import 'dotenv/config';
import { neonMcpClient } from '../src/clients/neonMcpClient.js';

async function main() {
  // Check users schema
  const userSchema = await neonMcpClient.query<any>(
    `SELECT column_name, data_type 
     FROM information_schema.columns 
     WHERE table_name = 'config_users'
     ORDER BY ordinal_position`,
    []
  );
  
  console.log('=== config_users Schema ===\n');
  for (const col of userSchema) {
    console.log(`${col.column_name}: ${col.data_type}`);
  }
  console.log('');

  // Get all users
  const users = await neonMcpClient.query<any>(
    `SELECT * FROM config_users ORDER BY user_id`,
    []
  );
  
  console.log('=== Team Members in Neon ===\n');
  if (!Array.isArray(users) || users.length === 0) {
    console.log('No users found');
    return;
  }

  for (const u of users) {
    console.log(`${u.user_id}`);
    console.log(`  JSON:`, JSON.stringify(u, null, 2));
    console.log('');
  }
}

main().catch(console.error);
