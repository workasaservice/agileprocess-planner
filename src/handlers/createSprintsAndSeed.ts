/**
 * Create Sprints and Seed Automation
 * 
 * Orchestration command that:
 * 1. Creates new sprint(s) via iteration creation
 * 2. Persists iteration metadata to Neon
 * 3. Seeds team capacity for all members
 * 4. Seeds default user stories from templates
 * 5. Records run audit in sprint_seed_runs table
 * 
 * This command ensures that every new sprint automatically gets:
 * - Team members with capacity assigned
 * - Default backlog items created
 * - Full audit trail of automation
 * 
 * Uses Neon MCP exclusively (PERSISTENCE_MODE=postgres required)
 */

import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { azureDevOpsMcpClient } from "../clients/azureDevOpsMcpClient";
import { neonMcpClient } from "../clients/neonMcpClient";
import { requirePostgresMode, requireNeonMcpConfigured, loadConfigurationAsync } from "../lib/configLoader";
import { seedSprintCapacity } from "../services/sprintCapacitySeeder";
import { seedSprintStories } from "../services/sprintStorySeeder";

export interface CreateSprintsAndSeedArgs {
  projectId: string;
  teamName?: string;
  schedule?: string; // path to schedule JSON or inline JSON
  dryRun?: boolean;
}

export interface Sprint {
  name: string;
  startDate: string; // ISO 8601
  finishDate: string; // ISO 8601
}

interface ScheduleConfig {
  sprints: Sprint[];
}

/**
 * Load sprint schedule from file or inline JSON
 */
function loadSchedule(scheduleInput: string): ScheduleConfig {
  try {
    // Try parsing as JSON first
    return JSON.parse(scheduleInput) as ScheduleConfig;
  } catch (e) {
    // Try reading as file path
    const filePath = path.resolve(process.cwd(), scheduleInput);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      return JSON.parse(content) as ScheduleConfig;
    }
    throw new Error(`Invalid schedule: cannot parse as JSON or read as file: ${scheduleInput}`);
  }
}

/**
 * Create sprint iteration in Azure DevOps
 */
async function createSprintIteration(
  projectId: string,
  teamName: string,
  sprint: Sprint,
  dryRun: boolean = false
): Promise<{
  iterationId: string;
  iterationPath: string;
}> {
  if (dryRun) {
    // Return mock data for dry run
    return {
      iterationId: `iteration-${Date.now()}`,
      iterationPath: `${projectId}\\${sprint.name}`
    };
  }

  try {
    const result = await azureDevOpsMcpClient.callTool("create-sprint", {
      project: projectId,
      team: teamName,
      name: sprint.name,
      startDate: new Date(sprint.startDate),
      finishDate: new Date(sprint.finishDate)
    });

    console.log(`[createSprintIteration] Azure DevOps response:`, JSON.stringify(result, null, 2));

    const iterationId = result.identifier || result.iterationId || result.id;
    const iterationPath = result.path || result.iterationPath;

    if (!iterationId || !iterationPath) {
      throw new Error(`Azure DevOps API returned incomplete data: iterationId=${iterationId}, iterationPath=${iterationPath}`);
    }

    return { iterationId, iterationPath };
  } catch (error) {
    console.error(`[createSprintIteration] Error creating sprint:`, error);
    throw error;
  }
}

/**
 * Persist iteration metadata to Neon for tracking
 */
async function persistIterationMetadata(
  projectId: string,
  iterationId: string,
  iterationPath: string,
  sprintName: string,
  startDate: string,
  finishDate: string,
  dryRun: boolean = false
): Promise<void> {
  if (dryRun) {
    console.log(`[Orchestration] DRY RUN: Would persist iteration ${iterationId} to Neon`);
    return;
  }

  try {
    // Insert or update iteration metadata
    await neonMcpClient.query(
      `INSERT INTO config_project_iterations 
       (project_id, sprint_name, iteration_path, iteration_id, start_date, finish_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::date, $6::date, NOW(), NOW())
       ON CONFLICT (iteration_id) DO UPDATE SET
       sprint_name = EXCLUDED.sprint_name,
       iteration_path = EXCLUDED.iteration_path,
       start_date = EXCLUDED.start_date,
       finish_date = EXCLUDED.finish_date,
       updated_at = NOW()`,
      [projectId, sprintName, iterationPath, iterationId, startDate, finishDate]
    );

    console.log(`[Orchestration] Persisted iteration metadata: ${iterationId}`);
  } catch (error) {
    console.error(`Failed to persist iteration metadata: ${error}`);
    throw error;
  }
}

/**
 * Create or retrieve seed run record
 */
async function createSeedRun(
  projectId: string,
  teamId: string,
  sprintId: string,
  iterationPath: string,
  dryRun: boolean = false
): Promise<number> {
  if (dryRun) {
    return -1; // Placeholder for dry run
  }

  const correlationId = uuidv4();
  
  try {
    const result = await neonMcpClient.query<any>(
      `INSERT INTO sprint_seed_runs 
       (correlation_id, project_id, team_id, sprint_id, iteration_path, run_type, run_status, started_at)
       VALUES ($1, $2, $3, $4, $5, 'create', 'started', NOW())
       RETURNING id`,
      [correlationId, projectId, teamId, sprintId, iterationPath]
    );

    if (Array.isArray(result) && result[0]) {
      return result[0].id;
    }

    throw new Error("Failed to get seed run ID");
  } catch (error) {
    console.error(`Failed to create seed run: ${error}`);
    throw error;
  }
}

/**
 * Update seed run status
 */
async function updateSeedRunStatus(
  seedRunId: number,
  status: "started" | "completed" | "failed",
  capacitySeeded: boolean = false,
  storiesSeeded: boolean = false,
  errorMessage?: string,
  dryRun: boolean = false
): Promise<void> {
  if (dryRun) {
    return;
  }

  try {
    await neonMcpClient.query(
      `UPDATE sprint_seed_runs 
       SET run_status = $1, 
           capacity_seeded = $2, 
           stories_seeded = $3,
           error_message = $4,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $5`,
      [status, capacitySeeded, storiesSeeded, errorMessage || null, seedRunId]
    );
  } catch (error) {
    console.error(`Failed to update seed run status: ${error}`);
  }
}

/**
 * Generate execution report
 */
function generateReport(
  sprints: Sprint[],
  results: Array<{
    sprintName: string;
    iterationId: string;
    capacity: any;
    stories: any;
  }>,
  dryRun: boolean
): string {
  let report = `# Sprint Creation and Seeding Report\n\n`;
  report += `**Timestamp**: ${new Date().toISOString()}\n`;
  report += `**Mode**: ${dryRun ? 'DRY RUN' : 'LIVE'}\n\n`;

  report += `## Summary\n`;
  report += `- Total sprints processed: ${sprints.length}\n`;
  report += `- Successful: ${results.filter(r => r.capacity.success && r.stories.success).length}\n`;
  report += `- Partial success: ${results.filter(r => (r.capacity.success || r.stories.success) && !(r.capacity.success && r.stories.success)).length}\n`;
  report += `- Failed: ${results.filter(r => !r.capacity.success && !r.stories.success).length}\n\n`;

  report += `## Details\n\n`;
  for (const result of results) {
    report += `### ${result.sprintName}\n`;
    report += `- Iteration ID: ${result.iterationId}\n`;
    report += `- Capacity: ${result.capacity.success ? '✓' : '✗'} (${result.capacity.membersSeedCount} seeded, ${result.capacity.memberSkipCount} skipped)\n`;
    report += `- Stories: ${result.stories.success ? '✓' : '✗'} (${result.stories.storiesCreated} created, ${result.stories.storiesSkipped} skipped)\n`;
    
    if (result.capacity.errors.length > 0) {
      report += `  - Capacity errors: ${result.capacity.errors.join('; ')}\n`;
    }
    if (result.stories.errors.length > 0) {
      report += `  - Story errors: ${result.stories.errors.join('; ')}\n`;
    }
    report += `\n`;
  }

  return report;
}

/**
 * Main orchestration command
 */
