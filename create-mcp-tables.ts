import * as dotenv from 'dotenv';
import { neonMcpClient } from './src/clients/neonMcpClient';

dotenv.config();

async function createSprintAutomationTables() {
  const tables = [
    // Table 1: sprint_capacity_defaults
    `CREATE TABLE IF NOT EXISTS sprint_capacity_defaults (
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
    )`,
    
    // Table 2: sprint_story_templates
    `CREATE TABLE IF NOT EXISTS sprint_story_templates (
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
    )`,
    
    // Table 3: sprint_seed_runs
    `CREATE TABLE IF NOT EXISTS sprint_seed_runs (
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
    )`,
    
    // Table 4: sprint_seed_artifacts
    `CREATE TABLE IF NOT EXISTS sprint_seed_artifacts (
      id SERIAL PRIMARY KEY,
      seed_run_id INT NOT NULL,
      artifact_type VARCHAR(100) NOT NULL,
      work_item_id INT,
      work_item_title VARCHAR(500),
      work_item_url TEXT,
      parent_work_item_id INT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (seed_run_id) REFERENCES sprint_seed_runs(id) ON DELETE CASCADE
    )`
  ];
  
  console.log('Creating sprint automation tables...\n');
  
  for (let i = 0; i < tables.length; i++) {
    try {
      console.log(`[${i+1}/${tables.length}] Creating table...`);
      await neonMcpClient.callTool('run_sql', { sql: tables[i] });
      console.log('✓ Success\n');
    } catch (e) {
      const error = e as Error;
      if (error.message.includes('already exists')) {
        console.log('⊙ Skipped (already exists)\n');
      } else {
        console.error(`✗ Error: ${error.message}\n`);
        throw error;
      }
    }
  }
  
  console.log('✓ All tables created successfully!');
}

createSprintAutomationTables().catch(e => {
  console.error('Failed:', (e as Error).message);
  process.exit(1);
});
