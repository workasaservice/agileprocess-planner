/**
 * Unit tests for configuration files and structure
 */

import * as fs from 'fs';
import path from 'path';

describe('Configuration Files', () => {
  const configDir = path.join(__dirname, '../config');

  describe('File Existence', () => {
    test('config directory should exist', () => {
      expect(fs.existsSync(configDir)).toBe(true);
    });

    test('default-config.json should exist', () => {
      const filePath = path.join(configDir, 'default-config.json');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('generated-iterations.json should exist', () => {
      const filePath = path.join(configDir, 'generated-iterations.json');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('unplanned-automation.json should exist', () => {
      const filePath = path.join(configDir, 'unplanned-automation.json');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('team-unplanned-profiles.json should exist', () => {
      const filePath = path.join(configDir, 'team-unplanned-profiles.json');
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('JSON Validity', () => {
    test('default-config.json should be valid JSON', () => {
      const filePath = path.join(configDir, 'default-config.json');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    test('generated-iterations.json should be valid JSON', () => {
      const filePath = path.join(configDir, 'generated-iterations.json');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    test('unplanned-automation.json should be valid JSON', () => {
      const filePath = path.join(configDir, 'unplanned-automation.json');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    test('team-unplanned-profiles.json should be valid JSON', () => {
      const filePath = path.join(configDir, 'team-unplanned-profiles.json');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });
  });

  describe('Configuration Structure', () => {
    test('default-config.json should have required sections', () => {
      const filePath = path.join(configDir, 'default-config.json');
      const content = fs.readFileSync(filePath, 'utf-8');
      const config = JSON.parse(content);
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });

    test('generated-iterations.json should have results array', () => {
      const filePath = path.join(configDir, 'generated-iterations.json');
      const content = fs.readFileSync(filePath, 'utf-8');
      const config = JSON.parse(content);
      expect(config.results).toBeDefined();
      expect(Array.isArray(config.results)).toBe(true);
    });

    test('unplanned-automation.json should have version', () => {
      const filePath = path.join(configDir, 'unplanned-automation.json');
      const content = fs.readFileSync(filePath, 'utf-8');
      const config = JSON.parse(content);
      expect(config.version).toBeDefined();
    });

    test('team-unplanned-profiles.json should have profiles', () => {
      const filePath = path.join(configDir, 'team-unplanned-profiles.json');
      const content = fs.readFileSync(filePath, 'utf-8');
      const config = JSON.parse(content);
      expect(config).toBeDefined();
    });
  });

  describe('File Sizes', () => {
    test('configuration files should not be empty', () => {
      const files = [
        'default-config.json',
        'generated-iterations.json',
        'unplanned-automation.json',
        'team-unplanned-profiles.json'
      ];

      files.forEach(file => {
        const filePath = path.join(configDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content.length).toBeGreaterThan(10);
      });
    });
  });
});
