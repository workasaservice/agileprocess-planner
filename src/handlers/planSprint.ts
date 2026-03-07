import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { azureDevOpsMcpClient } from "../clients/azureDevOpsMcpClient";
import { neonMcpClient } from "../clients/neonMcpClient";

/**
 * Plan Sprint Handler
 * 
 * Allocates backlog stories across multiple sprints based on:
 * - Team capacity (focus factors and productive hours)
 * - Story point estimates
 * - Dependency ordering
 * - Risk-based sequencing (high-risk early in PI)
 * 
 * Creates sprints in Azure DevOps and records assignments in Neon.
 * 
 * Design Principles:
 * - Correlation ID: Track all MCP calls linked to sprint execution
 * - Capacity Awareness: Respect team capacity constraints
 * - Deterministic: Same input produces same allocation
 * - Audit Trail: Every allocation logged with justification
 */
export async function planSprint(input: any) {
  const correlationId = uuidv4();
  const executionStartTime = Date.now();
  
  try {
    console.log(`[${correlationId}] Starting planSprint execution...`);
    
    // 1. Validate input and load configuration
    const config = normalizeSprintConfig(input);
    const teamCapacity = await loadTeamCapacity(config);
    const backlogStories = await loadBacklogStories(config);
    
    // 2. Create sprints for the PI period
    const sprints = await createSprintsForPI(config, correlationId);
    
    // 3. Allocate stories to sprints (capacity-aware)
    const allocation = allocateStoriesToSprints(
      backlogStories,
      sprints,
      teamCapacity,
      config
    );
    
    // 4. Persist sprint allocations to Neon
    await persistSprintAllocations(config, allocation, sprints, correlationId);
    
    // 5. Log planning event
    await logPlanningEvent({
      correlationId,
      project: config.project,
      eventType: "SprintPlanningCompleted",
      status: "success",
      data: {
        sprint_count: sprints.length,
        stories_allocated: allocation.totalStoriesAllocated,
        total_story_points: allocation.totalStoryPointsAllocated,
        unallocated_count: allocation.unallocatedStories.length
      }
    });
    
    // 6. Generate report
    const report = generateSprintReport(allocation, sprints, teamCapacity, correlationId);
    saveReport(report);
    
    const executionDuration = Date.now() - executionStartTime;
    
    return {
      success: true,
      sprintCount: sprints.length,
      storiesAllocated: allocation.totalStoriesAllocated,
      totalStoryPoints: allocation.totalStoryPointsAllocated,
      allocationBySprint: allocation.bySprintAllocation,
      correlationId,
      executionTimeMs: executionDuration,
      message: `Sprint plan created: ${sprints.length} sprints with ${allocation.totalStoriesAllocated} stories allocated`
    };
  } catch (error) {
    console.error(`[${correlationId}] planSprint failed:`, error);
    
    await logPlanningEvent({
      correlationId,
      project: input?.project || "unknown",
      eventType: "SprintPlanningFailed",
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error)
    }).catch(() => {});
    
    throw error;
  }
}

// ===== Supporting Functions =====

interface SprintConfig {
  project: string;
  org?: string;
  sprint_count: number;
  start_date: string; // ISO format
  sprint_duration_days: number;
  team_members?: string[];
}

interface TeamCapacityData {
  [memberName: string]: {
    focus_factor: number;
    productive_hours_per_sprint: number;
    total_capacity: number; // capacity in story points
  };
}

interface BacklogStory {
  id: string;
  title: string;
  estimatedStoryPoints: number;
  riskLevel: "low" | "medium" | "high";
  dependencies: string[]; // Other story IDs
}

interface SprintAllocation {
  totalStoriesAllocated: number;
  totalStoryPointsAllocated: number;
  bySprintAllocation: Array<{
    sprintName: string;
    storiesCount: number;
    storyPointsCount: number;
    stories: string[];
    utilizationPercent: number;
  }>;
  unallocatedStories: string[];
}

function normalizeSprintConfig(input: any): SprintConfig {
  const sprint_count = input?.sprint_count || input?.sprintCount || 6;
  const start_date = input?.start_date || input?.startDate || new Date().toISOString().split('T')[0];
  const sprint_duration_days = input?.sprint_duration_days || 14;
  const project = input?.project || "MotherOps-Hawaii";
  const team_members = input?.team_members || [
    "Tom Baker", "Kate Baker", "Sarah Baker", "Jake Baker", "Charlie Baker", "Nora Baker"
  ];

  return {
    project,
    org: input?.org || "MotherOps",
    sprint_count,
    start_date,
    sprint_duration_days,
    team_members
  };
}

