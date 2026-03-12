#!/usr/bin/env ts-node

import dotenv from 'dotenv';
import { neonMcpClient } from './src/clients/neonMcpClient';

dotenv.config();

async function updateSprintNamesToOldFormat() {
  console.log('🔄 Converting iteration names from Weekly to Sprint format...\n');

  try {
    // SQL to update sprint_name from "Weekly YYYY-MM-DD" to "Sprint YYYY-MM-DD"
    const result = await neonMcpClient.callTool('run_sql', {
      sql: `UPDATE config_project_iterations
            SET sprint_name = 'Sprint ' || SUBSTRING(sprint_name FROM 8)
            WHERE sprint_name LIKE 'Weekly%'
            AND project_id IN ('MotherOps-Alpha', 'MotherOps-Beta')`,
      params: []
    });

    console.log('✅ Updated sprint names');

    // Also update iteration_path
    const pathResult = await neonMcpClient.callTool('run_sql', {
      sql: `UPDATE config_project_iterations
            SET iteration_path = REPLACE(iteration_path, 'Weekly ', 'Sprint ')
            WHERE iteration_path LIKE '%Weekly%'
            AND project_id IN ('MotherOps-Alpha', 'MotherOps-Beta')`,
      params: []
    });

    console.log('✅ Updated iteration paths');

    // Query to confirm changes
    const confirmResult = await neonMcpClient.query(
      `SELECT project_id, sprint_name, iteration_path 
       FROM config_project_iterations
       WHERE project_id IN ('MotherOps-Alpha', 'MotherOps-Beta')
       LIMIT 3`
    );

    console.log('\n📊 Sample of updated iterations:');
    confirmResult.forEach((iter: any) => {
      console.log(`  ${iter.sprint_name}`);
      console.log(`  Path: ${iter.iteration_path}\n`);
    });

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

updateSprintNamesToOldFormat()
  .then(() => {
    console.log('\n✅ Done! Now regenerate JSON with: npx tsx regenerate-iterations-json.ts');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });
