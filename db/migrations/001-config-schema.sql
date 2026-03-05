/**
 * Database Schema Migration for Config Data
 * 
 * This migration sets up the database tables required for the configLoader
 * to read from Postgres when PERSISTENCE_MODE=postgres.
 * 
 * Run via: npm run cli migrate-db -- --file db/migrations/001-config-schema.sql
 */

-- Users table
CREATE TABLE IF NOT EXISTS config_users (
  user_id VARCHAR(255) PRIMARY KEY,
  display_name VARCHAR(255) NOT NULL,
  user_principal_name VARCHAR(255) NOT NULL UNIQUE,
  mail_nickname VARCHAR(255) NOT NULL,
  given_name VARCHAR(255),
  surname VARCHAR(255),
  job_title VARCHAR(255),
  department VARCHAR(255),
  usage_location VARCHAR(10),
  account_enabled BOOLEAN DEFAULT true,
  role_id VARCHAR(255) NOT NULL,
  project_ids JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Roles table
CREATE TABLE IF NOT EXISTS config_roles (
  role_id VARCHAR(255) PRIMARY KEY,
  role_name VARCHAR(255) NOT NULL UNIQUE,
  subtitle VARCHAR(255),
  description TEXT,
  default_focus_factor DECIMAL(3, 2),
  default_activity VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Capacity table
CREATE TABLE IF NOT EXISTS config_capacity (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  role_id VARCHAR(255) NOT NULL,
  focus_factor DECIMAL(3, 2) NOT NULL,
  productive_hours_per_sprint INT NOT NULL,
  total_capacity_hours INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES config_users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES config_roles(role_id) ON DELETE RESTRICT,
  UNIQUE(user_id, role_id)
);

-- Projects table
CREATE TABLE IF NOT EXISTS config_projects (
  project_id VARCHAR(255) PRIMARY KEY,
  project_name VARCHAR(255) NOT NULL,
  project_full_name VARCHAR(255) NOT NULL,
  organization VARCHAR(255) NOT NULL,
  team_id VARCHAR(255) NOT NULL,
  team_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Project members junction table
CREATE TABLE IF NOT EXISTS config_project_members (
  id SERIAL PRIMARY KEY,
  project_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES config_projects(project_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES config_users(user_id) ON DELETE CASCADE,
  UNIQUE(project_id, user_id)
);

-- Project iterations table
CREATE TABLE IF NOT EXISTS config_project_iterations (
  id SERIAL PRIMARY KEY,
  project_id VARCHAR(255) NOT NULL,
  sprint_name VARCHAR(255) NOT NULL,
  iteration_path VARCHAR(512) NOT NULL,
  iteration_id VARCHAR(255) NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  finish_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES config_projects(project_id) ON DELETE CASCADE
);

-- Credentials table
CREATE TABLE IF NOT EXISTS config_credentials (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL UNIQUE,
  user_principal_name VARCHAR(255) NOT NULL,
  password VARCHAR(512) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES config_users(user_id) ON DELETE CASCADE
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_config_users_role_id ON config_users(role_id);
CREATE INDEX IF NOT EXISTS idx_config_users_user_principal_name ON config_users(user_principal_name);
CREATE INDEX IF NOT EXISTS idx_config_capacity_user_id ON config_capacity(user_id);
CREATE INDEX IF NOT EXISTS idx_config_capacity_role_id ON config_capacity(role_id);
CREATE INDEX IF NOT EXISTS idx_config_project_members_project_id ON config_project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_config_project_members_user_id ON config_project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_config_project_iterations_project_id ON config_project_iterations(project_id);
CREATE INDEX IF NOT EXISTS idx_config_credentials_user_id ON config_credentials(user_id);