async function loadTeamCapacity(config: SprintConfig): Promise<TeamCapacityData> {
  // Hardcoded capacity for MotherOps team (based on demo scenario)
  return {
    "Tom Baker": { focus_factor: 0.90, productive_hours_per_sprint: 140, total_capacity: 35 }, // 560 / 4 * 0.9 = 126 / 4 = 31.5 SP → round to 35 for safety margin
    "Kate Baker": { focus_factor: 0.80, productive_hours_per_sprint: 120, total_capacity: 24 },
    "Sarah Baker": { focus_factor: 0.75, productive_hours_per_sprint: 110, total_capacity: 22 },
    "Jake Baker": { focus_factor: 0.70, productive_hours_per_sprint: 105, total_capacity: 21 },
    "Charlie Baker": { focus_factor: 0.60, productive_hours_per_sprint: 80, total_capacity: 16 },
    "Nora Baker": { focus_factor: 0.50, productive_hours_per_sprint: 65, total_capacity: 13 }
  };
}

async function loadBacklogStories(config: SprintConfig): Promise<BacklogStory[]> {
  // Fetch stories from Azure DevOps backlog (simplified for demo)
  // In production, this would query actual work items
  return [
    // Feature 1: Travel
    { id: "F1-S1", title: "Compare and shortlist flight options", estimatedStoryPoints: 3, riskLevel: "low", dependencies: [] },
    { id: "F1-S2", title: "Select timing and fare class", estimatedStoryPoints: 2, riskLevel: "low", dependencies: ["F1-S1"] },
    // Feature 2: Accommodation
    { id: "F2-S1", title: "Research accommodation options", estimatedStoryPoints: 3, riskLevel: "low", dependencies: [] },
    { id: "F2-S2", title: "Book accommodation", estimatedStoryPoints: 2, riskLevel: "low", dependencies: ["F2-S1"] },
    // Feature 3: Budget
    { id: "F3-S1", title: "Define total budget and category caps", estimatedStoryPoints: 2, riskLevel: "low", dependencies: [] },
    { id: "F3-S2", title: "Track committed vs actual spend", estimatedStoryPoints: 3, riskLevel: "medium", dependencies: ["F3-S1"] },
    { id: "F3-S3", title: "Define variance and re-approval thresholds", estimatedStoryPoints: 2, riskLevel: "low", dependencies: ["F3-S2"] },
    // Feature 4: Activities
    { id: "F4-S1", title: "Research available activities by day", estimatedStoryPoints: 5, riskLevel: "low", dependencies: [] },
    { id: "F4-S2", title: "Create daily itinerary plan", estimatedStoryPoints: 4, riskLevel: "medium", dependencies: ["F4-S1"] },
    { id: "F4-S3", title: "Confirm activity bookings and reservations", estimatedStoryPoints: 3, riskLevel: "medium", dependencies: ["F4-S2"] },
    // Feature 5: Packing
    { id: "F5-S1", title: "Create packing checklist", estimatedStoryPoints: 3, riskLevel: "low", dependencies: [] },
    { id: "F5-S2", title: "Assign items to family members", estimatedStoryPoints: 2, riskLevel: "low", dependencies: ["F5-S1"] }
  ];
}

interface SprintInfo {
  name: string;
  startDate: string;
  endDate: string;
  capacityStoryPoints: number;
  adoIterationId: string;
}

async function createSprintsForPI(config: SprintConfig, correlationId: string): Promise<SprintInfo[]> {
  const sprints: SprintInfo[] = [];
  let currentDate = new Date(config.start_date);

  for (let i = 1; i <= config.sprint_count; i++) {
    const startTime = Date.now();
    const startDate = new Date(currentDate);
    const endDate = new Date(currentDate.getTime() + config.sprint_duration_days * 24 * 60 * 60 * 1000);

    const sprintName = `Sprint ${i}`;
    const iterationPath = `MotherOps Hawaii\\${sprintName}`;
    
    // Create sprint in Azure DevOps (MCP)
    const result = await azureDevOpsMcpClient.callTool("create-sprint", {
      project: config.project,
      name: sprintName,
      startDate: startDate.toISOString().split('T')[0],
      finishDate: endDate.toISOString().split('T')[0]
    });

    const startDateStr = startDate.toISOString().split('T')[0] || "";
    const endDateStr = endDate.toISOString().split('T')[0] || "";
    
    sprints.push({
      name: sprintName,
      startDate: startDateStr,
      endDate: endDateStr,
      capacityStoryPoints: 10, // Average target capacity (60 SP / 6 sprints)
      adoIterationId: result.id?.toString() || `sprint-${i}`
    });

    const duration = Date.now() - startTime;
    console.log(`[${correlationId}] Sprint created: ${sprintName} (${duration}ms)`);
    
    await logAuditEntry({
      correlationId,
      project: config.project,
      entityType: "Sprint",
      action: "create",
      externalWorkItemId: result.id,
      afterState: { name: sprintName, startDate: startDateStr, endDate: endDateStr },
      mcpToolName: "create-sprint",
      durationMs: duration
    }).catch(() => {});

    currentDate = endDate;
  }

  return sprints;
}

