/**
 * Sprint Story Seeding Service
 * 
 * Automatically creates default user stories for new sprints based on Neon-stored templates.
 * Supports story hierarchy (Epic -> Feature -> Story -> Task) with parent linking.
 * 
 * Policy:
 * - Sources templates from `sprint_story_templates` table (per project/team)
 * - Creates stories with idempotent check (no duplicates if rerun)
 * - Links to parent Epic/Feature if template metadata specifies parent
 * - Records all created items to `sprint_seed_artifacts` for audit trail
 * - Requires PERSISTENCE_MODE=postgres
 */

import { neonMcpClient } from "../clients/neonMcpClient";
import { azureDevOpsMcpClient } from "../clients/azureDevOpsMcpClient";
import { requirePostgresMode, requireNeonMcpConfigured, loadConfigurationAsync } from "../lib/configLoader";

export interface StorySeederResult {
  success: boolean;
  storiesCreated: number;
  storiesSkipped: number;
  errors: string[];
  createdWorkItems: Array<{
    title: string;
    id: number;
    type: string;
  }>;
  summary: Record<string, any>;
}

export interface StorySeederConfig {
  projectId: string;
  teamId: string;
  sprintId: string; // Azure DevOps iteration ID
  iterationPath: string;
  requirementContext?: {
    summary: string;
    source: string;
  };
  parentFeatureId?: number | string; // Parent Feature for linking user stories
  dryRun?: boolean;
}

interface StoryTemplate {
  id: number;
  templateName: string;
  workItemType: string;
  title: string;
  description?: string;
  acceptanceCriteria?: string;
  estimatedHours?: number;
  storyOrder: number;
  parentTemplateId?: number;
}

interface ProjectMember {
  userId: string;
  displayName: string;
}

function buildIterationPathCandidates(iterationPath: string): string[] {
  const trimmedLeading = iterationPath.replace(/^\\+/, "");
  const withoutIterationNode = trimmedLeading.replace(/\\Iteration\\/i, "\\");

  const candidates = [
    withoutIterationNode,
    trimmedLeading,
    iterationPath
  ].map((p) => p.trim()).filter((p) => p.length > 0);

  return Array.from(new Set(candidates));
}

/**
 * Load story templates for a project/team from Neon
 */
async function loadStoryTemplates(projectId: string, teamId: string): Promise<StoryTemplate[]> {
  try {
    const templates = await neonMcpClient.query<any>(
      `SELECT 
        id, 
        template_name as "templateName",
        work_item_type as "workItemType",
        title,
        description,
        acceptance_criteria as "acceptanceCriteria",
        estimated_hours as "estimatedHours",
        story_order as "storyOrder",
        parent_template_id as "parentTemplateId"
       FROM sprint_story_templates
       WHERE project_id = $1 AND team_id = $2 AND is_active = true
       ORDER BY story_order ASC, id ASC`,
      [projectId, teamId]
    );

    if (Array.isArray(templates)) {
      return templates as StoryTemplate[];
    }
    
    return [];
  } catch (error) {
    console.warn(`Failed to load story templates: ${error}`);
    return [];
  }
}

/**
 * Check if a story already exists in the sprint (idempotency check)
 */
async function storyExists(sprintPath: string, title: string): Promise<boolean> {
  const candidatePaths = buildIterationPathCandidates(sprintPath);

  for (const candidatePath of candidatePaths) {
    try {
      const result = await azureDevOpsMcpClient.callTool("list-work-items", {
        query: `SELECT [System.Id], [System.Title] 
                FROM workitems 
                WHERE [System.IterationPath] = '${candidatePath}' 
                AND [System.Title] = '${title}'`
      });

      if (result && result.workItems && result.workItems.length > 0) {
        return true;
      }
    } catch (error) {
      // Ignore path probe errors; next candidate will be attempted.
    }
  }

  return false;
}

async function findStoryIdByTitle(projectId: string, sprintPath: string, title: string): Promise<number | null> {
  const candidatePaths = buildIterationPathCandidates(sprintPath);

  for (const candidatePath of candidatePaths) {
    try {
      const result = await azureDevOpsMcpClient.callTool("list-work-items", {
        query: `SELECT [System.Id], [System.Title]
                FROM workitems
                WHERE [System.TeamProject] = '${projectId}'
                AND [System.IterationPath] = '${candidatePath}'
                AND [System.Title] = '${title}'`
      });

      const items = Array.isArray(result?.workItems) ? result.workItems : [];
      if (items.length > 0 && items[0]?.id) {
        return Number(items[0].id);
      }
    } catch {
      // Ignore and try next path candidate.
    }
  }

  return null;
}

async function loadProjectMembers(projectId: string): Promise<ProjectMember[]> {
  try {
    const rows = await neonMcpClient.query<any>(
      `SELECT cpu.user_id as "userId", COALESCE(cu.display_name, cpu.user_id) as "displayName"
       FROM config_project_members cpu
       JOIN config_users cu ON cpu.user_id = cu.user_id
       WHERE cpu.project_id = $1
       ORDER BY COALESCE(cu.display_name, cpu.user_id) ASC`,
      [projectId]
    );

    if (!Array.isArray(rows)) {
      return [];
    }

    return rows
      .filter((r) => r.userId)
      .map((r) => ({
        userId: String(r.userId),
        displayName: String(r.displayName || r.userId)
      }));
  } catch (error) {
    console.warn(`Failed to load project members: ${error}`);
    return [];
  }
}

async function createMemberNamedTasks(
  config: StorySeederConfig,
  seedRunId: number,
  result: StorySeederResult,
  meetingsParentId: number | null,
  unplannedParentId: number | null,
  dryRun: boolean = false
): Promise<void> {
  const members = await loadProjectMembers(config.projectId);
  if (members.length === 0) {
    return;
  }

  const parentDefs: Array<{ parentTitle: string; parentId: number | null; taskPrefix: string }> = [
    { parentTitle: "Meetings", parentId: meetingsParentId, taskPrefix: "Sprint Meetings" },
    { parentTitle: "UnPlanned", parentId: unplannedParentId, taskPrefix: "UnPlanned Capacity" }
  ];

  for (const parent of parentDefs) {
    if (!parent.parentId && !dryRun) {
      continue;
    }

    for (const member of members) {
      const taskTitle = `${parent.taskPrefix} - ${member.displayName}`;
      const exists = await storyExists(config.iterationPath, taskTitle);
      if (exists) {
        result.storiesSkipped++;
        continue;
      }

      const createResult = await createStory(
        config.projectId,
        taskTitle,
        "Task",
        config.iterationPath,
        `Member task for ${member.displayName} under ${parent.parentTitle}`,
        undefined,
        undefined,
        member.userId,
        undefined,
        dryRun
      );

      if (!createResult.success) {
        result.success = false;
        result.errors.push(`Failed to create \"${taskTitle}\": ${createResult.error}`);
        continue;
      }

      const taskId = createResult.id!;
      result.storiesCreated++;
      result.createdWorkItems.push({ title: taskTitle, id: taskId, type: "Task" });

      if (parent.parentId) {
        await linkToParent(config.projectId, taskId, parent.parentId, dryRun);
      }

      await recordStoryArtifact(seedRunId, taskId, taskTitle, "Task", parent.parentId || undefined);
    }
  }
}

/**
 * Create a single story in Azure DevOps
 */
async function createStory(
  projectId: string,
  title: string,
  workItemType: string,
  iterationPath: string,
  description?: string,
  acceptanceCriteria?: string,
  estimatedHours?: number,
  assignedTo?: string,
  parentId?: number,
  dryRun: boolean = false
): Promise<{success: boolean; id?: number; error?: string}> {
  if (dryRun) {
    return { success: true, id: -1 }; // Placeholder ID for dry run
  }

  const candidatePaths = buildIterationPathCandidates(iterationPath);
  let lastError = "No ID returned from creation";

  for (const candidatePath of candidatePaths) {
    try {
      const payload: Record<string, any> = {
        project: projectId,
        type: workItemType,
        title: title,
        iterationPath: candidatePath
      };

      if (description) {
        payload.description = description;
      }

      if (acceptanceCriteria) {
        payload.acceptanceCriteria = acceptanceCriteria;
      }

      if (estimatedHours) {
        payload.storyPoints = estimatedHours;
      }

      if (assignedTo) {
        payload.assignedTo = assignedTo;
      }

      const result = await azureDevOpsMcpClient.callTool("create-work-item", payload);

      if (result && result.id) {
        if (candidatePath !== iterationPath) {
          console.log(`[Story Seeding] Created '${title}' using fallback iteration path: ${candidatePath}`);
        }
        return { success: true, id: result.id };
      }

      lastError = "No ID returned from creation";
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      lastError = errorMsg;
    }
  }

  return { success: false, error: lastError };
}

function enrichTemplateWithRequirement(
  template: StoryTemplate,
  requirementSummary?: string
): { description?: string; acceptanceCriteria?: string } {
  if (!requirementSummary || template.workItemType !== "User Story") {
    const passthrough: { description?: string; acceptanceCriteria?: string } = {};
    if (template.description) {
      passthrough.description = template.description;
    }
    if (template.acceptanceCriteria) {
      passthrough.acceptanceCriteria = template.acceptanceCriteria;
    }
    return passthrough;
  }

  const requirementLine = `Project requirement context: ${requirementSummary}`;

  return {
    description: template.description
      ? `${template.description}\n\n${requirementLine}`
      : requirementLine,
    acceptanceCriteria: template.acceptanceCriteria
      ? `${template.acceptanceCriteria}\n- Supports requirement context`
      : "Supports requirement context"
  };
}

/**
 * Link a child story to parent (Epic/Feature)
 */
async function linkToParent(
  projectId: string,
  childId: number,
  parentId: number,
  dryRun: boolean = false
): Promise<{success: boolean; error?: string}> {
  if (dryRun) {
    return { success: true };
  }

  try {
    const result = await azureDevOpsMcpClient.callTool("link-work-items", {
      project: projectId,
      sourceId: parentId,
      targetId: childId,
      linkType: "System.LinkTypes.Hierarchy-Forward"
    });

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn(`Failed to link item ${childId} to parent ${parentId}: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

/**
 * Record created story artifact in Neon for audit trail
 */
async function recordStoryArtifact(
  seedRunId: number,
  workItemId: number,
  title: string,
  workItemType: string,
  parentWorkItemId?: number
): Promise<void> {
  if (seedRunId <= 0) {
    return;
  }

  try {
    await neonMcpClient.query(
      `INSERT INTO sprint_seed_artifacts 
       (seed_run_id, artifact_type, work_item_id, work_item_title, work_item_type, parent_work_item_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        seedRunId,
        "story",
        workItemId,
        title,
        workItemType,
        parentWorkItemId || null
      ]
    );
  } catch (error) {
    console.warn(`Failed to record story artifact: ${error}`);
  }
}

/**
 * Main story seeding function
 * Called by orchestration command to seed default stories for a new sprint
 */
