/**
 * Reconcile Sprint Automation
 * 
 * Detects and backfills missing automation for sprints that were created
 * but not seeded (either created outside the orchestration command or due to failures).
 * 
 * Workflow:
 * 1. Query all sprints in a project
 * 2. Check if each sprint has a successful seed run record
 * 3. If not, check current state:
 *    - If capacity is empty -> seed it
 *    - If stories are missing -> seed them
 * 4. Record reconciliation run and status
 * 5. Support dry-run for safety
 * 
 * Idempotency Guarantees:
 * - Does not overwrite existing non-zero capacity values
 * - Does not create duplicate stories (checks by title)
 * - Re-running is safe: only fills gaps
 */

import { azureDevOpsMcpClient } from "../clients/azureDevOpsMcpClient";
import { neonMcpClient } from "../clients/neonMcpClient";
import { requirePostgresMode, requireNeonMcpConfigured, loadConfigurationAsync } from "../lib/configLoader";
import { seedSprintCapacity } from "../services/sprintCapacitySeeder";
import { seedSprintStories } from "../services/sprintStorySeeder";
import { ensureSprintAutomationPrerequisites } from "../services/sprintAutomationBootstrap";

export interface ReconcileArgs {
  projectId: string;
  startDate?: string; // ISO date to limit scope
  endDate?: string; // ISO date to limit scope
  dryRun?: boolean;
  onlyCapacity?: boolean; // Only reconcile capacity, skip stories
  onlyStories?: boolean; // Only reconcile stories, skip capacity
}

export interface ReconcileResult {
  success: boolean;
  sprintsScanned: number;
  sprintsNeedingCapacity: number;
  sprintsNeedingStories: number;
  sprintsReconciled: number;
  errors: string[];
  report: string;
}

interface Sprint {
  iterationId: string;
  iterationPath: string;
  sprintName: string;
  startDate: string;
  finishDate: string;
  teamId: string;
}

