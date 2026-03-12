#!/usr/bin/env tsx
/**
 * Create TestSprint 03 with complete Azure identity sync and capacity seeding
 * 
 * Steps:
 * 1. Sync Azure team member identities to Neon
 * 2. Create sprint iteration with stories
 * 3. Seed capacity for all team members
 * 4. Create Epic → Feature hierarchy
 * 5. Link everything together
 * 
 * MCP-Only + Neon-Seeded | Live Run
 */

import dotenv from "dotenv";
dotenv.config();

import { createSprintsAndSeed } from "../src/handlers/createSprintsAndSeed";
import { neonMcpClient } from "../src/clients/neonMcpClient";
import { azureDevOpsMcpClient } from "../src/clients/azureDevOpsMcpClient";

interface ProjectConfig {
  projectId: string;
  teamName: string;
  epicTitle: string;
  featureTitle: string;
}

const PROJECTS: ProjectConfig[] = [
  {
    projectId: "MotherOps-Alpha",
    teamName: "MotherOps-Alpha Team",
    epicTitle: "MotherOps-Alpha Q2 2026 Increment",
    featureTitle: "Agile Process Automation"
  },
  {
    projectId: "MotherOps-Beta",
    teamName: "MotherOps-Beta Team",
    epicTitle: "MotherOps-Beta Q2 2026 Increment",
    featureTitle: "Agile Process Automation"
  }
];

// ============================================================================
// STEP 1: SYNC AZURE IDENTITIES TO NEON
// ============================================================================

async function syncAzureIdentities(project: string, team: string): Promise<number> {
  console.log(`\n[Identity Sync] ${project} / ${team}`);
  
  try {
    const membersResult: any = await azureDevOpsMcpClient.callTool("get-team-members", {
      project,
      team
    });

    const members = Array.isArray(membersResult?.value) ? membersResult.value : [];
    console.log(`  Found ${members.length} team members in Azure`);

    let updated = 0;
    for (const member of members) {
      const email = member?.identity?.uniqueName || member?.identity?.displayName;
      const azureId = member?.identity?.id || member?.id;
      const displayName = member?.identity?.displayName || email;
      
      if (!email || !azureId) {
        console.log(`  ⚠ Skipping member without email/id`);
        continue;
      }

      try {
        await neonMcpClient.query(
          `UPDATE config_users
           SET azure_identity_id = $1, display_name = $2, updated_at = NOW()
           WHERE user_principal_name ILIKE $3 OR user_id ILIKE $3 OR mail_nickname ILIKE $3`,
          [String(azureId), String(displayName), String(email)]
        );
        console.log(`    ✓ ${email} → ${azureId.substring(0, 8)}...`);
        updated++;
      } catch (error) {
        console.log(`    ✗ ${email}: ${error}`);
      }
    }

    console.log(`  ✓ Updated ${updated}/${members.length} identities in Neon\n`);
    return updated;
  } catch (error) {
    console.error(`  ✗ Failed to sync identities: ${error}\n`);
    return 0;
  }
}

async function verifyIdentities(project: string): Promise<void> {
  console.log(`\n[Verification] Checking identities for ${project}...`);
  
  const rows = await neonMcpClient.query<any>(
    `SELECT cpu.user_id, cu.display_name, cu.azure_identity_id
     FROM config_project_members cpu
     JOIN config_users cu ON cpu.user_id = cu.user_id
     WHERE cpu.project_id = $1
     ORDER BY cu.display_name`,
    [project]
  );

  const members = Array.isArray(rows) ? rows : [];
  const withIds = members.filter((m: any) => m.azure_identity_id);
  
  console.log(`  Total members: ${members.length}`);
  console.log(`  With Azure IDs: ${withIds.length}`);
  
  if (withIds.length < members.length) {
    console.log(`  ⚠ Missing identities: ${members.length - withIds.length}`);
    const missing = members.filter((m: any) => !m.azure_identity_id);
    missing.forEach((m: any) => {
      console.log(`    - ${m.display_name || m.user_id}`);
    });
  } else {
    console.log(`  ✓ All members have Azure identities!`);
  }
  console.log();
}

// ============================================================================
// STEP 2: CLEANUP OLD SPRINTS
// ============================================================================

