#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { neonMcpClient } from './src/clients/neonMcpClient';

dotenv.config();

async function regenerateIterationsJson() {
  console.log('🔄 Regenerating config/generated-iterations.json from database...\n');

  try {
    // Query iterations from database
    const iterations = await neonMcpClient.query(
      `SELECT 
        project_id,
        sprint_name,
        start_date,
        finish_date,
        iteration_path,
        iteration_id
      FROM config_project_iterations
      WHERE project_id IN ('MotherOps-Alpha', 'MotherOps-Beta')
      ORDER BY project_id, start_date`
    );

    if (!iterations || iterations.length === 0) {
      console.log('⚠️  No iterations found in database');
      return;
    }

    // Transform database rows to expected JSON format
    const results = iterations.map((row: any) => ({
      project: row.project_id,
      team: `${row.project_id} Team`,
      name: row.sprint_name,
      startDate: row.start_date,
      finishDate: row.finish_date,
      status: 'created',
      iterationId: row.iteration_id,
      iterationPath: row.iteration_path
    }));

    // Create output structure
    const output = {
      total: results.length,
      created: results.length,
      skipped: 0,
      errors: 0,
      results: results
    };

    // Write to config/generated-iterations.json
    const outputPath = path.join(process.cwd(), 'config', 'generated-iterations.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

    console.log(`✅ Successfully regenerated ${results.length} iterations:`);
    
    // Group by project for summary
    const byProject: Record<string, number> = {};
    results.forEach((it: any) => {
      byProject[it.project] = (byProject[it.project] || 0) + 1;
    });

    Object.entries(byProject).forEach(([project, count]) => {
      console.log(`   - ${project}: ${count} iterations`);
    });

    console.log(`\n📝 Written to: ${outputPath}`);

  } catch (error: any) {
    console.error('❌ Error regenerating iterations:', error.message);
    throw error;
  }
}

regenerateIterationsJson()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });
