/**
 * Sync Effort Tracking Data
 * Synchronizes effort tracking data from Azure DevOps to the database
 * and calculates sprint summaries and burndown metrics
 */

import { Pool } from "pg";
import { AzureDevOpsMcpClient } from "../clients/azureDevOpsMcpClient";

interface WorkItem {
  id: number;
  fields: {
    "System.Title": string;
    "System.State": string;
    "System.AssignedTo"?: { displayName: string; uniqueName: string };
    "System.IterationPath": string;
    "Custom.OriginalEstimate"?: number;
    "Custom.RemainingWork"?: number;
    "Custom.CompletedWork"?: number;
  };
}

interface SprintEffortSummary {
  sprintId: string;
  iterationPath: string;
  totalEstimated: number;
  totalRemaining: number;
  totalCompleted: number;
  taskCount: number;
  tasksWithEstimates: number;
  tasksInProgress: number;
  tasksCompleted: number;
  burndownData: Array<{
    date: string;
    remaining: number;
    completed: number;
  }>;
}

/**
 * Get active sprints from database
 */
async function getActiveSprints(
  db: Pool,
  organizationUrl: string,
  projectName: string
): Promise<
  Array<{
    id: string;
    iteration_path: string;
    start_date: string;
    end_date: string;
  }>
> {
  const query = `
    SELECT id, iteration_path, start_date, end_date
    FROM config_project_iterations
    WHERE organization_url = $1
      AND project_name = $2
      AND start_date <= CURRENT_DATE
      AND end_date >= CURRENT_DATE
    ORDER BY start_date
  `;

  const result = await db.query(query, [organizationUrl, projectName]);
  return result.rows;
}

/**
 * Fetch work items for a sprint from Azure DevOps
 */
async function fetchSprintWorkItems(
  mcpClient: AzureDevOpsMcpClient,
  iterationPath: string,
  project?: string
): Promise<WorkItem[]> {
  const result = await mcpClient.callTool("get-sprint-work-items", {
    iterationPath,
    workItemType: "Task",
    project,
  });

  return result.workItems || [];
}

/**
 * Store effort tracking history for a work item
 */
async function storeEffortHistory(
  db: Pool,
  sprintId: string,
  workItem: WorkItem,
  _organizationUrl: string,
  projectName: string
): Promise<void> {
  const assignedTo = workItem.fields["System.AssignedTo"];
  const userId = assignedTo?.uniqueName || null;

  const query = `
    INSERT INTO effort_tracking_history (
      work_item_id,
      user_id,
      project_id,
      sprint_id,
      iteration_path,
      work_item_title,
      work_item_state,
      original_estimate,
      remaining_work,
      completed_work,
      recorded_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, DATE_TRUNC('day', NOW()))
    ON CONFLICT (work_item_id, recorded_at)
    DO UPDATE SET
      remaining_work = EXCLUDED.remaining_work,
      completed_work = EXCLUDED.completed_work,
      work_item_state = EXCLUDED.work_item_state,
      user_id = EXCLUDED.user_id
  `;

  await db.query(query, [
    workItem.id,
    userId,
    projectName,
    sprintId,
    workItem.fields["System.IterationPath"],
    workItem.fields["System.Title"],
    workItem.fields["System.State"],
    workItem.fields["Custom.OriginalEstimate"] || 0,
    workItem.fields["Custom.RemainingWork"] || 0,
    workItem.fields["Custom.CompletedWork"] || 0,
  ]);
}

/**
 * Calculate sprint effort summary
 */
export function calculateSprintSummary(
  sprintId: string,
  iterationPath: string,
  workItems: WorkItem[]
): SprintEffortSummary {
  let totalEstimated = 0;
  let totalRemaining = 0;
  let totalCompleted = 0;
  let tasksWithEstimates = 0;
  let tasksInProgress = 0;
  let tasksCompleted = 0;

  for (const item of workItems) {
    const estimated = item.fields["Custom.OriginalEstimate"] || 0;
    const remaining = item.fields["Custom.RemainingWork"] || 0;
    const completed = item.fields["Custom.CompletedWork"] || 0;
    const state = item.fields["System.State"];

    totalEstimated += estimated;
    totalRemaining += remaining;
    totalCompleted += completed;

    if (estimated > 0) {
      tasksWithEstimates++;
    }

    if (state === "Active" || state === "In Progress") {
      tasksInProgress++;
    }

    if (state === "Closed" || state === "Done") {
      tasksCompleted++;
    }
  }

  return {
    sprintId,
    iterationPath,
    totalEstimated,
    totalRemaining,
    totalCompleted,
    taskCount: workItems.length,
    tasksWithEstimates,
    tasksInProgress,
    tasksCompleted,
    burndownData: [
      {
        date: new Date().toISOString().split("T")[0] || "",
        remaining: totalRemaining,
        completed: totalCompleted,
      },
    ],
  };
}

/**
 * Store or update sprint effort summary
 */
