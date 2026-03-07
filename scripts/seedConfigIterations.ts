import dotenv from "dotenv";
import { neonMcpClient } from "../src/clients/neonMcpClient";

dotenv.config();

type ProjectSeed = {
  projectId: string;
  projectName: string;
  sprintCount: number;
};

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0] || "";
}

async function main() {
  const projects: ProjectSeed[] = [
    { projectId: "MotherOps-Hawaii", projectName: "MotherOps-Hawaii", sprintCount: 6 },
    { projectId: "MotherOps-Alpha", projectName: "MotherOps-Alpha", sprintCount: 6 },
    { projectId: "MotherOps-Beta", projectName: "MotherOps-Beta", sprintCount: 6 },
  ];

  const startBase = new Date("2026-03-01T00:00:00Z");

  for (const project of projects) {
    for (let i = 1; i <= project.sprintCount; i++) {
      const start = new Date(startBase.getTime());
      start.setUTCDate(start.getUTCDate() + (i - 1) * 14);
      const finish = new Date(start.getTime());
      finish.setUTCDate(finish.getUTCDate() + 13);

      const sprintName = `Sprint ${i}`;
      const iterationPath = `${project.projectName}\\${sprintName}`;
      const iterationId = `${project.projectId.toLowerCase()}-sprint-${i}`;

      const sql = `
        INSERT INTO config_project_iterations
          (project_id, sprint_name, iteration_path, iteration_id, start_date, finish_date, created_at, updated_at)
        VALUES
          ($1, $2, $3, $4, $5::date, $6::date, NOW(), NOW())
        ON CONFLICT (iteration_id) DO NOTHING;
      `;

      await neonMcpClient.callTool("run_sql", {
        sql,
        params: [
          project.projectId,
          sprintName,
          iterationPath,
          iterationId,
          isoDate(start),
          isoDate(finish),
        ],
      });
    }

    console.log(`Seeded iterations for ${project.projectId}`);
  }

  console.log("Config project iterations seed complete.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
