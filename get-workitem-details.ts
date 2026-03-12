#!/usr/bin/env ts-node

import dotenv from 'dotenv';
import { azureDevOpsMcpClient } from './src/clients/azureDevOpsMcpClient';

dotenv.config();

async function getWorkItemDetails() {
  console.log('🔍 Getting work item details...\n');

  const projects = ['MotherOps-Alpha'];

  for (const project of projects) {
    console.log(`\n📋 Project: ${project}`);
    
    try {
      // First get a list of work item IDs
      const listResult = await azureDevOpsMcpClient.callTool('list-work-items', {
        project: project,
        query: `SELECT [System.Id] FROM workitems WHERE [System.TeamProject] = '${project}'`
      });

      if (listResult.workItems && listResult.workItems.length > 0) {
        const firstId = listResult.workItems[0].id;
        console.log(`Getting details for work item #${firstId}...\n`);
        
        const details = await azureDevOpsMcpClient.callTool('get-work-item', {
          project: project,
          id: firstId
        });

        console.log('Fields:');
        if (details.fields) {
          Object.entries(details.fields).forEach(([key, value]: [string, any]) => {
            if (key.includes('Iteration') || key.includes('iteration')) {
              console.log(`  ${key}: ${value}`);
            }
          });
        }
        console.log('\nFull response keys:', Object.keys(details).join(', '));
      } else {
        console.log('No work items found');
      }
      
    } catch (error: any) {
      console.error(`❌ Error: ${error.message}\n`);
    }
  }
}

getWorkItemDetails()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });
