/**
 * Sprint Hierarchy Service
 * 
 * Manages Epic → Feature work item hierarchy for sprint automation.
 * Ensures all sprint work items (stories, tasks) are properly parented in Azure DevOps.
 * 
 * Hierarchy design:
 * - Epic: One per project (e.g., "Sprint Backlog - MotherOps Alpha")
 * - Feature: One per sprint (e.g., "TestSprint 05")
 * - User Story: Multiple per sprint (seeded from templates)
 * - Task: Multiple per story (ceremony tasks, unplanned tasks, etc.)
 */

import { azureDevOpsMcpClient } from "../clients/azureDevOpsMcpClient";
import { neonMcpClient } from "../clients/neonMcpClient";

export interface HierarchyConfig {
  projectId: string;
  projectName: string;
  sprintName: string;
  sprintIterationPath: string;
  dryRun?: boolean;
}

export interface HierarchyResult {
  epicId: number | string;
  featureId: number | string;
  epicTitle: string;
  featureTitle: string;
}

/**
 * Get or create Epic for project
 * Epic is reused across all sprints in the project
 */
async function ensureProjectEpic(
  projectId: string,
  projectName: string,
  dryRun: boolean = false
): Promise<{ id: number | string; title: string }> {
  const epicTitle = `Sprint Backlog - ${projectName}`;
  
  // Check if Epic already exists in Neon metadata
  const existing = await neonMcpClient.query<any>(
    `SELECT work_item_id as "workItemId", work_item_title as "workItemTitle"
     FROM sprint_hierarchy_cache
     WHERE project_id = $1 AND work_item_type = 'Epic' AND is_active = true
     ORDER BY created_at DESC
     LIMIT 1`,
    [projectId]
  );

  if (Array.isArray(existing) && existing.length > 0) {
    console.log(`[Hierarchy] Using existing Epic: ${existing[0].workItemTitle} (ID: ${existing[0].workItemId})`);
    return {
      id: existing[0].workItemId,
      title: existing[0].workItemTitle
    };
  }

  // Create new Epic
  console.log(`[Hierarchy] Creating Epic: "${epicTitle}" for ${projectName}`);
  
  if (dryRun) {
    return { id: `epic-${projectId}-dryrun`, title: epicTitle };
  }

  const response = await azureDevOpsMcpClient.callTool("create-work-item", {
    type: "Epic",
    title: epicTitle,
    description: `Parent epic for all sprint backlog items in ${projectName}. This epic contains features for each sprint iteration.`,
    tags: "sprint-automation; backlog; epic",
    project: projectName
  });

  const workItem = response as any;
  const epicId = workItem.id;

  // Cache Epic in Neon
  await neonMcpClient.query(
    `INSERT INTO sprint_hierarchy_cache
     (project_id, work_item_id, work_item_type, work_item_title, is_active, created_at)
     VALUES ($1, $2, 'Epic', $3, true, NOW())
     ON CONFLICT (project_id, work_item_id) DO UPDATE
     SET is_active = true, updated_at = NOW()`,
    [projectId, epicId, epicTitle]
  );

  console.log(`[Hierarchy] ✓ Epic created: ID ${epicId}`);
  return { id: epicId, title: epicTitle };
}

/**
 * Create Feature for sprint (child of Epic)
 */
async function createSprintFeature(
  projectId: string,
  projectName: string,
  sprintName: string,
  epicId: number | string,
  iterationPath: string,
  dryRun: boolean = false
): Promise<{ id: number | string; title: string }> {
  const featureTitle = sprintName;
  
  console.log(`[Hierarchy] Creating Feature: "${featureTitle}" under Epic ${epicId}`);
  
  if (dryRun) {
    return { id: `feature-${sprintName}-dryrun`, title: featureTitle };
  }

  // Clean iteration path
  let cleanPath = iterationPath.replace(/^\\+/, '');
  cleanPath = cleanPath.replace(/\\Iteration\\/, '\\');

  const response = await azureDevOpsMcpClient.callTool("create-work-item", {
    type: "Feature",
    title: featureTitle,
    description: `Feature for ${sprintName}. All user stories and tasks for this sprint are children of this feature.`,
    tags: "sprint-automation; feature",
    parent: String(epicId),
    iterationPath: cleanPath,
    project: projectName
  });

  const workItem = response as any;
  const featureId = workItem.id;

  // Cache Feature in Neon
  await neonMcpClient.query(
    `INSERT INTO sprint_hierarchy_cache
     (project_id, work_item_id, work_item_type, work_item_title, parent_work_item_id, sprint_name, is_active, created_at)
     VALUES ($1, $2, 'Feature', $3, $4, $5, true, NOW())
     ON CONFLICT (project_id, work_item_id) DO UPDATE
     SET is_active = true, updated_at = NOW()`,
    [projectId, featureId, featureTitle, epicId, sprintName]
  );

  console.log(`[Hierarchy] ✓ Feature created: ID ${featureId}`);
  return { id: featureId, title: featureTitle };
}

/**
 * Main entry point: ensure Epic → Feature hierarchy exists for sprint
 */
export async function ensureSprintHierarchy(config: HierarchyConfig): Promise<HierarchyResult> {
  console.log(`\n[Hierarchy] Ensuring Epic → Feature hierarchy for ${config.sprintName} in ${config.projectName}`);
  
  // Step 1: Get or create Epic for project
  const epic = await ensureProjectEpic(config.projectId, config.projectName, config.dryRun);
  
  // Step 2: Create Feature for sprint
  const feature = await createSprintFeature(
    config.projectId,
    config.projectName,
    config.sprintName,
    epic.id,
    config.sprintIterationPath,
    config.dryRun
  );

  console.log(`[Hierarchy] ✓ Hierarchy complete: Epic ${epic.id} → Feature ${feature.id}`);

  return {
    epicId: epic.id,
    featureId: feature.id,
    epicTitle: epic.title,
    featureTitle: feature.title
  };
}

/**
 * Get Feature ID for a sprint (for linking user stories)
 */
export async function getSprintFeatureId(
  projectId: string,
  sprintName: string
): Promise<number | null> {
  const result = await neonMcpClient.query<any>(
    `SELECT work_item_id as "workItemId"
     FROM sprint_hierarchy_cache
     WHERE project_id = $1
       AND sprint_name = $2
       AND work_item_type = 'Feature'
       AND is_active = true
     ORDER BY created_at DESC
     LIMIT 1`,
    [projectId, sprintName]
  );

  if (Array.isArray(result) && result.length > 0) {
    return Number(result[0].workItemId);
  }

  return null;
}
