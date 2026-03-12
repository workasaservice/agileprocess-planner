import { neonMcpClient } from "../clients/neonMcpClient";
import { loadConfigurationAsync, requireNeonMcpConfigured, requirePostgresMode } from "../lib/configLoader";

export interface RequirementContext {
  summary: string;
  source: string;
}

export interface BootstrapSummary {
  membersAdded: number;
  capacityDefaultsAdded: number;
  storyTemplatesAdded: number;
  warnings: string[];
}

export interface SprintAutomationBootstrapResult {
  projectId: string;
  teamName: string;
  teamId: string;
  requirement: RequirementContext;
  bootstrap: BootstrapSummary;
}

interface ProjectContextRow extends Record<string, unknown> {
  projectId: string;
  projectName: string;
  teamId: string;
  teamName: string;
}

function asNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRequirement(summary: string): string {
  const compact = summary.replace(/\s+/g, " ").trim();
  if (compact.length <= 240) {
    return compact;
  }
  return `${compact.slice(0, 237)}...`;
}

async function loadProjectContext(projectId: string): Promise<ProjectContextRow> {
  const rows = await neonMcpClient.query<ProjectContextRow>(
    `SELECT
      project_id as "projectId",
      project_name as "projectName",
      team_id as "teamId",
      team_name as "teamName"
     FROM config_projects
     WHERE project_id = $1
     LIMIT 1`,
    [projectId]
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`Project not found in config_projects: ${projectId}`);
  }

  return rows[0]!;
}

async function resolveProjectRequirement(project: ProjectContextRow): Promise<RequirementContext> {
  try {
    const rows = await neonMcpClient.query<{ requirementText: string }>(
      `SELECT COALESCE(NULLIF(capability_goal, ''), NULLIF(pi_description, ''), NULLIF(pi_name, '')) as "requirementText"
       FROM program_increments
       WHERE project_id = $1
         AND COALESCE(NULLIF(capability_goal, ''), NULLIF(pi_description, ''), NULLIF(pi_name, '')) IS NOT NULL
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [project.projectId]
    );

    if (Array.isArray(rows) && rows[0]?.requirementText) {
      return {
        summary: normalizeRequirement(rows[0].requirementText),
        source: "program_increments"
      };
    }
  } catch {
    // program_increments may not exist in some deployments; fallback below.
  }

  return {
    summary: normalizeRequirement(
      `${project.projectName}: maintain predictable sprint execution with ceremony discipline and controlled unplanned work.`
    ),
    source: "fallback"
  };
}

async function bootstrapProjectMembers(project: ProjectContextRow, dryRun: boolean): Promise<number> {
  if (dryRun) {
    return 0;
  }

  const rows = await neonMcpClient.query<{ insertedCount: number }>(
    `WITH to_insert AS (
       SELECT DISTINCT $1::varchar as project_id, cu.user_id
       FROM config_users cu
       WHERE EXISTS (
         SELECT 1
         FROM jsonb_array_elements_text(COALESCE(cu.project_ids, '[]'::jsonb)) AS pid(value)
         WHERE pid.value = $1
       )
       AND NOT EXISTS (
         SELECT 1
         FROM config_project_members cpm
         WHERE cpm.project_id = $1
           AND cpm.user_id = cu.user_id
       )
     ), inserted AS (
       INSERT INTO config_project_members (project_id, user_id)
       SELECT project_id, user_id
       FROM to_insert
       ON CONFLICT (project_id, user_id) DO NOTHING
       RETURNING user_id
     )
     SELECT COUNT(*)::int as "insertedCount" FROM inserted`,
    [project.projectId]
  );

  return asNumber(rows?.[0]?.insertedCount);
}

async function bootstrapCapacityDefaults(project: ProjectContextRow, dryRun: boolean): Promise<number> {
  if (dryRun) {
    return 0;
  }

  const rows = await neonMcpClient.query<{ insertedCount: number }>(
    `WITH role_defaults AS (
       SELECT DISTINCT
         $1::varchar as project_id,
         $2::varchar as team_id,
         cu.role_id,
         CASE
           WHEN LOWER(cr.role_name) = 'product manager' THEN 40
           WHEN LOWER(cr.role_name) = 'tech lead' THEN 35
           WHEN LOWER(cr.role_name) = 'senior engineer' THEN 32
           WHEN LOWER(cr.role_name) = 'engineer' THEN 30
           WHEN LOWER(cr.role_name) = 'qa engineer' THEN 30
           ELSE 30
         END as productive_hours_per_sprint,
         CASE
           WHEN LOWER(cr.role_name) = 'product manager' THEN 8.0
           WHEN LOWER(cr.role_name) = 'tech lead' THEN 7.0
           WHEN LOWER(cr.role_name) = 'senior engineer' THEN 6.4
           WHEN LOWER(cr.role_name) = 'engineer' THEN 6.0
           WHEN LOWER(cr.role_name) = 'qa engineer' THEN 6.0
           ELSE 6.0
         END as capacity_per_day
       FROM config_project_members cpm
       JOIN config_users cu ON cpm.user_id = cu.user_id
       JOIN config_roles cr ON cu.role_id = cr.role_id
       WHERE cpm.project_id = $1
         AND cu.role_id IS NOT NULL
     ), inserted AS (
       INSERT INTO sprint_capacity_defaults (
         project_id,
         team_id,
         role_id,
         productive_hours_per_sprint,
         capacity_per_day,
         is_active
       )
       SELECT
         project_id,
         team_id,
         role_id,
         productive_hours_per_sprint,
         capacity_per_day,
         true
       FROM role_defaults
       ON CONFLICT (project_id, team_id, role_id) DO NOTHING
       RETURNING id
     )
     SELECT COUNT(*)::int as "insertedCount" FROM inserted`,
    [project.projectId, project.teamName]
  );

  return asNumber(rows?.[0]?.insertedCount);
}

async function bootstrapStoryTemplates(project: ProjectContextRow, dryRun: boolean): Promise<number> {
  if (dryRun) {
    return 0;
  }

  const rows = await neonMcpClient.query<{ insertedCount: number }>(
    `WITH templates AS (
       SELECT * FROM (
         VALUES
           ('meetings-parent', 'User Story', 'Meetings', 'Parent story for sprint ceremonies.', 'All ceremony tasks are linked as children under Meetings.', 10, NULL::varchar, 0.0),
           ('meetings-sprint-planning', 'Task', 'Sprint Planning', 'Plan sprint scope and commitments.', 'Sprint planning completed with agreed sprint goal.', 11, 'meetings-parent', 2.0),
           ('meetings-daily-standup', 'Task', 'Daily Standup', 'Run daily team sync.', 'Daily standup notes captured and blockers tracked.', 12, 'meetings-parent', 0.5),
           ('meetings-backlog-refinement', 'Task', 'Backlog Refinement', 'Refine upcoming work.', 'Backlog items refined and estimated for upcoming sprint.', 13, 'meetings-parent', 1.0),
           ('meetings-sprint-review', 'Task', 'Sprint Review', 'Review and demo completed work.', 'Stakeholder feedback captured from sprint review.', 14, 'meetings-parent', 1.5),
           ('meetings-sprint-retrospective', 'Task', 'Sprint Retrospective', 'Inspect and improve process.', 'Retrospective action items recorded with owners.', 15, 'meetings-parent', 1.0),
           ('unplanned-parent', 'User Story', 'UnPlanned', 'Parent story for contingency and unplanned work.', 'All contingency tasks are linked as children under UnPlanned.', 20, NULL::varchar, 0.0),
           ('unplanned-buffer-capacity', 'Task', 'Buffer Capacity', 'Track reserved buffer for unexpected work.', 'Buffer allocation is visible and tracked each sprint.', 21, 'unplanned-parent', 1.0),
           ('unplanned-bug-fixes', 'Task', 'Bug Fixes', 'Handle unplanned defects.', 'Critical defects are triaged and resolved within agreed SLA.', 22, 'unplanned-parent', 2.0),
           ('unplanned-production-support', 'Task', 'Production Support', 'Handle incidents and support work.', 'Production incidents are documented and closed.', 23, 'unplanned-parent', 2.0)
       ) AS t(template_name, work_item_type, title, description, acceptance_criteria, story_order, parent_template_name, estimated_hours)
     ), existing AS (
       SELECT template_name, id
       FROM sprint_story_templates
       WHERE project_id = $1
         AND team_id = $2
     ), prepared AS (
       SELECT
         $1::varchar as project_id,
         $2::varchar as team_id,
         t.template_name,
         t.work_item_type,
         t.title,
         t.description,
         t.acceptance_criteria,
         t.story_order,
         t.estimated_hours,
         p.id as parent_template_id
       FROM templates t
       LEFT JOIN existing p ON p.template_name = t.parent_template_name
       WHERE NOT EXISTS (
         SELECT 1
         FROM existing e
         WHERE e.template_name = t.template_name
       )
     ), inserted AS (
       INSERT INTO sprint_story_templates (
         project_id,
         team_id,
         template_name,
         work_item_type,
         title,
         description,
         acceptance_criteria,
         parent_template_id,
         estimated_hours,
         story_order,
         is_active
       )
       SELECT
         project_id,
         team_id,
         template_name,
         work_item_type,
         title,
         description,
         acceptance_criteria,
         parent_template_id,
         estimated_hours,
         story_order,
         true
       FROM prepared
       RETURNING id
     )
     SELECT COUNT(*)::int as "insertedCount" FROM inserted`,
    [project.projectId, project.teamName]
  );

  return asNumber(rows?.[0]?.insertedCount);
}

async function getMemberCount(projectId: string): Promise<number> {
  const rows = await neonMcpClient.query<{ count: number }>(
    `SELECT COUNT(*)::int as count
     FROM config_project_members
     WHERE project_id = $1`,
    [projectId]
  );
  return asNumber(rows?.[0]?.count);
}

async function getCapacityDefaultsCount(projectId: string, teamName: string): Promise<number> {
  const rows = await neonMcpClient.query<{ count: number }>(
    `SELECT COUNT(*)::int as count
     FROM sprint_capacity_defaults
     WHERE project_id = $1
       AND team_id = $2
       AND is_active = true`,
    [projectId, teamName]
  );
  return asNumber(rows?.[0]?.count);
}

async function getStoryTemplateCount(projectId: string, teamName: string): Promise<number> {
  const rows = await neonMcpClient.query<{ count: number }>(
    `SELECT COUNT(*)::int as count
     FROM sprint_story_templates
     WHERE project_id = $1
       AND team_id = $2
       AND is_active = true`,
    [projectId, teamName]
  );
  return asNumber(rows?.[0]?.count);
}

export async function ensureSprintAutomationPrerequisites(
  projectId: string,
  teamHint?: string,
  dryRun: boolean = false
): Promise<SprintAutomationBootstrapResult> {
  requirePostgresMode();
  requireNeonMcpConfigured();
  await loadConfigurationAsync();

  const project = await loadProjectContext(projectId);
  const effectiveTeamName = teamHint && teamHint.trim() ? teamHint : (project.teamName || project.teamId);

  const membersAdded = await bootstrapProjectMembers(project, dryRun);
  const capacityDefaultsAdded = await bootstrapCapacityDefaults(
    { ...project, teamName: effectiveTeamName },
    dryRun
  );
  const storyTemplatesAdded = await bootstrapStoryTemplates(
    { ...project, teamName: effectiveTeamName },
    dryRun
  );

  const [memberCount, defaultCount, templateCount] = await Promise.all([
    getMemberCount(project.projectId),
    getCapacityDefaultsCount(project.projectId, effectiveTeamName),
    getStoryTemplateCount(project.projectId, effectiveTeamName)
  ]);

  const warnings: string[] = [];
  if (memberCount === 0) {
    warnings.push("No project members found after bootstrap");
  }
  if (defaultCount === 0) {
    warnings.push("No active capacity defaults found after bootstrap");
  }
  if (templateCount === 0) {
    warnings.push("No active story templates found after bootstrap");
  }

  const requirement = await resolveProjectRequirement(project);

  return {
    projectId: project.projectId,
    teamName: effectiveTeamName,
    teamId: project.teamId,
    requirement,
    bootstrap: {
      membersAdded,
      capacityDefaultsAdded,
      storyTemplatesAdded,
      warnings
    }
  };
}
