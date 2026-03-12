#!/usr/bin/env ts-node

import dotenv from 'dotenv';
import { azureDevOpsMcpClient } from './src/clients/azureDevOpsMcpClient';

dotenv.config();

async function findExistingWorkItems() {
  console.log('🔍 Querying existing work items to see iteration path format...\n');

  const projects = ['MotherOps-Alpha', 'MotherOps-Beta'];

  for (const project of projects) {
    console.log(`\n📋 Project: ${project}`);
    console.log(`=====================================`);
    
    try {
      const result = await azureDevOpsMcpClient.callTool('list-work-items', {
        project: project,
        query: `SELECT [System.Id], [System.Title], [System.IterationPath] FROM workitems WHERE [System.TeamProject] = '${project}'`
      });

      if (result.workItems && result.workItems.length > 0) {
        console.log(`Found ${result.workItems.length} work items:\n`);
        console.log('Sample response structure:', JSON.stringify(result.workItems[0], null, 2).substring(0, 200));
        result.workItems.slice(0, 1).forEach((item: any) => {
          console.log('\nFull item:', JSON.stringify(item, null, 2));
        });
      } else {
        console.log('No work items found\n');
      }
      
    } catch (error: any) {
      console.error(`❌ Error: ${error.message}\n`);
    }
  }
}

findExistingWorkItems()
  .then(() => {
    console.log('✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });
