/**
 * Jest setup file for all tests
 */

// Setup environment variables for tests
process.env.AZURE_DEVOPS_ORG = 'workasaservice';
process.env.AZURE_DEVOPS_PAT = 'test-pat-token';
process.env.AZURE_DEVOPS_MCP_SERVER_URL = 'http://localhost:8000';
process.env.AZURE_DEVOPS_MCP_TOKEN = 'test-mcp-token';
process.env.NODE_ENV = 'test';

// Note: Do NOT mock fs globally - tests need real fs access for structure validation

beforeAll(() => {
  // Keep console output for test reporting
});

afterAll(() => {
  // Nothing to restore
});

// Clear all mocks after each test
afterEach(() => {
  jest.clearAllMocks();
});
