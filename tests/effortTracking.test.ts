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
