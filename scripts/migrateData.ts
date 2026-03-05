/**
 * Data Migration Script
 * 
 * Loads configuration data from JSON seed files into Postgres database.
 * Enables handlers to read from database when PERSISTENCE_MODE=postgres.
 * 
 * Usage:
 *   npm run cli migrate-data -- --mode load
 *   npm run cli migrate-data -- --mode dump
 */

import fs from "fs";
import path from "path";
import { neonMcpClient } from "../src/clients/neonMcpClient";
import {
  User,
  Role,
  Project,
  Credential,
  CapacityRecord,
} from "../src/lib/configLoader";

const seedDir = path.join(process.cwd(), "data", "seed");

async function loadJsonFiles() {
  console.log("📂 Loading JSON seed files from data/seed/...");

  const rawUsers: User[] = JSON.parse(
    fs.readFileSync(path.join(seedDir, "users.json"), "utf8")
  ).users;

  // Keep the first record for each unique userId and userPrincipalName.
  // Some seed files contain aliases/duplicates that would violate DB uniqueness.
  const seenUserIds = new Set<string>();
  const seenUpns = new Set<string>();
  const users: User[] = [];
  for (const user of rawUsers) {
    const upn = (user.userPrincipalName || "").toLowerCase();
    if (seenUserIds.has(user.userId) || (upn && seenUpns.has(upn))) {
      continue;
    }
    seenUserIds.add(user.userId);
    if (upn) seenUpns.add(upn);
    users.push(user);
  }

  const roles: Role[] = JSON.parse(
    fs.readFileSync(path.join(seedDir, "roles.json"), "utf8")
  ).roles;

  const capacity: CapacityRecord[] = JSON.parse(
    fs.readFileSync(path.join(seedDir, "capacity.json"), "utf8")
  ).capacity;

  const projects: Project[] = JSON.parse(
    fs.readFileSync(path.join(seedDir, "projects.json"), "utf8")
  ).projects;

  const credentials: Credential[] = JSON.parse(
    fs.readFileSync(path.join(seedDir, "users.credentials.json"), "utf8")
  ).credentials;

  console.log(`✓ Loaded ${users.length} users (${rawUsers.length} raw)`);
  console.log(`✓ Loaded ${roles.length} roles`);
  console.log(`✓ Loaded ${capacity.length} capacity records`);
  console.log(`✓ Loaded ${projects.length} projects`);
  console.log(`✓ Loaded ${credentials.length} credentials`);

  return { users, roles, capacity, projects, credentials };
}

