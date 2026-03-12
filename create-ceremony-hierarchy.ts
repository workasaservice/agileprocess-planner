#!/usr/bin/env ts-node

import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfigurationAsync } from './src/lib/configLoader';
import { azureDevOpsMcpClient } from './src/clients/azureDevOpsMcpClient';

dotenv.config();

interface Sprint {
  project: string;
  name: string;
  iterationPath: string;
}

async function createProperHierarchy() {
  console.log('🔄 Creating proper parent-child hierarchy for ceremonies...\n');

  try {
    await loadConfigurationAsync();

    // Load sprints from the regenerated JSON file
    const jsonPath = path.join(process.cwd(), 'config', 'generated-iterations.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const sprints: Sprint[] = jsonData.results;

    console.log(`📊 Loaded ${sprints.length} sprints from database\n`);

    const projects = Array.from(new Set(sprints.map((s) => s.project)));

    for (const projectId of projects) {
      const projectSprints = sprints.filter((s) => s.project === projectId);
      
      console.log(`\n${'='.repeat(70)}`);
      console.log(`📋 ${projectId}: ${projectSprints.length} sprints`);
      console.log(`${'='.repeat(70)}`);

      let parentCount = 0;
      let taskCount = 0;

      for (const sprint of projectSprints) {
        console.log(`\n  🏃 ${sprint.name}`);

        // ===== MEETINGS PARENT & CHILDREN =====
        try {
          // Create "Meetings" User Story (parent)
          const meetingsStory = await azureDevOpsMcpClient.callTool('create-work-item', {
            project: projectId,
            type: 'User Story',
            title: `Meetings - ${sprint.name}`,
            description: `SAFe sprint ceremonies for ${sprint.name}.\n\nCoordinates all planned meetings: Sprint Planning, Daily Standup, Backlog Refinement, Sprint Review, and Sprint Retrospective.`,
            iterationPath: sprint.iterationPath,
            tags: 'ceremony; meetings; scrum'
          });

          console.log(`    ✅ Meetings (parent) #${meetingsStory.id}`);
          parentCount++;

          // Create ceremony tasks as children
          const ceremonies = [
            { name: 'Sprint Planning', time: '2 hours (Monday)' },
            { name: 'Daily Standup', time: '15 min (Daily Mon-Fri)' },
            { name: 'Backlog Refinement', time: '1 hour (Mid-week)' },
            { name: 'Sprint Review', time: '1.5 hours (Friday)' },
            { name: 'Sprint Retrospective', time: '1 hour (Friday)' }
          ];

          for (const ceremony of ceremonies) {
            const task = await azureDevOpsMcpClient.callTool('create-work-item', {
              project: projectId,
              type: 'Task',
              title: `${ceremony.name} (${ceremony.time})`,
              description: `${ceremony.name}\nDuration: ${ceremony.time}`,
              iterationPath: sprint.iterationPath,
              tags: 'ceremony'
            });

            // Link as child of Meetings parent
            await azureDevOpsMcpClient.callTool('link-work-items', {
              project: projectId,
              sourceId: meetingsStory.id,
              targetId: task.id,
              linkType: 'System.LinkTypes.Hierarchy-Forward'
            });

            console.log(`      ├─ ${ceremony.name} #${task.id}`);
            taskCount++;
          }
        } catch (error: any) {
          console.error(`    ❌ Error creating Meetings: ${error.message}`);
        }

        // ===== UNPLANNED PARENT & CHILDREN =====
        try {
          // Create "UnPlanned" User Story (parent)
          const unplannedStory = await azureDevOpsMcpClient.callTool('create-work-item', {
            project: projectId,
            type: 'User Story',
            title: `UnPlanned - ${sprint.name}`,
            description: `Contingency work and buffer capacity for ${sprint.name}.\n\nManages 15% team capacity buffer for handling unexpected work, defects, and incidents.`,
            iterationPath: sprint.iterationPath,
            tags: 'unplanned; contingency; buffer'
          });

          console.log(`    ✅ UnPlanned (parent) #${unplannedStory.id}`);
          parentCount++;

          // Create contingency tasks as children
          const contingencies = [
            { name: 'Buffer Capacity', capacity: '15% of sprint' },
            { name: 'Bug Fixes', capacity: 'As-needed' },
            { name: 'Production Support', capacity: 'On-call' }
          ];

          for (const contingency of contingencies) {
            const task = await azureDevOpsMcpClient.callTool('create-work-item', {
              project: projectId,
              type: 'Task',
              title: `${contingency.name} (${contingency.capacity})`,
              description: `${contingency.name}\nCapacity: ${contingency.capacity}`,
              iterationPath: sprint.iterationPath,
              tags: 'contingency'
            });

            // Link as child of UnPlanned parent
            await azureDevOpsMcpClient.callTool('link-work-items', {
              project: projectId,
              sourceId: unplannedStory.id,
              targetId: task.id,
              linkType: 'System.LinkTypes.Hierarchy-Forward'
            });

            console.log(`      ├─ ${contingency.name} #${task.id}`);
            taskCount++;
          }
        } catch (error: any) {
          console.error(`    ❌ Error creating UnPlanned: ${error.message}`);
        }
      }

      console.log(`\n  📊 ${projectId} summary:`);
      console.log(`     Parent stories: ${parentCount} (Meetings + UnPlanned)`);
      console.log(`     Child tasks: ${taskCount}`);
    }

    console.log(`\n\n${'='.repeat(70)}`);
    console.log('✅ Proper parent-child hierarchy created!');
    console.log('   - Each sprint has "Meetings" and "UnPlanned" parent stories');
    console.log('   - All ceremony and contingency tasks are children of their parents');
    console.log(`${'='.repeat(70)}\n`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

createProperHierarchy()
  .then(() => {
    console.log('✅ Done!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });
