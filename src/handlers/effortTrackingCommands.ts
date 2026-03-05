/**
 * Effort Tracking Command Handlers
 * Wrapper functions for CLI command routing
 */

import { getPool } from "../lib/neonClient";
import { azureDevOpsMcpClient } from "../clients/azureDevOpsMcpClient";
import { initEffortFields } from "./initEffortFields";
import { syncEffortTracking } from "./syncEffortTracking";
import { validateSprintCapacity } from "./validateSprintCapacity";

/**
 * CLI handler: Initialize effort tracking fields
 * Usage: effort-init --org <orgUrl> --project <projectName> [--apply]
 */
export async function effortInit(input: any): Promise<any> {
  try {
    const organizationUrl = input.org || input.organizationUrl || process.env.AZURE_DEVOPS_ORG_URL;
    const projectName = input.project || input.projectName || process.env.AZURE_DEVOPS_PROJECT;
    const applyToProject = input.apply !== false; // Default true unless explicitly set to false

    if (!organizationUrl || !projectName) {
      return {
        success: false,
        error: "Missing required parameters",
        message: "Please provide --org and --project parameters, or set AZURE_DEVOPS_ORG_URL and AZURE_DEVOPS_PROJECT environment variables",
      };
    }

    const db = getPool();

    await initEffortFields(db, azureDevOpsMcpClient as any, {
      organizationUrl,
      projectName,
      applyToProject,
    });

    return {
      success: true,
      message: "Effort tracking fields initialized successfully",
      data: {
        organizationUrl,
        projectName,
        processApplied: applyToProject,
      },
    };
  } catch (error) {
    console.error("Error initializing effort fields:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * CLI handler: Sync effort tracking data from Azure DevOps
 * Usage: effort-sync --org <orgUrl> --project <projectName> [--sprintId <id>]
 */
export async function effortSync(input: any): Promise<any> {
  try {
    const organizationUrl = input.org || input.organizationUrl || process.env.AZURE_DEVOPS_ORG_URL;
    const projectName = input.project || input.projectName || process.env.AZURE_DEVOPS_PROJECT;
    const sprintId = input.sprintId || input.sprint;

    if (!organizationUrl || !projectName) {
      return {
        success: false,
        error: "Missing required parameters",
        message: "Please provide --org and --project parameters, or set AZURE_DEVOPS_ORG_URL and AZURE_DEVOPS_PROJECT environment variables",
      };
    }

    const db = getPool();

    await syncEffortTracking(db, azureDevOpsMcpClient as any, {
      organizationUrl,
      projectName,
      sprintId,
    });

    return {
      success: true,
      message: sprintId
        ? `Effort tracking data synced for sprint ${sprintId}`
        : "Effort tracking data synced for all active sprints",
      data: {
        organizationUrl,
        projectName,
        sprintId,
      },
    };
  } catch (error) {
    console.error("Error syncing effort tracking:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * CLI handler: Validate sprint capacity
 * Usage: effort-validate --org <orgUrl> --project <projectName> [--sprintId <id>]
 */
export async function effortValidate(input: any): Promise<any> {
  try {
    const organizationUrl = input.org || input.organizationUrl || process.env.AZURE_DEVOPS_ORG_URL;
    const projectName = input.project || input.projectName || process.env.AZURE_DEVOPS_PROJECT;
    const sprintId = input.sprintId || input.sprint;

    if (!organizationUrl || !projectName) {
      return {
        success: false,
        error: "Missing required parameters",
        message: "Please provide --org and --project parameters, or set AZURE_DEVOPS_ORG_URL and AZURE_DEVOPS_PROJECT environment variables",
      };
    }

    const db = getPool();

    const report = await validateSprintCapacity(db, azureDevOpsMcpClient as any, {
      organizationUrl,
      projectName,
      sprintId,
      returnReport: true,
    });

    return {
      success: true,
      message: "Sprint capacity validation completed",
      data: report,
    };
  } catch (error) {
    console.error("Error validating sprint capacity:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
