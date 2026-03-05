/**
 * Unit tests for configWriter module
 */

import {
  createUserRecord,
  updateUserRecord,
  createCredentialRecord,
  updateCapacityRecord,
  addUserToProject,
  removeUserFromProject,
  deleteUserRecord,
  createIterationRecord,
} from "../src/lib/configWriter";
import { clearCache, loadConfiguration } from "../src/lib/configLoader";

describe("ConfigWriter", () => {
  beforeEach(() => {
    clearCache();
    // Set JSON mode for testing
    process.env.PERSISTENCE_MODE = "json";
  });

  afterEach(() => {
    clearCache();
  });

  describe("createUserRecord", () => {
    test("should create a new user in JSON mode", async () => {
      const newUser = {
        userId: "test-user-1",
        displayName: "Test User",
        userPrincipalName: "testuser@example.com",
        mailNickname: "testuser",
        givenName: "Test",
        surname: "User",
        jobTitle: "Developer",
        department: "Engineering",
        usageLocation: "US",
        accountEnabled: true,
        roleId: "dev-role",
        projectIds: ["proj-1"],
      };

      await createUserRecord(newUser);

      const config = loadConfiguration();
      const createdUser = config.users.get("test-user-1");

      expect(createdUser).toBeDefined();
      expect(createdUser?.displayName).toBe("Test User");
      expect(createdUser?.userPrincipalName).toBe("testuser@example.com");
    });

    test("should update existing user when calling createUserRecord with same userId", async () => {
      const existingUsers = loadConfiguration().users;
      if (existingUsers.size === 0) {
        console.warn("No existing users to test update functionality");
        return;
      }

      const firstUser = Array.from(existingUsers.values())[0];
      const updatedUser = {
        ...firstUser,
        displayName: "Updated Name",
      };

      await createUserRecord(updatedUser);

      const config = loadConfiguration();
      const user = config.users.get(firstUser.userId);
      expect(user?.displayName).toBe("Updated Name");
    });
  });

  describe("updateUserRecord", () => {
    test("should update user fields", async () => {
      const existingUsers = loadConfiguration().users;
      if (existingUsers.size === 0) {
        console.warn("No existing users to test");
        return;
      }

      const firstUser = Array.from(existingUsers.values())[0];
      await updateUserRecord(firstUser.userId, {
        jobTitle: "Senior Developer",
        department: "R&D",
      });

      clearCache();
      const config = loadConfiguration();
      const updated = config.users.get(firstUser.userId);
      expect(updated?.jobTitle).toBe("Senior Developer");
      expect(updated?.department).toBe("R&D");
    });

    test("should update projectIds array", async () => {
      const existingUsers = loadConfiguration().users;
      if (existingUsers.size === 0) {
        console.warn("No existing users to test");
        return;
      }

      const firstUser = Array.from(existingUsers.values())[0];
      const newProjectIds = [...(firstUser.projectIds || []), "new-proj"];

      await updateUserRecord(firstUser.userId, {
        projectIds: newProjectIds,
      });

      clearCache();
      const config = loadConfiguration();
      const updated = config.users.get(firstUser.userId);
      expect(updated?.projectIds).toContain("new-proj");
    });
  });

  describe("createCredentialRecord", () => {
    test("should create a new credential record", async () => {
      const credential = {
        userId: "test-user-2",
        userPrincipalName: "testuser2@example.com",
        password: "SecurePassword123!",
      };

      await createCredentialRecord(credential);

      const config = loadConfiguration();
      const createdCred = config.credentials.get("test-user-2");

      expect(createdCred).toBeDefined();
      expect(createdCred?.password).toBe("SecurePassword123!");
    });
  });

  describe("updateCapacityRecord", () => {
    test("should update capacity record", async () => {
      const existingCapacity = loadConfiguration().capacity;
      if (existingCapacity.size === 0) {
        console.warn("No existing capacity records to test");
        return;
      }

      const firstCapacity = Array.from(existingCapacity.values())[0];

      await updateCapacityRecord(firstCapacity.userId, {
        focusFactor: 0.9,
        productiveHoursPerSprint: 30,
      });

      clearCache();
      const config = loadConfiguration();
      const updated = config.capacity.get(firstCapacity.userId);
      expect(updated?.focusFactor).toBe(0.9);
      expect(updated?.productiveHoursPerSprint).toBe(30);
    });
  });

  describe("addUserToProject", () => {
    test("should add user to project", async () => {
      const config = loadConfiguration();
      const projects = Array.from(config.projects.values());
      const users = Array.from(config.users.values());

      if (projects.length === 0 || users.length === 0) {
        console.warn("Not enough projects or users for test");
        return;
      }

      const project = projects[0];
      const user = users.find((u) => !project.members.includes(u.userId));

      if (!user) {
        console.warn("All users are already in the test project");
        return;
      }

      await addUserToProject(project.projectId, user.userId);

      clearCache();
      const updatedConfig = loadConfiguration();
      const updatedProject = updatedConfig.projects.get(project.projectId);
      expect(updatedProject?.members).toContain(user.userId);

      const updatedUser = updatedConfig.users.get(user.userId);
      expect(updatedUser?.projectIds).toContain(project.projectId);
    });
  });

  describe("removeUserFromProject", () => {
    test("should remove user from project", async () => {
      const config = loadConfiguration();
      const projects = Array.from(config.projects.values());

      if (projects.length === 0) {
        console.warn("No projects to test");
        return;
      }

      const project = projects.find((p) => p.members.length > 0);
      if (!project) {
        console.warn("No project with members found");
        return;
      }

      const userIdToRemove = project.members[0];

      await removeUserFromProject(project.projectId, userIdToRemove);

      clearCache();
      const updatedConfig = loadConfiguration();
      const updatedProject = updatedConfig.projects.get(project.projectId);
      expect(updatedProject?.members).not.toContain(userIdToRemove);

      const updatedUser = updatedConfig.users.get(userIdToRemove);
      expect(updatedUser?.projectIds).not.toContain(project.projectId);
    });
  });

  describe("deleteUserRecord", () => {
    test("should delete a user record", async () => {
      // First create a test user
      const newUser = {
        userId: "test-user-delete",
        displayName: "Test Delete User",
        userPrincipalName: "testdelete@example.com",
        mailNickname: "testdelete",
        roleId: "dev-role",
      };

      await createUserRecord(newUser);

      // Verify it was created
      let config = loadConfiguration();
      expect(config.users.has("test-user-delete")).toBe(true);

      // Delete it
      await deleteUserRecord("test-user-delete");

      // Verify it was deleted
      clearCache();
      config = loadConfiguration();
      expect(config.users.has("test-user-delete")).toBe(false);
    });
  });

  describe("createIterationRecord", () => {
    test("should create a project iteration record", async () => {
      const config = loadConfiguration();
      const projects = Array.from(config.projects.values());

      if (projects.length === 0) {
        console.warn("No projects to test");
        return;
      }

      const project = projects[0];

      const iteration = {
        projectId: project.projectId,
        sprintName: "Sprint 999",
        iterationPath: `${project.projectName}\\Sprint 999`,
        iterationId: "sprint-999",
        startDate: "2026-03-01",
        finishDate: "2026-03-14",
      };

      await createIterationRecord(iteration);

      clearCache();
      const updatedConfig = loadConfiguration();
      const updatedProject = updatedConfig.projects.get(project.projectId);

      const createdIteration = (updatedProject?.iterations || []).find(
        (it) => it.iterationId === "sprint-999"
      );

      expect(createdIteration).toBeDefined();
      expect(createdIteration?.sprintName).toBe("Sprint 999");
    });
  });

  describe("Cache Invalidation", () => {
    test("should invalidate cache after write operations", async () => {
      clearCache();
      const config1 = loadConfiguration();
      const initialUserCount = config1.users.size;

      // Create a new user
      const testUserId = `cache-test-user-${Date.now()}`;
      await createUserRecord({
        userId: testUserId,
        displayName: "Cache Test",
        userPrincipalName: "cachetest@example.com",
        mailNickname: "cachetest",
        roleId: "dev-role",
      });

      // Load config again (should have new user)
      const config2 = loadConfiguration();
      expect(config2.users.has(testUserId)).toBe(true);
      expect(config2.users.size).toBeGreaterThanOrEqual(initialUserCount);
    });
  });
});
