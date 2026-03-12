import dotenv from "dotenv";
import { neonMcpClient } from "../src/clients/neonMcpClient";

dotenv.config();

const TARGET_PROJECTS = ["MotherOps-Alpha", "MotherOps-Beta"];

async function runSql(sql: string, params: any[] = []) {
  return neonMcpClient.callTool("run_sql", { sql, params });
}

async function syncHierarchyTemplatesToNeon() {
  console.log("Syncing hierarchical sprint templates to Neon...");

  // 1) Deactivate old flat templates so automation no longer uses them.
  await runSql(
    `UPDATE sprint_story_templates
     SET is_active = false,
         updated_at = NOW()
    WHERE project_id IN ($1, $2)
       AND template_name IN (
         'daily-standup',
         'sprint-planning',
         'sprint-review',
         'sprint-retro',
         'dummy-weekly-placeholder'
       )`,
    TARGET_PROJECTS
  );

  // 2) Remove previous hierarchy templates for idempotent re-seed.
  await runSql(
    `DELETE FROM sprint_story_templates
    WHERE project_id IN ($1, $2)
       AND template_name IN (
         'meetings-parent',
         'unplanned-parent',
         'meetings-sprint-planning',
         'meetings-daily-standup',
         'meetings-backlog-refinement',
         'meetings-sprint-review',
         'meetings-sprint-retrospective',
         'unplanned-buffer-capacity',
         'unplanned-bug-fixes',
         'unplanned-production-support'
       )`,
    TARGET_PROJECTS
  );

  // 3) Insert parent templates.
  await runSql(
    `INSERT INTO sprint_story_templates (
       project_id, team_id, template_name, work_item_type, title, description,
       acceptance_criteria, parent_template_id, estimated_hours, story_order, is_active
     )
     SELECT
       p.project_id,
       p.team_name,
       'meetings-parent',
       'User Story',
       'Meetings',
       'Parent story for sprint ceremonies.',
       'All ceremony tasks are linked as children under Meetings.',
      NULL::INT,
       0,
       10,
       true
     FROM config_projects p
    WHERE p.project_id IN ($1, $2)

     UNION ALL

     SELECT
       p.project_id,
       p.team_name,
       'unplanned-parent',
       'User Story',
       'UnPlanned',
       'Parent story for contingency and unplanned work.',
       'All contingency tasks are linked as children under UnPlanned.',
      NULL::INT,
       0,
       20,
       true
     FROM config_projects p
     WHERE p.project_id IN ($1, $2)`,
    TARGET_PROJECTS
  );

  // 4) Insert Meetings children linked to meetings-parent.
  await runSql(
    `INSERT INTO sprint_story_templates (
       project_id, team_id, template_name, work_item_type, title, description,
       acceptance_criteria, parent_template_id, estimated_hours, story_order, is_active
     )
     SELECT
       m.project_id,
       m.team_id,
       child.template_name,
       'Task',
       child.title,
       child.description,
       child.acceptance_criteria,
       m.id,
       child.estimated_hours,
       child.story_order,
       true
     FROM sprint_story_templates m
     CROSS JOIN (
       VALUES
         ('meetings-sprint-planning', 'Sprint Planning', 'Plan sprint scope and commitments.', 'Sprint planning completed with agreed sprint goal.', 2.0, 11),
         ('meetings-daily-standup', 'Daily Standup', 'Run daily team sync.', 'Daily standup notes captured and blockers tracked.', 0.5, 12),
         ('meetings-backlog-refinement', 'Backlog Refinement', 'Refine upcoming work.', 'Backlog items refined and estimated for upcoming sprint.', 1.0, 13),
         ('meetings-sprint-review', 'Sprint Review', 'Review and demo completed work.', 'Stakeholder feedback captured from sprint review.', 1.5, 14),
         ('meetings-sprint-retrospective', 'Sprint Retrospective', 'Inspect and improve process.', 'Retrospective action items recorded with owners.', 1.0, 15)
     ) AS child(template_name, title, description, acceptance_criteria, estimated_hours, story_order)
     WHERE m.project_id IN ($1, $2)
       AND m.template_name = 'meetings-parent'`,
    TARGET_PROJECTS
  );

  // 5) Insert UnPlanned children linked to unplanned-parent.
  await runSql(
    `INSERT INTO sprint_story_templates (
       project_id, team_id, template_name, work_item_type, title, description,
       acceptance_criteria, parent_template_id, estimated_hours, story_order, is_active
     )
     SELECT
       u.project_id,
       u.team_id,
       child.template_name,
       'Task',
       child.title,
       child.description,
       child.acceptance_criteria,
       u.id,
       child.estimated_hours,
       child.story_order,
       true
     FROM sprint_story_templates u
     CROSS JOIN (
       VALUES
         ('unplanned-buffer-capacity', 'Buffer Capacity', 'Track reserved buffer for unexpected work.', 'Buffer allocation is visible and tracked each sprint.', 1.0, 21),
         ('unplanned-bug-fixes', 'Bug Fixes', 'Handle unplanned defects.', 'Critical defects are triaged and resolved within agreed SLA.', 2.0, 22),
         ('unplanned-production-support', 'Production Support', 'Handle incidents and support work.', 'Production incidents are documented and closed.', 2.0, 23)
     ) AS child(template_name, title, description, acceptance_criteria, estimated_hours, story_order)
     WHERE u.project_id IN ($1, $2)
       AND u.template_name = 'unplanned-parent'`,
    TARGET_PROJECTS
  );

  // 6) Verification report.
  const verify: any = await runSql(
    `SELECT project_id, template_name, work_item_type, parent_template_id, is_active, story_order
     FROM sprint_story_templates
    WHERE project_id IN ($1, $2)
       AND (
         template_name LIKE 'meetings-%'
         OR template_name LIKE 'unplanned-%'
         OR template_name IN ('meetings-parent', 'unplanned-parent')
       )
     ORDER BY project_id, story_order, template_name`,
    TARGET_PROJECTS
  );

  const text = verify?.content?.[0]?.text || "[]";
  const parsed = JSON.parse(text);
  console.log(`Hierarchy templates synced. Rows: ${parsed.length}`);
}

syncHierarchyTemplatesToNeon().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
