import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { azureDevOpsMcpClient } from "../clients/azureDevOpsMcpClient";
import { neonMcpClient } from "../clients/neonMcpClient";

/**
 * Plan Backlog Handler
 * 
 * Generates and persists a complete PI backlog hierarchy (Epic -> Feature -> Story -> Task)
 * based on scenario input. Creates work items in Azure DevOps via MCP and records mappings
 * in Neon for later sprint allocation and effort tracking.
 * 
 * Design Principles:
 * - Correlation ID: Track all MCP calls linked to a single planning execution
 * - Idempotency: Check before creating in Azure DevOps (prevent duplicates)
 * - Audit Trail: Log all actions with correlation ID, status, duration
 * - Graceful Degradation: System works even if Neon unavailable
 * - Error Handling: Catch and log all failures; continue where possible
 * 
 * Input: scenario details including project, duration, team, and requirements
 * Output: backlog hierarchy with Azure DevOps IDs and Neon persistence confirmations
 */
export async function planBacklog(input: any) {
  const correlationId = uuidv4();
  const executionStartTime = Date.now();
  
  try {
    console.log(`[${correlationId}] Starting planBacklog execution...`);
    
    // 1. Validate and normalize input
    const scenario = normalizeScenarioInput(input);
    
    // 2. Check for existing backlog (idempotency)
    const existingBacklog = await checkExistingBacklog(scenario.project, correlationId);
    if (existingBacklog) {
      console.log(`[${correlationId}] Backlog already exists for ${scenario.project}`);
      return { success: false, message: "Backlog already exists", existingEpicId: existingBacklog.epicId };
    }
    
    // 3. Generate backlog structure (deterministic)
    const backlogStructure = generateBacklogStructure(scenario);
    
    // 4. Create Epic in Azure DevOps via MCP
    const epicResult = await createEpicViaApi(scenario, backlogStructure, correlationId);
    const epicId = epicResult.id;
    
    // 5. Create Features, Stories, Tasks in hierarchy (MCP)
    const featureIds = await createFeaturesViaApi(scenario, backlogStructure, epicId, correlationId);
    const storyIds = await createStoriesViaApi(scenario, backlogStructure, featureIds, correlationId);
    const taskIds = await createTasksViaApi(scenario, backlogStructure, storyIds, correlationId);
    
    // 6. Persist PI context and backlog hierarchy to Neon
    await persistPiContextToNeon(scenario, backlogStructure, correlationId);
    await persistBacklogHierarchyToNeon(scenario, {
      epicId,
      featureIds,
      storyIds,
      taskIds,
      structure: backlogStructure
    }, correlationId);
    
    // 7. Log planning event to audit trail
    await logPlanningEvent({
      correlationId,
      project: scenario.project,
      eventType: "BacklogCreated",
      status: "success",
      data: {
        epic_count: 1,
        feature_count: Object.keys(featureIds).length,
        story_count: Object.keys(storyIds).length,
        task_count: Object.keys(taskIds).length,
        total_story_points: backlogStructure.totalStoryPoints
      }
    });
    
    // 8. Generate and save report
    const report = generateReport({
      scenario,
      epicId,
      featureCount: Object.keys(featureIds).length,
      storyCount: Object.keys(storyIds).length,
      taskCount: Object.keys(taskIds).length,
      correlationId
    });
    
    saveReport(report);
    
    const executionDuration = Date.now() - executionStartTime;
    
    return {
      success: true,
      epicId,
      featureCount: Object.keys(featureIds).length,
      storyCount: Object.keys(storyIds).length,
      taskCount: Object.keys(taskIds).length,
      totalStoryPoints: backlogStructure.totalStoryPoints,
      correlationId,
      executionTimeMs: executionDuration,
      message: `Backlog created successfully: 1 Epic, ${Object.keys(featureIds).length} Features, ${Object.keys(storyIds).length} Stories, ${Object.keys(taskIds).length} Tasks`
    };
  } catch (error) {
    console.error(`[${correlationId}] planBacklog failed:`, error);
    
    // Log failure event
    await logPlanningEvent({
      correlationId,
      project: input?.project || "unknown",
      eventType: "BacklogCreationFailed",
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error)
    }).catch(() => {/* Ignore Neon logging errors */});
    
    throw error;
  }
}

// ===== Supporting Functions =====

interface ScenarioInput {
  project: string;
  org?: string;
  title: string;
  duration_weeks: number;
  sprint_count: number;
  team_members?: string[];
  max_story_points?: number;
  descriptionHtml?: string;
}

function normalizeScenarioInput(input: any): ScenarioInput {
  // Extract nested properties
  const scope = input?.scope || input?.scenario || {};
  
  const project = input?.project || scope?.project || "MotherOps-Hawaii";
  const title = input?.title || scope?.title || "Family Trip Product Increment";
  const duration_weeks = input?.duration_weeks || scope?.duration_weeks || 12;
  const sprint_count = input?.sprint_count || scope?.sprint_count || 6;
  const team_members = input?.team_members || scope?.team_members || [
    "Tom Baker", "Kate Baker", "Sarah Baker", "Jake Baker", "Charlie Baker", "Nora Baker"
  ];
  const max_story_points = input?.max_story_points || scope?.max_story_points || 60;

  return {
    project,
    org: input?.org || "MotherOps",
    title,
    duration_weeks,
    sprint_count,
    team_members,
    max_story_points,
    descriptionHtml: input?.description || scope?.description || 
      `<p>A comprehensive plan for a reliable, budget-aware, low-stress Hawaii family trip.</p>`
  };
}

interface BacklogStructure {
  epic: {
    title: string;
    description: string;
  };
  features: Array<{
    id: string;
    title: string;
    description: string;
    estimatedStoryPoints: number;
    stories: Array<{
      id: string;
      title: string;
      description: string;
      acceptanceCriteria: string[];
      estimatedStoryPoints: number;
      tasks: Array<{
        id: string;
        title: string;
        description: string;
        estimatedHours: number;
      }>;
    }>;
  }>;
  totalStoryPoints: number;
}

function extractWorkItemId(
  result: any,
  fallbackId: string,
  correlationId: string,
  entityType: string
): string {
  const candidates = [
    result?.id,
    result?.workItemId,
    result?.value?.id,
    result?.resource?.id,
    result?.fields?.["System.Id"],
  ];

  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null && String(candidate).trim() !== "") {
      return String(candidate);
    }
  }

  const urlCandidate = result?.url || result?._links?.html?.href;
  if (typeof urlCandidate === "string") {
    const match = urlCandidate.match(/(\d+)(?:\?.*)?$/);
    if (match?.[1]) {
      return match[1];
    }
  }

  console.warn(
    `[${correlationId}] ${entityType} ID missing from Azure response; using fallback '${fallbackId}' for persistence.`
  );
  return fallbackId;
}

function generateBacklogStructure(scenario: ScenarioInput): BacklogStructure {
  // Hardcoded MotherOps Hawaii example structure
  const features = [
    {
      id: "F1",
      title: "Travel and Flight Booking Strategy",
      description: "Define and lock optimal travel plan for the family within budget constraints",
      estimatedStoryPoints: 8,
      stories: [
        {
          id: "F1-S1",
          title: "Compare and shortlist flight options",
          description: "Research and compare flight options across different dates and carriers",
          acceptanceCriteria: [
            "At least three viable options documented with cost, duration, and baggage details",
            "Comparison includes direct vs connecting flights",
            "Price spread and trade-offs clearly documented"
          ],
          estimatedStoryPoints: 3,
          tasks: [
            { id: "F1-S1-T1", title: "Research flight options", description: "Use airline and travel aggregator websites", estimatedHours: 4 },
            { id: "F1-S1-T2", title: "Build comparison spreadsheet", description: "Create comparison with key criteria", estimatedHours: 2 }
          ]
        },
        {
          id: "F1-S2",
          title: "Select timing and fare class",
          description: "Choose preferred flight based on cost, convenience, and family preferences",
          acceptanceCriteria: [
            "Preferred flight selected based on family vote",
            "Fare class chosen (economy vs premium)",
            "Booking confirmation prepared"
          ],
          estimatedStoryPoints: 2,
          tasks: [
            { id: "F1-S2-T1", title: "Family voting on preferred option", description: "", estimatedHours: 2 },
            { id: "F1-S2-T2", title: "Confirm fare pricing", description: "", estimatedHours: 1 }
          ]
        }
      ]
    },
    {
      id: "F2",
      title: "Accommodation and Stay Planning",
      description: "Select and book accommodations for the duration of the trip",
      estimatedStoryPoints: 8,
      stories: [
        {
          id: "F2-S1",
          title: "Research accommodation options",
          description: "Find suitable hotels, resorts, or rental accommodations",
          acceptanceCriteria: [
            "At least 5 accommodation options reviewed",
            "Written summaries of each option with pros/cons",
            "Pricing and amenities comparison"
          ],
          estimatedStoryPoints: 3,
          tasks: [
            { id: "F2-S1-T1", title: "Browse accommodation websites", description: "", estimatedHours: 5 },
            { id: "F2-S1-T2", title: "Create options summary", description: "", estimatedHours: 3 }
          ]
        }
      ]
    },
    {
      id: "F3",
      title: "Budget Governance and Spend Controls",
      description: "Define financial constraints and track expenses throughout planning",
      estimatedStoryPoints: 7,
      stories: [
        {
          id: "F3-S1",
          title: "Define total budget and category caps",
          description: "Set financial constraints for the entire trip",
          acceptanceCriteria: [
            "Total budget established and agreed",
            "Budget broken down by category (flights, lodging, food, activities)",
            "Contingency buffer defined"
          ],
          estimatedStoryPoints: 2,
          tasks: [
            { id: "F3-S1-T1", title: "Gather cost estimates", description: "", estimatedHours: 3 },
            { id: "F3-S1-T2", title: "Create budget spreadsheet", description: "", estimatedHours: 2 }
          ]
        }
      ]
    },
    {
      id: "F4",
      title: "Daily Itinerary and Activity Design",
      description: "Plan daily activities and experiences for the trip",
      estimatedStoryPoints: 12,
      stories: [
        {
          id: "F4-S1",
          title: "Research available activities by day",
          description: "Identify attractions and activities suitable for family",
          acceptanceCriteria: [
            "Activities documented for each day",
            "Seasonal/weather considerations noted",
            "Age-appropriate options included"
          ],
          estimatedStoryPoints: 5,
          tasks: [
            { id: "F4-S1-T1", title: "Browse activity listings", description: "", estimatedHours: 6 },
            { id: "F4-S1-T2", title: "Create activity matrix", description: "", estimatedHours: 4 }
          ]
        }
      ]
    },
    {
      id: "F5",
      title: "Packing and Readiness Management",
      description: "Prepare all physical items and documentation needed",
      estimatedStoryPoints: 8,
      stories: [
        {
          id: "F5-S1",
          title: "Create packing checklist",
          description: "Document all items needed for the trip",
          acceptanceCriteria: [
            "Master packing list created",
            "Items organized by category",
            "Special items (medications, documents) highlighted"
          ],
          estimatedStoryPoints: 3,
          tasks: [
            { id: "F5-S1-T1", title: "Build master checklist", description: "", estimatedHours: 3 }
          ]
        }
      ]
    }
  ];

  return {
    epic: {
      title: scenario.title,
      description: scenario.descriptionHtml || "Program Increment for planned initiative"
    },
    features,
    totalStoryPoints: features.reduce((sum, f) => sum + f.estimatedStoryPoints, 0)
  };
}

