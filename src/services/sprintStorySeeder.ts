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
  try {
    const normalizedPath = sprintPath.replace(/^\\+/, "");

    // Query work items in sprint with matching title
    const result = await azureDevOpsMcpClient.callTool("list-work-items", {
      query: `SELECT [System.Id], [System.Title] 
              FROM workitems 
              WHERE [System.IterationPath] = '${normalizedPath}' 
              AND [System.Title] = '${title}'`
    });

    if (result && result.workItems && result.workItems.length > 0) {
      return true;
    }

    return false;
  } catch (error) {
    console.warn(`Failed to check if story exists: ${error}`);
    return false;
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
  parentId?: number,
  dryRun: boolean = false
): Promise<{success: boolean; id?: number; error?: string}> {
  if (dryRun) {
    return { success: true, id: -1 }; // Placeholder ID for dry run
  }

  try {
    const fields: Record<string, any> = {
      "System.Title": title,
      "System.IterationPath": iterationPath
    };

    if (description) {
      fields["System.Description"] = description;
    }

    if (estimatedHours) {
      fields["Microsoft.VSTS.Scheduling.StoryPoints"] = estimatedHours;
    }

    if (acceptanceCriteria) {
      fields["Microsoft.VSTS.Common.AcceptanceCriteria"] = acceptanceCriteria;
    }

    const result = await azureDevOpsMcpClient.callTool("create-work-item", {
      project: projectId,
      type: workItemType,
      title: title,
      fields: fields
    });

    if (result && result.id) {
      return { success: true, id: result.id };
    }

    return { success: false, error: "No ID returned from creation" };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMsg };
  }
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

    console.log(`[Story Seeding] Sprint: ${config.iterationPath}`);
    console.log(`[Story Seeding] Dry run: ${config.dryRun ? 'yes' : 'no'}`);

    // Load templates
    const templates = await loadStoryTemplates(config.projectId, config.teamId);
    
    if (templates.length === 0) {
      console.warn(`[Story Seeding] No story templates found for project ${config.projectId}, team ${config.teamId}`);
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
      const createResult = await createStory(
        config.projectId,
        template.title,
        template.workItemType,
        config.iterationPath,
        template.description,
        template.acceptanceCriteria,
        template.estimatedHours,
        undefined,
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

      console.log(`[Story Seeding] ✓ Created "${template.title}" (ID ${itemId})`);

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

    result.summary = {
      totalTemplates: templates.length,
      created: result.storiesCreated,
      skipped: result.storiesSkipped,
      errors: result.errors.length
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
