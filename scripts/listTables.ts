import 'dotenv/config';
import { neonMcpClient } from '../src/clients/neonMcpClient.js';

async function main() {
  try {
    const tables = await neonMcpClient.query<any>(
      `SELECT table_name 
       FROM information_schema.tables 
       WHERE table_schema = 'public'
       ORDER BY table_name`,
      []
    );
    
    console.log('Tables in Neon:');
    if (Array.isArray(tables)) {
      for (const t of tables) {
        console.log('  -', t.table_name);
      }
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

main().catch(console.error);
