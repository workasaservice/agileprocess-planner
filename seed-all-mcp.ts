import * as dotenv from 'dotenv';
import { neonMcpClient } from './src/clients/neonMcpClient';

dotenv.config();

async function seedAll() {
  try {
    // Insert roles
    console.log('Inserting roles...');
    await neonMcpClient.callTool('run_sql', {
      sql: `INSERT INTO config_roles (role_id, role_name, description)
             VALUES 
               ('pm', 'Project Manager', 'Project Manager role'),
               ('tech-lead', 'Tech Lead', 'Technical Lead role'),
               ('senior-engineer', 'Senior Engineer', 'Senior Software Engineer role'),
               ('engineer', 'Engineer', 'Software Engineer role'),
               ('qa', 'QA Engineer', 'Quality Assurance Engineer role')
             ON CONFLICT (role_id) DO NOTHING`
    });
    console.log('✓ Roles inserted\n');
    
    // Insert capacity defaults
    console.log('Inserting capacity defaults...');
    await neonMcpClient.callTool('run_sql', {
      sql: `INSERT INTO sprint_capacity_defaults (project_id, team_id, role_id, productive_hours_per_sprint, capacity_per_day, is_active)
             VALUES 
               ('MotherOps-Alpha', 'Default', 'pm', 40, 8.0, true),
               ('MotherOps-Alpha', 'Default', 'tech-lead', 35, 7.0, true),
               ('MotherOps-Alpha', 'Default', 'senior-engineer', 32, 6.4, true),
               ('MotherOps-Alpha', 'Default', 'engineer', 30, 6.0, true),
               ('MotherOps-Alpha', 'Default', 'qa', 30, 6.0, true)
             ON CONFLICT (project_id, team_id, role_id) DO NOTHING`
    });
    console.log('✓ Capacity defaults inserted\n');
    
    // Insert story templates
    console.log('Inserting story templates...');
    await neonMcpClient.callTool('run_sql', {
      sql: `INSERT INTO sprint_story_templates (project_id, team_id, template_name, work_item_type, title, description, story_order, is_active)
             VALUES 
               ('MotherOps-Alpha', 'Default', 'daily-standup', 'User Story', 
                'Daily Team Standup', 'Conduct daily standup meetings to sync on progress and blockers', 1, true),
               ('MotherOps-Alpha', 'Default', 'sprint-planning', 'User Story',
                'Sprint Planning Session', 'Plan and estimate work for the sprint', 2, true),
               ('MotherOps-Alpha', 'Default', 'sprint-review', 'User Story',
                'Sprint Review/Demo', 'Demonstrate completed work to stakeholders', 3, true),
               ('MotherOps-Alpha', 'Default', 'sprint-retro', 'User Story',
                'Sprint Retrospective', 'Reflect on sprint and identify improvements', 4, true)`
    });
    console.log('✓ Story templates inserted\n');
    
    console.log('✓✓ All seed data inserted successfully!');
  } catch (e) {
    console.error('Failed:', (e as Error).message);
    process.exit(1);
  }
}

seedAll();
