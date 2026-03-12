/**
 * Create TestSprint 01 using MCP tools with Neon seeding
 * - Cleans up old iterations
 * - Creates new sprint with capacity and stories
 * - Uses MCP tools exclusively
 */

import * as dotenv from "dotenv";
dotenv.config();

import { neonMcpClient } from "../src/clients/neonMcpClient";

async function main() {
  console.log("\n=== TESTSPRINT 01 CREATION (MCP + Neon) ===\n");

  try {
    // Step 1: Clean up old iterations
    console.log("STEP 1: Cleaning up old iterations...");
    
    // Get all iterations from Neon
    const oldIterations = await neonMcpClient.query<any>(
      `SELECT iteration_id, sprint_name, iteration_path 
       FROM config_project_iterations 
       WHERE project_id = $1
       ORDER BY created_at DESC`,
      ["MotherOps-Alpha"]
    );

    if (Array.isArray(oldIterations) && oldIterations.length > 0) {
      console.log(`Found ${oldIterations.length} old iterations to clean up`);
      
      // Get work items from old sprints
      for (const iter of oldIterations) {
        console.log(`Cleaning up: ${iter.sprint_name}`);
        
        // Get work items in this iteration
        const workItems = await mcp_microsoft_azu_wit_get_work_items_for_iteration({
          project: "MotherOps-Alpha",
          team: "MotherOps-Alpha Team",
          iterationId: iter.iteration_id
        });

        if (workItems && workItems.workItemRelations && workItems.workItemRelations.length > 0) {
          console.log(`  Deleting ${workItems.workItemRelations.length} work items...`);
          
          for (const rel of workItems.workItemRelations) {
            if (rel.target && rel.target.id) {
              // Delete work item using batch update with Remove state
              await mcp_microsoft_azu_wit_update_work_item({
                id: rel.target.id,
                updates: [
                  { path: "/fields/System.State", value: "Removed" }
                ]
              });
            }
          }
        }
        
        // Delete from Neon
        await neonMcpClient.query(
          `DELETE FROM config_project_iterations WHERE iteration_id = $1`,
          [iter.iteration_id]
        );
        
        console.log(`  ✓ Cleaned up ${iter.sprint_name}`);
      }
    } else {
      console.log("No old iterations found");
    }

    // Step 2: Create TestSprint 01
    console.log("\nSTEP 2: Creating TestSprint 01...");
    
    const sprintName = "TestSprint 01";
    const startDate = "2026-04-27T00:00:00Z";
    const finishDate = "2026-05-03T23:59:59Z";
    
    const createResult = await mcp_microsoft_azu_work_create_iterations({
      project: "MotherOps-Alpha",
      iterations: [
        {
          iterationName: sprintName,
          startDate: startDate,
          finishDate: finishDate
        }
      ]
    });

    console.log("✓ Iteration created:", createResult);
    
    // Get the created iteration details
    const allIterations = await mcp_microsoft_azu_work_list_iterations({
      project: "MotherOps-Alpha",
      depth: 2
    });

    let newIteration: any = null;
    if (allIterations && allIterations.children) {
      for (const child of allIterations.children) {
        if (child.name === sprintName) {
          newIteration = child;
          break;
        }
      }
    }

    if (!newIteration) {
      throw new Error("Failed to find created iteration");
    }

    const iterationId = newIteration.identifier;
    const iterationPath = newIteration.path;
    
    console.log(`✓ Iteration ID: ${iterationId}`);
    console.log(`✓ Iteration Path: ${iterationPath}`);

    // Assign iteration to team
    await mcp_microsoft_azu_work_assign_iterations({
      project: "MotherOps-Alpha",
      team: "MotherOps-Alpha Team",
      iterations: [
        {
          identifier: iterationId,
          path: iterationPath
        }
      ]
    });
    
    console.log("✓ Iteration assigned to team");

    // Store in Neon
    await neonMcpClient.query(
      `INSERT INTO config_project_iterations 
       (project_id, iteration_id, iteration_path, sprint_name, start_date, finish_date, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (iteration_id) DO NOTHING`,
      ["MotherOps-Alpha", iterationId, iterationPath, sprintName, startDate, finishDate]
    );
    
    console.log("✓ Iteration metadata stored in Neon");

    // Step 3: Create seed run in Neon
    console.log("\nSTEP 3: Creating seed run...");
    
    const seedRunResult = await neonMcpClient.query<any>(
      `INSERT INTO sprint_seed_runs 
       (project_id, sprint_id, iteration_id, run_mode, started_at, completed_at, success)
       VALUES ($1, $2, $3, $4, NOW(), NOW(), true)
       RETURNING id`,
      ["MotherOps-Alpha", sprintName, iterationId, "live"]
    );

    const seedRunId = Array.isArray(seedRunResult) && seedRunResult.length > 0 
      ? seedRunResult[0].id 
      : null;

    console.log(`✓ Seed run ID: ${seedRunId}`);

    // Step 4: Seed capacity for all team members
    console.log("\nSTEP 4: Seeding capacity for all members...");
    
    // Get team members from Neon
    const members = await neonMcpClient.query<any>(
      `SELECT cpu.user_id as "userId", cu.role_id as "roleId", cu.display_name as "displayName"
       FROM config_project_members cpu
       JOIN config_users cu ON cpu.user_id = cu.user_id
       WHERE cpu.project_id = $1`,
      ["MotherOps-Alpha"]
    );

    // Get capacity defaults from Neon
    const defaults = await neonMcpClient.query<any>(
      `SELECT role_id as "roleId", capacity_per_day as "capacityPerDay"
       FROM sprint_capacity_defaults
       WHERE project_id = $1 AND team_id = $2 AND is_active = true`,
      ["MotherOps-Alpha", "MotherOps-Alpha Team"]
    );

    const defaultsMap = new Map<string, number>();
    if (Array.isArray(defaults)) {
      for (const def of defaults) {
        defaultsMap.set(def.roleId, def.capacityPerDay);
      }
    }

    // Get team member identities from Azure
    const teamMembers = await mcp_microsoft_azu_core_get_identity_ids({
      searchFilter: ""
    });

    const identityMap = new Map<string, string>();
    if (Array.isArray(teamMembers)) {
      for (const member of teamMembers) {
        if (member.uniqueName) {
          identityMap.set(member.uniqueName.toLowerCase(), member.id);
        }
      }
    }

    let capacitySeededCount = 0;
    let capacitySkippedCount = 0;

    if (Array.isArray(members)) {
      console.log(`Found ${members.length} team members`);
      
      for (const member of members) {
        const capacity = defaultsMap.get(member.roleId);
        const azureId = identityMap.get(member.userId.toLowerCase());

        if (!capacity) {
          console.log(`  ⊘ ${member.displayName || member.userId}: No default capacity for role ${member.roleId}`);
          capacitySkippedCount++;
          continue;
        }

        if (!azureId) {
          console.log(`  ⊘ ${member.displayName || member.userId}: No Azure identity found`);
          capacitySkippedCount++;
          continue;
        }

        try {
          await mcp_microsoft_azu_work_update_team_capacity({
            project: "MotherOps-Alpha",
            team: "MotherOps-Alpha Team",
            teamMemberId: azureId,
            iterationId: iterationId,
            activities: [
              {
                name: "Development",
                capacityPerDay: capacity
              }
            ],
            daysOff: []
          });

          console.log(`  ✓ ${member.displayName || member.userId}: ${capacity}h/day`);
          capacitySeededCount++;

          // Record in Neon
          if (seedRunId) {
            await neonMcpClient.query(
              `INSERT INTO sprint_seed_artifacts 
               (seed_run_id, artifact_type, work_item_title, external_id, created_at)
               VALUES ($1, $2, $3, $4, NOW())`,
              [seedRunId, "capacity", `${member.displayName || member.userId}: ${capacity}h/day`, member.userId]
            );
          }
        } catch (error) {
          console.log(`  ✗ ${member.displayName || member.userId}: ${error}`);
          capacitySkippedCount++;
        }
      }
    }

    console.log(`\n✓ Capacity seeding complete: ${capacitySeededCount} seeded, ${capacitySkippedCount} skipped`);

    // Step 5: Create user stories and tasks
    console.log("\nSTEP 5: Creating user stories and tasks...");
    
    // Get story templates from Neon
    const templates = await neonMcpClient.query<any>(
      `SELECT id, project_id, team_id, template_name, work_item_type, 
              parent_template_id, title, description, acceptance_criteria, 
              tags, priority, effort_hours, effort_points
       FROM sprint_story_templates
       WHERE project_id = $1 
         AND team_id = $2 
         AND is_active = true
       ORDER BY parent_template_id NULLS FIRST, display_order, id`,
      ["MotherOps-Alpha", "MotherOps-Alpha Team"]
    );

    const createdStories = new Map<number, number>(); // templateId -> workItemId
    let storiesCreated = 0;

    if (Array.isArray(templates)) {
      console.log(`Found ${templates.length} story templates`);
      
      // Get requirement context
      const requirement = await neonMcpClient.query<any>(
        `SELECT capability_goal, pi_description, pi_name
         FROM program_increments
         WHERE project_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        ["MotherOps-Alpha"]
      );

      const reqContext = Array.isArray(requirement) && requirement.length > 0
        ? requirement[0].capability_goal || requirement[0].pi_description || requirement[0].pi_name || "General sprint activities"
        : "General sprint activities";

      // Create parent stories first, then children
      for (const template of templates) {
        if (template.parent_template_id !== null) {
          continue; // Skip children for now
        }

        const description = template.description 
          ? `${template.description}\n\n---\nProject requirement context: ${reqContext}\n(Source: program_increments)`
          : `Project requirement context: ${reqContext}\n(Source: program_increments)`;

        const fields = [
          { name: "System.Title", value: template.title },
          { name: "System.Description", value: description, format: "Html" as const },
          { name: "System.IterationPath", value: iterationPath },
          { name: "System.Tags", value: template.tags || "sprint-automation" }
        ];

        if (template.acceptance_criteria) {
          fields.push({ name: "Microsoft.VSTS.Common.AcceptanceCriteria", value: template.acceptance_criteria, format: "Html" as const });
        }

        if (template.priority) {
          fields.push({ name: "Microsoft.VSTS.Common.Priority", value: template.priority.toString() });
        }

        const workItem = await mcp_microsoft_azu_wit_create_work_item({
          project: "MotherOps-Alpha",
          workItemType: template.work_item_type,
          fields: fields
        });

        createdStories.set(template.id, workItem.id);
        console.log(`  ✓ Created "${template.title}" (ID ${workItem.id})`);
        storiesCreated++;

        // Record in Neon
        if (seedRunId) {
          await neonMcpClient.query(
            `INSERT INTO sprint_seed_artifacts 
             (seed_run_id, artifact_type, work_item_id, work_item_title, work_item_type, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [seedRunId, "story", workItem.id, template.title, template.work_item_type]
          );
        }
      }

      // Create child tasks
      for (const template of templates) {
        if (template.parent_template_id === null) {
          continue; // Skip parents
        }

        const parentWorkItemId = createdStories.get(template.parent_template_id);
        if (!parentWorkItemId) {
          console.log(`  ⊘ Skipping "${template.title}" - parent not found`);
          continue;
        }

        const fields = [
          { name: "System.Title", value: template.title },
          { name: "System.Description", value: template.description || "", format: "Html" as const },
          { name: "System.IterationPath", value: iterationPath },
          { name: "System.Tags", value: template.tags || "sprint-automation" }
        ];

        if (template.effort_hours) {
          fields.push({ name: "Microsoft.VSTS.Scheduling.OriginalEstimate", value: template.effort_hours.toString() });
        }

        const workItem = await mcp_microsoft_azu_wit_create_work_item({
          project: "MotherOps-Alpha",
          workItemType: template.work_item_type,
          fields: fields
        });

        // Link to parent
        await mcp_microsoft_azu_wit_update_work_item({
          id: workItem.id,
          updates: [
            {
              op: "add",
              path: "/relations/-",
              value: JSON.stringify({
                rel: "System.LinkTypes.Hierarchy-Reverse",
                url: `https://dev.azure.com/workasaservice/MotherOps-Alpha/_apis/wit/workItems/${parentWorkItemId}`,
                attributes: { isLocked: false }
              })
            }
          ]
        });

        console.log(`  ✓ Created "${template.title}" (ID ${workItem.id}) → Parent ${parentWorkItemId}`);
        storiesCreated++;

        // Record in Neon
        if (seedRunId) {
          await neonMcpClient.query(
            `INSERT INTO sprint_seed_artifacts 
             (seed_run_id, artifact_type, work_item_id, work_item_title, work_item_type, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [seedRunId, "story", workItem.id, template.title, template.work_item_type]
          );
        }
      }
    }

    console.log(`\n✓ Stories/tasks created: ${storiesCreated}`);

    // Final summary
    console.log("\n=== TESTSPRINT 01 CREATION COMPLETE ===");
    console.log(`Sprint: ${sprintName}`);
    console.log(`Iteration ID: ${iterationId}`);
    console.log(`Capacity seeded: ${capacitySeededCount} members`);
    console.log(`Stories/tasks created: ${storiesCreated}`);
    console.log("\n");

  } catch (error) {
    console.error("\n✗ ERROR:", error);
    throw error;
  }
}

main().catch(console.error);
