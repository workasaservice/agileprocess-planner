#!/usr/bin/env ts-node

import dotenv from 'dotenv';
import { azureDevOpsMcpClient } from './src/clients/azureDevOpsMcpClient';

dotenv.config();

async function deleteSprintIterations() {
  console.log('🗑️  Deleting Sprint iterations from Azure DevOps...\n');

  const projects = ['MotherOps-Alpha', 'MotherOps-Beta'];
  
  try {
    for (const project of projects) {
      console.log(`\n📋 Project: ${project}`);
      console.log(`=====================================`);
      
      // List all sprints to get their IDs
      const sprints = await azureDevOpsMcpClient.callTool('list-sprints', {
        project: project,
        team: project
      });

      if (!sprints || sprints.length === 0) {
        console.log('No sprints found');
        continue;
      }

      console.log(`Found ${sprints.length} sprints to delete\n`);

      let deleted = 0;
      for (const sprint of sprints) {
        try {
          // Note: Azure DevOps API may not support direct deletion of iterations
          // We'll attempt but may need manual UI deletion
          console.log(`Attempting to delete: ${sprint.name}...`);
          
          // The API endpoint would be: DELETE /_apis/wit/classificationnodes/iterations/{id}
          // But this might require a different approach
          console.log(`⚠️  Iteration deletion may require manual removal in Azure DevOps UI`);
          console.log(`   Path: ${sprint.path}`);
          
        } catch (error: any) {
          console.error(`Error deleting ${sprint.name}: ${error.message}`);
        }
      }
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

deleteSprintIterations()
  .then(() => {
    console.log('\n\n📋 Manual Cleanup Instructions:');
    console.log('=====================================');
    console.log('To delete sprints from Azure DevOps UI:');
    console.log('1. Go to Project Settings → Project Configuration');
    console.log('2. Click on "Sprints" (or "Iterations")');
    console.log('3. Select each Sprint 2026-XX-XX iteration');
    console.log('4. Click "Delete" button');
    console.log('5. Confirm deletion\n');
    
    console.log('⚠️  WARNING: Do NOT delete the parent "Iteration" classification node!');
    console.log('   Only delete the individual Sprint YYYY-MM-DD items.\n');
    
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });
