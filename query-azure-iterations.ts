#!/usr/bin/env ts-node

import dotenv from 'dotenv';
import { azureDevOpsMcpClient } from './src/clients/azureDevOpsMcpClient';

dotenv.config();

async function queryAzureIterations() {
  console.log('🔍 Querying iterations from Azure DevOps...\n');

  try {
    const projects = ['MotherOps-Alpha', 'MotherOps-Beta'];

    for (const project of projects) {
      console.log(`\n📋 Project: ${project}`);
      console.log(`=====================================`);
      
      try {
        const iterations = await azureDevOpsMcpClient.callTool('list-sprints', {
          project: project,
          team: project
        });

        console.log(`Found ${iterations.length || 0} iterations:\n`);
        
        if (Array.isArray(iterations)) {
          iterations.forEach((iter: any, idx: number) => {
            console.log(`${idx + 1}. ${iter.name}`);
            console.log(`   Path: ${iter.path}`);
            console.log(`   ID: ${iter.id}`);
            if (iter.attributes) {
              console.log(`   Start: ${iter.attributes.startDate || 'N/A'}`);
              console.log(`   Finish: ${iter.attributes.finishDate || 'N/A'}`);
            }
            console.log('');
          });
        } else {
          console.log('Response:', JSON.stringify(iterations, null, 2));
        }
        
      } catch (error: any) {
        console.error(`❌ Error querying ${project}:`, error.message);
      }
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

queryAzureIterations()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });
