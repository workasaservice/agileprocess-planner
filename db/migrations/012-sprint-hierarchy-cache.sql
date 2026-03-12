-- Migration: Add sprint hierarchy cache table
-- Purpose: Cache Epic/Feature work items for sprint automation to avoid duplicates
-- Hierarchy: Epic (per project) → Feature (per sprint) → User Story → Task

CREATE TABLE IF NOT EXISTS sprint_hierarchy_cache (
  id SERIAL PRIMARY KEY,
  project_id VARCHAR(255) NOT NULL,
  work_item_id INTEGER NOT NULL,
  work_item_type VARCHAR(50) NOT NULL CHECK (work_item_type IN ('Epic', 'Feature')),
  work_item_title VARCHAR(500) NOT NULL,
  parent_work_item_id INTEGER,
  sprint_name VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, work_item_id)
);

CREATE INDEX IF NOT EXISTS idx_hierarchy_cache_project_type
  ON sprint_hierarchy_cache(project_id, work_item_type, is_active);

CREATE INDEX IF NOT EXISTS idx_hierarchy_cache_sprint
  ON sprint_hierarchy_cache(project_id, sprint_name, is_active)
  WHERE sprint_name IS NOT NULL;

COMMENT ON TABLE sprint_hierarchy_cache IS 'Caches Epic/Feature work items created by sprint automation to enable reuse and prevent duplicates';
COMMENT ON COLUMN sprint_hierarchy_cache.work_item_type IS 'Epic (one per project) or Feature (one per sprint)';
COMMENT ON COLUMN sprint_hierarchy_cache.parent_work_item_id IS 'Parent work item ID (Feature points to Epic)';
COMMENT ON COLUMN sprint_hierarchy_cache.is_active IS 'Set to false when work item is deleted or archived';
