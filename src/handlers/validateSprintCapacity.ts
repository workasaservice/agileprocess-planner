/**
 * Validate Sprint Capacity
 * Validates that sprint task estimates are reasonable and compares
 * total estimated work against available team capacity
 */

import { Pool } from "pg";
import { AzureDevOpsMcpClient } from "../clients/azureDevOpsMcpClient";
import * as fs from "fs";
import * as path from "path";

interface ValidationRule {
  field: string;
  min?: number;
  max?: number;
  warningThreshold?: number;
}

interface ValidationConfig {
  validation: {
    rules: {
      originalEstimate: ValidationRule;
      remainingWork: ValidationRule;
      completedWork: ValidationRule;
    };
    estimationGuidelines: {
      minimumTaskSize: number;
      maximumTaskSize: number;
      recommendedTaskSize: number;
    };
  };
}

interface WorkItem {
  id: number;
  fields: {
    "System.Title": string;
    "System.State": string;
    "System.AssignedTo"?: { displayName: string; uniqueName: string };
    "Custom.OriginalEstimate"?: number;
    "Custom.RemainingWork"?: number;
    "Custom.CompletedWork"?: number;
  };
}

interface CapacityData {
  user_id: string;
  user_name: string;
  capacity_hours: number;
}

interface ValidationIssue {
  type: "error" | "warning" | "info";
  workItemId: number;
  workItemTitle: string;
  field: string;
  message: string;
  value?: number;
}

interface CapacityReport {
  sprintId: string;
  iterationPath: string;
  totalCapacity: number;
  totalEstimated: number;
  utilizationPercentage: number;
  isOverCommitted: boolean;
  isUnderCommitted: boolean;
  userCapacities: Array<{
    userId: string;
    userName: string;
    capacity: number;
    allocated: number;
    utilization: number;
  }>;
  validationIssues: ValidationIssue[];
}

/**
 * Load validation configuration
 */