async function cleanupOldTestSprints(projectId: string) {
  console.log(`\n[Cleanup] Removing old TestSprint iterations from ${projectId}...`);
  
  const oldIterations = await neonMcpClient.query<any>(
    `SELECT iteration_id, sprint_name 
     FROM config_project_iterations 
     WHERE project_id = $1 AND sprint_name LIKE 'TestSprint%'
     ORDER BY created_at DESC`,
    [projectId]
  );

  if (!Array.isArray(oldIterations) || oldIterations.length === 0) {
    console.log("  No old test sprints found\n");
    return;
  }

  console.log(`  Found ${oldIterations.length} old test sprints`);
  
  for (const iter of oldIterations) {
    await neonMcpClient.query(
      `DELETE FROM sprint_seed_artifacts 
       WHERE seed_run_id IN (
         SELECT id FROM sprint_seed_runs WHERE sprint_id = $1 AND project_id = $2
       )`,
      [iter.sprint_name, projectId]
    );
    
    await neonMcpClient.query(
      `DELETE FROM sprint_seed_runs WHERE sprint_id = $1 AND project_id = $2`,
      [iter.sprint_name, projectId]
    );
    
    await neonMcpClient.query(
      `DELETE FROM config_project_iterations WHERE iteration_id = $1`,
      [iter.iteration_id]
    );
    
    console.log(`    ✓ Removed: ${iter.sprint_name}`);
  }
  
  console.log(`  ✓ Cleanup complete\n`);
}

// ============================================================================
// STEP 3: CREATE SPRINT WITH STORIES AND CAPACITY
// ============================================================================

async function createSprintWithWorkItems(project: ProjectConfig): Promise<string | null> {
  console.log(`\n[Sprint] Creating TestSprint 03 for ${project.projectId}...`);
  
  const schedule = {
    sprints: [
      {
        name: "TestSprint 03",
        startDate: "2026-03-09",  // Starting next Monday
        finishDate: "2026-03-15"   // One week sprint
      }
    ]
  };

  const result = await createSprintsAndSeed({
    projectId: project.projectId,
    teamName: project.teamName,
    schedule: JSON.stringify(schedule),
    dryRun: false,
    onlyCapacity: false,
    onlyStories: false
  });

  console.log("\n[Sprint] Creation Report:");
  console.log(result.report);

  if (!result.success && !result.errors.some(e => e.includes("Partial success"))) {
    console.error(`\n✗ Failed to create TestSprint 03`);
    return null;
  }

  console.log(`\n✓ TestSprint 03 created with stories and capacity seeding attempted`);
  
  return `${project.projectId}\\TestSprint 03`;
}

// ============================================================================
// STEP 4: CREATE EPIC → FEATURE HIERARCHY
// ============================================================================

async function createEpicHierarchy(
  project: ProjectConfig, 
  iterationPath: string
): Promise<{epicId: number | null, featureId: number | null}> {
  console.log(`\n[Hierarchy] Creating Epic → Feature for ${project.projectId}...`);
  
  // Create Epic
  let epicId: number | null = null;
  try {
    const epicResult: any = await azureDevOpsMcpClient.callTool("create-work-item", {
      project: project.projectId,
      type: "Epic",
      title: project.epicTitle,
      description: "Q2 2026 increment for agile process automation and sprint execution framework",
      tags: "TestSprint03,Q2-2026,Automation"
    });

    if (epicResult && epicResult.id) {
      epicId = epicResult.id;
      console.log(`  ✓ Epic created: ${epicId} - ${project.epicTitle}`);
    }
  } catch (error) {
    console.error(`  ✗ Epic creation failed: ${error}`);
  }

  // Create Feature
  let featureId: number | null = null;
  if (epicId) {
    try {
      const featureResult: any = await azureDevOpsMcpClient.callTool("create-work-item", {
        project: project.projectId,
        type: "Feature",
        title: project.featureTitle,
        description: "Automated sprint planning, capacity tracking, and ceremony management",
        iterationPath: iterationPath,
        tags: "TestSprint03,Automation,Framework"
      });

      if (featureResult && featureResult.id) {
        featureId = featureResult.id;
        console.log(`  ✓ Feature created: ${featureId} - ${project.featureTitle}`);

        // Link Feature to Epic
        try {
          await azureDevOpsMcpClient.callTool("link-work-items", {
            project: project.projectId,
            sourceId: epicId,
            targetId: featureId,
            linkType: "System.LinkTypes.Hierarchy-Forward"
          });
          console.log(`  ✓ Feature linked to Epic`);
        } catch (linkError) {
          console.warn(`  ⚠ Warning: Failed to link Feature to Epic: ${linkError}`);
        }
      }
    } catch (error) {
      console.error(`  ✗ Feature creation failed: ${error}`);
    }
  }

  return { epicId, featureId };
}

// ============================================================================
// STEP 5: LINK STORIES TO FEATURE
// ============================================================================