async function storeSprintSummary(
  db: Pool,
  summary: SprintEffortSummary,
  _organizationUrl: string,
  projectName: string
): Promise<void> {
  // First, get existing burndown data if any
  const existingQuery = `
    SELECT burndown_data
    FROM sprint_effort_summary
    WHERE project_id = $1 AND sprint_id = $2
  `;
  const existingResult = await db.query(existingQuery, [projectName, summary.sprintId]);

  let burndownData = summary.burndownData;
  if (existingResult.rows.length > 0 && existingResult.rows[0].burndown_data) {
    const existing = existingResult.rows[0].burndown_data;
    
    // Merge new data with existing, avoiding duplicates by date
    const dateMap = new Map();
    for (const entry of existing) {
      dateMap.set(entry.date, entry);
    }
    for (const entry of summary.burndownData) {
      dateMap.set(entry.date, entry); // Will overwrite if same date
    }
    
    burndownData = Array.from(dateMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }

  const query = `
    INSERT INTO sprint_effort_summary (
      project_id,
      sprint_id,
      iteration_path,
      total_estimated_hours,
      total_remaining_hours,
      total_completed_hours,
      task_count,
      completed_task_count,
      burndown_data,
      last_updated
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
    ON CONFLICT (project_id, sprint_id)
    DO UPDATE SET
      total_estimated_hours = EXCLUDED.total_estimated_hours,
      total_remaining_hours = EXCLUDED.total_remaining_hours,
      total_completed_hours = EXCLUDED.total_completed_hours,
      task_count = EXCLUDED.task_count,
      completed_task_count = EXCLUDED.completed_task_count,
      burndown_data = EXCLUDED.burndown_data,
      last_updated = CURRENT_TIMESTAMP
  `;

  await db.query(query, [
    projectName,
    summary.sprintId,
    summary.iterationPath,
    summary.totalEstimated,
    summary.totalRemaining,
    summary.totalCompleted,
    summary.taskCount,
    summary.tasksCompleted,
    JSON.stringify(burndownData),
  ]);
}

/**
 * Update sprint iteration with effort totals
 */
async function updateIterationEffort(
  db: Pool,
  sprintId: string,
  summary: SprintEffortSummary
): Promise<void> {
  const query = `
    UPDATE config_project_iterations
    SET 
      total_estimated_hours = $1,
      total_remaining_hours = $2,
      total_completed_hours = $3,
      burndown_data = $4
    WHERE id = $5
  `;

  await db.query(query, [
    summary.totalEstimated,
    summary.totalRemaining,
    summary.totalCompleted,
    JSON.stringify(summary.burndownData),
    sprintId,
  ]);
}

/**
 * Calculate estimation accuracy metrics
 */
async function calculateEstimationAccuracy(
  db: Pool,
  sprintId: string,
  workItems: WorkItem[],
  _organizationUrl: string,
  projectName: string
): Promise<void> {
  for (const item of workItems) {
    const state = item.fields["System.State"];
    
    // Only calculate accuracy for completed tasks
    if (state !== "Closed" && state !== "Done") {
      continue;
    }

    const original = item.fields["Custom.OriginalEstimate"] || 0;
    const actual = item.fields["Custom.CompletedWork"] || 0;

    if (original === 0) {
      continue; // Skip tasks without estimates
    }

    const variance = actual - original;
    const variancePercentage = (variance / original) * 100;

    const query = `
      INSERT INTO estimation_accuracy (
        sprint_id,
        project_id,
        work_item_id,
        original_estimate,
        actual_completed,
        variance,
        variance_percentage
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT DO NOTHING
    `;

    await db.query(query, [
      sprintId,
      projectName,
      item.id,
      original,
      actual,
      variance,
      variancePercentage,
    ]);
  }
}

/**
 * Main handler: Sync effort tracking data
 */
export async function syncEffortTracking(
  db: Pool,
  mcpClient: AzureDevOpsMcpClient,
  options: {
    organizationUrl: string;
    projectName: string;
    sprintId?: string; // Optional: sync specific sprint only
  }
): Promise<void> {
  try {
    console.log("\n=== Syncing Effort Tracking Data ===\n");

    const { organizationUrl, projectName, sprintId } = options;

    let sprints;
    if (sprintId) {
      // Sync specific sprint
      const result = await db.query(
        `SELECT id, iteration_path, start_date, end_date
         FROM config_project_iterations
         WHERE id = $1`,
        [sprintId]
      );
      sprints = result.rows;
    } else {
      // Sync all active sprints
      sprints = await getActiveSprints(db, organizationUrl, projectName);
    }

    if (sprints.length === 0) {
      console.log("⊙ No active sprints found");
      return;
    }

    console.log(`Found ${sprints.length} sprint(s) to sync\n`);

    for (const sprint of sprints) {
      console.log(`Syncing sprint: ${sprint.iteration_path}`);

      // Fetch work items from Azure DevOps
      const workItems = await fetchSprintWorkItems(
        mcpClient,
        sprint.iteration_path,
        projectName
      );

      console.log(`  Found ${workItems.length} work items`);

      // Store effort history for each work item
      for (const item of workItems) {
        await storeEffortHistory(
          db,
          sprint.id,
          item,
          organizationUrl,
          projectName
        );
      }

      console.log(`  ✓ Stored effort history`);

      // Calculate and store sprint summary
      const summary = calculateSprintSummary(
        sprint.id,
        sprint.iteration_path,
        workItems
      );

      await storeSprintSummary(db, summary, organizationUrl, projectName);
      await updateIterationEffort(db, sprint.id, summary);

      console.log(`  ✓ Updated sprint summary`);
      console.log(
        `    Estimated: ${summary.totalEstimated}h, ` +
          `Remaining: ${summary.totalRemaining}h, ` +
          `Completed: ${summary.totalCompleted}h`
      );

      // Calculate estimation accuracy
      await calculateEstimationAccuracy(
        db,
        sprint.id,
        workItems,
        organizationUrl,
        projectName
      );

      console.log(`  ✓ Calculated estimation accuracy\n`);
    }

    console.log("✓ Effort tracking sync completed successfully\n");
  } catch (error) {
    console.error("Error syncing effort tracking:", error);
    throw error;
  }
}
