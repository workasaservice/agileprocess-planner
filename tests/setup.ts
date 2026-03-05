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

// Auto-suppress console output during tests
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
  // Keep console for test reporting
  // console.log = jest.fn();
  // console.error = jest.fn();
  // console.warn = jest.fn();
});

afterAll(() => {
  // console.log = originalLog;
  // console.error = originalError;
  // console.warn = originalWarn;
});

// Clear all mocks after each test
afterEach(() => {
  jest.clearAllMocks();
});