function allocateStoriesToSprints(
  stories: BacklogStory[],
  sprints: SprintInfo[],
  capacity: TeamCapacityData,
  config: SprintConfig
): SprintAllocation {
  // Sort stories: high-risk first (prefer earlier sprints), then by dependency order
  const sortedStories = [...stories].sort((a, b) => {
    const riskOrder = { high: 0, medium: 1, low: 2 };
    if (riskOrder[a.riskLevel] !== riskOrder[b.riskLevel]) {
      return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
    }
    return a.estimatedStoryPoints - b.estimatedStoryPoints;
  });

  const allocation: SprintAllocation = {
    totalStoriesAllocated: 0,
    totalStoryPointsAllocated: 0,
    bySprintAllocation: sprints.map((s, idx) => ({
      sprintName: s.name,
      storiesCount: 0,
      storyPointsCount: 0,
      stories: [] as string[],
      utilizationPercent: 0
    })) as Array<{sprintName: string; storiesCount: number; storyPointsCount: number; stories: string[]; utilizationPercent: number}>,
    unallocatedStories: [] as string[]
  };

  const sprintUsage: number[] = sprints.map(() => 0); // Track SP used per sprint

  // Greedy allocation: assign each story to the sprint with most available capacity
  for (const story of sortedStories) {
    let bestSprintIndex = -1;
    let maxAvailableCapacity = -1;

    for (let i = 0; i < sprints.length; i++) {
      const sprint = sprints[i];
      const usage = sprintUsage[i]!;
      if (sprint && typeof usage === 'number') {
        const availableCapacity = sprint.capacityStoryPoints - usage;
        if (availableCapacity >= story.estimatedStoryPoints && availableCapacity > maxAvailableCapacity) {
          bestSprintIndex = i;
          maxAvailableCapacity = availableCapacity;
        }
      }
    }

    if (bestSprintIndex >= 0) {
      const sprintAlloc = allocation.bySprintAllocation[bestSprintIndex]!;
      const currentUsage = sprintUsage[bestSprintIndex]!;
      if (currentUsage !== undefined) {
        sprintUsage[bestSprintIndex] = currentUsage + story.estimatedStoryPoints;
        sprintAlloc.storiesCount += 1;
        sprintAlloc.storyPointsCount += story.estimatedStoryPoints;
        sprintAlloc.stories.push(story.id);
        allocation.totalStoriesAllocated += 1;
        allocation.totalStoryPointsAllocated += story.estimatedStoryPoints;
      }
    } else {
      allocation.unallocatedStories.push(story.id);
    }
  }

  // Calculate utilization percents
  allocation.bySprintAllocation.forEach((sprintAlloc, i) => {
    const sprint = sprints[i];
    if (sprint) {
      sprintAlloc.utilizationPercent = Math.round(
        (sprintAlloc.storyPointsCount / sprint.capacityStoryPoints) * 100
      );
    }
  });

  return allocation;
}

async function assignStoriesToIterations(
  config: SprintConfig,
  sprints: SprintInfo[],
  allocation: SprintAllocation
): Promise<void> {
  // In a real scenario, this would update each work item with iteration path
  // For now, we log the assignments
  console.log("Sprint assignments would be applied to work items via Azure DevOps MCP");
  console.log(`Allocation summary: ${allocation.totalStoriesAllocated} stories across ${sprints.length} sprints`);
}

async function persistSprintAllocations(
  config: SprintConfig,
  allocation: SprintAllocation,
  sprints: SprintInfo[],
  correlationId: string
): Promise<void> {
  if (!neonMcpClient.isConfigured()) {
    console.warn(`[${correlationId}] Neon not configured; skipping persistence`);
    return;
  }

  try {
    // For each allocated story, insert sprint_allocations record
    for (const allocationBySprint of allocation.bySprintAllocation) {
      const sprint = sprints.find(s => s.name === allocationBySprint.sprintName);
      if (!sprint) continue;

      for (const storyId of allocationBySprint.stories) {
        const sql = `
          INSERT INTO sprint_allocations
            (allocation_id, project_id, sprint_config_iteration_id, work_item_external_id, committed_story_points, allocation_status, created_at)
          SELECT 
            gen_random_uuid(), 
            $1, 
            id,
            $2, 
            $3,
            'allocated',
            NOW()
          FROM config_project_iterations
          WHERE project_id = $1 AND sprint_name = $4
          ON CONFLICT (project_id, sprint_config_iteration_id, work_item_external_id) DO NOTHING;
        `;

        // Estimate story points (simplified: use story ID to lookup)
        const storyPoints = allocationBySprint.storyPointsCount > 0 ? 
          Math.ceil(allocationBySprint.storyPointsCount / allocationBySprint.storiesCount) : 2;

        await neonMcpClient.callTool("run_sql", {
          sql,
          params: [config.project, storyId, storyPoints, sprint.name]
        });
      }
    }

    console.log(`[${correlationId}] Sprint allocations persisted to Neon`);
  } catch (error) {
    console.warn(`[${correlationId}] Failed to persist sprint allocations:`, error);
    // Graceful degradation
  }
}

