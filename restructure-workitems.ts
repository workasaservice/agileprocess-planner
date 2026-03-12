#!/usr/bin/env ts-node

import dotenv from 'dotenv';
import { azureDevOpsMcpClient } from './src/clients/azureDevOpsMcpClient';
import { neonMcpClient } from './src/clients/neonMcpClient';

dotenv.config();

async function restructureWorkItemsUnderParents() {
  console.log('🔄 Restructuring work items: Creating parent stories with child tasks...\n');

  const projects = ['MotherOps-Alpha', 'MotherOps-Beta'];

  try {
    for (const project of projects) {
      console.log(`\n📋 Project: ${project}`);
      console.log(`=====================================`);

      // Query sprints from database
      const sprints = await neonMcpClient.query(
        `SELECT sprint_name, iteration_path
         FROM config_project_iterations
         WHERE project_id = $1
         ORDER BY start_date`,
        [project]
      );

      if (!sprints || sprints.length === 0) {
        console.log('No sprints found');
        continue;
      }

      for (const sprint of sprints) {
        console.log(`\n  Sprint: ${sprint.sprint_name}`);

        // Step 1: Create parent "Meetings" story
        const meetingsParent = await azureDevOpsMcpClient.callTool('create-work-item', {
          project: project,
          type: 'User Story',
          title: `Meetings - ${sprint.sprint_name}`,
          description: `Sprint ceremonies parent story for ${sprint.sprint_name}`,
          iterationPath: sprint.iteration_path,
          tags: 'ceremony; meetings'
        });

        console.log(`    ✓ Created Meetings parent: ${meetingsParent.id}`);

        // Step 2: Create parent "UnPlanned" story
        const unplannedParent = await azureDevOpsMcpClient.callTool('create-work-item', {
          project: project,
          type: 'User Story',
          title: `UnPlanned - ${sprint.sprint_name}`,
          description: `Contingency capacity and unplanned work for ${sprint.sprint_name}`,
          iterationPath: sprint.iteration_path,
          tags: 'contingency; unplanned'
        });

        console.log(`    ✓ Created UnPlanned parent: ${unplannedParent.id}`);
      }
    }

    console.log('\n\n✅ Parent stories created successfully!');
    console.log('\nNext steps:');
    console.log('1. Query existing "Sprint Meetings" tasks');
    console.log('2. Link them as child tasks under the Meetings stories');
    console.log('3. Delete or move existing Issue work items\n');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

restructureWorkItemsUnderParents()
  .then(() => {
    console.log('✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });
