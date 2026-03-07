import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { neonMcpClient } from "../src/clients/neonMcpClient";

dotenv.config();

type ProjectId = "MotherOps-Alpha" | "MotherOps-Beta";

const TARGET_PROJECTS: ProjectId[] = ["MotherOps-Alpha", "MotherOps-Beta"];
const TEAM_FALLBACK = "Default";
const DEFAULT_ROLE_ID = "engineer";
const PLACEHOLDER_TEMPLATE = "dummy-weekly-placeholder";
const PLACEHOLDER_TITLE = "Dummy User Story Placeholder";
const PLACEHOLDER_DESCRIPTION = "Placeholder story automatically seeded for weekly sprint readiness.";
const START_MONDAY = "2026-03-09";
const WEEKS = 13;

type AssignmentFile = {
  project: ProjectId;
  assignments: Array<{
    userPrincipalName: string;
    teams?: string[];
  }>;
};

function mondaySchedule(startIso: string, weeks: number): Array<{ name: string; startDate: string; finishDate: string }> {
  const sprints: Array<{ name: string; startDate: string; finishDate: string }> = [];
  const start = new Date(`${startIso}T00:00:00Z`);

  for (let i = 0; i < weeks; i++) {
    const sprintStart = new Date(start.getTime());
    sprintStart.setUTCDate(start.getUTCDate() + i * 7);

    const sprintEnd = new Date(sprintStart.getTime());
    sprintEnd.setUTCDate(sprintStart.getUTCDate() + 6);

    const startDate = sprintStart.toISOString().slice(0, 10);
    const finishDate = sprintEnd.toISOString().slice(0, 10);

    sprints.push({
      name: `Weekly ${startDate}`,
      startDate,
      finishDate,
    });
  }

  return sprints;
}

async function runSql(sql: string, params: unknown[] = []): Promise<any> {
  return neonMcpClient.callTool("run_sql", { sql, params });
}