async function createEpicViaApi(scenario: ScenarioInput, backlog: BacklogStructure, correlationId: string): Promise<any> {
  const startTime = Date.now();
  
  const result = await azureDevOpsMcpClient.callTool("create-work-item", {
    project: scenario.project,
    type: "Epic",
    title: backlog.epic.title,
    description: backlog.epic.description,
    tags: `PI,Epic,${correlationId}`
  });

  const epicId = extractWorkItemId(result, `epic-${scenario.project}`, correlationId, "Epic");
  const duration = Date.now() - startTime;
  console.log(`[${correlationId}] Epic created: ${epicId} (${duration}ms)`);
  
  // Log to audit trail
  await logAuditEntry({
    correlationId,
    project: scenario.project,
    entityType: "Epic",
    action: "create",
    externalWorkItemId: epicId,
    afterState: { title: backlog.epic.title, type: "Epic" },
    mcpToolName: "create-work-item",
    durationMs: duration
  }).catch(() => {/* Ignore audit logging errors */});

  return { ...result, id: epicId };
}

async function createFeaturesViaApi(
  scenario: ScenarioInput,
  backlog: BacklogStructure,
  epicId: number,
  correlationId: string
): Promise<Record<string, string>> {
  const featureIds: Record<string, string> = {};

  for (const feature of backlog.features) {
    const startTime = Date.now();
    
    const result = await azureDevOpsMcpClient.callTool("create-work-item", {
      project: scenario.project,
      type: "Feature",
      title: feature.title,
      description: feature.description,
      parent: epicId,
      tags: `PI,Feature,${feature.id},${correlationId}`,
      "Microsoft.VSTS.Scheduling.StoryPoints": feature.estimatedStoryPoints
    });

    const featureExternalId = extractWorkItemId(
      result,
      `${feature.id}-${scenario.project}`,
      correlationId,
      "Feature"
    );
    featureIds[feature.id] = featureExternalId;
    
    const duration = Date.now() - startTime;
    console.log(`[${correlationId}] Feature created: ${featureExternalId} (${duration}ms)`);
    
    await logAuditEntry({
      correlationId,
      project: scenario.project,
      entityType: "Feature",
      action: "create",
      externalWorkItemId: featureExternalId,
      afterState: { title: feature.title, storyPoints: feature.estimatedStoryPoints },
      mcpToolName: "create-work-item",
      durationMs: duration
    }).catch(() => {});
  }

  return featureIds;
}

async function createStoriesViaApi(
  scenario: ScenarioInput,
  backlog: BacklogStructure,
  featureIds: Record<string, string>,
  correlationId: string
): Promise<Record<string, string>> {
  const storyIds: Record<string, string> = {};

  for (const feature of backlog.features) {
    const featureId = featureIds[feature.id];
    for (const story of feature.stories) {
      const startTime = Date.now();
      
      const acString = story.acceptanceCriteria.map(ac => `• ${ac}`).join("\n");
      const description = `${story.description}\n\n**Acceptance Criteria:**\n${acString}\n\n**Estimate:** ${story.estimatedStoryPoints} SP`;

      const result = await azureDevOpsMcpClient.callTool("create-work-item", {
        project: scenario.project,
        type: "User Story",
        title: story.title,
        description,
        parent: featureId,
        tags: `Story,${feature.id},${story.id},${correlationId}`,
        "Microsoft.VSTS.Scheduling.StoryPoints": story.estimatedStoryPoints
      });

      const storyExternalId = extractWorkItemId(
        result,
        `${story.id}-${scenario.project}`,
        correlationId,
        "Story"
      );
      storyIds[story.id] = storyExternalId;
      
      const duration = Date.now() - startTime;
      console.log(`[${correlationId}] Story created: ${storyExternalId} (${duration}ms)`);
      
      await logAuditEntry({
        correlationId,
        project: scenario.project,
        entityType: "Story",
        action: "create",
        externalWorkItemId: storyExternalId,
        afterState: { title: story.title, storyPoints: story.estimatedStoryPoints },
        mcpToolName: "create-work-item",
        durationMs: duration
      }).catch(() => {});
    }
  }

  return storyIds;
}

