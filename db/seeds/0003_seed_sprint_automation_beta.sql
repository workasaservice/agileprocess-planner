-- Populate Sprint Automation Defaults for MotherOps-Beta
-- Mirrors the Alpha seed (0002_seed_sprint_automation.sql) for the Beta project

-- 1. CAPACITY DEFAULTS
-- Insert default capacity per role for MotherOps-Beta
INSERT INTO sprint_capacity_defaults 
  (project_id, team_id, role_id, productive_hours_per_sprint, capacity_per_day, is_active)
SELECT 
  p.project_id,
  p.team_id,
  r.role_id,
  CASE 
    WHEN r.role_name = 'Product Manager' THEN 40
    WHEN r.role_name = 'Tech Lead' THEN 35
    WHEN r.role_name = 'Senior Engineer' THEN 32
    WHEN r.role_name = 'Engineer' THEN 30
    WHEN r.role_name = 'QA Engineer' THEN 30
    ELSE 30
  END as productive_hours,
  CASE 
    WHEN r.role_name = 'Product Manager' THEN 8.0
    WHEN r.role_name = 'Tech Lead' THEN 7.0
    WHEN r.role_name = 'Senior Engineer' THEN 6.4
    WHEN r.role_name = 'Engineer' THEN 6.0
    WHEN r.role_name = 'QA Engineer' THEN 6.0
    ELSE 6.0
  END as capacity_per_day,
  true
FROM config_projects p
CROSS JOIN config_roles r
WHERE p.project_name = 'MotherOps-Beta'
  AND p.team_name ILIKE '%Beta%'
  AND r.role_name IN ('Product Manager', 'Tech Lead', 'Senior Engineer', 'Engineer', 'QA Engineer')
ON CONFLICT (project_id, team_id, role_id) DO UPDATE
SET 
  productive_hours_per_sprint = EXCLUDED.productive_hours_per_sprint,
  capacity_per_day = EXCLUDED.capacity_per_day,
  is_active = true,
  updated_at = NOW();

-- 2. STORY TEMPLATES
-- Insert default story templates for MotherOps-Beta

WITH project_data AS (
  SELECT p.project_id, p.team_id
  FROM config_projects p
  WHERE p.project_name = 'MotherOps-Beta' AND p.team_name ILIKE '%Beta%'
  LIMIT 1
)
INSERT INTO sprint_story_templates 
  (project_id, team_id, template_name, work_item_type, title, description, acceptance_criteria, estimated_hours, parent_template_id, story_order, is_active)
SELECT 
  pd.project_id,
  pd.team_id,
  'daily-standup',
  'User Story',
  'Daily Team Standup',
  'Conduct daily 15-minute team synchronization meeting',
  'Daily standup occurs at 9:00 AM with all team members present or async updates provided',
  2.0,
  NULL,
  0,
  true
FROM project_data pd
ON CONFLICT DO NOTHING;

WITH project_data AS (
  SELECT p.project_id, p.team_id
  FROM config_projects p
  WHERE p.project_name = 'MotherOps-Beta' AND p.team_name ILIKE '%Beta%'
  LIMIT 1
)
INSERT INTO sprint_story_templates 
  (project_id, team_id, template_name, work_item_type, title, description, acceptance_criteria, estimated_hours, parent_template_id, story_order, is_active)
SELECT 
  pd.project_id,
  pd.team_id,
  'sprint-planning',
  'User Story',
  'Sprint Planning Session',
  'Conduct sprint planning ceremony to define sprint goals and commitments',
  'Sprint planning completed with all stories estimated and assigned to team members',
  3.0,
  NULL,
  1,
  true
FROM project_data pd
ON CONFLICT DO NOTHING;

WITH project_data AS (
  SELECT p.project_id, p.team_id
  FROM config_projects p
  WHERE p.project_name = 'MotherOps-Beta' AND p.team_name ILIKE '%Beta%'
  LIMIT 1
)
INSERT INTO sprint_story_templates 
  (project_id, team_id, template_name, work_item_type, title, description, acceptance_criteria, estimated_hours, parent_template_id, story_order, is_active)
SELECT 
  pd.project_id,
  pd.team_id,
  'sprint-review',
  'User Story',
  'Sprint Review and Demo',
  'Review accomplished work and demonstrate completed features to stakeholders',
  'All sprint commitments reviewed; demo completed with stakeholder feedback captured',
  2.0,
  NULL,
  2,
  true
FROM project_data pd
ON CONFLICT DO NOTHING;

WITH project_data AS (
  SELECT p.project_id, p.team_id
  FROM config_projects p
  WHERE p.project_name = 'MotherOps-Beta' AND p.team_name ILIKE '%Beta%'
  LIMIT 1
)
INSERT INTO sprint_story_templates 
  (project_id, team_id, template_name, work_item_type, title, description, acceptance_criteria, estimated_hours, parent_template_id, story_order, is_active)
SELECT 
  pd.project_id,
  pd.team_id,
  'sprint-retro',
  'User Story',
  'Sprint Retrospective',
  'Conduct retrospective to identify improvements for next sprint',
  'Retrospective completed with action items identified and assigned owners',
  2.0,
  NULL,
  3,
  true
FROM project_data pd
ON CONFLICT DO NOTHING;

-- Verify data was inserted
SELECT 
  'CAPACITY_DEFAULTS' as type,
  COUNT(*) as count
FROM sprint_capacity_defaults
WHERE project_id IN (SELECT project_id FROM config_projects WHERE project_name = 'MotherOps-Beta')
UNION ALL
SELECT 
  'STORY_TEMPLATES',
  COUNT(*)
FROM sprint_story_templates
WHERE project_id IN (SELECT project_id FROM config_projects WHERE project_name = 'MotherOps-Beta');
