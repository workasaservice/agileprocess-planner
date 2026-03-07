import dotenv from "dotenv";
import { neonMcpClient } from "../src/clients/neonMcpClient";

dotenv.config();

async function main() {
  const projects = [
    { projectId: 'MotherOps-Hawaii', projectName: 'Family Trip Hawaii 2026', projectFullName: 'MotherOps - Family Trip Hawaii 2026', organization: 'MotherOps', teamId: 'team-hawaii', teamName: 'Hawaii Team' },
    { projectId: 'MotherOps-Alpha', projectName: 'Product Alpha', projectFullName: 'MotherOps - Product Alpha', organization: 'MotherOps', teamId: 'team-alpha', teamName: 'Alpha Team' },
    { projectId: 'MotherOps-Beta', projectName: 'Product Beta', projectFullName: 'MotherOps - Product Beta', organization: 'MotherOps', teamId: 'team-beta', teamName: 'Beta Team' },
  ];

  for (const project of projects) {
    const sql = `
      INSERT INTO config_projects 
        (project_id, project_name, project_full_name, organization, team_id, team_name, created_at, updated_at)
      VALUES 
        ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      ON CONFLICT (project_id) DO NOTHING;
    `;

    await neonMcpClient.callTool('run_sql', {
      sql,
      params: [project.projectId, project.projectName, project.projectFullName, project.organization, project.teamId, project.teamName]
    });

    console.log(`Seeded project: ${project.projectId}`);
  }

  console.log('Config projects seed complete.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