export async function createSprintsAndSeed(input: any): Promise<any> {
  // Enforce postgres mode
  requirePostgresMode();
  requireNeonMcpConfigured();

  const errors: string[] = [];
  const results: Array<any> = [];
  
  // Extract parameters from input
  const projectId = input.project || input.projectId;
  const teamName = input.team || input.teamName || "Default";
  const schedule = input.schedule;
  const dryRun = input["dry-run"] === true || input.dryRun === true;

  const args: CreateSprintsAndSeedArgs = { projectId, teamName, schedule, dryRun };

  try {
    // Load configuration async (required for postgres mode)
    await loadConfigurationAsync();

    console.log(`[Orchestration] Starting sprint creation and seeding`);
    console.log(`[Orchestration] Project: ${projectId}`);
    console.log(`[Orchestration] Dry run: ${dryRun ? 'yes' : 'no'}`);

    // Load sprint schedule
    if (!schedule) {
      throw new Error("Schedule is required (--schedule)");
    }

    const scheduleConfig = loadSchedule(schedule);
    if (!scheduleConfig.sprints || scheduleConfig.sprints.length === 0) {
      throw new Error("Schedule must contain at least one sprint");
    }

    console.log(`[Orchestration] Found ${scheduleConfig.sprints.length} sprints to create`);

    // Process each sprint
    for (const sprint of scheduleConfig.sprints) {
      console.log(`\n[Orchestration] Processing sprint: ${sprint.name}`);

      try {
        // Step 1: Create sprint iteration
        const iterationResult = await createSprintIteration(
          projectId,
          teamName,
          sprint,
          dryRun
        );

        console.log(`[Orchestration] Created iteration: ${iterationResult.iterationPath}`);

        // Step 2: Persist metadata to Neon
        await persistIterationMetadata(
          projectId,
          iterationResult.iterationId,
          iterationResult.iterationPath,
          sprint.name,
          sprint.startDate,
          sprint.finishDate,
          dryRun
        );

        // Step 3: Create seed run record
        const seedRunId = await createSeedRun(
          args.projectId,
          teamName,
          iterationResult.iterationId,
          iterationResult.iterationPath,
          dryRun
        );

        // Step 4: Seed capacity
        const capacityResult = await seedSprintCapacity(
          {
            projectId: args.projectId,
            teamId: teamName,
            sprintId: iterationResult.iterationId,
            sprintStartDate: new Date(sprint.startDate),
            sprintEndDate: new Date(sprint.finishDate),
            iterationPath: iterationResult.iterationPath,
            dryRun
          },
          seedRunId
        );

        // Step 5: Seed stories
        const storiesResult = await seedSprintStories(
          {
            projectId: args.projectId,
            teamId: teamName,
            sprintId: iterationResult.iterationId,
            iterationPath: iterationResult.iterationPath,
            dryRun
          },
          seedRunId
        );

        // Step 6: Update seed run status
        const overallSuccess = capacityResult.success && storiesResult.success;
        await updateSeedRunStatus(
          seedRunId,
          overallSuccess ? "completed" : "failed",
          capacityResult.success,
          storiesResult.success,
          overallSuccess ? undefined : "Errors in capacity or story seeding",
          dryRun
        );

        results.push({
          sprintName: sprint.name,
          iterationId: iterationResult.iterationId,
          capacity: capacityResult,
          stories: storiesResult
        });

        if (!overallSuccess) {
          errors.push(`Sprint ${sprint.name}: capacity or stories seeding failed`);
        }

        console.log(`[Orchestration] ✓ Completed sprint: ${sprint.name}`);

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Sprint ${sprint.name}: ${errorMsg}`);
        console.error(`[Orchestration] ✗ Error processing sprint ${sprint.name}: ${errorMsg}`);
      }
    }

    // Generate report
    const report = generateReport(scheduleConfig.sprints, results, dryRun);

    console.log(`\n[Orchestration] Complete`);
    console.log(report);

    return {
      success: errors.length === 0,
      report,
      errors
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const report = `# Sprint Creation and Seeding Report\n\nFATAL ERROR: ${errorMsg}\n`;
    
    console.error(`[Orchestration] Fatal error: ${errorMsg}`);
    
    return {
      success: false,
      report,
      errors: [errorMsg]
    };
  }
}

/**
 * CLI handler registration
 */
export async function handleCreateSprintsAndSeed(args: Record<string, string | boolean>): Promise<void> {
  const result = await createSprintsAndSeed({
    projectId: args.project as string,
    teamName: args.team as string,
    schedule: args.schedule as string,
    dryRun: args.dryRun === true || args["dry-run"] === "true"
  });

  if (!result.success) {
    console.error("FAILED: One or more operations encountered errors");
    process.exitCode = 1;
  }
}