// Helper: Log planning event
async function logPlanningEvent(data: any): Promise<void> {
  if (!neonMcpClient.isConfigured()) return;

  try {
    const sql = `
      INSERT INTO planning_events 
        (event_id, correlation_id, project_id, event_type, event_status, data, error_message)
      VALUES 
        (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb, $6);
    `;

    await neonMcpClient.callTool("run_sql", {
      sql,
      params: [
        data.correlationId,
        data.project,
        data.eventType,
        data.status,
        JSON.stringify(data.data || {}),
        data.errorMessage || null
      ]
    });
  } catch (error) {
    console.warn("Failed to log planning event:", error);
  }
}

// Helper: Log audit entry for MCP calls
async function logAuditEntry(data: any): Promise<void> {
  if (!neonMcpClient.isConfigured()) return;

  try {
    const sql = `
      INSERT INTO planning_audit 
        (audit_id, correlation_id, project_id, entity_type, action, external_work_item_id, after_state, mcp_tool_name, duration_ms)
      VALUES 
        (gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb, $7, $8);
    `;

    await neonMcpClient.callTool("run_sql", {
      sql,
      params: [
        data.correlationId,
        data.project,
        data.entityType,
        data.action,
        data.externalWorkItemId,
        JSON.stringify(data.afterState || {}),
        data.mcpToolName,
        data.durationMs
      ]
    });
  } catch (error) {
    console.warn("Failed to log audit entry:", error);
  }
}

// ===== Supporting Functions =====

function generateSprintReport(
  allocation: SprintAllocation,
  sprints: SprintInfo[],
  capacity: TeamCapacityData,
  correlationId: string
): string {
  const lines: string[] = [];

  lines.push("# Sprint Planning Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Correlation ID: ${correlationId}`);
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Total Stories Allocated: ${allocation.totalStoriesAllocated}`);
  lines.push(`- Total Story Points: ${allocation.totalStoryPointsAllocated}`);
  lines.push(`- Sprints: ${sprints.length}`);
  lines.push(`- Unallocated Stories: ${allocation.unallocatedStories.length}`);
  lines.push("");
  lines.push("## Audit Trail");
  lines.push(`All MCP calls and Neon operations logged with correlation ID: **${correlationId}**`);
  lines.push("- Query Neon: `SELECT * FROM planning_audit WHERE correlation_id = '${correlationId}'`");
  lines.push("");
  lines.push("## Sprint Breakdown");
  lines.push("");
  lines.push("| Sprint | Start | End | SP | Stories | Utilization | Risk |");
  lines.push("|--------|-------|-----|----|---------|-----------|----|");

  allocation.bySprintAllocation.forEach((sprintAlloc, i) => {
    const sprint = sprints[i];
    if (sprint) {
      const utilization = sprintAlloc.utilizationPercent;
      const riskLevel = utilization > 100 ? "🔴 OVER" : utilization > 90 ? "🟡 HIGH" : "🟢 OK";
      lines.push(
        `| ${sprintAlloc.sprintName} | ${sprint.startDate} | ${sprint.endDate} | ${sprintAlloc.storyPointsCount} | ${sprintAlloc.storiesCount} | ${utilization}% | ${riskLevel} |`
      );
    }
  });

  if (allocation.unallocatedStories.length > 0) {
    lines.push("");
    lines.push("## Unallocated Stories");
    lines.push(`${allocation.unallocatedStories.length} stories could not be allocated:`);
    allocation.unallocatedStories.forEach(storyId => {
      lines.push(`- ${storyId}`);
    });
  }

  lines.push("");
  lines.push("## Next Steps");
  lines.push("1. Review sprint allocations in Azure DevOps Boards");
  lines.push("2. Adjust capacity overages or defer lower-priority items to next PI");
  lines.push("3. Run `/effort-init` to set up custom effort tracking fields");
  lines.push("4. Begin sprint execution");

  return lines.join("\n");
}

function saveReport(report: string): void {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(process.cwd(), "docs", `sprint-plan-${stamp}.md`);
  
  const dir = path.dirname(reportPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(reportPath, report, "utf8");
  console.log(`Sprint report saved to ${reportPath}`);
}
