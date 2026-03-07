/**
 * Database Schema Migration for Sprint Automation
 * 
 * This migration sets up tables required for:
 * - Storing default team capacity per role (for auto-seeding on sprint creation)
 * - Storing sprint story templates per project/team (for auto-backlog creation)
 * - Recording automation runs for idempotency and observability
 * - Tracking creation artifacts (what was auto-created)
 * 
 * Run via: npm run cli migrate-db -- --file db/migrations/004-sprint-automation-schema.sql
 */

-- Table: sprint_capacity_defaults
-- Purpose: Store default team capacity per role per project
-- Used to auto-seed team capacity when new sprints are created
CREATE TABLE IF NOT EXISTS sprint_capacity_defaults (
  id SERIAL PRIMARY KEY,
  project_id VARCHAR(255) NOT NULL,
  team_id VARCHAR(255) NOT NULL,
  role_id VARCHAR(255) NOT NULL,
  productive_hours_per_sprint INT NOT NULL,
  capacity_per_day DECIMAL(5, 2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (project_id) REFERENCES config_projects(project_id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES config_roles(role_id) ON DELETE RESTRICT,
  UNIQUE(project_id, team_id, role_id)
);

CREATE INDEX idx_capacity_defaults_project ON sprint_capacity_defaults(project_id);
CREATE INDEX idx_capacity_defaults_team ON sprint_capacity_defaults(team_id);
CREATE INDEX idx_capacity_defaults_active ON sprint_capacity_defaults(is_active);

-- Table: sprint_story_templates
-- Purpose: Store default user stories/epics/features to create for each sprint
-- Supports story hierarchy (Epic -> Feature -> Story -> Task)
-- Used to auto-seed backlog when new sprints are created
CREATE TABLE IF NOT EXISTS sprint_story_templates (
  id SERIAL PRIMARY KEY,
  project_id VARCHAR(255) NOT NULL,
  team_id VARCHAR(255) NOT NULL,
  template_name VARCHAR(255) NOT NULL,
  work_item_type VARCHAR(100) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  acceptance_criteria TEXT,
  parent_template_id INT,
  parent_field_reference VARCHAR(255),
  estimated_hours DECIMAL(10, 2),
  story_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (project_id) REFERENCES config_projects(project_id) ON DELETE CASCADE,
  FOREIGN KEY (parent_template_id) REFERENCES sprint_story_templates(id) ON DELETE SET NULL
);

CREATE INDEX idx_story_templates_project ON sprint_story_templates(project_id);
CREATE INDEX idx_story_templates_team ON sprint_story_templates(team_id);
CREATE INDEX idx_story_templates_active ON sprint_story_templates(is_active);
CREATE INDEX idx_story_templates_type ON sprint_story_templates(work_item_type);
CREATE INDEX idx_story_templates_parent ON sprint_story_templates(parent_template_id);
CREATE INDEX idx_story_templates_order ON sprint_story_templates(template_name, story_order);

-- Table: sprint_seed_runs
-- Purpose: Record automation run events for idempotency and observability
-- One row per sprint creation with automated seeding
CREATE TABLE IF NOT EXISTS sprint_seed_runs (
  id SERIAL PRIMARY KEY,
  correlation_id VARCHAR(255) NOT NULL UNIQUE,
  project_id VARCHAR(255) NOT NULL,
  team_id VARCHAR(255) NOT NULL,
  sprint_id VARCHAR(255) NOT NULL,
  iteration_path VARCHAR(512) NOT NULL,
  run_type VARCHAR(50) NOT NULL DEFAULT 'create',
  run_status VARCHAR(50) NOT NULL DEFAULT 'started',
  capacity_seeded BOOLEAN DEFAULT false,
  stories_seeded BOOLEAN DEFAULT false,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (project_id) REFERENCES config_projects(project_id) ON DELETE CASCADE
);

CREATE INDEX idx_seed_runs_correlation ON sprint_seed_runs(correlation_id);
CREATE INDEX idx_seed_runs_project_sprint ON sprint_seed_runs(project_id, sprint_id);
CREATE INDEX idx_seed_runs_status ON sprint_seed_runs(run_status);
CREATE INDEX idx_seed_runs_completed ON sprint_seed_runs(completed_at DESC);

-- Table: sprint_seed_artifacts
-- Purpose: Track work items created by automation (for audit trail and potential cleanup)
CREATE TABLE IF NOT EXISTS sprint_seed_artifacts (
  id SERIAL PRIMARY KEY,
  seed_run_id INT NOT NULL,
  artifact_type VARCHAR(100) NOT NULL,
  work_item_id INT,
  work_item_title VARCHAR(500),
  work_item_type VARCHAR(100),
  external_id VARCHAR(255),
  parent_artifact_id INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (seed_run_id) REFERENCES sprint_seed_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_artifact_id) REFERENCES sprint_seed_artifacts(id) ON DELETE SET NULL
);

CREATE INDEX idx_artifacts_seed_run ON sprint_seed_artifacts(seed_run_id);
CREATE INDEX idx_artifacts_work_item ON sprint_seed_artifacts(work_item_id);
CREATE INDEX idx_artifacts_type ON sprint_seed_artifacts(artifact_type);
CREATE INDEX idx_artifacts_parent ON sprint_seed_artifacts(parent_artifact_id);

-- Helper function to compute capacity per day from productive hours and working days
-- Formula: productive_hours_per_sprint / working_days
-- Assumes 5-day work week (working_days = 5 for 2-week sprint, 10 for 4-week sprint, etc.)
CREATE OR REPLACE FUNCTION compute_capacity_per_day(
  productive_hours INT,
  sprint_start_date DATE,
  sprint_end_date DATE
) RETURNS DECIMAL(5, 2) AS $$
DECLARE
  working_days INT;
  capacity_value DECIMAL(5, 2);
BEGIN
  -- Calculate working days (Mon-Fri only)
  -- Simple approximation: (end_date - start_date + 1) * 5/7
  working_days := GREATEST(1, FLOOR((sprint_end_date - sprint_start_date + 1) * 5.0 / 7.0)::INT);
  
  capacity_value := ROUND(CAST(productive_hours AS DECIMAL) / working_days, 2);
  RETURN capacity_value;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Sample seed data for testing
-- Uncomment and adjust to match your projects and roles
/*
INSERT INTO sprint_capacity_defaults (project_id, team_id, role_id, productive_hours_per_sprint, capacity_per_day, is_active)
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
WHERE p.project_name LIKE 'MotherOps%'
  AND r.role_name IN ('Product Manager', 'Tech Lead', 'Senior Engineer', 'Engineer', 'QA Engineer')
ON CONFLICT (project_id, team_id, role_id) DO UPDATE
SET capacity_per_day = EXCLUDED.capacity_per_day,
    updated_at = NOW();
*/
