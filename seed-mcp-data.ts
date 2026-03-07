import * as dotenv from 'dotenv';
import { neonMcpClient } from './src/clients/neonMcpClient';

dotenv.config();

async function seedSprintAutomationData() {
  // First, get the project_id for MotherOps-Alpha
  const projectResult = await neonMcpClient.callTool('run_sql', {
    sql: "SELECT project_id FROM config_projects WHERE project_name LIKE 'Product Alpha' OR project_id = 'MotherOps-Alpha' LIMIT 1"
  });
  
  console.log('Project lookup:', JSON.stringify(projectResult, null, 2));
  
  const inserts = [
    // Capacity defaults for MotherOps-Alpha
    `INSERT INTO sprint_capacity_defaults (project_id, team_id, role_id, productive_hours_per_sprint, capacity_per_day, is_active)
     VALUES 
       ('MotherOps-Alpha', 'Default', 'pm', 40, 8.0, true),
       ('MotherOps-Alpha', 'Default', 'tech-lead', 35, 7.0, true),
       ('MotherOps-Alpha', 'Default', 'senior-engineer', 32, 6.4, true),
       ('MotherOps-Alpha', 'Default', 'engineer', 30, 6.0, true),
       ('MotherOps-Alpha', 'Default', 'qa', 30, 6.0, true)
     ON CONFLICT (project_id, team_id, role_id) DO NOTHING`,
    
    // Story templates for MotherOps-Alpha
    `INSERT INTO sprint_story_templates (project_id, team_id, template_name, work_item_type, title, description, story_order, is_active)
     VALUES 
       ('MotherOps-Alpha', 'Default', 'daily-standup', 'User Story', 
        'Daily Team Standup', 'Conduct daily standup meetings to sync on progress and blockers', 1, true),
       ('MotherOps-Alpha', 'Default', 'sprint-planning', 'User Story',
        'Sprint Planning Session', 'Plan and estimate work for the sprint', 2, true),
       ('MotherOps-Alpha', 'Default', 'sprint-review', 'User Story',
        'Sprint Review/Demo', 'Demonstrate completed work to stakeholders', 3, true),
       ('MotherOps-Alpha', 'Default', 'sprint-retro', 'User Story',
        'Sprint Retrospective', 'Reflect on  sprint and identify improvements', 4, true)`
  ];
  
  console.log('Seeding sprint automation data...\ n');
  
  for (let i = 0; i < inserts.length; i++) {
    try {
      console.log(`[${i+1}/${inserts.length}] Inserting...`);
      await neonMcpClient.callTool('run_sql', { sql: inserts[i] });
      console.log('✓ Success\n');
    } catch (e) {
      const error = e as Error;
      console.error(`✗ Error: ${error.message}\n`);
      throw error;
    }
  }
  
  console.log('✓ Seed data inserted successfully!');
}

seedSprintAutomationData().catch(e => {
  console.error('Failed:', (e as Error).message);
  process.exit(1);
});