export async function seedSprintStories(
  config: StorySeederConfig,
  seedRunId?: number
): Promise<StorySeederResult> {
  // Enforce postgres mode
  requirePostgresMode();
  requireNeonMcpConfigured();

  const result: StorySeederResult = {
    success: true,
    storiesCreated: 0,
    storiesSkipped: 0,
    errors: [],
    createdWorkItems: [],
    summary: {}
  };

  try {
    // Load configuration async (required for postgres mode)
    await loadConfigurationAsync();

    console.log(`[Story Seeding] Project: ${config.projectId}, Sprint: ${config.sprintId}`);
    console.log(`[Story Seeding] Iteration Path: ${config.iterationPath}`);
    if (config.parentFeatureId) {
      console.log(`[Story Seeding] Parent Feature ID: ${config.parentFeatureId} (stories will be linked to Feature)`);
    } else {
      console.log(`[Story Seeding] No parent Feature ID provided (stories will be top-level)`);
    }
    console.log(`[Story Seeding] Dry run: ${config.dryRun ? 'yes' : 'no'}`);

    // Load templates
    const templates = await loadStoryTemplates(config.projectId, config.teamId);
    
    if (templates.length === 0) {
      console.warn(`[Story Seeding] No story templates found for project ${config.projectId}, team ${config.teamId}`);
      result.success = false;
      result.errors.push(`No story templates found`);
      return result;
    }

    console.log(`[Story Seeding] Found ${templates.length} templates`);

    // Track created items for hierarchy linking
    const createdItemsByTemplateId: Map<number, number> = new Map();

    // Process templates in order
    for (const template of templates) {
      // Check idempotency - if story already exists, skip
      const exists = await storyExists(config.iterationPath, template.title);
      if (exists) {
        result.storiesSkipped++;
        console.log(`[Story Seeding] Skipping "${template.title}" - already exists`);
        continue;
      }

      // Create the story
      const enriched = enrichTemplateWithRequirement(
        template,
        config.requirementContext?.summary
      );

      const createResult = await createStory(
        config.projectId,
        template.title,
        template.workItemType,
        config.iterationPath,
        enriched.description,
        enriched.acceptanceCriteria,
        template.estimatedHours,
        undefined, // assignedTo
        config.parentFeatureId ? Number(config.parentFeatureId) : undefined, // parentId (Feature)
        config.dryRun
      );

      if (!createResult.success) {
        result.success = false;
        result.errors.push(`Failed to create "${template.title}": ${createResult.error}`);
        console.error(`[Story Seeding] ✗ Failed to create "${template.title}": ${createResult.error}`);
        continue;
      }

      const itemId = createResult.id!;
      result.storiesCreated++;
      result.createdWorkItems.push({
        title: template.title,
        id: itemId,
        type: template.workItemType
      });

      const parentSuffix = config.parentFeatureId ? ` (child of Feature ${config.parentFeatureId})` : '';
      console.log(`[Story Seeding] ✓ Created "${template.title}" (ID ${itemId})${parentSuffix}`);

      // Store for potential parent linking
      createdItemsByTemplateId.set(template.id, itemId);

      // Record artifact
      await recordStoryArtifact(
        seedRunId || 0,
        itemId,
        template.title,
        template.workItemType
      );

      // If template has parent reference, link to it
      if (template.parentTemplateId && createdItemsByTemplateId.has(template.parentTemplateId)) {
        const parentId = createdItemsByTemplateId.get(template.parentTemplateId)!;
        const linkResult = await linkToParent(
          config.projectId,
          itemId,
          parentId,
          config.dryRun
        );

        if (linkResult.success) {
          console.log(`[Story Seeding] ✓ Linked "${template.title}" to parent (ID ${parentId})`);
        }
      }
    }

    // Ensure we always have parent IDs (even when parent stories already existed).
    const meetingsParentId = createdItemsByTemplateId.get(
      templates.find((t) => t.title === "Meetings")?.id || -1
    ) || await findStoryIdByTitle(config.projectId, config.iterationPath, "Meetings");

    const unplannedParentId = createdItemsByTemplateId.get(
      templates.find((t) => t.title === "UnPlanned")?.id || -1
    ) || await findStoryIdByTitle(config.projectId, config.iterationPath, "UnPlanned");

    await createMemberNamedTasks(
      config,
      seedRunId || 0,
      result,
      meetingsParentId,
      unplannedParentId,
      config.dryRun
    );

    result.summary = {
      totalTemplates: templates.length,
      created: result.storiesCreated,
      skipped: result.storiesSkipped,
      errors: result.errors.length,
      requirementSource: config.requirementContext?.source || "none"
    };

    console.log(`[Story Seeding] Complete: ${result.storiesCreated} created, ${result.storiesSkipped} skipped`);

  } catch (error) {
    result.success = false;
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(errorMsg);
    console.error(`[Story Seeding] Fatal error: ${errorMsg}`);
  }

  return result;
}
