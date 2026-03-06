-- Migration: 002-effort-tracking-schema.sql
-- Description: Add tables for effort tracking configuration and history
-- Date: 2026-03-05

-- Table: effort_tracking_config
-- Purpose: Store process template field configurations
CREATE TABLE IF NOT EXISTS effort_tracking_config (
  config_id SERIAL PRIMARY KEY,
  process_id VARCHAR(255) NOT NULL,
  work_item_type VARCHAR(100) NOT NULL DEFAULT 'Task',
  field_name VARCHAR(255) NOT NULL,
  field_display_name VARCHAR(255) NOT NULL,
  field_type VARCHAR(50) NOT NULL DEFAULT 'Decimal',
  default_value DECIMAL(10, 2),
  is_required BOOLEAN DEFAULT FALSE,
  layout_group VARCHAR(100),
  layout_order INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(process_id, work_item_type, field_name)
);

CREATE INDEX idx_effort_config_process ON effort_tracking_config(process_id);
CREATE INDEX idx_effort_config_work_item_type ON effort_tracking_config(work_item_type);

-- Table: effort_tracking_history
-- Purpose: Historical effort data for analytics and burndown
CREATE TABLE IF NOT EXISTS effort_tracking_history (
  history_id SERIAL PRIMARY KEY,
  work_item_id INT NOT NULL,
  user_id VARCHAR(255),
  project_id VARCHAR(255),
  sprint_id VARCHAR(255),
  iteration_path VARCHAR(500),
  work_item_title VARCHAR(500),
  work_item_state VARCHAR(100),
  original_estimate DECIMAL(10, 2),
  remaining_work DECIMAL(10, 2),
  completed_work DECIMAL(10, 2),
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  change_reason VARCHAR(255),
  changed_by VARCHAR(255),
  UNIQUE(work_item_id, recorded_at)
);

CREATE INDEX idx_effort_history_work_item ON effort_tracking_history(work_item_id);
CREATE INDEX idx_effort_history_sprint ON effort_tracking_history(sprint_id);
CREATE INDEX idx_effort_history_user ON effort_tracking_history(user_id);
CREATE INDEX idx_effort_history_recorded ON effort_tracking_history(recorded_at DESC);
CREATE INDEX idx_effort_history_project_sprint ON effort_tracking_history(project_id, sprint_id);

-- Table: sprint_effort_summary
-- Purpose: Aggregated effort metrics per sprint
CREATE TABLE IF NOT EXISTS sprint_effort_summary (
  summary_id SERIAL PRIMARY KEY,
  project_id VARCHAR(255) NOT NULL,
  sprint_id VARCHAR(255) NOT NULL,
  iteration_path VARCHAR(500) NOT NULL,
  sprint_start_date DATE,
  sprint_end_date DATE,
  total_estimated_hours DECIMAL(10, 2) DEFAULT 0,
  total_remaining_hours DECIMAL(10, 2) DEFAULT 0,
  total_completed_hours DECIMAL(10, 2) DEFAULT 0,
  task_count INT DEFAULT 0,
  completed_task_count INT DEFAULT 0,
  team_capacity_hours DECIMAL(10, 2),
  capacity_utilization DECIMAL(5, 2),
  burndown_data JSONB,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, sprint_id)
);

CREATE INDEX idx_sprint_summary_project ON sprint_effort_summary(project_id);
CREATE INDEX idx_sprint_summary_sprint ON sprint_effort_summary(sprint_id);
CREATE INDEX idx_sprint_summary_dates ON sprint_effort_summary(sprint_start_date, sprint_end_date);

-- Table: estimation_accuracy
-- Purpose: Track estimation accuracy per user and team
CREATE TABLE IF NOT EXISTS estimation_accuracy (
  accuracy_id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  sprint_id VARCHAR(255),
  project_id VARCHAR(255),
  work_item_id INT,
  original_estimate DECIMAL(10, 2),
  actual_completed DECIMAL(10, 2),
  variance DECIMAL(10, 2),
  variance_percentage DECIMAL(5, 2),
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_accuracy_user ON estimation_accuracy(user_id);
CREATE INDEX idx_accuracy_sprint ON estimation_accuracy(sprint_id);
CREATE INDEX idx_accuracy_recorded ON estimation_accuracy(recorded_at DESC);

-- Add columns to existing config_project_iterations table
-- (Note: ALTER TABLE only if columns don't exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'config_project_iterations' 
                 AND column_name = 'total_estimated_hours') THEN
    ALTER TABLE config_project_iterations 
    ADD COLUMN total_estimated_hours DECIMAL(10, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'config_project_iterations' 
                 AND column_name = 'total_remaining_hours') THEN
    ALTER TABLE config_project_iterations 
    ADD COLUMN total_remaining_hours DECIMAL(10, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'config_project_iterations' 
                 AND column_name = 'total_completed_hours') THEN
    ALTER TABLE config_project_iterations 
    ADD COLUMN total_completed_hours DECIMAL(10, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'config_project_iterations' 
                 AND column_name = 'burndown_data') THEN
    ALTER TABLE config_project_iterations 
    ADD COLUMN burndown_data JSONB;
  END IF;
END$$;

-- Comments for documentation
COMMENT ON TABLE effort_tracking_config IS 'Process template field configurations for effort tracking';
COMMENT ON TABLE effort_tracking_history IS 'Historical effort data for all tasks, updated daily';
COMMENT ON TABLE sprint_effort_summary IS 'Aggregated effort metrics per sprint for reporting';
COMMENT ON TABLE estimation_accuracy IS 'Tracks estimation vs actual effort for continuous improvement';