function loadValidationConfig(): ValidationConfig {
  const configPath = path.join(
    process.cwd(),
    "config",
    "effort-tracking-config.json"
  );
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

/**
 * Get upcoming sprint from database
 */
async function getUpcomingSprint(
  db: Pool,
  organizationUrl: string,
  projectName: string,
  sprintId?: string
): Promise<{
  id: string;
  iteration_path: string;
  start_date: string;
  end_date: string;
} | null> {
  let query;
  let params;

  if (sprintId) {
    query = `
      SELECT id, iteration_path, start_date, end_date
      FROM config_project_iterations
      WHERE id = $1
    `;
    params = [sprintId];
  } else {
    query = `
      SELECT id, iteration_path, start_date, end_date
      FROM config_project_iterations
      WHERE organization_url = $1
        AND project_name = $2
        AND start_date > CURRENT_DATE
      ORDER BY start_date
      LIMIT 1
    `;
    params = [organizationUrl, projectName];
  }

  const result = await db.query(query, params);
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Get team capacity for sprint from database
 */
async function getTeamCapacity(
  db: Pool,
  sprintId: string
): Promise<CapacityData[]> {
  const query = `
    SELECT 
      user_id,
      user_name,
      capacity_hours
    FROM config_capacity
    WHERE sprint_id = $1
    ORDER BY user_name
  `;

  const result = await db.query(query, [sprintId]);
  return result.rows;
}

/**
 * Fetch work items for sprint from Azure DevOps
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
 * Validate individual work item estimates
 */
function validateWorkItem(
  item: WorkItem,
  config: ValidationConfig
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const rules = config.validation.rules;
  const guidelines = config.validation.estimationGuidelines;

  const original = item.fields["Custom.OriginalEstimate"];
  const remaining = item.fields["Custom.RemainingWork"];
  const completed = item.fields["Custom.CompletedWork"];

  // Validate Original Estimate
  if (original === undefined || original === null) {
    issues.push({
      type: "error",
      workItemId: item.id,
      workItemTitle: item.fields["System.Title"],
      field: "OriginalEstimate",
      message: "Missing original estimate - all tasks must have an estimate",
    });
  } else {
    if (original < rules.originalEstimate.min!) {
      issues.push({
        type: "warning",
        workItemId: item.id,
        workItemTitle: item.fields["System.Title"],
        field: "OriginalEstimate",
        message: `Estimate too small (${original}h) - minimum recommended: ${rules.originalEstimate.min}h`,
        value: original,
      });
    }

    if (original > rules.originalEstimate.max!) {
      issues.push({
        type: "error",
        workItemId: item.id,
        workItemTitle: item.fields["System.Title"],
        field: "OriginalEstimate",
        message: `Estimate exceeds maximum (${original}h) - maximum allowed: ${rules.originalEstimate.max}h. Consider breaking down this task.`,
        value: original,
      });
    }

    if (rules.originalEstimate.warningThreshold && original > rules.originalEstimate.warningThreshold) {
      issues.push({
        type: "warning",
        workItemId: item.id,
        workItemTitle: item.fields["System.Title"],
        field: "OriginalEstimate",
        message: `Large estimate (${original}h) - recommended maximum: ${rules.originalEstimate.warningThreshold}h. Consider breaking down into smaller tasks.`,
        value: original,
      });
    }
  }

  // Validate Remaining Work
  if (remaining !== undefined && remaining !== null) {
    if (remaining < 0) {
      issues.push({
        type: "error",
        workItemId: item.id,
        workItemTitle: item.fields["System.Title"],
        field: "RemainingWork",
        message: `Remaining work cannot be negative (${remaining}h)`,
        value: remaining,
      });
    }

    if (original && remaining > original * 1.5) {
      issues.push({
        type: "warning",
        workItemId: item.id,
        workItemTitle: item.fields["System.Title"],
        field: "RemainingWork",
        message: `Remaining work (${remaining}h) exceeds 150% of original estimate (${original}h) - consider revising estimate`,
        value: remaining,
      });
    }
  }

  // Validate Completed Work
  if (completed !== undefined && completed !== null && completed < 0) {
    issues.push({
      type: "error",
      workItemId: item.id,
      workItemTitle: item.fields["System.Title"],
      field: "CompletedWork",
      message: `Completed work cannot be negative (${completed}h)`,
      value: completed,
    });
  }

  return issues;
}

/**
 * Calculate capacity utilization by user
 */
function calculateUserUtilization(
  workItems: WorkItem[],
  capacities: CapacityData[]
): CapacityReport["userCapacities"] {
  const userAllocations = new Map<string, number>();

  // Sum up estimates by assigned user
  for (const item of workItems) {
    const assignedTo = item.fields["System.AssignedTo"];
    if (!assignedTo) continue;

    const userId = assignedTo.uniqueName;
    const estimate = item.fields["Custom.OriginalEstimate"] || 0;

    userAllocations.set(userId, (userAllocations.get(userId) || 0) + estimate);
  }

  // Build capacity report by user
  const userCapacities = capacities.map((cap) => {
    const allocated = userAllocations.get(cap.user_id) || 0;
    const utilization = cap.capacity_hours > 0 
      ? (allocated / cap.capacity_hours) * 100 
      : 0;

    return {
      userId: cap.user_id,
      userName: cap.user_name,
      capacity: cap.capacity_hours,
      allocated,
      utilization,
    };
  });

  return userCapacities;
}

/**
 * Generate capacity validation report
 */
function generateCapacityReport(
  sprint: { id: string; iteration_path: string },
  workItems: WorkItem[],
  capacities: CapacityData[],
  config: ValidationConfig
): CapacityReport {
  const validationIssues: ValidationIssue[] = [];

  // Validate each work item
  for (const item of workItems) {
    const issues = validateWorkItem(item, config);
    validationIssues.push(...issues);
  }

  // Calculate capacity metrics
  const totalCapacity = capacities.reduce((sum, c) => sum + c.capacity_hours, 0);
  const totalEstimated = workItems.reduce(
    (sum, item) => sum + (item.fields["Custom.OriginalEstimate"] || 0),
    0
  );

  const utilizationPercentage = totalCapacity > 0 
    ? (totalEstimated / totalCapacity) * 100 
    : 0;

  const isOverCommitted = utilizationPercentage > 100;
  const isUnderCommitted = utilizationPercentage < 70; // Threshold for under-utilization

  const userCapacities = calculateUserUtilization(workItems, capacities);

  return {
    sprintId: sprint.id,
    iterationPath: sprint.iteration_path,
    totalCapacity,
    totalEstimated,
    utilizationPercentage,
    isOverCommitted,
    isUnderCommitted,
    userCapacities,
    validationIssues,
  };
}

/**
 * Print capacity report to console
 */
function printCapacityReport(report: CapacityReport): void {
  console.log(`\nSprint: ${report.iterationPath}`);
  console.log(`Sprint ID: ${report.sprintId}`);
  console.log(`\n--- Capacity Overview ---`);
  console.log(`Total Team Capacity: ${report.totalCapacity.toFixed(1)}h`);
  console.log(`Total Estimated Work: ${report.totalEstimated.toFixed(1)}h`);
  console.log(`Utilization: ${report.utilizationPercentage.toFixed(1)}%`);

  if (report.isOverCommitted) {
    console.log(`⚠️  WARNING: Sprint is OVER-COMMITTED by ${(report.totalEstimated - report.totalCapacity).toFixed(1)}h`);
  } else if (report.isUnderCommitted) {
    console.log(`ℹ️  INFO: Sprint is under-utilized (${report.utilizationPercentage.toFixed(1)}%)`);
  } else {
    console.log(`✓ Sprint capacity is well-balanced`);
  }

  console.log(`\n--- User Capacity ---`);
  for (const user of report.userCapacities) {
    const status = 
      user.utilization > 100 ? "⚠️  OVER" :
      user.utilization < 70 ? "ℹ️  UNDER" :
      "✓";
    
    console.log(
      `${status} ${user.userName}: ${user.allocated.toFixed(1)}h / ${user.capacity.toFixed(1)}h (${user.utilization.toFixed(1)}%)`
    );
  }

  // Print validation issues
  if (report.validationIssues.length > 0) {
    console.log(`\n--- Validation Issues (${report.validationIssues.length}) ---`);

    const errors = report.validationIssues.filter((i) => i.type === "error");
    const warnings = report.validationIssues.filter((i) => i.type === "warning");

    if (errors.length > 0) {
      console.log(`\nErrors (${errors.length}):`);
      for (const issue of errors) {
        console.log(`  ❌ #${issue.workItemId}: ${issue.message}`);
      }
    }

    if (warnings.length > 0) {
      console.log(`\nWarnings (${warnings.length}):`);
      for (const issue of warnings) {
        console.log(`  ⚠️  #${issue.workItemId}: ${issue.message}`);
      }
    }
  } else {
    console.log(`\n✓ No validation issues found`);
  }
}

/**
 * Main handler: Validate sprint capacity
 */
export async function validateSprintCapacity(
  db: Pool,
  mcpClient: AzureDevOpsMcpClient,
  options: {
    organizationUrl: string;
    projectName: string;
    sprintId?: string; // Optional: validate specific sprint
    returnReport?: boolean; // Optional: return report instead of just printing
  }
): Promise<CapacityReport | void> {
  try {
    console.log("\n=== Validating Sprint Capacity ===\n");

    const { organizationUrl, projectName, sprintId, returnReport = false } = options;

    // Load validation configuration
    const config = loadValidationConfig();

    // Get sprint to validate
    const sprint = await getUpcomingSprint(
      db,
      organizationUrl,
      projectName,
      sprintId
    );

    if (!sprint) {
      console.log("⊙ No sprint found to validate");
      return;
    }

    console.log(`Validating sprint: ${sprint.iteration_path}\n`);

    // Get team capacity
    const capacities = await getTeamCapacity(db, sprint.id);
    
    if (capacities.length === 0) {
      console.log("⚠️  WARNING: No team capacity data found for this sprint");
      console.log("   Please configure team capacity before validating sprint commitment\n");
    }

    // Fetch work items
    const workItems = await fetchSprintWorkItems(
      mcpClient,
      sprint.iteration_path,
      projectName
    );

    console.log(`Found ${workItems.length} work items in sprint\n`);

    // Generate capacity report
    const report = generateCapacityReport(sprint, workItems, capacities, config);

    // Print report
    printCapacityReport(report);

    console.log("\n✓ Validation completed\n");

    if (returnReport) {
      return report;
    }
  } catch (error) {
    console.error("Error validating sprint capacity:", error);
    throw error;
  }
}
