#!/usr/bin/env ts-node
// Copyright (c) 2026 AgilePlanner Contributors
// Licensed under the MIT License. See LICENSE file for details.

/**
 * Test Azure DevOps authentication configuration
 * 
 * This script verifies that your authentication setup is working correctly.
 * Works with both PAT and Service Principal authentication.
 * 
 * Usage:
 *   npm run test-auth
 *   or
 *   npx ts-node scripts/testAuthentication.ts
 */

import dotenv from "dotenv";
dotenv.config();

import { loadAuthConfig, validateAuthConfig, getAuthToken } from "../src/auth/azureDevOpsAuth";
import { azureDevOpsMcpClient } from "../src/clients/azureDevOpsMcpClient";

async function testAuthentication() {
  console.log("🔐 Testing Azure DevOps Authentication...\n");

  // Step 1: Load configuration
  console.log("📋 Step 1: Loading configuration");
  const config = loadAuthConfig();
  console.log(`   Auth Type: ${config.authType}`);
  
  if (config.authType === "pat") {
    console.log(`   PAT: ${config.pat ? "✅ Set (hidden)" : "❌ Missing"}`);
  } else {
    console.log(`   Tenant ID: ${config.tenantId ? "✅ Set" : "❌ Missing"}`);
    console.log(`   Client ID: ${config.clientId ? "✅ Set" : "❌ Missing"}`);
    console.log(`   Client Secret: ${config.clientSecret ? "✅ Set (hidden)" : "❌ Missing"}`);
  }

  // Step 2: Validate configuration
  console.log("\n✓ Step 2: Validating configuration");
  try {
    validateAuthConfig(config);
    console.log("   ✅ Configuration is valid");
  } catch (error: any) {
    console.error(`   ❌ Configuration error: ${error.message}`);
    process.exit(1);
  }

  // Step 3: Get authentication token
  console.log("\n🔑 Step 3: Obtaining authentication token");
  try {
    const tokenData = await getAuthToken(config);
    console.log(`   Token Type: ${tokenData.type}`);
    
    if (tokenData.type === "bearer" && tokenData.expiresAt) {
      const expiresIn = Math.floor((tokenData.expiresAt.getTime() - Date.now()) / 1000 / 60);
      console.log(`   Expires in: ${expiresIn} minutes`);
    }
    
    console.log("   ✅ Token obtained successfully");
  } catch (error: any) {
    console.error(`   ❌ Failed to get token: ${error.message}`);
    process.exit(1);
  }

  // Step 4: Test Azure DevOps API call
  console.log("\n🌐 Step 4: Testing Azure DevOps API connection");
  try {
    const orgName = process.env.AZURE_DEVOPS_ORG || "workasaservice";
    const projectName = process.env.AZURE_DEVOPS_PROJECT || "Automate";
    
    console.log(`   Organization: ${orgName}`);
    console.log(`   Project: ${projectName}`);
    
    // Try to query work items to verify API access
    const result = await azureDevOpsMcpClient.callTool("list-work-items", {
      query: `SELECT [System.Id] FROM workitems WHERE [System.TeamProject] = '${projectName}' ORDER BY [System.Id] DESC`
    });
    
    console.log("   ✅ API call successful");
    
    if (result.workItems && result.workItems.length > 0) {
      console.log(`   Found ${result.workItems.length} work items`);
    }
  } catch (error: any) {
    console.error(`   ❌ API call failed: ${error.message}`);
    console.error("\n   Possible causes:");
    console.error("   - Service Principal not added to Azure DevOps");
    console.error("   - Insufficient permissions");
    console.error("   - Organization or project name is incorrect");
    process.exit(1);
  }

  console.log("\n✅ All tests passed! Authentication is working correctly.\n");
}

// Run the test
testAuthentication().catch(error => {
  console.error("\n❌ Unexpected error:", error.message);
  process.exit(1);
});