function toDisplayName(upn: string): string {
  const local = upn.split("@")[0] || upn;
  const parts = local.split(".").filter(Boolean);
  if (parts.length === 0) return upn;
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

function loadAssignments(fileName: string): AssignmentFile {
  const filePath = path.resolve(process.cwd(), fileName);
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as AssignmentFile;
}

async function ensureRoleExists(): Promise<void> {
  await runSql(
    `INSERT INTO config_roles (role_id, role_name, description)
     VALUES ($1, 'Engineer', 'Default role for weekly sprint capacity setup')
     ON CONFLICT (role_id) DO NOTHING`,
    [DEFAULT_ROLE_ID]
  );
}

async function upsertUsersAndMemberships(): Promise<void> {
  const alpha = loadAssignments("motherops-alpha-assignments.json");
  const beta = loadAssignments("motherops-beta-assignments.json");
  const files = [alpha, beta];

  await ensureRoleExists();

  for (const assignmentFile of files) {
    const projectId = assignmentFile.project;

    for (const assignment of assignmentFile.assignments) {
      const upn = assignment.userPrincipalName.trim().toLowerCase();
      const userId = upn;
      const displayName = toDisplayName(upn);
      const mailNickname = (upn.split("@")[0] || upn).replace(/[^a-zA-Z0-9._-]/g, "");
      const nameParts = displayName.split(" ");
      const givenName = nameParts[0] || displayName;
      const surname = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

      await runSql(
        `INSERT INTO config_users
          (user_id, display_name, user_principal_name, mail_nickname, given_name, surname, role_id, project_ids, account_enabled)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, true)
         ON CONFLICT (user_id)
         DO UPDATE SET
           display_name = EXCLUDED.display_name,
           user_principal_name = EXCLUDED.user_principal_name,
           mail_nickname = EXCLUDED.mail_nickname,
           given_name = EXCLUDED.given_name,
           surname = EXCLUDED.surname,
           role_id = COALESCE(config_users.role_id, EXCLUDED.role_id),
           account_enabled = true,
           updated_at = NOW()`,
        [userId, displayName, upn, mailNickname, givenName, surname, DEFAULT_ROLE_ID, JSON.stringify([projectId])]
      );

      await runSql(
        `INSERT INTO config_project_members (project_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (project_id, user_id) DO NOTHING`,
        [projectId, userId]
      );
    }

    console.log(`[seed-members] ${projectId}: upserted ${assignmentFile.assignments.length} users/members`);
  }
}

async function ensureProjectsAndMembers(): Promise<void> {
  for (const projectId of TARGET_PROJECTS) {
    const projectRows: any = await runSql(
      `SELECT project_id FROM config_projects WHERE project_id = $1`,
      [projectId]
    );

    const projectText = projectRows?.content?.[0]?.text || "[]";
    const projects = JSON.parse(projectText);
    if (!Array.isArray(projects) || projects.length === 0) {
      throw new Error(`Missing project in config_projects: ${projectId}`);
    }

    const memberRows: any = await runSql(
      `SELECT COUNT(*)::int AS count FROM config_project_members WHERE project_id = $1`,
      [projectId]
    );
    const memberText = memberRows?.content?.[0]?.text || "[]";
    const members = JSON.parse(memberText);
    const count = members?.[0]?.count || 0;

    if (count <= 0) {
      throw new Error(`No project members found for ${projectId}. Team members must exist in config_project_members.`);
    }

    console.log(`[preflight] ${projectId}: ${count} members found`);
  }
}

async function resolveTeamName(projectId: ProjectId): Promise<string> {
  const rows: any = await runSql(
    `SELECT team_name FROM config_projects WHERE project_id = $1`,
    [projectId]
  );
  const text = rows?.content?.[0]?.text || "[]";
  const parsed = JSON.parse(text);
  return parsed?.[0]?.team_name || TEAM_FALLBACK;
}

async function seedFullCapacityDefaults(projectId: ProjectId, teamId: string): Promise<void> {
  await runSql(
    `INSERT INTO sprint_capacity_defaults
      (project_id, team_id, role_id, productive_hours_per_sprint, capacity_per_day, is_active)
     SELECT DISTINCT
       m.project_id,
      $2,
       u.role_id,
       40,
       8.0,
       true
     FROM config_project_members m
     JOIN config_users u ON u.user_id = m.user_id
     WHERE m.project_id = $1
     ON CONFLICT (project_id, team_id, role_id)
     DO UPDATE SET
       productive_hours_per_sprint = EXCLUDED.productive_hours_per_sprint,
       capacity_per_day = EXCLUDED.capacity_per_day,
       is_active = true,
       updated_at = NOW()`,
    [projectId, teamId]
  );

  console.log(`[seed] ${projectId}/${teamId}: full-capacity defaults upserted`);
}

async function seedDummyTemplate(projectId: ProjectId, teamId: string): Promise<void> {
  await runSql(
    `UPDATE sprint_story_templates
     SET is_active = false,
         updated_at = NOW()
     WHERE project_id = $1
       AND team_id = $2
       AND template_name <> $3`,
    [projectId, teamId, PLACEHOLDER_TEMPLATE]
  );

  await runSql(
    `INSERT INTO sprint_story_templates
      (project_id, team_id, template_name, work_item_type, title, description, story_order, is_active)
     SELECT $1, $2, $3, 'User Story', $4, $5, 1, true
     WHERE NOT EXISTS (
       SELECT 1
       FROM sprint_story_templates
       WHERE project_id = $1
         AND team_id = $2
         AND template_name = $3
     )`,
    [projectId, teamId, PLACEHOLDER_TEMPLATE, PLACEHOLDER_TITLE, PLACEHOLDER_DESCRIPTION]
  );

  await runSql(
    `UPDATE sprint_story_templates
     SET work_item_type = 'User Story',
         title = $4,
         description = $5,
         story_order = 1,
         is_active = true,
         updated_at = NOW()
     WHERE project_id = $1
       AND team_id = $2
       AND template_name = $3`,
    [projectId, teamId, PLACEHOLDER_TEMPLATE, PLACEHOLDER_TITLE, PLACEHOLDER_DESCRIPTION]
  );

  console.log(`[seed] ${projectId}/${teamId}: dummy placeholder template active`);
}

function writeScheduleFile(): string {
  const schedule = { sprints: mondaySchedule(START_MONDAY, WEEKS) };
  const outDir = path.resolve(process.cwd(), "schedules");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "alpha-beta-weekly-2026-03-09-to-2026-06-07.json");
  fs.writeFileSync(outPath, JSON.stringify(schedule, null, 2));
  console.log(`[schedule] wrote ${outPath}`);
  return outPath;
}

async function main(): Promise<void> {
  if (process.env.PERSISTENCE_MODE !== "postgres") {
    throw new Error("PERSISTENCE_MODE must be postgres.");
  }
  if (!process.env.NEON_MCP_API_KEY || !process.env.NEON_PROJECT_ID || !process.env.NEON_BRANCH_ID) {
    throw new Error("Missing Neon MCP env vars: NEON_MCP_API_KEY, NEON_PROJECT_ID, NEON_BRANCH_ID.");
  }

  await upsertUsersAndMemberships();
  await ensureProjectsAndMembers();

  for (const projectId of TARGET_PROJECTS) {
    const teamId = await resolveTeamName(projectId);
    await seedFullCapacityDefaults(projectId, teamId);
    await seedDummyTemplate(projectId, teamId);
  }

  writeScheduleFile();
  console.log("\nSetup complete for Alpha and Beta.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
