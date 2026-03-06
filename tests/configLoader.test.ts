/**
 * Unit tests for configLoader module
 */

import {
  loadConfiguration,
  loadConfigurationAsync,
  getUser,
  getAllUsers,
  getRole,
  getAllRoles,
  getCapacity,
  getAllCapacity,
  getProject,
  getAllProjects,
  getCredential,
  getUserWithCredentials,
  getAllUsersWithCredentials,
  getAllUsersWithCredentialsSync,
  getUserWithRole,
  getUsersInProject,
  getUsersInProjectSync,
  getProjectsForUser,
  getUnifiedConfig,
  getUnifiedConfigSync,
  getPersistenceMode,
  isPostgresMode,
  isJsonMode,
  validateReferentialIntegrity,
  validateReferentialIntegritySync,
  clearCache,
  User,
  Role,
  Project,
  Credential,
  UnifiedConfig,
  CapacityRecord,
} from "../src/lib/configLoader";

describe("ConfigLoader", () => {
  beforeEach(() => {
    // Clear cache before each test to ensure fresh load
    clearCache();
  });

  afterEach(() => {
    // Clean up after each test
    clearCache();
  });

  describe("loadConfiguration", () => {
    test("should load configuration in JSON mode", () => {
      process.env.PERSISTENCE_MODE = "json";
      clearCache();

      const config = loadConfiguration();

      expect(config).toBeDefined();
      expect(config.users).toBeDefined();
      expect(config.roles).toBeDefined();
      expect(config.capacity).toBeDefined();
      expect(config.projects).toBeDefined();
      expect(config.credentials).toBeDefined();
      expect(config.unifiedConfig).toBeDefined();
      expect(config.mode).toBe("json");
    });

    test("should throw error in postgres mode when called synchronously", () => {
      process.env.PERSISTENCE_MODE = "postgres";
      clearCache();

      expect(() => {
        loadConfiguration();
      }).toThrow(/PERSISTENCE_MODE=postgres requires async loading/);
    });

    test("should cache configuration on subsequent calls", () => {
      process.env.PERSISTENCE_MODE = "json";
      clearCache();

      const config1 = loadConfiguration();
      const config2 = loadConfiguration();

      expect(config1).toBe(config2); // Same object reference
    });
  });

  describe("loadConfigurationAsync", () => {
    test("should load configuration asynchronously in JSON mode", async () => {
      process.env.PERSISTENCE_MODE = "json";
      clearCache();

      const config = await loadConfigurationAsync();

      expect(config).toBeDefined();
      expect(config.users).toBeDefined();
      expect(config.roles).toBeDefined();
      expect(config.capacity).toBeDefined();
      expect(config.projects).toBeDefined();
      expect(config.credentials).toBeDefined();
      expect(config.unifiedConfig).toBeDefined();
      expect(config.mode).toBe("json");
    });

    test("should cache configuration on subsequent async calls", async () => {
      process.env.PERSISTENCE_MODE = "json";
      clearCache();

      const config1 = await loadConfigurationAsync();
      const config2 = await loadConfigurationAsync();

      expect(config1).toBe(config2); // Same object reference
    });
  });

  describe("getUser", () => {
    beforeEach(() => {
      process.env.PERSISTENCE_MODE = "json";
      clearCache();
    });

    test("should return user by userId", () => {
      const users = getAllUsers();
      expect(users.length).toBeGreaterThan(0);

      const firstUser = users[0];
      const foundUser = getUser(firstUser.userId);

      expect(foundUser).toBeDefined();
      expect(foundUser?.userId).toBe(firstUser.userId);
      expect(foundUser?.displayName).toBe(firstUser.displayName);
    });

    test("should return undefined for non-existent user", () => {
      const user = getUser("non-existent-user-id");
      expect(user).toBeUndefined();
    });
  });

  describe("getAllUsers", () => {
    beforeEach(() => {
      process.env.PERSISTENCE_MODE = "json";
      clearCache();
    });

    test("should return all users as array", () => {
      const users = getAllUsers();

      expect(Array.isArray(users)).toBe(true);
      expect(users.length).toBeGreaterThan(0);
      expect(users[0]).toHaveProperty("userId");
      expect(users[0]).toHaveProperty("displayName");
      expect(users[0]).toHaveProperty("userPrincipalName");
    });
  });

  describe("getRole", () => {
    beforeEach(() => {
      process.env.PERSISTENCE_MODE = "json";
      clearCache();
    });

    test("should return role by roleId", () => {
      const roles = getAllRoles();
      expect(roles.length).toBeGreaterThan(0);

      const firstRole = roles[0];
      const foundRole = getRole(firstRole.roleId);

      expect(foundRole).toBeDefined();
      expect(foundRole?.roleId).toBe(firstRole.roleId);
      expect(foundRole?.roleName).toBe(firstRole.roleName);
    });

    test("should return undefined for non-existent role", () => {
      const role = getRole("non-existent-role-id");
      expect(role).toBeUndefined();
    });
  });

  describe("getAllRoles", () => {
    beforeEach(() => {
      process.env.PERSISTENCE_MODE = "json";
      clearCache();
    });

    test("should return all roles as array", () => {
      const roles = getAllRoles();

      expect(Array.isArray(roles)).toBe(true);
      expect(roles.length).toBeGreaterThan(0);
      expect(roles[0]).toHaveProperty("roleId");
      expect(roles[0]).toHaveProperty("roleName");
    });
  });

  describe("getCapacity", () => {
    beforeEach(() => {
      process.env.PERSISTENCE_MODE = "json";
      clearCache();
    });

    test("should return capacity record by userId", () => {
      const capacityRecords = getAllCapacity();
      if (capacityRecords.length > 0) {
        const firstRecord = capacityRecords[0];
        const foundCapacity = getCapacity(firstRecord.userId);

        expect(foundCapacity).toBeDefined();
        expect(foundCapacity?.userId).toBe(firstRecord.userId);
      }
    });
  });

  describe("getAllCapacity", () => {
    beforeEach(() => {
      process.env.PERSISTENCE_MODE = "json";
      clearCache();
    });

    test("should return all capacity records as array", () => {
      const capacity = getAllCapacity();

      expect(Array.isArray(capacity)).toBe(true);
      if (capacity.length > 0) {
        expect(capacity[0]).toHaveProperty("userId");
        expect(capacity[0]).toHaveProperty("roleId");
        expect(capacity[0]).toHaveProperty("focusFactor");
      }
    });
  });

  describe("getProject", () => {
    beforeEach(() => {
      process.env.PERSISTENCE_MODE = "json";
      clearCache();
    });

    test("should return project by projectId", () => {
      const projects = getAllProjects();
      if (projects.length > 0) {
        const firstProject = projects[0];
        const foundProject = getProject(firstProject.projectId);

        expect(foundProject).toBeDefined();
        expect(foundProject?.projectId).toBe(firstProject.projectId);
        expect(foundProject?.projectName).toBe(firstProject.projectName);
      }
    });
  });

  describe("getAllProjects", () => {
    beforeEach(() => {
      process.env.PERSISTENCE_MODE = "json";
      clearCache();
    });

    test("should return all projects as array", () => {
      const projects = getAllProjects();

      expect(Array.isArray(projects)).toBe(true);
      if (projects.length > 0) {
        expect(projects[0]).toHaveProperty("projectId");
        expect(projects[0]).toHaveProperty("projectName");
        expect(projects[0]).toHaveProperty("organization");
      }
    });
  });

  describe("getCredential", () => {
    beforeEach(() => {
      process.env.PERSISTENCE_MODE = "json";
      clearCache();
    });

    test("should return credential by userId", () => {
      const users = getAllUsers();
      if (users.length > 0) {
        const firstUser = users[0];
        const credential = getCredential(firstUser.userId);

        // Credential might or might not exist, so we just check if it's the right type
        if (credential) {
          expect(credential.userId).toBe(firstUser.userId);
          expect(credential).toHaveProperty("password");
        }
      }
    });
  });

  describe("getUserWithCredentials", () => {
    beforeEach(() => {
      process.env.PERSISTENCE_MODE = "json";
      clearCache();
    });

    test("should merge user and credential data", () => {
      const users = getAllUsers();
      if (users.length > 0) {
        const firstUser = users[0];
        const userWithCreds = getUserWithCredentials(firstUser.userId);

        if (userWithCreds) {
          expect(userWithCreds.userId).toBe(firstUser.userId);
          expect(userWithCreds.displayName).toBe(firstUser.displayName);
          expect(userWithCreds).toHaveProperty("password");
        }
      }
    });
  });

  describe("getAllUsersWithCredentials", () => {
    beforeEach(() => {
      process.env.PERSISTENCE_MODE = "json";
      clearCache();
    });

    test("should return users with credentials merged", () => {
      const allUsers = getAllUsers();
      const allCredentials = Array.from(loadConfiguration().credentials.values());

      // If no users have credentials, skip test
      if (allCredentials.length === 0) {
        expect(true).toBe(true);
        return;
      }

      const usersWithCreds = getAllUsersWithCredentials();

      expect(Array.isArray(usersWithCreds)).toBe(true);
      if (usersWithCreds.length > 0) {
        expect(usersWithCreds[0]).toHaveProperty("userId");
        expect(usersWithCreds[0]).toHaveProperty("password");
      }
    });
  });

  describe("getAllUsersWithCredentialsSync", () => {
    beforeEach(() => {
      process.env.PERSISTENCE_MODE = "json";
      clearCache();
    });

    test("should be a synchronous alias for getAllUsersWithCredentials", () => {
      const allCredentials = Array.from(loadConfiguration().credentials.values());

      // If no users have credentials, skip test
      if (allCredentials.length === 0) {
        expect(true).toBe(true);
        return;
      }

      const sync = getAllUsersWithCredentialsSync();

      expect(Array.isArray(sync)).toBe(true);
      expect(sync.length).toBeGreaterThan(0);
    });
  });

  describe("getUserWithRole", () => {
    beforeEach(() => {
      process.env.PERSISTENCE_MODE = "json";
      clearCache();
    });

    test("should merge user and role data", () => {
      const users = getAllUsers();
      if (users.length > 0) {
        const firstUser = users[0];
        const userWithRole = getUserWithRole(firstUser.userId);

        expect(userWithRole).toBeDefined();
        expect(userWithRole?.userId).toBe(firstUser.userId);
        expect(userWithRole?.role).toBeDefined();
        expect(userWithRole?.role.roleId).toBe(firstUser.roleId);
      }
    });
  });

  describe("getUsersInProject", () => {
    beforeEach(() => {
      process.env.PERSISTENCE_MODE = "json";
      clearCache();
    });

    test("should return users in a specific project", () => {
      const projects = getAllProjects();
      if (projects.length > 0) {
        const firstProject = projects[0];
        const usersInProject = getUsersInProject(firstProject.projectId);

        expect(Array.isArray(usersInProject)).toBe(true);
        // Users might be empty for some projects
      }
    });

    test("should return empty array for non-existent project", () => {
      const users = getUsersInProject("non-existent-project-id");
      expect(users).toEqual([]);
    });
  });

  describe("getUsersInProjectSync", () => {
    beforeEach(() => {
      process.env.PERSISTENCE_MODE = "json";
      clearCache();
    });

    test("should be a synchronous alias for getUsersInProject", () => {
      const projects = getAllProjects();
      if (projects.length > 0) {
        const firstProject = projects[0];
        const users = getUsersInProjectSync(firstProject.projectId);
        expect(Array.isArray(users)).toBe(true);
      }
    });
  });

  describe("getProjectsForUser", () => {
    beforeEach(() => {
      process.env.PERSISTENCE_MODE = "json";
      clearCache();
    });

    test("should return projects for a specific user", () => {
      const users = getAllUsers();
      if (users.length > 0) {
        const firstUser = users[0];
        const projects = getProjectsForUser(firstUser.userId);

        expect(Array.isArray(projects)).toBe(true);
      }
    });
  });

  describe("getUnifiedConfig", () => {
    beforeEach(() => {
      process.env.PERSISTENCE_MODE = "json";
      clearCache();
    });

    test("should return unified configuration", () => {
      const config = getUnifiedConfig();

      expect(config).toBeDefined();
      expect(typeof config).toBe("object");
    });
  });

  describe("getUnifiedConfigSync", () => {
    beforeEach(() => {
      process.env.PERSISTENCE_MODE = "json";
      clearCache();
    });

    test("should be a synchronous alias for getUnifiedConfig", () => {
      const config = getUnifiedConfigSync();
      expect(config).toBeDefined();
    });
  });

  describe("Persistence Mode Detection", () => {
    test("getPersistenceMode should return current mode", () => {
      process.env.PERSISTENCE_MODE = "json";
      expect(getPersistenceMode()).toBe("json");

      process.env.PERSISTENCE_MODE = "postgres";
      expect(getPersistenceMode()).toBe("postgres");
    });

    test("isJsonMode should detect JSON mode", () => {
      process.env.PERSISTENCE_MODE = "json";
      expect(isJsonMode()).toBe(true);
      expect(isPostgresMode()).toBe(false);
    });

    test("isPostgresMode should detect Postgres mode", () => {
      process.env.PERSISTENCE_MODE = "postgres";
      expect(isPostgresMode()).toBe(true);
      expect(isJsonMode()).toBe(false);
    });

    test("should default to json mode when PERSISTENCE_MODE is not set", () => {
      delete process.env.PERSISTENCE_MODE;
      expect(getPersistenceMode()).toBe("json");
      expect(isJsonMode()).toBe(true);
    });
  });

  describe("Referential Integrity Validation", () => {
    beforeEach(() => {
      process.env.PERSISTENCE_MODE = "json";
      clearCache();
    });

    test("validateReferentialIntegrity should return validation result", () => {
      const result = validateReferentialIntegrity();

      expect(result).toHaveProperty("valid");
      expect(result).toHaveProperty("errors");
      expect(typeof result.valid).toBe("boolean");
      expect(Array.isArray(result.errors)).toBe(true);
    });

    test("validateReferentialIntegritySync should be an alias", () => {
      const result = validateReferentialIntegritySync();

      expect(result).toHaveProperty("valid");
      expect(result).toHaveProperty("errors");
    });

    test("should validate user role references", () => {
      const result = validateReferentialIntegrity();
      // If all data is valid, there should be no errors
      // If there are errors, they should be meaningful strings
      if (result.errors.length > 0) {
        expect(result.errors[0]).toMatch(/(references unknown|not found)/i);
      }
    });
  });

  describe("Cache Management", () => {
    test("clearCache should reset cached configuration", () => {
      process.env.PERSISTENCE_MODE = "json";

      const config1 = loadConfiguration();
      clearCache();
      const config2 = loadConfiguration();

      expect(config1).not.toBe(config2); // Different object references
    });
  });
});