function parseBooleanFlag(value: unknown): boolean {
  if (value === true) {
    return true;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  return false;
}

/**
 * Get all sprints for a project from Neon metadata
 */
async function getProjectSprints(
  projectId: string,
  startDate?: string,
  endDate?: string
): Promise<Sprint[]> {
  let query = `SELECT 
    iteration_id as "iterationId",
    iteration_path as "iterationPath", 
    sprint_name as "sprintName",
    start_date as "startDate",
    finish_date as "finishDate",
    p.team_name as "teamId"
    FROM config_project_iterations i
    JOIN config_projects p ON p.project_id = i.project_id
    WHERE i.project_id = $1`;
  
  const params: any[] = [projectId];

  if (startDate) {
    query += ` AND i.start_date >= $${params.length + 1}::date`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND i.finish_date <= $${params.length + 1}::date`;
    params.push(endDate);
  }

  query += ` ORDER BY i.start_date DESC`;

  try {
    const results = await neonMcpClient.query<any>(query, params);
    
    if (Array.isArray(results)) {
      const sprints: Sprint[] = results.map(r => ({
        iterationId: r.iterationId,
        iterationPath: r.iterationPath,
        sprintName: r.sprintName,
        startDate: r.startDate,
        finishDate: r.finishDate,
        teamId: r.teamId
      }));
      
      return sprints;
    }

    return [];
  } catch (error) {
    console.error(`Failed to fetch sprints: ${error}`);
    throw error;
  }
}

/**
 * Check if a sprint has a successful seed run
 */
async function hasSuccessfulSeedRun(sprintId: string): Promise<boolean> {
  try {
    const results = await neonMcpClient.query<any>(
      `SELECT id FROM sprint_seed_runs 
       WHERE sprint_id = $1 AND run_status = 'completed' LIMIT 1`,
      [sprintId]
    );

    return Array.isArray(results) && results.length > 0;
  } catch (error) {
    console.warn(`Failed to check seed run for sprint ${sprintId}: ${error}`);
    return false;
  }
}

/**
 * Check if a sprint has any team member capacity assigned
 */
async function sprintHasCapacity(
  projectId: string,
  teamId: string,
  sprintId: string
): Promise<boolean> {
  try {
    const result = await azureDevOpsMcpClient.callTool("list-sprint-capacities", {
      project: projectId,
      team: teamId,
      iterationId: sprintId
    });

    if (result && result.value && Array.isArray(result.value)) {
      // Check if any member has non-zero capacity
      for (const capacity of result.value) {
        if (capacity.activities && Array.isArray(capacity.activities)) {
          for (const activity of capacity.activities) {
            if (activity.name === "Development" && activity.capacityPerDay && activity.capacityPerDay > 0) {
              return true;
            }
          }
        }
      }
    }

    return false;
  } catch (error) {
    console.warn(`Failed to check sprint capacity: ${error}`);
    return false;
  }
}

/**
 * Check if a sprint has any stories assigned
 */
async function sprintHasStories(sprintPath: string): Promise<boolean> {
  try {
    const result = await azureDevOpsMcpClient.callTool("list-work-items", {
      query: `SELECT [System.Id] FROM workitems WHERE [System.IterationPath] = '${sprintPath}' AND [System.WorkItemType] IN ('User Story', 'Feature', 'Epic') LIMIT 1`
    });

    if (result && result.workItems && result.workItems.length > 0) {
      return true;
    }

    return false;
  } catch (error) {
    console.warn(`Failed to check sprint stories: ${error}`);
    return false;
  }
}

/**
 * Record reconciliation run
 */
async function recordReconciliationRun(
  projectId: string,
  teamId: string,
  sprintId: string,
  iterationPath: string,
  capacityReconciled: boolean,
  storiesReconciled: boolean,
  dryRun: boolean = false
): Promise<void> {
  if (dryRun) {
    return;
  }

  try {
    await neonMcpClient.query(
      `INSERT INTO sprint_seed_runs 
       (correlation_id, project_id, team_id, sprint_id, iteration_path, run_type, run_status, 
        capacity_seeded, stories_seeded, completed_at)
       VALUES ($1, $2, $3, $4, $5, 'reconcile', 'completed', $6, $7, NOW())
       ON CONFLICT DO NOTHING`,
      [
        `reconcile-${Date.now()}-${Math.random()}`,
        projectId,
        teamId,
        sprintId,
        iterationPath,
        capacityReconciled,
        storiesReconciled
      ]
    );
  } catch (error) {
    console.warn(`Failed to record reconciliation: ${error}`);
  }
}

/**
 * Generate reconciliation report
 */
function generateReport(
  sprintsScanned: number,
  sprintsNeedingCapacity: number,
  sprintsNeedingStories: number,
  sprintsReconciled: number,
  errors: string[],
  dryRun: boolean
): string {
  let report = `# Sprint Automation Reconciliation Report\n\n`;
  report += `**Timestamp**: ${new Date().toISOString()}\n`;
  report += `**Mode**: ${dryRun ? 'DRY RUN' : 'LIVE'}\n\n`;

  report += `## Summary\n`;
  report += `- Sprints scanned: ${sprintsScanned}\n`;
  report += `- Sprints needing capacity: ${sprintsNeedingCapacity}\n`;
  report += `- Sprints needing stories: ${sprintsNeedingStories}\n`;
  report += `- Sprints successfully reconciled: ${sprintsReconciled}\n`;
  
  if (errors.length > 0) {
    report += `- Errors encountered: ${errors.length}\n\n`;
    report += `## Errors\n`;
    for (const error of errors) {
      report += `- ${error}\n`;
    }
  } else {
    report += `- Errors: none\n`;
  }

  report += `\n## Status\n`;
  report += `${sprintsReconciled === sprintsScanned ? '✓' : '⚠️'} Reconciliation ${sprintsReconciled === sprintsScanned ? 'complete' : 'partially complete'}\n`;

  return report;
}

/**
 * Main reconciliation function
 */
export async function reconcileSprintAutomation(input: any): Promise<any> {
  // Enforce postgres mode
  requirePostgresMode();
  requireNeonMcpConfigured();

  const errors: string[] = [];
  let sprintsScanned = 0;
  let sprintsNeedingCapacity = 0;
  let sprintsNeedingStories = 0;
  let sprintsReconciled = 0;
  
  // Extract parameters from input
  const projectId = input.project || input.projectId;
  const startDate = input["start-date"] || input.startDate;
  const endDate = input["end-date"] || input.endDate;
  const dryRun = parseBooleanFlag(input["dry-run"]) || parseBooleanFlag(input.dryRun);
  const onlyCapacity = parseBooleanFlag(input["only-capacity"]) || parseBooleanFlag(input.onlyCapacity);
  const onlyStories = parseBooleanFlag(input["only-stories"]) || parseBooleanFlag(input.onlyStories);

  const args: ReconcileArgs = { projectId, startDate, endDate, dryRun, onlyCapacity, onlyStories };

  try {
    // Load configuration async (required for postgres mode)
    await loadConfigurationAsync();

    const bootstrapResult = await ensureSprintAutomationPrerequisites(projectId, undefined, dryRun);
    if (bootstrapResult.bootstrap.warnings.length > 0) {
      throw new Error(`Prerequisite bootstrap incomplete: ${bootstrapResult.bootstrap.warnings.join("; ")}`);
    }

    console.log(`[Reconciler] Starting sprint automation reconciliation`);
    console.log(`[Reconciler] Project: ${projectId}`);
    console.log(`[Reconciler] Dry run: ${dryRun ? 'yes' : 'no'}`);

    // Get all sprints
    const sprints = await getProjectSprints(
      projectId,
      startDate,
      endDate
    );

    if (sprints.length === 0) {
      console.log(`[Reconciler] No sprints found for project ${projectId}`);
      return {
        success: true,
        sprintsScanned: 0,
        sprintsNeedingCapacity: 0,
        sprintsNeedingStories: 0,
        sprintsReconciled: 0,
        errors: [],
        report: ""
      };
    }

    console.log(`[Reconciler] Found ${sprints.length} sprints to scan`);

    // Check each sprint
    for (const sprint of sprints) {
      sprintsScanned++;

      console.log(`\n[Reconciler] Checking sprint: ${sprint.sprintName}`);

      try {
        let capacityAdded = false;
        let storiesAdded = false;
        const hasSuccessfulRun = await hasSuccessfulSeedRun(sprint.iterationId);

        // Check and add capacity if needed
        let hasCapacity = false;
        if (!args.onlyStories) {
          hasCapacity = await sprintHasCapacity(args.projectId, sprint.teamId, sprint.iterationId);
          
          if (!hasCapacity) {
            console.log(`[Reconciler] Sprint needs capacity seeding`);
            sprintsNeedingCapacity++;

            const capacityResult = await seedSprintCapacity(
              {
                projectId: args.projectId,
                teamId: sprint.teamId,
                sprintId: sprint.iterationId,
                sprintStartDate: new Date(sprint.startDate),
                sprintEndDate: new Date(sprint.finishDate),
                iterationPath: sprint.iterationPath,
                dryRun
              }
            );

            capacityAdded = capacityResult.success;

            if (!capacityAdded) {
              errors.push(`${sprint.sprintName}: Failed to seed capacity - ${capacityResult.errors.join('; ')}`);
            }
          }
        }

        // Check and add stories if needed
        let hasStories = false;
        if (!args.onlyCapacity) {
          hasStories = await sprintHasStories(sprint.iterationPath);
          
          if (!hasStories) {
            console.log(`[Reconciler] Sprint needs story seeding`);
            sprintsNeedingStories++;

            const storiesResult = await seedSprintStories(
              {
                projectId: args.projectId,
                teamId: sprint.teamId,
                sprintId: sprint.iterationId,
                iterationPath: sprint.iterationPath,
                requirementContext: bootstrapResult.requirement,
                dryRun
              }
            );

            storiesAdded = storiesResult.success;

            if (!storiesAdded) {
              errors.push(`${sprint.sprintName}: Failed to seed stories - ${storiesResult.errors.join('; ')}`);
            }
          }
        }

        // Record reconciliation
        if (capacityAdded || storiesAdded) {
          await recordReconciliationRun(
            args.projectId,
            sprint.teamId,
            sprint.iterationId,
            sprint.iterationPath,
            capacityAdded,
            storiesAdded,
            dryRun
          );
          sprintsReconciled++;
          console.log(`[Reconciler] ✓ Reconciled sprint: ${sprint.sprintName}`);
        } else if (hasSuccessfulRun && (args.onlyCapacity || hasCapacity) && (args.onlyStories || hasStories)) {
          sprintsReconciled++;
          console.log(`[Reconciler] ✓ Sprint already reconciled with successful seed run`);
        } else if (!dryRun) {
          sprintsReconciled++;
          console.log(`[Reconciler] ✓ Sprint complete (no action needed)`);
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${sprint.sprintName}: ${errorMsg}`);
        console.error(`[Reconciler] ✗ Error reconciling sprint ${sprint.sprintName}: ${errorMsg}`);
      }
    }

    const report = generateReport(
      sprintsScanned,
      sprintsNeedingCapacity,
      sprintsNeedingStories,
      sprintsReconciled,
      errors,
      dryRun
    );

    console.log(`\n[Reconciler] Complete\n`);
    console.log(report);

    return {
      success: errors.length === 0,
      sprintsScanned,
      sprintsNeedingCapacity,
      sprintsNeedingStories,
      sprintsReconciled,
      errors,
      report
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const report = `# Sprint Automation Reconciliation Report\n\nFATAL ERROR: ${errorMsg}\n`;

    console.error(`[Reconciler] Fatal error: ${errorMsg}`);

    return {
      success: false,
      sprintsScanned,
      sprintsNeedingCapacity,
      sprintsNeedingStories,
      sprintsReconciled,
      errors: [errorMsg],
      report
    };
  }
}

/**
 * CLI handler registration
 */
export async function handleReconcileSprintAutomation(args: Record<string, string | boolean>): Promise<void> {
  const result = await reconcileSprintAutomation({
    projectId: args.project as string,
    startDate: args.start as string,
    endDate: args.end as string,
    dryRun: parseBooleanFlag(args.dryRun) || parseBooleanFlag(args["dry-run"]),
    onlyCapacity: parseBooleanFlag(args.onlyCapacity) || parseBooleanFlag(args["only-capacity"]),
    onlyStories: parseBooleanFlag(args.onlyStories) || parseBooleanFlag(args["only-stories"])
  });

  if (!result.success) {
    console.error("FAILED: One or more reconciliation operations encountered errors");
    process.exitCode = 1;
  }
}
