/**
 * Configuration Writer Module
 * 
 * Provides write operations for configuration data in both JSON and Postgres modes.
 * Complements configLoader for managing configuration changes.
 * 
 * MCP-ONLY POLICY:
 * All database writes must go through neonMcpClient, never direct pg connections.
 * All file writes should use fs module with proper error handling.
 * 
 * Usage:
 *   // Create a new user record
 *   await createUserRecord(userData);
 *   
 *   // Update capacity record
 *   await updateCapacityRecord(userId, capacityData);
 *   
 *   // Add user to project
 *   await addUserToProject(userId, projectId);
 */

import fs from "fs";
import path from "path";
import { neonMcpClient } from "../clients/neonMcpClient";
import {
  User,
  Role,
  Project,
  Credential,
  CapacityRecord,
  isPostgresMode,
  clearCache,
  loadConfiguration,
} from "./configLoader";

// ─── Direct Postgres Write Operations ─────────────────────────────────────

/**
 * Create a new user record in the database
 */
export async function createUserRecord(data: {
  userId: string;
  displayName: string;
  userPrincipalName: string;
  mailNickname: string;
  givenName?: string;
  surname?: string;
  jobTitle?: string;
  department?: string;
  usageLocation?: string;
  accountEnabled?: boolean;
  roleId: string;
  projectIds?: string[];
}): Promise<void> {
  if (isPostgresMode()) {
    await neonMcpClient.query(
      `INSERT INTO config_users (user_id, display_name, user_principal_name, mail_nickname, 
                          given_name, surname, job_title, department, usage_location,
                          account_enabled, role_id, project_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (user_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
      [
        data.userId,
        data.displayName,
        data.userPrincipalName,
        data.mailNickname,
        data.givenName || null,
        data.surname || null,
        data.jobTitle || null,
        data.department || null,
        data.usageLocation || null,
        data.accountEnabled !== false,
        data.roleId,
        JSON.stringify(data.projectIds || []),
      ]
    );
    clearCache(); // Invalidate cache
  } else {
    // JSON mode: update config file
    const configDir = resolveConfigDir();
    const usersPath = ensureWritableJsonFile(
      path.join(configDir, "users.json"),
      [
        path.join(configDir, "users.json.sample"),
        path.join(resolveRootDir(), "users.json.sample"),
      ],
      { users: [] }
    );
    let usersData = JSON.parse(fs.readFileSync(usersPath, "utf8"));

    // Update or add user
    const existingIndex = usersData.users.findIndex(
      (u: User) => u.userId === data.userId
    );

    const userData: User = {
      userId: data.userId,
      displayName: data.displayName,
      userPrincipalName: data.userPrincipalName,
      mailNickname: data.mailNickname,
      givenName: data.givenName || "",
      surname: data.surname || "",
      jobTitle: data.jobTitle || "",
      department: data.department || "",
      usageLocation: data.usageLocation || "",
      accountEnabled: data.accountEnabled !== false,
      roleId: data.roleId,
      projectIds: data.projectIds || [],
    };

    if (existingIndex >= 0) {
      usersData.users[existingIndex] = userData;
    } else {
      usersData.users.push(userData);
    }

    fs.writeFileSync(usersPath, JSON.stringify(usersData, null, 2));
    clearCache(); // Invalidate cache
  }
}

/**
 * Update user fields
 */
export async function updateUserRecord(
  userId: string,
  updates: Partial<User>
): Promise<void> {
  if (isPostgresMode()) {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    Object.entries(updates).forEach(([key, value]) => {
      if (key === "userId") return;
      if (key === "projectIds" && Array.isArray(value)) {
        setClauses.push(`project_ids = $${paramIndex}`);
        values.push(JSON.stringify(value));
      } else {
        const dbKey = toSnakeCase(key);
        setClauses.push(`${dbKey} = $${paramIndex}`);
        values.push(value);
      }
      paramIndex++;
    });

    if (setClauses.length === 0) return;

    values.push(userId); // user_id param
    const sql = `UPDATE config_users SET ${setClauses.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE user_id = $${paramIndex}`;

    await neonMcpClient.query(sql, values);
    clearCache();
  } else {
    // JSON mode
    const configDir = resolveConfigDir();
    const usersPath = ensureWritableJsonFile(
      path.join(configDir, "users.json"),
      [
        path.join(configDir, "users.json.sample"),
        path.join(resolveRootDir(), "users.json.sample"),
      ],
      { users: [] }
    );
    const usersData = JSON.parse(fs.readFileSync(usersPath, "utf8"));

    const userIndex = usersData.users.findIndex(
      (u: User) => u.userId === userId
    );
    if (userIndex >= 0) {
      usersData.users[userIndex] = {
        ...usersData.users[userIndex],
        ...updates,
      };
      fs.writeFileSync(usersPath, JSON.stringify(usersData, null, 2));
      clearCache();
    }
  }
}

/**
 * Create a credential record
 */
export async function createCredentialRecord(data: {
  userId: string;
  userPrincipalName: string;
  password: string;
}): Promise<void> {
  if (isPostgresMode()) {
    await neonMcpClient.query(
      `INSERT INTO config_credentials (user_id, user_principal_name, password)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET password = $3, updated_at = CURRENT_TIMESTAMP`,
      [data.userId, data.userPrincipalName, data.password]
    );
    clearCache();
  } else {
    // JSON mode
    const rootDir = resolveRootDir();
    const credsPath = ensureWritableJsonFile(
      path.join(rootDir, "users.credentials.json"),
      [path.join(rootDir, "users.credentials.json.sample")],
      { credentials: [] }
    );
    let credsData = JSON.parse(fs.readFileSync(credsPath, "utf8"));

    const existingIndex = credsData.credentials.findIndex(
      (c: Credential) => c.userId === data.userId
    );

    if (existingIndex >= 0) {
      credsData.credentials[existingIndex] = data;
    } else {
      credsData.credentials.push(data);
    }

    fs.writeFileSync(credsPath, JSON.stringify(credsData, null, 2));
    clearCache();
  }
}

/**
 * Update a capacity record
 */
export async function updateCapacityRecord(
  userId: string,
  data: Partial<CapacityRecord>
): Promise<void> {
  if (isPostgresMode()) {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    Object.entries(data).forEach(([key, value]) => {
      if (key === "userId") return;
      const dbKey = toSnakeCase(key);
      setClauses.push(`${dbKey} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    });

    if (setClauses.length === 0) return;

    values.push(userId);
    const sql = `UPDATE config_capacity SET ${setClauses.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE user_id = $${paramIndex}`;

    await neonMcpClient.query(sql, values);
    clearCache();
  } else {
    // JSON mode
    const configDir = resolveConfigDir();
    const capacityPath = ensureWritableJsonFile(
      path.join(configDir, "capacity.json"),
      [path.join(configDir, "capacity.json.sample")],
      { capacity: [] }
    );
    const capacityData = JSON.parse(fs.readFileSync(capacityPath, "utf8"));

    const recordIndex = capacityData.capacity.findIndex(
      (c: CapacityRecord) => c.userId === userId
    );
    if (recordIndex >= 0) {
      capacityData.capacity[recordIndex] = {
        ...capacityData.capacity[recordIndex],
        ...data,
      };
      fs.writeFileSync(capacityPath, JSON.stringify(capacityData, null, 2));
      clearCache();
    }
  }
}

/**
 * Add a user to a project
 */
export async function addUserToProject(
  projectId: string,
  userId: string
): Promise<void> {
  if (isPostgresMode()) {
    await neonMcpClient.query(
      `INSERT INTO config_project_members (project_id, user_id) 
       VALUES ($1, $2)
       ON CONFLICT (project_id, user_id) DO NOTHING`,
      [projectId, userId]
    );
    // Update users table's project_ids array
    const user = loadConfiguration().users.get(userId);
    if (user && !user.projectIds.includes(projectId)) {
      const updatedIds = [...user.projectIds, projectId];
      await updateUserRecord(userId, { projectIds: updatedIds });
    }
    clearCache();
  } else {
    // JSON mode
    const configDir = resolveConfigDir();

    // Update projects.json
    const projectsPath = ensureWritableJsonFile(
      path.join(configDir, "projects.json"),
      [path.join(configDir, "projects.json.sample")],
      { projects: [] }
    );
    const projectsData = JSON.parse(fs.readFileSync(projectsPath, "utf8"));
    const project = projectsData.projects.find(
      (p: Project) => p.projectId === projectId
    );
    if (project && !project.members.includes(userId)) {
      project.members.push(userId);
      fs.writeFileSync(projectsPath, JSON.stringify(projectsData, null, 2));
    }

    // Update users.json
    const usersPath = ensureWritableJsonFile(
      path.join(configDir, "users.json"),
      [
        path.join(configDir, "users.json.sample"),
        path.join(resolveRootDir(), "users.json.sample"),
      ],
      { users: [] }
    );
    const usersData = JSON.parse(fs.readFileSync(usersPath, "utf8"));
    const user = usersData.users.find((u: User) => u.userId === userId);
    if (user && !user.projectIds.includes(projectId)) {
      user.projectIds.push(projectId);
      fs.writeFileSync(usersPath, JSON.stringify(usersData, null, 2));
    }

    clearCache();
  }
}

/**
 * Remove a user from a project
 */
export async function removeUserFromProject(
  projectId: string,
  userId: string
): Promise<void> {
  if (isPostgresMode()) {
    await neonMcpClient.query(
      `DELETE FROM config_project_members WHERE project_id = $1 AND user_id = $2`,
      [projectId, userId]
    );
    // Update users table's project_ids array
    const user = loadConfiguration().users.get(userId);
    if (user) {
      const updatedIds = user.projectIds.filter((id) => id !== projectId);
      await updateUserRecord(userId, { projectIds: updatedIds });
    }
    clearCache();
  } else {
    // JSON mode
    const configDir = resolveConfigDir();

    // Update projects.json
    const projectsPath = ensureWritableJsonFile(
      path.join(configDir, "projects.json"),
      [path.join(configDir, "projects.json.sample")],
      { projects: [] }
    );
    const projectsData = JSON.parse(fs.readFileSync(projectsPath, "utf8"));
    const project = projectsData.projects.find(
      (p: Project) => p.projectId === projectId
    );
    if (project) {
      project.members = project.members.filter((id: string) => id !== userId);
      fs.writeFileSync(projectsPath, JSON.stringify(projectsData, null, 2));
    }

    // Update users.json
    const usersPath = ensureWritableJsonFile(
      path.join(configDir, "users.json"),
      [
        path.join(configDir, "users.json.sample"),
        path.join(resolveRootDir(), "users.json.sample"),
      ],
      { users: [] }
    );
    const usersData = JSON.parse(fs.readFileSync(usersPath, "utf8"));
    const user = usersData.users.find((u: User) => u.userId === userId);
    if (user) {
      user.projectIds = user.projectIds.filter((id: string) => id !== projectId);
      fs.writeFileSync(usersPath, JSON.stringify(usersData, null, 2));
    }

    clearCache();
  }
}

/**
 * Delete a user record
 */
export async function deleteUserRecord(userId: string): Promise<void> {
  if (isPostgresMode()) {
    await neonMcpClient.query(`DELETE FROM config_users WHERE user_id = $1`, [userId]);
    clearCache();
  } else {
    // JSON mode
    const configDir = resolveConfigDir();
    const usersPath = ensureWritableJsonFile(
      path.join(configDir, "users.json"),
      [
        path.join(configDir, "users.json.sample"),
        path.join(resolveRootDir(), "users.json.sample"),
      ],
      { users: [] }
    );
    const usersData = JSON.parse(fs.readFileSync(usersPath, "utf8"));

    usersData.users = usersData.users.filter((u: User) => u.userId !== userId);
    fs.writeFileSync(usersPath, JSON.stringify(usersData, null, 2));
    clearCache();
  }
}

/**
 * Create a project iteration record
 */
export async function createIterationRecord(data: {
  projectId: string;
  sprintName: string;
  iterationPath: string;
  iterationId: string;
  startDate: string;
  finishDate: string;
}): Promise<void> {
  if (isPostgresMode()) {
    await neonMcpClient.query(
      `INSERT INTO config_project_iterations (project_id, sprint_name, iteration_path, iteration_id, start_date, finish_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (iteration_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
      [
        data.projectId,
        data.sprintName,
        data.iterationPath,
        data.iterationId,
        data.startDate,
        data.finishDate,
      ]
    );
    clearCache();
  } else {
    // JSON mode: update projects.json
    const configDir = resolveConfigDir();
    const projectsPath = ensureWritableJsonFile(
      path.join(configDir, "projects.json"),
      [path.join(configDir, "projects.json.sample")],
      { projects: [] }
    );
    const projectsData = JSON.parse(fs.readFileSync(projectsPath, "utf8"));

    const project = projectsData.projects.find(
      (p: Project) => p.projectId === data.projectId
    );
    if (project) {
      if (!project.iterations) {
        project.iterations = [];
      }
      const existingIndex = project.iterations.findIndex(
        (it: any) => it.iterationId === data.iterationId
      );
      if (existingIndex >= 0) {
        project.iterations[existingIndex] = {
          sprintName: data.sprintName,
          iterationPath: data.iterationPath,
          iterationId: data.iterationId,
          startDate: data.startDate,
          finishDate: data.finishDate,
        };
      } else {
        project.iterations.push({
          sprintName: data.sprintName,
          iterationPath: data.iterationPath,
          iterationId: data.iterationId,
          startDate: data.startDate,
          finishDate: data.finishDate,
        });
      }
      fs.writeFileSync(projectsPath, JSON.stringify(projectsData, null, 2));
      clearCache();
    }
  }
}

// ─── Utility Functions ──────────────────────────────────────────────────────

/**
 * Resolve config directory based on current working directory
 */
function resolveConfigDir(): string {
  const currentDir = process.cwd();
  if (currentDir.includes("/dist")) {
    return path.resolve(currentDir, "../../config");
  }
  return path.resolve(currentDir, "config");
}

function resolveRootDir(): string {
  const currentDir = process.cwd();
  if (currentDir.includes("/dist")) {
    return path.resolve(currentDir, "../..");
  }
  return currentDir;
}

function ensureWritableJsonFile(
  targetPath: string,
  sampleCandidates: string[],
  defaultValue: Record<string, any>
): string {
  if (fs.existsSync(targetPath)) {
    return targetPath;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  for (const samplePath of sampleCandidates) {
    if (fs.existsSync(samplePath)) {
      fs.copyFileSync(samplePath, targetPath);
      return targetPath;
    }
  }

  fs.writeFileSync(targetPath, JSON.stringify(defaultValue, null, 2));
  return targetPath;
}

/**
 * Convert camelCase to snake_case
 */
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