async function loadDataToDatabase(data: {
  users: User[];
  roles: Role[];
  capacity: CapacityRecord[];
  projects: Project[];
  credentials: Credential[];
}) {
  console.log("\n📝 Loading data into database...");
  const validRoleIds = new Set(data.roles.map((r) => r.roleId));
  const validUserIds = new Set(data.users.map((u) => u.userId));

  // Insert roles first (no dependencies)
  console.log("  Loading roles...");
  for (const role of data.roles) {
    await neonMcpClient.query(
      `INSERT INTO config_roles (role_id, role_name, subtitle, description, default_focus_factor, default_activity)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (role_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
      [
        role.roleId,
        role.roleName,
        role.subtitle,
        role.description,
        role.defaultFocusFactor,
        role.defaultActivity,
      ]
    );
  }
  console.log(`  ✓ Inserted ${data.roles.length} roles`);

  // Insert users (depends on roles)
  console.log("  Loading users...");
  let insertedUsers = 0;
  for (const user of data.users) {
    if (!validRoleIds.has(user.roleId)) {
      continue;
    }
    await neonMcpClient.query(
      `INSERT INTO config_users (user_id, display_name, user_principal_name, mail_nickname, 
                          given_name, surname, job_title, department, usage_location, 
                          account_enabled, role_id, project_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (user_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
      [
        user.userId,
        user.displayName,
        user.userPrincipalName,
        user.mailNickname,
        user.givenName,
        user.surname,
        user.jobTitle,
        user.department,
        user.usageLocation,
        user.accountEnabled,
        user.roleId,
        JSON.stringify(user.projectIds || []),
      ]
    );
    insertedUsers++;
  }
  console.log(`  ✓ Inserted ${insertedUsers} users`);

  // Insert capacity records (depends on users and roles)
  console.log("  Loading capacity records...");
  let insertedCapacity = 0;
  for (const cap of data.capacity) {
    if (!validUserIds.has(cap.userId) || !validRoleIds.has(cap.roleId)) {
      continue;
    }
    await neonMcpClient.query(
      `INSERT INTO config_capacity (user_id, role_id, focus_factor, productive_hours_per_sprint, total_capacity_hours)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, role_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
      [
        cap.userId,
        cap.roleId,
        cap.focusFactor,
        Math.round(Number(cap.productiveHoursPerSprint)),
        Math.round(Number(cap.totalCapacityHours)),
      ]
    );
    insertedCapacity++;
  }
  console.log(`  ✓ Inserted ${insertedCapacity} capacity records`);

  // Insert projects (no dependencies)
  console.log("  Loading projects...");
  for (const project of data.projects) {
    await neonMcpClient.query(
      `INSERT INTO config_projects (project_id, project_name, project_full_name, organization, team_id, team_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (project_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
      [
        project.projectId,
        project.projectName,
        project.projectFullName,
        project.organization,
        project.teamId,
        project.teamName,
      ]
    );

    // Insert project iterations
    for (const iteration of project.iterations || []) {
      await neonMcpClient.query(
        `INSERT INTO config_project_iterations (project_id, sprint_name, iteration_path, iteration_id, start_date, finish_date)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (iteration_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
        [
          project.projectId,
          iteration.sprintName,
          iteration.iterationPath,
          iteration.iterationId,
          iteration.startDate,
          iteration.finishDate,
        ]
      );
    }
  }
  console.log(`  ✓ Inserted ${data.projects.length} projects`);

  // Insert project members (junction table)
  console.log("  Loading project members...");
  let memberCount = 0;
  for (const project of data.projects) {
    for (const userId of project.members || []) {
      if (!validUserIds.has(userId)) {
        continue;
      }
      try {
        await neonMcpClient.query(
          `INSERT INTO config_project_members (project_id, user_id)
           VALUES ($1, $2)
           ON CONFLICT (project_id, user_id) DO NOTHING`,
          [project.projectId, userId]
        );
        memberCount++;
      } catch (error) {
        console.warn(`  ⚠️ Failed to insert member ${userId} to project ${project.projectId}`);
      }
    }
  }
  console.log(`  ✓ Inserted ${memberCount} project members`);

  // Insert credentials (depends on users)
  console.log("  Loading credentials...");
  let insertedCredentials = 0;
  for (const cred of data.credentials) {
    if (!validUserIds.has(cred.userId)) {
      continue;
    }
    await neonMcpClient.query(
      `INSERT INTO config_credentials (user_id, user_principal_name, password)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
      [cred.userId, cred.userPrincipalName, cred.password]
    );
    insertedCredentials++;
  }
  console.log(`  ✓ Inserted ${insertedCredentials} credentials`);
}

async function dumpDatabaseToJson() {
  console.log("\n💾 Dumping database to JSON files...");

  // Query and save users
  const users = await neonMcpClient.query(
    `SELECT user_id as "userId", display_name as "displayName", 
            user_principal_name as "userPrincipalName", mail_nickname as "mailNickname",
            given_name as "givenName", surname, job_title as "jobTitle", department,
            usage_location as "usageLocation", account_enabled as "accountEnabled",
            role_id as "roleId", project_ids as "projectIds"
    FROM config_users ORDER BY user_id`
  );

  fs.writeFileSync(
    path.join(configDir, "users.json"),
    JSON.stringify({ users }, null, 2)
  );
  console.log(`  ✓ Dumped ${users.length} users to users.json`);

  // Query and save roles
  const roles = await neonMcpClient.query(
    `SELECT role_id as "roleId", role_name as "roleName", subtitle, description,
            default_focus_factor as "defaultFocusFactor", default_activity as "defaultActivity"
    FROM config_roles ORDER BY role_id`
  );

  fs.writeFileSync(
    path.join(configDir, "roles.json"),
    JSON.stringify({ roles }, null, 2)
  );
  console.log(`  ✓ Dumped ${roles.length} roles to roles.json`);

  // Query and save capacity
  const capacity = await neonMcpClient.query(
    `SELECT user_id as "userId", role_id as "roleId", focus_factor as "focusFactor",
            productive_hours_per_sprint as "productiveHoursPerSprint",
            total_capacity_hours as "totalCapacityHours"
    FROM config_capacity ORDER BY user_id`
  );

  fs.writeFileSync(
    path.join(configDir, "capacity.json"),
    JSON.stringify({ capacity }, null, 2)
  );
  console.log(`  ✓ Dumped ${capacity.length} capacity records to capacity.json`);

  // Query and save projects with iterations and members
  const projects = await neonMcpClient.query(
    `SELECT p.project_id as "projectId", p.project_name as "projectName",
            p.project_full_name as "projectFullName", p.organization,
            p.team_id as "teamId", p.team_name as "teamName"
    FROM config_projects p ORDER BY p.project_id`
  );

  for (const project of projects) {
    // Get iterations for this project
    const iterations = await neonMcpClient.query(
      `SELECT sprint_name as "sprintName", iteration_path as "iterationPath",
              iteration_id as "iterationId", start_date as "startDate", finish_date as "finishDate"
      FROM config_project_iterations WHERE project_id = $1 ORDER BY start_date`,
      [project.projectId]
    );
    (project as any).iterations = iterations;

    // Get members for this project
    const members = await neonMcpClient.query(
      `SELECT user_id FROM config_project_members WHERE project_id = $1 ORDER BY user_id`,
      [project.projectId]
    );
    (project as any).members = members.map((m: any) => m.user_id);
  }

  fs.writeFileSync(
    path.join(configDir, "projects.json"),
    JSON.stringify({ projects }, null, 2)
  );
  console.log(`  ✓ Dumped ${projects.length} projects to projects.json`);

  // Query and save credentials
  const credentials = await neonMcpClient.query(
    `SELECT user_id as "userId", user_principal_name as "userPrincipalName", password
    FROM config_credentials ORDER BY user_id`
  );

  fs.writeFileSync(
    path.join(process.cwd(), "users.credentials.json"),
    JSON.stringify({ credentials }, null, 2)
  );
  console.log(`  ✓ Dumped ${credentials.length} credentials to users.credentials.json`);
}

async function main() {
  const mode = process.env.MIGRATION_MODE || "load";

  try {
    if (!neonMcpClient.isConfigured()) {
      console.error("❌ Neon MCP client is not configured.");
      console.error(
        "Set NEON_MCP_SERVER_URL and NEON_MCP_API_KEY environment variables."
      );
      process.exit(1);
    }

    // Test health
    const health = await neonMcpClient.health();
    if (!health.ok) {
      console.error("❌ Neon MCP server is not healthy");
      console.error(health.error);
      process.exit(1);
    }
    console.log("✓ Neon MCP server is healthy");

    if (mode === "load") {
      const data = await loadJsonFiles();
      await loadDataToDatabase(data);
      console.log("\n✅ Data migration to database completed successfully");
    } else if (mode === "dump") {
      await dumpDatabaseToJson();
      console.log("\n✅ Data dump from database completed successfully");
    } else {
      console.error(`Unknown migration mode: ${mode}`);
      console.error("Use 'load' or 'dump'");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Migration failed:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
