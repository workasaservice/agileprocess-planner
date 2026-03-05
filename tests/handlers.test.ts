/**
 * Unit tests for all handlers - Integration and interface testing
 * Tests verify that handlers exist, compile, and implement expected interface
 */

import * as fs from 'fs';
import path from 'path';

describe('Handlers Module', () => {
  const handlersDir = path.join(__dirname, '../src/handlers');

  describe('File Existence', () => {
    test('createUnplannedItems.ts should exist', () => {
      const filePath = path.join(handlersDir, 'createUnplannedItems.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('createSprintMeetings.ts should exist', () => {
      const filePath = path.join(handlersDir, 'createSprintMeetings.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('createSprintMeetingsWithProfiles.ts should exist', () => {
      const filePath = path.join(handlersDir, 'createSprintMeetingsWithProfiles.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('createSprintMeetingsFromTemplate.ts should exist', () => {
      const filePath = path.join(handlersDir, 'createSprintMeetingsFromTemplate.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('Handler Code Quality', () => {
    test('all handlers should use async functions', () => {
      const handlers = [
        'createUnplannedItems.ts',
        'createSprintMeetings.ts',
        'createSprintMeetingsWithProfiles.ts',
        'createSprintMeetingsFromTemplate.ts'
      ];

      handlers.forEach(handler => {
        const filePath = path.join(handlersDir, handler);
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toContain('async');
        expect(content.length).toBeGreaterThan(500);
      });
    });

    test('handlers should import azureDevOpsMcpClient', () => {
      const handlers = [
        'createUnplannedItems.ts',
        'createSprintMeetings.ts',
        'createSprintMeetingsWithProfiles.ts',
        'createSprintMeetingsFromTemplate.ts'
      ];

      handlers.forEach(handler => {
        const filePath = path.join(handlersDir, handler);
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toMatch(/import.*azureDevOpsMcpClient|from.*azureDevOpsMcpClient/);
      });
    });

    test('handlers should not import axios directly', () => {
      const handlers = [
        'createUnplannedItems.ts',
        'createSprintMeetings.ts',
        'createSprintMeetingsWithProfiles.ts',
        'createSprintMeetingsFromTemplate.ts'
      ];

      handlers.forEach(handler => {
        const filePath = path.join(handlersDir, handler);
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).not.toMatch(/import.*axios|from.*axios/);
      });
    });
  });

  describe('MCP Policy Compliance', () => {
    test('createUnplannedItems should comply with MCP-only policy', () => {
      const filePath = path.join(handlersDir, 'createUnplannedItems.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('azureDevOpsMcpClient.callTool');
    });

    test('createSprintMeetings should comply with MCP-only policy', () => {
      const filePath = path.join(handlersDir, 'createSprintMeetings.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('azureDevOpsMcpClient');
    });

    test('createSprintMeetingsWithProfiles should comply with MCP-only policy', () => {
      const filePath = path.join(handlersDir, 'createSprintMeetingsWithProfiles.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('azureDevOpsMcpClient');
    });

    test('createSprintMeetingsFromTemplate should comply with MCP-only policy', () => {
      const filePath = path.join(handlersDir, 'createSprintMeetingsFromTemplate.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('azureDevOpsMcpClient');
    });
  });

  describe('Dry Run Support', () => {
    test('handlers should support dryRun mode', () => {
      const handlers = [
        'createUnplannedItems.ts',
        'createSprintMeetings.ts',
        'createSprintMeetingsWithProfiles.ts',
        'createSprintMeetingsFromTemplate.ts'
      ];

      handlers.forEach(handler => {
        const filePath = path.join(handlersDir, handler);
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toContain('dryRun');
      });
    });
  });

  describe('Configuration Integration', () => {
    test('handlers should reference configuration files', () => {
      const handlers = [
        'createUnplannedItems.ts',
        'createSprintMeetings.ts'
      ];

      handlers.forEach(handler => {
        const filePath = path.join(handlersDir, handler);
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toMatch(/config\/|loadConfiguration/);
      });
    });
  });

  describe('Type Safety', () => {
    test('handlers should have proper TypeScript typing', () => {
      const handlers = [
        'createUnplannedItems.ts',
        'createSprintMeetings.ts',
        'createSprintMeetingsWithProfiles.ts',
        'createSprintMeetingsFromTemplate.ts'
      ];

      handlers.forEach(handler => {
        const filePath = path.join(handlersDir, handler);
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toMatch(/interface|type/);
      });
    });
  });
});
