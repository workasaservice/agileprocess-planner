#!/usr/bin/env ts-node

import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

interface AzureConfig {
  org: string;
  token: string;
  serverUrl: string;
}

function resolveAzureConfig(): AzureConfig {
  const org = process.env.AZURE_DEVOPS_ORG || 'workasaservice';
  const token = process.env.AZURE_DEVOPS_PAT;
  const serverUrl = `https://dev.azure.com/${org}`;

  if (!token) {
    throw new Error('AZURE_DEVOPS_PAT is not configured');
  }

  return { org, token, serverUrl };
}

function createAxiosClient(config: AzureConfig) {
  const encodedToken = Buffer.from(`${config.org}:${config.token}`).toString('base64');
  
  return axios.create({
    baseURL: config.serverUrl,
    headers: {
      Authorization: `Basic ${encodedToken}`,
      'Content-Type': 'application/json'
    },
    timeout: 30000
  });
}

async function deleteAllIterations() {
  console.log('🗑️  Starting comprehensive cleanup...\n');

  const config = resolveAzureConfig();
  const client = createAxiosClient(config);
  const projects = ['MotherOps-Alpha', 'MotherOps-Beta'];

  for (const project of projects) {
    console.log(`\n📋 Project: ${project}`);
    console.log('='.repeat(60));

    try {
      // Step 1: Delete all work items with "Meetings" or "UnPlanned" in title
      console.log('\n1️⃣  Deleting duplicate Meetings and UnPlanned issues...');
      
      const query = `SELECT [System.Id], [System.Title] FROM workitems WHERE [System.TeamProject] = '${project}' AND ([System.Title] CONTAINS 'Meetings' OR [System.Title] CONTAINS 'UnPlanned' OR [System.Title] CONTAINS 'Sprint Meetings' OR [System.Title] CONTAINS 'Contingency')`;
      
      const queryResult = await client.post(
        `/${config.org}/${project}/_apis/wit/wiql`,
        { query },
        { params: { 'api-version': '7.0' } }
      );

      const workItemIds = queryResult.data.workItems?.map((wi: any) => wi.id) || [];
      console.log(`   Found ${workItemIds.length} items to delete`);

      for (const id of workItemIds) {
        try {
          await client.delete(
            `/${config.org}/${project}/_apis/wit/workitems/${id}`,
            { params: { 'api-version': '7.0', permanent: 'true' } }
          );
          console.log(`   ✓ Deleted work item #${id}`);
        } catch (error: any) {
          console.log(`   ⚠️  Could not delete #${id}: ${error.response?.status}`);
        }
      }

      // Step 2: Delete all Sprint iterations
      console.log('\n2️⃣  Deleting all Sprint iterations...');
      
      const iterResult = await client.get(
        `/${config.org}/${project}/_apis/wit/classificationnodes/iterations`,
        { params: { 'api-version': '7.0' } }
      );

      const deleteIterations = async (node: any) => {
        if (!node.children) return;
        
        for (const child of node.children) {
          if (child.name.startsWith('Sprint')) {
            try {
              await client.delete(
                `/${config.org}/${project}/_apis/wit/classificationnodes/iterations/${child.name}`,
                { params: { 'api-version': '7.0' } }
              );
              console.log(`   ✓ Deleted iteration: ${child.name}`);
            } catch (error: any) {
              if (error.response?.status === 404) {
                console.log(`   ⚠️  Already deleted: ${child.name}`);
              } else {
                console.log(`   ⚠️  Error deleting ${child.name}: ${error.response?.status}`);
              }
            }
          }
          // Recursively handle nested children
          await deleteIterations(child);
        }
      };

      if (iterResult.data) {
        await deleteIterations(iterResult.data);
      }

    } catch (error: any) {
      console.error(`❌ Error processing ${project}:`, error.message);
    }
  }

  console.log('\n\n✅ Cleanup complete!');
  console.log('Next: Run the creation scripts to rebuild with proper hierarchy\n');
}

deleteAllIterations()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Failed:', error.message);
    process.exit(1);
  });
