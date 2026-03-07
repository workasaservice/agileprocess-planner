import { v4 as uuidv4 } from "uuid";
import { neonMcpClient } from "../clients/neonMcpClient";
import { planBacklog } from "./planBacklog";
import { planSprint } from "./planSprint";

/**
 * Plan Organization Handler
 * 
 * Orchestrates planning across multiple projects (MotherOps-Hawaii, MotherOps-Alpha, MotherOps-Beta)
 * with isolated execution, event sourcing, and aggregate reporting.
 * 
 * Design Principles:
 * - Isolation: Each project planned independently; failures don't cascade
 * - CQRS: Commands (planBacklog, planSprint) separated from event log
 * - Event Sourcing: All planning events immutably logged for audit and replay
 * - Determinism: Same input produces same multi-project output
 * - Observability: Correlation ID links all related operations across projects
 */
export async function planOrganization(input: any) {
  const correlationId = uuidv4();
  const executionStartTime = Date.now();
  
  try {
    console.log(`[${correlationId}] Starting planOrganization execution...`);
    
    // 1. Determine which projects to plan (default: all 3)
    const projects = getProjectsToOrchestrate(input);
    console.log(`[${correlationId}] Planning for ${projects.length} projects: ${projects.map(p => p.name).join(", ")}`);
    
    // 2. Execute planning for each project in sequence (isolated)
    const results: Record<string, any> = {};
    const events: PlanningEvent[] = [];
    
    for (const project of projects) {
      try {
        console.log(`[${correlationId}] [${project.name}] Starting backlog planning...`);
        
        const backlogResult = await planBacklog({
          project: project.name,
          org: "MotherOps",
          title: `${project.name} Product Increment`,
          duration_weeks: 12,
          sprint_count: 6,
          team_members: project.teamMembers
        });
        
        console.log(`[${correlationId}] [${project.name}] Backlog planning complete`);
        
        console.log(`[${correlationId}] [${project.name}] Starting sprint planning...`);
        
        const sprintResult = await planSprint({
          project: project.name,
          org: "MotherOps",
          sprint_count: 6,
          start_date: new Date().toISOString().split('T')[0],
          sprint_duration_days: 14,
          team_members: project.teamMembers
        });
        
        console.log(`[${correlationId}] [${project.name}] Sprint planning complete`);
        
        results[project.name] = {
          status: "success",
          backlog: backlogResult,
          sprint: sprintResult
        };
        
        events.push({
          correlationId,
          timestamp: new Date().toISOString(),
          projectId: project.name,
          eventType: "ProjectPlanningCompleted",
          status: "success",
          data: {
            epic_count: backlogResult.featureCount,
            feature_count: backlogResult.featureCount,
            story_count: backlogResult.storyCount,
            task_count: backlogResult.taskCount,
            total_story_points: backlogResult.totalStoryPoints,
            sprint_count: sprintResult.sprintCount,
            stories_allocated: sprintResult.storiesAllocated
          }
        });
      } catch (error) {
        console.error(`[${correlationId}] [${project.name}] Planning failed:`, error);
        
        results[project.name] = {
          status: "failed",
          error: error instanceof Error ? error.message : String(error)
        };
        
        events.push({
          correlationId,
          timestamp: new Date().toISOString(),
          projectId: project.name,
          eventType: "ProjectPlanningFailed",
          status: "failed",
          errorMessage: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    // 3. Persist planning events to Neon
    await persistPlanningEvents(events, correlationId);
    
    // 4. Create organization-level summary
    const summary = generateOrganizationSummary(results, projects, correlationId);
    
    // 5. Log organization event
    await logOrganizationEvent({
      correlationId,
      eventType: "OrganizationPlanningCompleted",
      status: "success",
      data: summary
    });
    
    const executionDuration = Date.now() - executionStartTime;
    
    return {
      success: true,
      correlationId,
      projectsPlanned: projects.length,
      projectResults: results,
      organizationSummary: summary,
      executionTimeMs: executionDuration,
      message: `Organization planning complete: ${projects.length} projects orchestrated`
    };
  } catch (error) {
    console.error(`[${correlationId}] planOrganization failed:`, error);
    
    await logOrganizationEvent({
      correlationId,
      eventType: "OrganizationPlanningFailed",
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error)
    }).catch(() => {});
    
    throw error;
  }
}

// ===== Supporting Functions =====

interface ProjectConfig {
  name: string;
  teamMembers: string[];
  region?: string;
}

interface PlanningEvent {
  correlationId: string;
  timestamp: string;
  projectId: string;
  eventType: string;
  status: "success" | "failed" | "partial";
  data?: any;
  errorMessage?: string;
}

function getProjectsToOrchestrate(input: any): ProjectConfig[] {
  // Default: all 3 Mother Ops projects
  const defaultProjects: ProjectConfig[] = [
    {
      name: "MotherOps-Hawaii",
      teamMembers: ["Tom Baker", "Kate Baker", "Sarah Baker", "Jake Baker", "Charlie Baker", "Nora Baker"]
    },
    {
      name: "MotherOps-Alpha",
      teamMembers: ["Tom Baker", "Kate Baker", "Sarah Baker", "Jake Baker"]
    },
    {
      name: "MotherOps-Beta",
      teamMembers: ["Tom Baker", "Kate Baker", "Charlie Baker", "Nora Baker"]
    }
  ];

  // Allow override via input
  if (input?.projects && Array.isArray(input.projects)) {
    return input.projects;
  }

  if (input?.excludeHawaii) {
    return defaultProjects.filter(p => p.name !== "MotherOps-Hawaii");
  }

  if (input?.onlyProject) {
    return defaultProjects.filter(p => p.name === input.onlyProject);
  }

  return defaultProjects;
}

function generateOrganizationSummary(results: Record<string, any>, projects: ProjectConfig[], correlationId: string): any {
  let totalEpics = 0;
  let totalFeatures = 0;
  let totalStories = 0;
  let totalTasks = 0;
  let totalStoryPoints = 0;
  let totalSprints = 0;
  let totalAllocations = 0;
  let successCount = 0;
  let failureCount = 0;

  for (const project of projects) {
    const result = results[project.name];
    if (!result) continue;

    if (result.status === "success") {
      successCount++;
      totalEpics += 1; // 1 epic per project
      totalFeatures += result.backlog?.featureCount || 0;
      totalStories += result.backlog?.storyCount || 0;
      totalTasks += result.backlog?.taskCount || 0;
      totalStoryPoints += result.backlog?.totalStoryPoints || 0;
      totalSprints += result.sprint?.sprintCount || 0;
      totalAllocations += result.sprint?.storiesAllocated || 0;
    } else {
      failureCount++;
    }
  }

  return {
    correlationId,
    timestamp: new Date().toISOString(),
    totalProjects: projects.length,
    successfulProjects: successCount,
    failedProjects: failureCount,
    totalEpics,
    totalFeatures,
    totalStories,
    totalTasks,
    totalStoryPoints,
    totalSprints,
    totalAllocations,
    projectStatus: Object.entries(results).reduce((acc, [projectName, result]) => {
      acc[projectName] = result.status === "success" ? "✅ Success" : "❌ Failed";
      return acc;
    }, {} as Record<string, string>)
  };
}

async function persistPlanningEvents(events: PlanningEvent[], correlationId: string): Promise<void> {
  if (!neonMcpClient.isConfigured()) {
    console.warn(`[${correlationId}] Neon not configured; skipping event persistence`);
    return;
  }

  try {
    for (const event of events) {
      const sql = `
        INSERT INTO planning_events 
          (event_id, correlation_id, project_id, event_type, event_status, data, error_message)
        VALUES 
          (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb, $6);
      `;

      await neonMcpClient.callTool("run_sql", {
        sql,
        params: [
          event.correlationId,
          event.projectId,
          event.eventType,
          event.status,
          JSON.stringify(event.data || {}),
          event.errorMessage || null
        ]
      });
    }

    console.log(`[${correlationId}] Persisted ${events.length} planning events to Neon`);
  } catch (error) {
    console.warn(`[${correlationId}] Failed to persist planning events:`, error);
    // Graceful degradation
  }
}

async function logOrganizationEvent(data: any): Promise<void> {
  if (!neonMcpClient.isConfigured()) return;

  try {
    const sql = `
      INSERT INTO organization_planning_summary 
        (organization, pi_name, total_projects_planned, total_epics_created, total_features_created, 
         total_stories_created, total_tasks_created, total_story_points, total_sprints_created, 
         total_allocations, status)
      VALUES (
        'MotherOps',
        'MotherOps Multi-Project PI',
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9
      );
    `;

    const summary = data.data;
    await neonMcpClient.callTool("run_sql", {
      sql,
      params: [
        summary.totalProjects,
        summary.totalEpics,
        summary.totalFeatures,
        summary.totalStories,
        summary.totalTasks,
        summary.totalStoryPoints,
        summary.totalSprints,
        summary.totalAllocations,
        'completed'
      ]
    });
  } catch (error) {
    console.warn("Failed to log organization event:", error);
  }
}

export default {
  planOrganization,
  getProjectsToOrchestrate,
  generateOrganizationSummary
};
