-- Migration: 003-planning-schema.sql
-- Description: Planning persistence for backlog hierarchy, sprint allocations, audit, and multi-project summaries.
-- Date: 2026-03-06

-- Program increments are project-scoped in current config model.
CREATE TABLE IF NOT EXISTS program_increments (
  pi_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR(255) NOT NULL REFERENCES config_projects(project_id) ON DELETE CASCADE,
  pi_name VARCHAR(255) NOT NULL,
  pi_description TEXT,
  start_date DATE,
  end_date DATE,
  duration_sprints INTEGER CHECK (duration_sprints IS NULL OR duration_sprints > 0),
  capability_goal TEXT,
  success_criteria JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, pi_name)
);

CREATE TABLE IF NOT EXISTS backlog_hierarchy (
  hierarchy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR(255) NOT NULL REFERENCES config_projects(project_id) ON DELETE CASCADE,
  parent_external_id VARCHAR(64),
  child_external_id VARCHAR(64) NOT NULL,
  hierarchy_level VARCHAR(50) NOT NULL CHECK (hierarchy_level IN ('Epic', 'Feature', 'Story', 'Task')),
  parent_work_item_type VARCHAR(50),
  child_work_item_type VARCHAR(50),
  estimated_story_points INTEGER CHECK (estimated_story_points IS NULL OR estimated_story_points >= 0),
  estimated_effort_hours INTEGER CHECK (estimated_effort_hours IS NULL OR estimated_effort_hours >= 0),
  order_in_parent INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, parent_external_id, child_external_id)
);

CREATE TABLE IF NOT EXISTS sprint_allocations (
  allocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR(255) NOT NULL REFERENCES config_projects(project_id) ON DELETE CASCADE,
  sprint_config_iteration_id INTEGER NOT NULL REFERENCES config_project_iterations(id) ON DELETE CASCADE,
  work_item_external_id VARCHAR(64) NOT NULL,
  assigned_user_id VARCHAR(255) REFERENCES config_users(user_id) ON DELETE SET NULL,
  committed_story_points INTEGER CHECK (committed_story_points IS NULL OR committed_story_points >= 0),
  actual_story_points INTEGER CHECK (actual_story_points IS NULL OR actual_story_points >= 0),
  estimated_effort_hours INTEGER CHECK (estimated_effort_hours IS NULL OR estimated_effort_hours >= 0),
  actual_effort_hours INTEGER CHECK (actual_effort_hours IS NULL OR actual_effort_hours >= 0),
  allocation_status VARCHAR(50) NOT NULL DEFAULT 'allocated' CHECK (allocation_status IN ('allocated', 'in-progress', 'completed', 'removed', 'reassigned')),
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, sprint_config_iteration_id, work_item_external_id)
);

CREATE TABLE IF NOT EXISTS planning_audit (
  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id UUID,
  project_id VARCHAR(255) NOT NULL REFERENCES config_projects(project_id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('Epic', 'Feature', 'Story', 'Task', 'Sprint', 'Allocation', 'EffortSync', 'EffortFieldInit')),
  action VARCHAR(50) NOT NULL CHECK (action IN ('create', 'update', 'delete', 'allocate', 'reassign', 'remove', 'sync', 'init')),
  external_work_item_id VARCHAR(64),
  before_state JSONB,
  after_state JSONB,
  error_message TEXT,
  mcp_tool_name VARCHAR(100),
  mcp_tool_result JSONB,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id VARCHAR(255) REFERENCES config_users(user_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS effort_variance_alerts (
  alert_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR(255) NOT NULL REFERENCES config_projects(project_id) ON DELETE CASCADE,
  sprint_config_iteration_id INTEGER NOT NULL REFERENCES config_project_iterations(id) ON DELETE CASCADE,
  user_id VARCHAR(255) REFERENCES config_users(user_id) ON DELETE SET NULL,
  work_item_external_id VARCHAR(64),
  estimated_hours DECIMAL(10, 2),
  actual_hours DECIMAL(10, 2),
  variance_hours DECIMAL(10, 2),
  variance_percentage DECIMAL(6, 2),
  alert_level VARCHAR(20) NOT NULL CHECK (alert_level IN ('green', 'yellow', 'red')),
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS planning_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id UUID NOT NULL,
  project_id VARCHAR(255) NOT NULL REFERENCES config_projects(project_id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  event_status VARCHAR(50) NOT NULL DEFAULT 'success' CHECK (event_status IN ('success', 'partial', 'failed')),
  data JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id VARCHAR(255) REFERENCES config_users(user_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS organization_planning_summary (
  summary_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization VARCHAR(255) NOT NULL,
  pi_name VARCHAR(255),
  execution_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_projects_planned INTEGER,
  total_epics_created INTEGER,
  total_features_created INTEGER,
  total_stories_created INTEGER,
  total_tasks_created INTEGER,
  total_story_points INTEGER,
  total_sprints_created INTEGER,
  total_allocations INTEGER,
  execution_duration_seconds INTEGER,
  status VARCHAR(50) NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'in-progress', 'completed', 'partial', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_program_increments_updated_at ON program_increments;
CREATE TRIGGER trg_program_increments_updated_at
BEFORE UPDATE ON program_increments
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_backlog_hierarchy_updated_at ON backlog_hierarchy;
CREATE TRIGGER trg_backlog_hierarchy_updated_at
BEFORE UPDATE ON backlog_hierarchy
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_sprint_allocations_updated_at ON sprint_allocations;
CREATE TRIGGER trg_sprint_allocations_updated_at
BEFORE UPDATE ON sprint_allocations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_program_increments_project ON program_increments(project_id);
CREATE INDEX IF NOT EXISTS idx_program_increments_dates ON program_increments(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_backlog_hierarchy_project_level ON backlog_hierarchy(project_id, hierarchy_level);
CREATE INDEX IF NOT EXISTS idx_backlog_hierarchy_parent ON backlog_hierarchy(parent_external_id);
CREATE INDEX IF NOT EXISTS idx_backlog_hierarchy_child ON backlog_hierarchy(child_external_id);
CREATE INDEX IF NOT EXISTS idx_sprint_allocations_project_sprint ON sprint_allocations(project_id, sprint_config_iteration_id);
CREATE INDEX IF NOT EXISTS idx_sprint_allocations_user ON sprint_allocations(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_planning_audit_project_date ON planning_audit(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_planning_audit_correlation ON planning_audit(correlation_id);
CREATE INDEX IF NOT EXISTS idx_effort_variance_alerts_project ON effort_variance_alerts(project_id);
CREATE INDEX IF NOT EXISTS idx_effort_variance_alerts_level ON effort_variance_alerts(alert_level);
CREATE INDEX IF NOT EXISTS idx_planning_events_project ON planning_events(project_id);
CREATE INDEX IF NOT EXISTS idx_planning_events_correlation ON planning_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_org_planning_summary_org ON organization_planning_summary(organization);

COMMENT ON TABLE program_increments IS 'High-level planning context: goals, dates, capabilities for each project PI';
COMMENT ON TABLE backlog_hierarchy IS 'Hierarchical structure of work items from Epic down to Task level';
COMMENT ON TABLE sprint_allocations IS 'Sprint backlog allocation with planned vs actual effort values';
COMMENT ON TABLE planning_audit IS 'Detailed audit trail of planning and effort actions with MCP correlation';
COMMENT ON TABLE effort_variance_alerts IS 'Alerts for estimate vs actual effort variance thresholds';
COMMENT ON TABLE planning_events IS 'Immutable event log for orchestration and diagnostics';
COMMENT ON TABLE organization_planning_summary IS 'High-level metrics for multi-project planning runs';