async function createTasksViaApi(
  scenario: ScenarioInput,
  backlog: BacklogStructure,
  storyIds: Record<string, string>,
  correlationId: string
): Promise<Record<string, string>> {
  const taskIds: Record<string, string> = {};

  for (const feature of backlog.features) {
    for (const story of feature.stories) {
      const storyId = storyIds[story.id];
      for (const task of story.tasks) {
        const startTime = Date.now();
        
        const result = await azureDevOpsMcpClient.callTool("create-work-item", {
          project: scenario.project,
          type: "Task",
          title: task.title,
          description: task.description,
          parent: storyId,
          tags: `Task,${story.id},${task.id},${correlationId}`
        });

        const taskExternalId = extractWorkItemId(
          result,
          `${task.id}-${scenario.project}`,
          correlationId,
          "Task"
        );
        taskIds[task.id] = taskExternalId;
        
        const duration = Date.now() - startTime;
        await logAuditEntry({
          correlationId,
          project: scenario.project,
          entityType: "Task",
          action: "create",
          externalWorkItemId: taskExternalId,
          afterState: { title: task.title, estimatedHours: task.estimatedHours },
          mcpToolName: "create-work-item",
          durationMs: duration
        }).catch(() => {});
      }
    }
  }

  return taskIds;
}

// Helper: Check if backlog already exists (idempotency)
async function checkExistingBacklog(project: string, correlationId: string): Promise<any> {
  if (!neonMcpClient.isConfigured()) {
    return null;
  }

  try {
    const sql = `SELECT pi_id, pi_name FROM program_increments WHERE project_id = $1 LIMIT 1`;
    const result = await neonMcpClient.callTool("run_sql", { sql, params: [project] });
    const rows = (result as any).rows || [];
    return rows[0] || null;
  } catch (error) {
    console.warn(`[${correlationId}] Failed to check existing backlog:`, error);
    return null;
  }
}

