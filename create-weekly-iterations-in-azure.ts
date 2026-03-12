#!/usr/bin/env ts-node

import dotenv from 'dotenv';
import { neonMcpClient } from './src/clients/neonMcpClient';
import { azureDevOpsMcpClient } from './src/clients/azureDevOpsMcpClient';

dotenv.config();

async function createWeeklyIterationsInAzure() {
  console.log('🔄 Creating Weekly iterations in Azure DevOps...\n');

  try {
    // Query iterations from database
    const iterations = await neonMcpClient.query(
      `SELECT 
        project_id,
        sprint_name,
        start_date,
        finish_date,
        iteration_path
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
      console.log(`Processing: ${iter.project_id} - ${iter.sprint_name}...`);
      
      try {
        const result = await azureDevOpsMcpClient.callTool('create-sprint', {
          project: iter.project_id,
          team: `${iter.project_id} Team`,
          name: iter.sprint_name,
          startDate: iter.start_date,
          finishDate: iter.finish_date
        });

        console.log(`  ✅ Created iteration: ${result.path}`);
        created++;
        
      } catch (error: any) {
        if (error.message && error.message.includes('already exists')) {
          console.log(`  ⏩ Skipped (already exists)`);
          skipped++;
        } else {
          console.error(`  ❌ Error: ${error.message}`);
          errors++;
        }
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Created: ${created}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors: ${errors}`);

  } catch (error: any) {
    console.error('❌ Error creating iterations:', error.message);
    throw error;
  }
}

createWeeklyIterationsInAzure()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });
