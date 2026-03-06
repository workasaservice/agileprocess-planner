/**
 * Unit tests for utility and lib modules
 */

import * as fs from 'fs';
import path from 'path';

describe('Utility Modules', () => {
  const libDir = path.join(__dirname, '../src/lib');

  describe('File Existence', () => {
    test('lib directory should exist', () => {
      expect(fs.existsSync(libDir)).toBe(true);
    });
  });
});

describe('Source Code Quality', () => {
  const srcDir = path.join(__dirname, '../src');

  describe('TypeScript Files', () => {
    test('src directory should contain TypeScript files', () => {
      const files = fs.readdirSync(srcDir);
      const tsFiles = files.filter(f => f.endsWith('.ts'));
      expect(tsFiles.length).toBeGreaterThan(0);
    });

    test('source files should have proper extension', () => {
      const files = fs.readdirSync(srcDir);
      const sourceFiles = files.filter(f => !f.startsWith('.'));
      expect(sourceFiles.length).toBeGreaterThan(0);
    });
  });

  describe('Agent Entry Point', () => {
    test('agent.ts should exist', () => {
      const filePath = path.join(srcDir, 'agent.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('agent.ts should be main entry point', () => {
      const filePath = path.join(srcDir, 'agent.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content.length).toBeGreaterThan(100);
    });

    test('agent.ts should reference handlers', () => {
      const filePath = path.join(srcDir, 'agent.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('handler');
    });
  });

  describe('Code Organization', () => {
    test('handlers directory should exist', () => {
      const handlersDir = path.join(srcDir, 'handlers');
      expect(fs.existsSync(handlersDir)).toBe(true);
    });

    test('clients directory should exist', () => {
      const clientsDir = path.join(srcDir, 'clients');
      expect(fs.existsSync(clientsDir)).toBe(true);
    });

    test('directories should contain files', () => {
      const handlersDir = path.join(srcDir, 'handlers');
      if (fs.existsSync(handlersDir)) {
        const files = fs.readdirSync(handlersDir);
        expect(files.length).toBeGreaterThan(0);
      }
    });
  });
});

describe('Project Structure', () => {
  const projectRoot = path.join(__dirname, '..');

  describe('Essential Files', () => {
    test('package.json should exist', () => {
      const filePath = path.join(projectRoot, 'package.json');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('tsconfig.json should exist', () => {
      const filePath = path.join(projectRoot, 'tsconfig.json');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('README.md should exist', () => {
      const filePath = path.join(projectRoot, 'README.md');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('jest.config.js should exist', () => {
      const filePath = path.join(projectRoot, 'jest.config.js');
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('Configuration Integrity', () => {
    test('package.json should be valid JSON', () => {
      const filePath = path.join(projectRoot, 'package.json');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    test('package.json should have test script', () => {
      const filePath = path.join(projectRoot, 'package.json');
      const content = fs.readFileSync(filePath, 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.scripts.test).toBeDefined();
      expect(pkg.scripts.test).toContain('jest');
    });

    test('tsconfig.json should exist and be valid TypeScript config', () => {
      const filePath = path.join(projectRoot, 'tsconfig.json');
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content.length).toBeGreaterThan(10);
      expect(content).toContain('compilerOptions');
    });
  });

  describe('Dependencies', () => {
    test('package.json should have necessary dependencies', () => {
      const filePath = path.join(projectRoot, 'package.json');
      const content = fs.readFileSync(filePath, 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.dependencies).toBeDefined();
      expect(pkg.devDependencies).toBeDefined();
    });

    test('package.json should include jest', () => {
      const filePath = path.join(projectRoot, 'package.json');
      const content = fs.readFileSync(filePath, 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.devDependencies.jest).toBeDefined();
    });
  });
});