// Persist: Program Increments (PI context)
async function persistPiContextToNeon(scenario: ScenarioInput, structure: BacklogStructure, correlationId: string): Promise<void> {
  if (!neonMcpClient.isConfigured()) {
    console.warn(`[${correlationId}] Neon not configured; skipping PI context persistence`);
    return;
  }

  try {
    const piName = scenario.title || "Family Trip PI";
    const startDate = new Date().toISOString().split('T')[0];
    const endDate = new Date(Date.now() + scenario.duration_weeks * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const sql = `
      INSERT INTO program_increments 
        (pi_id, project_id, pi_name, pi_description, start_date, end_date, duration_sprints, capability_goal, success_criteria)
      VALUES 
        (gen_random_uuid(), $1, $2, $3, $4::date, $5::date, $6, $7, $8::jsonb)
      ON CONFLICT (project_id, pi_name) DO NOTHING
      RETURNING pi_id;
    `;

    const params = [
      scenario.project,
      piName,
      `Complete product increment: ${structure.totalStoryPoints} story points across ${structure.features.length} features`,
      startDate,
      endDate,
      scenario.sprint_count,
      `Deliver ${structure.features.length} features with ${structure.totalStoryPoints} SP`,
      JSON.stringify({ features: structure.features.length, stories: 12, tasks: 20 })
    ];

    const result = await neonMcpClient.callTool("run_sql", { sql, params });
    console.log(`[${correlationId}] PI context persisted to Neon`);
  } catch (error) {
    console.warn(`[${correlationId}] Failed to persist PI context to Neon:`, error);
    // Graceful degradation: continue even if persistence fails
  }
}

// Persist: Backlog Hierarchy (parent-child relationships)
async function persistBacklogHierarchyToNeon(
  scenario: ScenarioInput,
  ids: any,
  correlationId: string
): Promise<void> {
  if (!neonMcpClient.isConfigured()) {
    console.warn(`[${correlationId}] Neon not configured; skipping backlog hierarchy persistence`);
    return;
  }

  try {
    // Build hierarchy records from structure
    const hierarchyRecords = [];
    let orderInParent = 0;

    for (const feature of ids.structure.features) {
      const featureId = ids.featureIds[feature.id];
      
      // Epic -> Feature relationship
      hierarchyRecords.push({
        parentId: ids.epicId,
        childId: featureId,
        level: "Feature",
        points: feature.estimatedStoryPoints,
        order: ++orderInParent
      });

      // Feature -> Stories relationships
      let storyOrder = 0;
      for (const story of feature.stories) {
        const storyId = ids.storyIds[story.id];
        
        hierarchyRecords.push({
          parentId: featureId,
          childId: storyId,
          level: "Story",
          points: story.estimatedStoryPoints,
          order: ++storyOrder
        });

        // Story -> Tasks relationships
        let taskOrder = 0;
        for (const task of story.tasks) {
          const taskId = ids.taskIds[task.id];
          
          hierarchyRecords.push({
            parentId: storyId,
            childId: taskId,
            level: "Task",
            points: 0,
            order: ++taskOrder
          });
        }
      }
    }

    // Insert all hierarchy records
    for (const record of hierarchyRecords) {
      const sql = `
        INSERT INTO backlog_hierarchy 
          (project_id, parent_external_id, child_external_id, hierarchy_level, parent_work_item_type, child_work_item_type, estimated_story_points, order_in_parent)
        VALUES 
          ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (project_id, parent_external_id, child_external_id) DO NOTHING;
      `;

      const parentType = record.order === 1 && record.level === "Feature" ? "Epic" : (record.level === "Story" ? "Feature" : "Story");
      
      await neonMcpClient.callTool("run_sql", {
        sql,
        params: [
          scenario.project,
          record.parentId,
          record.childId,
          record.level,
          parentType,
          record.level,
          record.points,
          record.order
        ]
      });
    }

    console.log(`[${correlationId}] Backlog hierarchy persisted to Neon: ${hierarchyRecords.length} records`);
  } catch (error) {
    console.warn(`[${correlationId}] Failed to persist backlog hierarchy to Neon:`, error);
    // Graceful degradation
  }
}

// Helper: Log planning event to audit trail
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

// Helper: Log audit entry for individual MCP calls
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

function generateReport(data: any): string {
  const lines: string[] = [];

  lines.push("# Backlog Planning Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Project: ${data.scenario.project}`);
  lines.push(`Title: ${data.scenario.title || 'MotherOps Hawaii Trip'}`);
  lines.push(`Correlation ID: ${data.correlationId}`);
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Epic ID: ${data.epicId}`);
  lines.push(`- Features: ${data.featureCount}`);
  lines.push(`- Stories: ${data.storyCount}`);
  lines.push(`- Tasks: ${data.taskCount}`);
  lines.push(`- Total Story Points: ${data.totalStoryPoints || '60'}`);
  lines.push("");
  lines.push("## Audit Trail");
  lines.push(`All MCP calls and Neon operations logged with correlation ID: **${data.correlationId}**`);
  lines.push("- Query Neon: `SELECT * FROM planning_audit WHERE correlation_id = '${correlationId}'`");
  lines.push("- Query Events: `SELECT * FROM planning_events WHERE correlation_id = '${correlationId}'`");
  lines.push("");
  lines.push("## Next Steps");
  lines.push("1. Review backlog in Azure DevOps Boards");
  lines.push("2. Run `/plan-sprint` to allocate stories to sprints");
  lines.push("3. Run `/effort-init` to initialize custom effort fields");
  lines.push("4. Run `/effort-sync` to begin tracking effort");

  return lines.join("\n");
}

function saveReport(report: string): void {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(process.cwd(), "docs", `backlog-plan-${stamp}.md`);
  
  const dir = path.dirname(reportPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(reportPath, report, "utf8");
  console.log(`Report saved to ${reportPath}`);
}
