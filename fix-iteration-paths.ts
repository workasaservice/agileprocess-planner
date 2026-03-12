#!/usr/bin/env ts-node

import dotenv from 'dotenv';
import { neonMcpClient } from './src/clients/neonMcpClient';

dotenv.config();

async function fixIterationPaths() {
  console.log('🔄 Fixing iteration paths to correct format...\n');

  try {
    // Update paths from \MotherOps-Alpha\Iteration\Sprint to MotherOps-Alpha\Sprint
    const updateAlpha = await neonMcpClient.callTool('run_sql', {
      sql: `UPDATE config_project_iterations
            SET iteration_path = REGEXP_REPLACE(iteration_path, '^\\\\MotherOps-Alpha\\\\Iteration\\\\', 'MotherOps-Alpha\\')
            WHERE project_id = 'MotherOps-Alpha'`,
      params: []
    });

    console.log('✅ Updated MotherOps-Alpha paths');

    const updateBeta = await neonMcpClient.callTool('run_sql', {
      sql: `UPDATE config_project_iterations
            SET iteration_path = REGEXP_REPLACE(iteration_path, '^\\\\MotherOps-Beta\\\\Iteration\\\\', 'MotherOps-Beta\\')
            WHERE project_id = 'MotherOps-Beta'`,
      params: []
    });

    console.log('✅ Updated MotherOps-Beta paths');

    // Query to confirm changes
    const confirmResult = await neonMcpClient.query(
      `SELECT project_id, sprint_name, iteration_path 
       FROM config_project_iterations
       WHERE project_id IN ('MotherOps-Alpha', 'MotherOps-Beta')
       ORDER BY project_id
       LIMIT 3`
    );

    console.log('\n📊 Sample of corrected paths:');
    confirmResult.forEach((iter: any) => {
      console.log(`  ${iter.sprint_name}`);
      console.log(`  Path: ${iter.iteration_path}\n`);
    });

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

fixIterationPaths()
  .then(() => {
    console.log('\n✅ Done! Now regenerate JSON with: npx tsx regenerate-iterations-json.ts');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });
