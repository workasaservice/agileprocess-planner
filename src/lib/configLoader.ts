import fs from "fs";
import path from "path";
import { neonMcpClient } from "../clients/neonMcpClient";

/**
 * Type definitions for modular configuration
 */
export interface User {
  userId: string;
  displayName: string;
  userPrincipalName: string;
  mailNickname: string;
  givenName: string;
  surname: string;
  jobTitle: string;
  department: string;
  usageLocation: string;
  accountEnabled: boolean;
  roleId: string;
  projectIds: string[];
}

export interface Role {
  roleId: string;
  roleName: string;
  subtitle: string;
  description: string;
  defaultFocusFactor: number;
  defaultActivity: string;
}

export interface CapacityRecord {
  userId: string;
  roleId: string;
  focusFactor: number;
  productiveHoursPerSprint: number;
  totalCapacityHours: number;
}

export interface Project {
  projectId: string;
  projectName: string;
  projectFullName: string;
  organization: string;
  teamId: string;
  teamName: string;
  members: string[]; // userIds
  iterations: Array<{
    sprintName: string;
    iterationPath: string;
    iterationId: string;
    startDate: string;
    finishDate: string;
  }>;
}

export interface Credential {
  userId: string;
  userPrincipalName: string;
  password: string;
}

export interface UnifiedConfig {
  agent: Record<string, any>;
  services: Record<string, any>;
  sprints: Record<string, any>;
  validation: Record<string, any>;
  security: Record<string, any>;
  configuration: Record<string, any>;
}

/**
 * Configuration source abstraction
 * Allows loading from either JSON files or Postgres
 */
interface ConfigurationSource {
  loadUsers(): Promise<Map<string, User>>;
  loadRoles(): Promise<Map<string, Role>>;
  loadCapacity(): Promise<Map<string, CapacityRecord>>;
  loadProjects(): Promise<Map<string, Project>>;
  loadCredentials(): Promise<Map<string, Credential>>;
  loadUnifiedConfig(): Promise<UnifiedConfig>;
}

/**
 * JSON-based configuration source
 */
class JsonConfigurationSource implements ConfigurationSource {
  private configDir: string;
  private rootDir: string;

  constructor() {
    const currentDir = process.cwd();
    
    if (currentDir.includes('/dist')) {
      this.configDir = path.resolve(currentDir, '../../config');
      this.rootDir = path.resolve(currentDir, '../..');
    } else {
      this.configDir = path.resolve(currentDir, 'config');
      this.rootDir = currentDir;
    }
  }

  async loadUsers(): Promise<Map<string, User>> {
    const usersData = JSON.parse(
      fs.readFileSync(path.join(this.configDir, "users.json"), "utf8")
    );
    return new Map<string, User>(
      usersData.users.map((u: User) => [u.userId, u])
    );
  }

  async loadRoles(): Promise<Map<string, Role>> {
    const rolesData = JSON.parse(
      fs.readFileSync(path.join(this.configDir, "roles.json"), "utf8")
    );
    return new Map<string, Role>(
      rolesData.roles.map((r: Role) => [r.roleId, r])
    );
  }

  async loadCapacity(): Promise<Map<string, CapacityRecord>> {
    const capacityData = JSON.parse(
      fs.readFileSync(path.join(this.configDir, "capacity.json"), "utf8")
    );
    return new Map<string, CapacityRecord>(
      capacityData.capacity.map((c: CapacityRecord) => [c.userId, c])
    );
  }

  async loadProjects(): Promise<Map<string, Project>> {
    const projectsData = JSON.parse(
      fs.readFileSync(path.join(this.configDir, "projects.json"), "utf8")
    );
    return new Map<string, Project>(
      projectsData.projects.map((p: Project) => [p.projectId, p])
    );
  }

  async loadCredentials(): Promise<Map<string, Credential>> {
    const credentialsData = JSON.parse(
      fs.readFileSync(path.join(this.rootDir, "users.credentials.json"), "utf8")
    );
    return new Map<string, Credential>(
      credentialsData.credentials.map((c: Credential) => [c.userId, c])
    );
  }

  async loadUnifiedConfig(): Promise<UnifiedConfig> {
    return JSON.parse(
      fs.readFileSync(path.join(this.configDir, "unified-config.json"), "utf8")
    );
  }
}

/**
 * Postgres-based configuration source (via Neon MCP)
 */
