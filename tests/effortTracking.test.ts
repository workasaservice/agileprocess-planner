/**
 * Unit tests for Effort Tracking Feature
 * Tests verify effort tracking handlers, MCP client extensions, and CLI commands
 */

import * as fs from 'fs';
import path from 'path';

describe('Effort Tracking Module', () => {
  const srcDir = path.join(__dirname, '../src');
  const handlersDir = path.join(srcDir, 'handlers');
  const clientsDir = path.join(srcDir, 'clients');
  const configDir = path.join(__dirname, '../config');
  const dbMigrationsDir = path.join(__dirname, '../db/migrations');

  describe('Configuration Files', () => {
    test('effort-tracking-config.json should exist', () => {
      const configPath = path.join(configDir, 'effort-tracking-config.json');
      expect(fs.existsSync(configPath)).toBe(true);
    });

    test('effort-tracking-config.json should have valid structure', () => {
      const configPath = path.join(configDir, 'effort-tracking-config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      expect(config).toHaveProperty('processTemplate');
      expect(config).toHaveProperty('automation');
      expect(config).toHaveProperty('validation');
      expect(config).toHaveProperty('reporting');
      expect(config.processTemplate.name).toBe('Agile-MotherOps-EffortTracking');
    });

    test('effort-tracking-config.json should have automation rules', () => {
      const configPath = path.join(configDir, 'effort-tracking-config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      expect(config.automation).toHaveProperty('onTaskCreate');
      expect(config.automation).toHaveProperty('onTaskUpdate');
      expect(config.automation).toHaveProperty('dailySync');
    });

    test('effort-tracking-config.json should have validation rules', () => {
      const configPath = path.join(configDir, 'effort-tracking-config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      expect(config.validation).toHaveProperty('rules');
      expect(config.validation.rules).toHaveProperty('originalEstimate');
    });
  });

  describe('Database Migration', () => {
    test('002-effort-tracking-schema.sql should exist', () => {
      const migrationPath = path.join(dbMigrationsDir, '002-effort-tracking-schema.sql');
      expect(fs.existsSync(migrationPath)).toBe(true);
    });

    test('migration should create required tables', () => {
      const migrationPath = path.join(dbMigrationsDir, '002-effort-tracking-schema.sql');
      const migration = fs.readFileSync(migrationPath, 'utf-8');

      expect(migration).toContain('CREATE TABLE IF NOT EXISTS effort_tracking_config');
      expect(migration).toContain('CREATE TABLE IF NOT EXISTS effort_tracking_history');
      expect(migration).toContain('CREATE TABLE IF NOT EXISTS sprint_effort_summary');
      expect(migration).toContain('CREATE TABLE IF NOT EXISTS estimation_accuracy');
    });

    test('migration should add effort columns to config_project_iterations', () => {
      const migrationPath = path.join(dbMigrationsDir, '002-effort-tracking-schema.sql');
      const migration = fs.readFileSync(migrationPath, 'utf-8');

      expect(migration).toContain('ALTER TABLE config_project_iterations');
      expect(migration).toContain('total_estimated_hours');
      expect(migration).toContain('total_remaining_hours');
      expect(migration).toContain('total_completed_hours');
    });
  });

  describe('Azure DevOps MCP Client Extensions', () => {
    test('azureDevOpsMcpClient.ts should contain update-effort-fields tool', () => {
      const clientPath = path.join(clientsDir, 'azureDevOpsMcpClient.ts');
      const content = fs.readFileSync(clientPath, 'utf-8');
      expect(content).toContain('update-effort-fields');
      expect(content).toContain('updateEffortFields');
    });

    test('azureDevOpsMcpClient.ts should contain get-sprint-work-items tool', () => {
      const clientPath = path.join(clientsDir, 'azureDevOpsMcpClient.ts');
      const content = fs.readFileSync(clientPath, 'utf-8');
      expect(content).toContain('get-sprint-work-items');
      expect(content).toContain('getSprintWorkItems');
    });

    test('updateEffortFields function should handle all three effort fields', () => {
      const clientPath = path.join(clientsDir, 'azureDevOpsMcpClient.ts');
      const content = fs.readFileSync(clientPath, 'utf-8');

      expect(content).toContain('Custom.OriginalEstimate');
      expect(content).toContain('Custom.RemainingWork');
      expect(content).toContain('Custom.CompletedWork');
    });
  });

  describe('Handler Files', () => {
    test('initEffortFields.ts should exist', () => {
      const filePath = path.join(handlersDir, 'initEffortFields.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('syncEffortTracking.ts should exist', () => {
      const filePath = path.join(handlersDir, 'syncEffortTracking.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('validateSprintCapacity.ts should exist', () => {
      const filePath = path.join(handlersDir, 'validateSprintCapacity.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('effortTrackingCommands.ts should exist', () => {
      const filePath = path.join(handlersDir, 'effortTrackingCommands.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('Handler Functionality', () => {
    test('initEffortFields should export async function', () => {
      const filePath = path.join(handlersDir, 'initEffortFields.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('export async function initEffortFields');
    });

    test('syncEffortTracking should export async function', () => {
      const filePath = path.join(handlersDir, 'syncEffortTracking.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('export async function syncEffortTracking');
    });

    test('validateSprintCapacity should export async function', () => {
      const filePath = path.join(handlersDir, 'validateSprintCapacity.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('export async function validateSprintCapacity');
    });

    test('effortTrackingCommands should export CLI handlers', () => {
      const filePath = path.join(handlersDir, 'effortTrackingCommands.ts');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('export async function effortInit');
      expect(content).toContain('export async function effortSync');
      expect(content).toContain('export async function effortValidate');
    });
  });

  describe('CLI Integration', () => {
    test('agent.ts should import effort tracking commands', () => {
      const agentPath = path.join(srcDir, 'agent.ts');
      const content = fs.readFileSync(agentPath, 'utf-8');
      expect(content).toContain('effortTrackingCommands');
    });

    test('agent.ts should register effort tracking commands', () => {
      const agentPath = path.join(srcDir, 'agent.ts');
      const content = fs.readFileSync(agentPath, 'utf-8');

      expect(content).toContain('"effort-init"');
      expect(content).toContain('"effort-sync"');
      expect(content).toContain('"effort-validate"');
    });
  });

  describe('Code Quality', () => {
    test('all effort handlers should have error handling', () => {
      const handlers = [
        'initEffortFields.ts',
        'syncEffortTracking.ts',
        'validateSprintCapacity.ts'
      ];

      handlers.forEach(handler => {
        const filePath = path.join(handlersDir, handler);
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toContain('try');
        expect(content).toContain('catch');
      });
    });

    test('all handlers should have JSDoc comments', () => {
      const handlers = [
        'initEffortFields.ts',
        'syncEffortTracking.ts',
        'validateSprintCapacity.ts'
      ];

      handlers.forEach(handler => {
        const filePath = path.join(handlersDir, handler);
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toContain('/**');
      });
    });
  });

  describe('Integration', () => {
    test('effort tracking components should be complete', () => {
      const requiredFiles = [
        path.join(configDir, 'effort-tracking-config.json'),
        path.join(dbMigrationsDir, '002-effort-tracking-schema.sql'),
        path.join(handlersDir, 'initEffortFields.ts'),
        path.join(handlersDir, 'syncEffortTracking.ts'),
        path.join(handlersDir, 'validateSprintCapacity.ts'),
        path.join(handlersDir, 'effortTrackingCommands.ts'),
      ];

      const missing = requiredFiles.filter(f => !fs.existsSync(f));
      expect(missing).toHaveLength(0);
    });

    test('MCP client should export AzureDevOpsMcpClient type', () => {
      const clientPath = path.join(clientsDir, 'azureDevOpsMcpClient.ts');
      const content = fs.readFileSync(clientPath, 'utf-8');
      expect(content).toContain('export type AzureDevOpsMcpClient');
    });
  });
});

describe('calculateSprintSummary', () => {
  // Import the exported function via require to avoid circular mock issues
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { calculateSprintSummary } = require('../src/handlers/syncEffortTracking');

  const makeWorkItem = (
    id: number,
    state: string,
    estimate?: number,
    remaining?: number,
    completed?: number
  ) => ({
    id,
    fields: {
      'System.Title': `Task ${id}`,
      'System.State': state,
      'System.IterationPath': 'MyProject\\Sprint 1',
      ...(estimate !== undefined ? { 'Custom.OriginalEstimate': estimate } : {}),
      ...(remaining !== undefined ? { 'Custom.RemainingWork': remaining } : {}),
      ...(completed !== undefined ? { 'Custom.CompletedWork': completed } : {}),
    },
  });

  test('returns zero totals for an empty work item list', () => {
    const result = calculateSprintSummary('sprint-1', 'MyProject\\Sprint 1', []);
    expect(result.totalEstimated).toBe(0);
    expect(result.totalRemaining).toBe(0);
    expect(result.totalCompleted).toBe(0);
    expect(result.taskCount).toBe(0);
    expect(result.tasksWithEstimates).toBe(0);
    expect(result.tasksInProgress).toBe(0);
    expect(result.tasksCompleted).toBe(0);
  });

  test('sums effort hours across all work items', () => {
    const items = [
      makeWorkItem(1, 'Active', 4, 2, 2),
      makeWorkItem(2, 'Closed', 8, 0, 8),
      makeWorkItem(3, 'New', 2, 2, 0),
    ];
    const result = calculateSprintSummary('sprint-1', 'MyProject\\Sprint 1', items);
    expect(result.totalEstimated).toBe(14);
    expect(result.totalRemaining).toBe(4);
    expect(result.totalCompleted).toBe(10);
    expect(result.taskCount).toBe(3);
  });

  test('counts tasksWithEstimates only when estimate > 0', () => {
    const items = [
      makeWorkItem(1, 'New', 4),      // has estimate
      makeWorkItem(2, 'New', 0),      // estimate = 0
      makeWorkItem(3, 'New'),         // no estimate field
    ];
    const result = calculateSprintSummary('sprint-1', 'MyProject\\Sprint 1', items);
    expect(result.tasksWithEstimates).toBe(1);
  });

  test('classifies "Active" and "In Progress" states as tasksInProgress', () => {
    const items = [
      makeWorkItem(1, 'Active'),
      makeWorkItem(2, 'In Progress'),
      makeWorkItem(3, 'New'),
      makeWorkItem(4, 'Closed'),
    ];
    const result = calculateSprintSummary('sprint-1', 'MyProject\\Sprint 1', items);
    expect(result.tasksInProgress).toBe(2);
  });

  test('classifies "Closed" and "Done" states as tasksCompleted', () => {
    const items = [
      makeWorkItem(1, 'Closed'),
      makeWorkItem(2, 'Done'),
      makeWorkItem(3, 'Active'),
    ];
    const result = calculateSprintSummary('sprint-1', 'MyProject\\Sprint 1', items);
    expect(result.tasksCompleted).toBe(2);
  });

  test('includes a burndown data point for today', () => {
    const items = [makeWorkItem(1, 'Active', 8, 5, 3)];
    const result = calculateSprintSummary('sprint-1', 'MyProject\\Sprint 1', items);
    expect(result.burndownData).toHaveLength(1);
    expect(result.burndownData[0]!.remaining).toBe(5);
    expect(result.burndownData[0]!.completed).toBe(3);
    expect(result.burndownData[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('preserves sprintId and iterationPath in the result', () => {
    const result = calculateSprintSummary('sprint-xyz', 'MyProject\\Sprint 5', []);
    expect(result.sprintId).toBe('sprint-xyz');
    expect(result.iterationPath).toBe('MyProject\\Sprint 5');
  });
});