async function linkStoriesToFeature(
  project: ProjectConfig, 
  featureId: number, 
  iterationPath: string
): Promise<void> {
  console.log(`\n[Stories] Linking to Feature ${featureId}...`);
  
  const wiql = `SELECT [System.Id], [System.Title]
                FROM workitems
                WHERE [System.TeamProject] = '${project.projectId}'
                AND [System.IterationPath] = '${iterationPath}'
                AND [System.WorkItemType] = 'User Story'
                ORDER BY [System.Id]`;

  try {
    const result: any = await azureDevOpsMcpClient.callTool("list-work-items", {
      project: project.projectId,
      query: wiql
    });

    const stories = Array.isArray(result?.workItems) ? result.workItems : [];
    console.log(`  Found ${stories.length} stories to link`);

    let linked = 0;
    for (const story of stories) {
      try {
        const details: any = await azureDevOpsMcpClient.callTool("get-work-item", {
          project: project.projectId,
          id: story.id
        });
        const title = details?.fields?.["System.Title"] || "(no title)";
        
        await azureDevOpsMcpClient.callTool("link-work-items", {
          project: project.projectId,
          sourceId: featureId,
          targetId: story.id,
          linkType: "System.LinkTypes.Hierarchy-Forward"
        });
        console.log(`    ✓ Linked: ${story.id} - ${title}`);
        linked++;
      } catch (linkError) {
        console.warn(`    ⚠ Failed to link story ${story.id}: ${linkError}`);
      }
    }
    
    console.log(`  ✓ Linked ${linked}/${stories.length} stories to Feature`);
  } catch (error) {
    console.error(`  ✗ Failed to query stories: ${error}`);
  }
}

// ============================================================================
// STEP 6: VERIFY FINAL STATE
// ============================================================================

async function verifySprintSchedule(project: ProjectConfig, iterationPath: string): Promise<void> {
  console.log(`\n[Verification] Final sprint state for ${project.projectId}...`);
  
  const wiql = `SELECT [System.Id], [System.Title], [System.WorkItemType], [System.State]
                FROM workitems
                WHERE [System.TeamProject] = '${project.projectId}'
                AND [System.IterationPath] = '${iterationPath}'
                ORDER BY [System.WorkItemType] DESC, [System.Id]`;

  try {
    const result: any = await azureDevOpsMcpClient.callTool("list-work-items", {
      project: project.projectId,
      query: wiql
    });

    const items = Array.isArray(result?.workItems) ? result.workItems : [];
    
    const byType: Record<string, number> = {};
    for (const item of items) {
      const details: any = await azureDevOpsMcpClient.callTool("get-work-item", {
        project: project.projectId,
        id: item.id
      });
      const type = details?.fields?.["System.WorkItemType"] || "Unknown";
      byType[type] = (byType[type] || 0) + 1;
    }

    console.log(`  Total work items in sprint: ${items.length}`);
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`    ${type}: ${count}`);
    });
  } catch (error) {
    console.error(`  ✗ Verification failed: ${error}`);
  }
}

// ============================================================================
// MAIN ORCHESTRATION
// ============================================================================

async function processProject(project: ProjectConfig): Promise<void> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`PROCESSING: ${project.projectId}`);
  console.log('='.repeat(70));

  try {
    // Step 1: Sync Azure identities to Neon
    await syncAzureIdentities(project.projectId, project.teamName);
    await verifyIdentities(project.projectId);

    // Step 2: Cleanup old test sprints
    await cleanupOldTestSprints(project.projectId);

    // Step 3: Create sprint with work items
    const iterationPath = await createSprintWithWorkItems(project);
    if (!iterationPath) {
      console.error(`\n✗✗✗ Failed to create sprint for ${project.projectId}`);
      return;
    }

    // Step 4: Create Epic and Feature hierarchy
    const { epicId, featureId } = await createEpicHierarchy(project, iterationPath);
    
    // Step 5: Link stories to Feature
    if (featureId) {
      await linkStoriesToFeature(project, featureId, iterationPath);
    } else {
      console.warn(`  ⚠ Skipping story linking (no Feature created)`);
    }

    // Step 6: Verify final state
    await verifySprintSchedule(project, iterationPath);

    console.log(`\n✓✓✓ ${project.projectId} COMPLETE ✓✓✓`);
    if (epicId && featureId) {
      console.log(`    Epic ${epicId} → Feature ${featureId} → Stories → Tasks`);
    }
  } catch (error) {
    console.error(`\n✗✗✗ ERROR: ${error}`);
  }
}

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("TESTSPRINT 03 - COMPLETE AUTOMATION WITH IDENTITY SYNC");
  console.log("MCP-Only + Neon-Seeded | Live Run");
  console.log("Sprint Dates: March 9-15, 2026");
  console.log("=".repeat(70));

  for (const project of PROJECTS) {
    await processProject(project);
  }

  console.log("\n" + "=".repeat(70));
  console.log("✅✅✅ TESTSPRINT 03 COMPLETE ✅✅✅");
  console.log("=".repeat(70));
  console.log("\n📋 Next Steps:");
  console.log("  1. Open Azure DevOps Sprint view");
  console.log("  2. Select 'TestSprint 03' from sprint dropdown (March 9-15)");
  console.log("  3. Verify work items appear in sprint backlog");
  console.log("  4. Check Capacity tab for team member capacity");
  console.log("  5. Review Epic hierarchy in Boards view");
  console.log("\n");
}

main().catch((error) => {
  console.error("\n✗✗✗ FATAL ERROR ✗✗✗");
  console.error(error);
  process.exit(1);
});