class PostgresConfigurationSource implements ConfigurationSource {
  async loadUsers(): Promise<Map<string, User>> {
    // Query users from Postgres
    const users = await neonMcpClient.query<Record<string, unknown>>(
      `SELECT user_id as "userId", display_name as "displayName", 
              user_principal_name as "userPrincipalName", mail_nickname as "mailNickname",
              given_name as "givenName", surname, job_title as "jobTitle", department,
              usage_location as "usageLocation", account_enabled as "accountEnabled",
              role_id as "roleId", project_ids as "projectIds"
      FROM config_users`
    );
    return new Map<string, User>(
      (users as unknown as User[]).map((u) => [u.userId, u])
    );
  }

  async loadRoles(): Promise<Map<string, Role>> {
    const roles = await neonMcpClient.query<Record<string, unknown>>(
      `SELECT role_id as "roleId", role_name as "roleName", subtitle, description,
              default_focus_factor as "defaultFocusFactor", default_activity as "defaultActivity"
      FROM config_roles`
    );
    return new Map<string, Role>(
      (roles as unknown as Role[]).map((r) => [r.roleId, r])
    );
  }

  async loadCapacity(): Promise<Map<string, CapacityRecord>> {
    const capacity = await neonMcpClient.query<Record<string, unknown>>(
      `SELECT user_id as "userId", role_id as "roleId", focus_factor as "focusFactor",
              productive_hours_per_sprint as "productiveHoursPerSprint",
              total_capacity_hours as "totalCapacityHours"
      FROM config_capacity`
    );
    return new Map<string, CapacityRecord>(
      (capacity as unknown as CapacityRecord[]).map((c) => [c.userId, c])
    );
  }

  async loadProjects(): Promise<Map<string, Project>> {
    const projects = await neonMcpClient.query<Record<string, unknown>>(
      `SELECT p.project_id as "projectId", p.project_name as "projectName",
              p.project_full_name as "projectFullName", p.organization,
              p.team_id as "teamId", p.team_name as "teamName",
              COALESCE(json_agg(DISTINCT pm.user_id) FILTER (WHERE pm.user_id IS NOT NULL), '[]'::json) as members
      FROM config_projects p
      LEFT JOIN config_project_members pm ON p.project_id = pm.project_id
       GROUP BY p.project_id, p.project_name, p.project_full_name, p.organization,
                p.team_id, p.team_name`
    );
    return new Map<string, Project>(
      (projects as unknown as Project[]).map((p) => [p.projectId, p])
    );
  }

  async loadCredentials(): Promise<Map<string, Credential>> {
    const credentials = await neonMcpClient.query<Record<string, unknown>>(
      `SELECT user_id as "userId", user_principal_name as "userPrincipalName", password
      FROM config_credentials`
    );
    return new Map<string, Credential>(
      (credentials as unknown as Credential[]).map((c) => [c.userId, c])
    );
  }

  async loadUnifiedConfig(): Promise<UnifiedConfig> {
    // Unified config is always from JSON (metadata, not data)
    const source = new JsonConfigurationSource();
    return source.loadUnifiedConfig();
  }
}

/**
 * Get configuration source based on PERSISTENCE_MODE
 */
function getConfigurationSource(): ConfigurationSource {
  const mode = process.env.PERSISTENCE_MODE || "json";
  
  if (mode === "postgres") {
    return new PostgresConfigurationSource();
  }
  
  return new JsonConfigurationSource();
}

/**
 * Configuration cache (loaded once at startup)
 */
let configCache: {
  users: Map<string, User>;
  roles: Map<string, Role>;
  capacity: Map<string, CapacityRecord>;
  projects: Map<string, Project>;
  credentials: Map<string, Credential>;
  unifiedConfig: UnifiedConfig;
  mode: string;
} | null = null;

/**
 * Load configuration from current source (JSON or Postgres)
 * For JSON mode (default): synchronous and fast
 * For Postgres mode: USE loadConfigurationAsync() instead
 */
export function loadConfiguration() {
  if (configCache) {
    return configCache;
  }

  const mode = process.env.PERSISTENCE_MODE || "json";
  
  // JSON mode: synchronous loading
  if (mode === "json") {
    const source = new JsonConfigurationSource();
    
    try {
      // Synchronous loader for JSON
      const currentDir = process.cwd();
      const configDir = currentDir.includes('/dist') 
        ? path.resolve(currentDir, '../../config')
        : path.resolve(currentDir, 'config');
      const rootDir = currentDir.includes('/dist')
        ? path.resolve(currentDir, '../..')
        : currentDir;

      // Load users
      const usersData = JSON.parse(
        fs.readFileSync(path.join(configDir, "users.json"), "utf8")
      );
      const users = new Map<string, User>(
        usersData.users.map((u: User) => [u.userId, u])
      );

      // Load roles
      const rolesData = JSON.parse(
        fs.readFileSync(path.join(configDir, "roles.json"), "utf8")
      );
      const roles = new Map<string, Role>(
        rolesData.roles.map((r: Role) => [r.roleId, r])
      );

      // Load capacity
      const capacityData = JSON.parse(
        fs.readFileSync(path.join(configDir, "capacity.json"), "utf8")
      );
      const capacity = new Map<string, CapacityRecord>(
        capacityData.capacity.map((c: CapacityRecord) => [c.userId, c])
      );

      // Load projects
      const projectsData = JSON.parse(
        fs.readFileSync(path.join(configDir, "projects.json"), "utf8")
      );
      const projects = new Map<string, Project>(
        projectsData.projects.map((p: Project) => [p.projectId, p])
      );

      // Load credentials
      const credentialsData = JSON.parse(
        fs.readFileSync(path.join(rootDir, "users.credentials.json"), "utf8")
      );
      const credentials = new Map<string, Credential>(
        credentialsData.credentials.map((c: Credential) => [c.userId, c])
      );

      // Load unified config
      const unifiedConfig = JSON.parse(
        fs.readFileSync(path.join(configDir, "unified-config.json"), "utf8")
      );

      configCache = {
        users,
        roles,
        capacity,
        projects,
        credentials,
        unifiedConfig,
        mode,
      };

      return configCache;
    } catch (error) {
      throw new Error(
        `Failed to load configuration from JSON source: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
  
  // Postgres mode: must use async loadConfigurationAsync()
  throw new Error(
    `PERSISTENCE_MODE=postgres requires async loading. Use await loadConfigurationAsync() instead of loadConfiguration()`
  );
}

/**
 * Async load configuration from current source (for Postgres mode)
 * JSON mode will return synchronously, Postgres loads asynchronously
 */
export async function loadConfigurationAsync() {
  if (configCache) {
    return configCache;
  }

  const source = getConfigurationSource();
  const mode = process.env.PERSISTENCE_MODE || "json";

  try {
    const [users, roles, capacity, projects, credentials, unifiedConfig] = 
      await Promise.all([
        source.loadUsers(),
        source.loadRoles(),
        source.loadCapacity(),
        source.loadProjects(),
        source.loadCredentials(),
        source.loadUnifiedConfig(),
      ]);

    configCache = {
      users,
      roles,
      capacity,
      projects,
      credentials,
      unifiedConfig,
      mode,
    };

    return configCache;
  } catch (error) {
    throw new Error(
      `Failed to load configuration from ${mode} source: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Get user by userId
 */
export function getUser(userId: string): User | undefined {
  const config = loadConfiguration();
  return config.users.get(userId);
}

/**
 * Get all users
 */
export function getAllUsers(): User[] {
  const config = loadConfiguration();
  return Array.from(config.users.values());
}

/**
 * Get role by roleId
 */
export function getRole(roleId: string): Role | undefined {
  const config = loadConfiguration();
  return config.roles.get(roleId);
}

/**
 * Get all roles
 */
export function getAllRoles(): Role[] {
  const config = loadConfiguration();
  return Array.from(config.roles.values());
}

/**
 * Get capacity record by userId
 */
export function getCapacity(userId: string): CapacityRecord | undefined {
  const config = loadConfiguration();
  return config.capacity.get(userId);
}

/**
 * Get all capacity records
 */
export function getAllCapacity(): CapacityRecord[] {
  const config = loadConfiguration();
  return Array.from(config.capacity.values());
}

/**
 * Get project by projectId
 */
export function getProject(projectId: string): Project | undefined {
  const config = loadConfiguration();
  return config.projects.get(projectId);
}

/**
 * Get all projects
 */
export function getAllProjects(): Project[] {
  const config = loadConfiguration();
  return Array.from(config.projects.values());
}

/**
 * Get credential by userId
 */
export function getCredential(userId: string): Credential | undefined {
  const config = loadConfiguration();
  return config.credentials.get(userId);
}

/**
 * Join user data with credentials by userId
 * Returns user object with password field added
 */
export function getUserWithCredentials(userId: string): (User & Credential) | undefined {
  const config = loadConfiguration();
  const user = config.users.get(userId);
  const credential = config.credentials.get(userId);

  if (!user || !credential) {
    return undefined;
  }

  return {
    ...user,
    ...credential, // password field
  };
}

/**
 * Get all users with credentials
 */
export function getAllUsersWithCredentials(): (User & Credential)[] {
  const config = loadConfiguration();
  return Array.from(config.users.values())
    .map((user) => {
      const credential = config.credentials.get(user.userId);
      if (!credential) {
        return null; // User without credentials will be filtered out
      }
      return {
        ...user,
        ...credential,
      };
    })
    .filter((item) => item !== null) as (User & Credential)[];
}

/**
 * Get all users with credentials (synchronous version)
 */
export function getAllUsersWithCredentialsSync(): (User & Credential)[] {
  return getAllUsersWithCredentials();
}

/**
 * Get user with role information
 */
export function getUserWithRole(userId: string): (User & { role: Role }) | undefined {
  const config = loadConfiguration();
  const user = config.users.get(userId);
  if (!user) {
    return undefined;
  }

  const role = config.roles.get(user.roleId);
  if (!role) {
    throw new Error(`No role found for roleId ${user.roleId}`);
  }

  return {
    ...user,
    role,
  };
}

/**
 * Get users in a specific project
 */
export function getUsersInProject(projectId: string): User[] {
  const config = loadConfiguration();
  const project = config.projects.get(projectId);
  if (!project) {
    return [];
  }

  return project.members
    .map((userId) => config.users.get(userId))
    .filter((user) => user !== undefined) as User[];
}

/**
 * Get users in a specific project (synchronous alias)
 */
export function getUsersInProjectSync(projectId: string): User[] {
  return getUsersInProject(projectId);
}

/**
 * Get projects for a specific user
 */
export function getProjectsForUser(userId: string): Project[] {
  const config = loadConfiguration();
  const user = config.users.get(userId);
  if (!user) {
    return [];
  }

  return user.projectIds
    .map((projectId) => config.projects.get(projectId))
    .filter((project) => project !== undefined) as Project[];
}

/**
 * Get unified configuration
 */
export function getUnifiedConfig(): UnifiedConfig {
  const config = loadConfiguration();
  return config.unifiedConfig;
}

/**
 * Get unified configuration (synchronous alias)
 */
export function getUnifiedConfigSync(): UnifiedConfig {
  return getUnifiedConfig();
}

/**
 * Get persistence mode (json or postgres)
 */
export function getPersistenceMode(): string {
  return process.env.PERSISTENCE_MODE || "json";
}

/**
 * Check if using Postgres mode
 */
export function isPostgresMode(): boolean {
  return getPersistenceMode() === "postgres";
}

/**
 * Check if using JSON mode
 */
export function isJsonMode(): boolean {
  return getPersistenceMode() === "json";
}

/**
 * Validate referential integrity of all configurations
 */
export function validateReferentialIntegrity(): {
  valid: boolean;
  errors: string[];
} {
  const config = loadConfiguration();
  const errors: string[] = [];

  // Check all roleIds in users exist in roles
  for (const user of config.users.values()) {
    if (!config.roles.has(user.roleId)) {
      errors.push(`User ${user.userId} references unknown roleId: ${user.roleId}`);
    }
  }

  // Check all projectIds in users exist in projects
  for (const user of config.users.values()) {
    for (const projectId of user.projectIds) {
      if (!config.projects.has(projectId)) {
        errors.push(
          `User ${user.userId} references unknown projectId: ${projectId}`
        );
      }
    }
  }

  // Check all userIds in capacity exist in users
  for (const capacity of config.capacity.values()) {
    if (!config.users.has(capacity.userId)) {
      errors.push(
        `Capacity record references unknown userId: ${capacity.userId}`
      );
    }
    if (!config.roles.has(capacity.roleId)) {
      errors.push(
        `Capacity record for ${capacity.userId} references unknown roleId: ${capacity.roleId}`
      );
    }
  }

  // Check all project members exist in users
  for (const project of config.projects.values()) {
    for (const userId of project.members) {
      if (!config.users.has(userId)) {
        errors.push(
          `Project ${project.projectId} references unknown userId: ${userId}`
        );
      }
    }
  }

  // Check all userIds in credentials exist in users
  for (const credential of config.credentials.values()) {
    if (!config.users.has(credential.userId)) {
      errors.push(
        `Credential references unknown userId: ${credential.userId}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate referential integrity (synchronous alias)
 */
export function validateReferentialIntegritySync(): {
  valid: boolean;
  errors: string[];
} {
  return validateReferentialIntegrity();
}

/**
 * Clear configuration cache (useful for testing)
 */
export function clearCache(): void {
  configCache = null;
}
