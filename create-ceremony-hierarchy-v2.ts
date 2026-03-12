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

async function createHierarchyV2() {
  console.log('🔄 Creating proper parent-child hierarchy (V2)...\n');

  try {
    await loadConfigurationAsync();

    const jsonPath = path.join(process.cwd(), 'config', 'generated-iterations.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const sprints: Sprint[] = jsonData.results;

    console.log(`📊 ${sprints.length} sprints loaded\n`);

    const projects = Array.from(new Set(sprints.map((s) => s.project)));
    let totalParents = 0;
    let totalChildren = 0;

    for (const projectId of projects) {
      const projectSprints = sprints.filter((s) => s.project === projectId);
      
      console.log(`\n${'='.repeat(70)}`);
      console.log(`📋 ${projectId}`);
      console.log(`${'='.repeat(70)}`);

      for (const sprint of projectSprints) {
        console.log(`\n  🏃 ${sprint.name}`);

        // ===== CREATE MEETINGS PARENT =====
        const meetingsParent = await azureDevOpsMcpClient.callTool('create-work-item', {
          project: projectId,
          type: 'User Story',
          title: `Meetings - ${sprint.name}`,
          description: `SAFe ceremonies for ${sprint.name} (Sprint Planning, Daily Standup, Backlog Refinement, Review, Retro)`,
          iterationPath: sprint.iterationPath,
          tags: 'ceremony; meetings'
        });
        console.log(`    ✅ Meetings parent #${meetingsParent.id}`);
        totalParents++;

        // ===== CREATE MEETING CEREMONY TASKS =====
        const ceremonies = [
          'Sprint Planning (Monday 2h)',
          'Daily Standup (Mon-Fri 15m)',
          'Backlog Refinement (Mid-week 1h)',
          'Sprint Review (Friday 1.5h)',
          'Sprint Retrospective (Friday 1h)'
        ];

        for (const ceremony of ceremonies) {
          try {
            const task = await azureDevOpsMcpClient.callTool('create-work-item', {
              project: projectId,
              type: 'Task',
              title: ceremony,
              iterationPath: sprint.iterationPath,
              tags: 'ceremony'
            });

            // Try to link
            try {
              await azureDevOpsMcpClient.callTool('link-work-items', {
                project: projectId,
                sourceId: meetingsParent.id,
                targetId: task.id,
                linkType: 'System.LinkTypes.Hierarchy-Forward'
              });
              console.log(`      ├─ ${ceremony} #${task.id} [linked]`);
            } catch (e: any) {
              console.log(`      ├─ ${ceremony} #${task.id} [created, no link]`);
            }
            totalChildren++;
          } catch (e: any) {
            console.log(`      ├─ ${ceremony} [ERROR: ${e.message.substring(0, 40)}]`);
          }
        }

        // ===== CREATE UNPLANNED PARENT =====
        const unplannedParent = await azureDevOpsMcpClient.callTool('create-work-item', {
          project: projectId,
          type: 'User Story',
          title: `UnPlanned - ${sprint.name}`,
          description: `Contingency buffer (15%) and unplanned work for ${sprint.name}`,
          iterationPath: sprint.iterationPath,
          tags: 'contingency; unplanned'
        });
        console.log(`    ✅ UnPlanned parent #${unplannedParent.id}`);
        totalParents++;

        // ===== CREATE CONTINGENCY TASKS =====
        const contingencies = [
          'Buffer Capacity (15%)',
          'Bug Fixes (On-demand)',
          'Production Support (As-needed)'
        ];

        for (const contingency of contingencies) {
          try {
            const task = await azureDevOpsMcpClient.callTool('create-work-item', {
              project: projectId,
              type: 'Task',
              title: contingency,
              iterationPath: sprint.iterationPath,
              tags: 'contingency'
            });

            // Try to link
            try {
              await azureDevOpsMcpClient.callTool('link-work-items', {
                project: projectId,
                sourceId: unplannedParent.id,
                targetId: task.id,
                linkType: 'System.LinkTypes.Hierarchy-Forward'
              });
              console.log(`      ├─ ${contingency} #${task.id} [linked]`);
            } catch (e: any) {
              console.log(`      ├─ ${contingency} #${task.id} [created, no link]`);
            }
            totalChildren++;
          } catch (e: any) {
            console.log(`      ├─ ${contingency} [ERROR: ${e.message.substring(0, 40)}]`);
          }
        }
      }
    }

    console.log(`\n\n${'='.repeat(70)}`);
    console.log(`✅ Hierarchy Complete!`);
    console.log(`   Parent stories: ${totalParents}`);
    console.log(`   Child tasks: ${totalChildren}`);
    console.log(`   Total work items: ${totalParents + totalChildren}`);
    console.log(`${'='.repeat(70)}\n`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createHierarchyV2()
  .then(() => {
    console.log('✅ Done!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });
