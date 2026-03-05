/**
 * Unit tests for client modules
 */

import * as fs from 'fs';
import path from 'path';

describe('Client Modules', () => {
  const clientsDir = path.join(__dirname, '../src/clients');

  describe('File Existence', () => {
    test('clients directory should exist', () => {
      expect(fs.existsSync(clientsDir)).toBe(true);
    });

    test('azureDevOpsMcpClient.ts should exist', () => {
      const filePath = path.join(clientsDir, 'azureDevOpsMcpClient.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('agileCoreClient.ts should exist', () => {
      const filePath = path.join(clientsDir, 'agileCoreClient.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('microsoftGraphRealMcpClient.ts should exist', () => {
      const filePath = path.join(clientsDir, 'microsoftGraphRealMcpClient.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('MCP Policy Warnings', () => {
    test('azureDevOpsMcpClient should have MCP policy header', () => {
      const filePath = path.join(clientsDir, 'azureDevOpsMcpClient.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toMatch(/MCP.*POLICY|MCP.*ONLY|MCP.*EXCLUSIVE/i);
    });

    test('agileCoreClient should have MCP policy header', () => {
      const filePath = path.join(clientsDir, 'agileCoreClient.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toMatch(/MCP.*POLICY|MCP.*ONLY|MCP.*EXCLUSIVE/i);
    });

    test('microsoftGraphRealMcpClient should have MCP policy header', () => {
      const filePath = path.join(clientsDir, 'microsoftGraphRealMcpClient.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toMatch(/MCP.*POLICY|MCP.*ONLY|MCP.*EXCLUSIVE/i);
    });
  });

  describe('Client Code Quality', () => {
    test('azureDevOpsMcpClient should be properly formatted', () => {
      const filePath = path.join(clientsDir, 'azureDevOpsMcpClient.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content.length).toBeGreaterThan(500);
      expect(content).toContain('export');
    });

    test('clients should have error handling', () => {
      const clients = [
        'azureDevOpsMcpClient.ts',
        'agileCoreClient.ts'
      ];

      clients.forEach(client => {
        const filePath = path.join(clientsDir, client);
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toMatch(/throw|Error|catch|try/);
      });
    });

    test('clients should use async patterns', () => {
      const clients = [
        'azureDevOpsMcpClient.ts',
        'agileCoreClient.ts'
      ];

      clients.forEach(client => {
        const filePath = path.join(clientsDir, client);
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toMatch(/async|await|Promise/);
      });
    });
  });

  describe('Exports', () => {
    test('azureDevOpsMcpClient should export client object', () => {
      const filePath = path.join(clientsDir, 'azureDevOpsMcpClient.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toMatch(/export.*azureDevOpsMcpClient|export const.*azureDevOpsMcpClient/);
    });

    test('agileCoreClient should export client', () => {
      const filePath = path.join(clientsDir, 'agileCoreClient.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toMatch(/export/);
    });
  });

  describe('Configuration', () => {
    test('clients should reference configuration', () => {
      const filePath = path.join(clientsDir, 'azureDevOpsMcpClient.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toMatch(/config|Config|CONFIG|environment/);
    });

    test('clients should validate configuration', () => {
      const filePath = path.join(clientsDir, 'azureDevOpsMcpClient.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toMatch(/configured|isConfigured|configure/);
    });
  });
});
