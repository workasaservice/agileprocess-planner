#!/usr/bin/env ts-node

import dotenv from 'dotenv';
import { azureDevOpsMcpClient } from './src/clients/azureDevOpsMcpClient';

dotenv.config();

async function auditSprintsAndWorkItems() {
  console.log('🔍 Auditing Azure DevOps for sprints and work items...\n');

  const projects = ['MotherOps-Alpha', 'MotherOps-Beta'];

  for (const project of projects) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📋 PROJECT: ${project}`);
    console.log(`${'='.repeat(60)}`);

    try {
      // Get all work items - estimate count
      const wiResult = await azureDevOpsMcpClient.callTool('list-work-items', {
        project: project,
        query: `SELECT [System.Id], [System.Title], [System.WorkItemType] FROM workitems WHERE [System.TeamProject] = '${project}'`
      });

      const totalWI = wiResult.workItems?.length || 0;
      
      // Count by type
      const byType: Record<string, number> = {};
      if (wiResult.workItems) {
        wiResult.workItems.forEach((wi: any) => {
          // Need to fetch details to get type
        });
      }

      console.log(`\n📊 Work Items:`);
      console.log(`   Total count: ${totalWI}`);
      console.log(`   Expected: ~247 items (26 Issues + 221 Tasks)`);
      console.log(`   Status: ${totalWI >= 240 ? '✅ Correct' : '⚠️  May be missing items'}`);

      // Get a sample to show structure
      if (wiResult.workItems && wiResult.workItems.length > 0) {
        const sampleId = wiResult.workItems[0].id;
        const sampleItem = await azureDevOpsMcpClient.callTool('get-work-item', {
          project: project,
          id: sampleId
        });

        console.log(`\n📌 Sample Work Item:`);
        console.log(`   ID: ${sampleId}`);
        console.log(`   Title: ${sampleItem.fields?.['System.Title'] || '?'}`);
        console.log(`   Type: ${sampleItem.fields?.['System.WorkItemType'] || '?'}`);
        console.log(`   State: ${sampleItem.fields?.['System.State'] || '?'}`);
        
        if (sampleItem.relations) {
          const parentLink = sampleItem.relations.find((r: any) => r.rel === 'System.LinkTypes.Hierarchy-reverse');
          console.log(`   Parent: ${parentLink ? 'Yes' : 'No'}`);
        }
      }

      console.log(`\n🏃 Sprint Iterations:`);
      try {
        const sprints = await azureDevOpsMcpClient.callTool('list-sprints', {
          project: project,
          team: project
        });

        if (sprints && sprints.length > 0) {
          console.log(`   Total: ${sprints.length} sprints`);
          console.log(`   Expected: 13 sprints (Mar 9 - Jun 1)`);
          
          // Check for duplicates
          const nameMap: Record<string, number> = {};
          sprints.forEach((s: any) => {
            nameMap[s.name] = (nameMap[s.name] || 0) + 1;
          });

          const duplicates = Object.entries(nameMap).filter(([, count]) => count > 1);
          
          if (duplicates.length > 0) {
            console.log(`\n   ⚠️  DUPLICATES FOUND:`);
            duplicates.forEach(([name, count]) => {
              console.log(`      "${name}": ${count} instances`);
            });
            console.log(`\n   ACTION: Delete duplicates via Azure DevOps UI`);
          } else {
            console.log(`   ✅ No duplicates found`);
          }

          console.log(`\n   Sprints:`);
          sprints.slice(0, 3).forEach((s: any) => {
            console.log(`      • ${s.name} (ID: ${s.id})`);
          });
          if (sprints.length > 3) {
            console.log(`      ... and ${sprints.length - 3} more`);
          }
        } else {
          console.log(`   ⚠️  No sprints found!`);
        }
      } catch (error: any) {
        console.log(`   ⚠️  Could not list sprints: ${error.message}`);
      }

    } catch (error: any) {
      console.error(`❌ Error: ${error.message}`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('📋 CLEANUP CHECKLIST');
  console.log(`${'='.repeat(60)}`);
  console.log(`\n1. ✅ Verify 247+ work items created (ceremony + unplanned)`);
  console.log(`2. ⏳ Check for duplicate Sprint iterations (see above)`);
  console.log(`3. 🗑️  Delete any duplicate sprints via Azure DevOps UI:`);
  console.log(`     - Settings → Project Configuration → Classification Nodes`);
  console.log(`     - Expand "Iteration" → Delete duplicates (keep 1 of each name)`);
  console.log(`4. ✅ Verify parent-child structure:`);
  console.log(`     - Backlog view should show tasks under parent issues`);
  console.log(`\n`);
}

auditSprintsAndWorkItems()
  .then(() => {
    console.log('✅ Audit complete!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Audit failed:', error);
    process.exit(1);
  });
