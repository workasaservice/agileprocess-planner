#!/usr/bin/env ts-node

import dotenv from 'dotenv';
import { neonMcpClient } from './src/clients/neonMcpClient';
import { azureDevOpsMcpClient } from './src/clients/azureDevOpsMcpClient';

dotenv.config();

async function createAllSprintIterations() {
  console.log('🔄 Creating all Sprint iterations in Azure DevOps...\n');

  try {
    // Query iterations from database
    const iterations = await neonMcpClient.query(
      `SELECT 
        project_id,
        sprint_name,
        start_date,
        finish_date
      FROM config_project_iterations
      WHERE project_id IN ('MotherOps-Alpha', 'MotherOps-Beta')
      ORDER BY project_id, start_date`
    );

    if (!iterations || iterations.length === 0) {
      console.log('⚠️  No iterations found in database');
      return;
    }

    console.log(`📊 Found ${iterations.length} iterations in database\n`);

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const iter of iterations) {
      const displayName = `${iter.project_id}: ${iter.sprint_name}`;
      
      try {
        const result = await azureDevOpsMcpClient.callTool('create-sprint', {
          project: iter.project_id,
          team: `${iter.project_id} Team`,
          name: iter.sprint_name,
          startDate: iter.start_date,
          finishDate: iter.finish_date
        });

        console.log(`✅ ${displayName}`);
        created++;
        
      } catch (error: any) {
        const msg = error.message || '';
        if (msg.includes('already exists') || msg.includes('already in use')) {
          console.log(`⏩ ${displayName} (already exists)`);
          skipped++;
        } else {
          console.log(`❌ ${displayName}: ${msg.substring(0, 60)}`);
          errors++;
        }
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Created: ${created}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors: ${errors}`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

createAllSprintIterations()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });
