# AgilePlanner

AgileProcess Planner agent for turning requirements, features, and sprint goals into backlog-ready output, plus Azure AD user management and team provisioning.

## What it does
- Plans a backlog from requirements text or a requirements file.
- Splits a feature into user stories and tasks.
- Assists sprint planning using goals, scope, and constraints.
- **Creates Azure AD users** and provisions accounts.
- **Assigns users to Azure AD security groups**.
- **Assigns users to Azure DevOps teams**.

# Demo Video

[![Watch the video](./thumbnail.png)](https://send.workasaservice.ai/share/v10vwi2hw4jlwtrq3ig21qi6sscbt8aj)

Link - https://send.workasaservice.ai/share/v10vwi2hw4jlwtrq3ig21qi6sscbt8aj

## Setup
1. Install dependencies: `npm install`
2. Copy and edit environment variables: `cp .env.example .env`
3. Generate a local user file from the sample: `bash scripts/generate-users.sh`
4. Update config defaults in `config/default-config.json` (optional).

> **Security note:** `users.json` is excluded from git. Never commit files containing real email addresses, passwords, or tokens. See [SECURITY.md](SECURITY.md) for guidance.

## Configuration

🔐 **All credentials must be configured via environment variables in `.env` file.**

### Azure AD / Microsoft Graph (User Management)
**Required environment variables:**
- `AZURE_TENANT_ID` - Your Azure AD tenant ID
- `AZURE_CLIENT_ID` - Service principal client ID with User.ReadWrite.All and Group.ReadWrite.All permissions
- `AZURE_CLIENT_SECRET` - Service principal secret

Optional:
- `AZURE_GRAPH_SCOPE` (default: `https://graph.microsoft.com/.default`)

### Azure DevOps (Work Items & Team Management)
**Required environment variables:**
- `AZURE_DEVOPS_ORG_URL` - Your Azure DevOps organization URL (e.g., `https://dev.azure.com/yourorg`)
- `AZURE_DEVOPS_PAT` - Personal Access Token with appropriate permissions

### AgileProcess Core (Planning Features)
**Optional environment variables:**
- `OPS360_AGILE_CORE_BASE_URL`
- `OPS360_AGILE_CORE_API_KEY` (if required by the API)
- `OPS360_AGILE_CORE_TIMEOUT_MS`

## 🔒 MCP-Only Architecture Policy

**All external API calls must go through Model Context Protocol (MCP) servers.**

This system enforces a strict MCP-only policy for all interactions with external services:

✅ **ALLOWED:**
```typescript
azureDevOpsMcpClient.callTool("create-work-item", { ... })
microsoftGraphMcpClient.callTool("create-user", { ... })
agileCoreClient.callTool("plan-backlog", { ... })
```

❌ **PROHIBITED:**
```typescript
// Direct HTTP calls to Azure DevOps
axios.post("https://dev.azure.com/...", { ... })

// Direct API calls to Microsoft Graph
fetch("https://graph.microsoft.com/...", { ... })

// Any service bypassing MCP
curl https://dev.azure.com/...
```

**Why?** MCP provides:
- ✓ Centralized authentication & credential management
- ✓ Comprehensive request/response logging & audit trails
- ✓ Rate limiting, throttling, and error handling
- ✓ Token refresh management
- ✓ Security & compliance

**See [MCP_POLICY.md](MCP_POLICY.md) for full enforcement details and patterns.**

## Commands

### Work Item Management
These handlers are available for Azure DevOps work items:
- `create-devops-items` - Create hierarchical work items (Epic → Feature → User Story → Task)
- `create-backlog-items` - Create flat backlog items from JSON
- `create-sprint-items` - Create sprint-assigned user stories

### Sprint Ceremony Requirement (MotherOps SAFe)
- Required parent stories per sprint: `Meetings - <SprintName>` and `UnPlanned - <SprintName>`.
- All ceremony tasks must be children of the `Meetings` parent story.
- All contingency/buffer tasks must be children of the `UnPlanned` parent story.
- `Unparented Items` should not contain ceremony or contingency tasks after seeding.
- Neon-backed defaults for sprint templates should mirror this hierarchy so future automation runs remain consistent.

### Planning (via AgileProcess Core API)
- `plan-backlog` - Generate backlog plans from requirements
- `plan-feature` - Break features into stories/tasks
- `plan-sprint` - Sprint planning assistance

### Azure AD User Management
- `create-users` - Create Azure AD user accounts
- `assign-users-to-groups` - Assign users to Azure AD security groups
- `assign-users-to-devops-teams` - Assign users to Azure DevOps teams

## Usage Examples

### Creating Azure AD Users

🔒 **Secure User Creation Process:**

1. **Create a `users.json` file** with user definitions:
```json
{
  "_security_note": "For production: store passwords in users.credentials.json (git-ignored)",
  "users": [
    {
      "displayName": "John Doe",
      "userPrincipalName": "john.doe@yourdomain.com",
      "mailNickname": "johndoe",
      "givenName": "John",
      "surname": "Doe",
      "jobTitle": "Software Engineer",
      "department": "Engineering",
      "passwordProfile": {
        "password": "***HIDDEN***",
        "forceChangePasswordNextSignIn": true
      },
      "groups": ["Engineering Team"],
      "devOpsTeams": ["Development Team"]
    }
  ]
}
```

2. **For production: Create `users.credentials.json`** (git-ignored) with actual passwords:
```json
{
  "credentials": [
    {
      "displayName": "John Doe",
      "userPrincipalName": "john.doe@yourdomain.com",
      "password": "YourSecurePassword123!"
    }
  ]
}
```

2. **Create users securely:**
```bash
# Using MCP protocol (recommended)
npm run create-users-mcp users.json

# Or using CLI
npm run cli create-users --file users.json
```

3. **Validate setup:**
```bash
# Test Azure AD connection
npm run validate-graph-mcp

# Test MCP protocol
npm run test-mcp-protocol
```

3. **Assign users to Azure AD groups:**
```bash
npm run cli assign-users-to-groups --file users.json
```

4. **Assign users to Azure DevOps teams:**
```bash
npm run cli assign-users-to-devops-teams --file users.json
```

## Validation & Testing

**Security & Connection Validation:**
```bash
# Validate Azure AD/Microsoft Graph setup
npm run validate-graph-mcp

# Test MCP protocol functionality  
npm run test-mcp-protocol

# Validate Azure DevOps MCP connection
npm run validate-mcp
```

### Creating Work Items

Using the smart CLI (natural language):
```bash
npm run go "Create user stories from devops-backlog.json"
npm run go "Create tasks from input.json for sprint Sprint 1"
```

Using direct commands:
```bash
npm run cli create-backlog-items --file devops-backlog.json
npm run cli create-sprint-items --file input.json --sprint "Sprint 1"
```

## Documentation Output

All operations generate detailed markdown reports in the `docs/` folder:
- `users-created-*.md` - User creation results with IDs and portal links
- `group-assignments-*.md` - Azure AD group assignment results
- `devops-team-assignments-*.md` - Azure DevOps team assignment results  
- `backlog-created-*.md` - Work item creation summaries

Public API contract is in contracts/agileprocess-core.openapi.yaml.
Detailed usage docs are maintained in the private AgileProcessCore repo.

## Development
- Build: `npm run build`
- Run (ts-node): `npm run dev`
- Run (compiled): `npm run start`

## Testing

The project includes a comprehensive Jest test suite covering handlers, clients, configurations, and project structure.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Test Coverage

The test suite validates:
- **Handlers** (4 test suites): Handler implementations, MCP compliance, dry-run support
- **Clients** (7 tests): Client modules, MCP policy headers, error handling
- **Configuration** (9 tests): Configuration file validity, JSON structure
- **Project Structure** (40+ tests): File organization, dependencies, TypeScript setup

**Current Test Status:** ✅ 60/60 tests passing

### Test Files

Test files are located in the `tests/` directory:
- `handlers.test.ts` - Handler interface and implementation tests
- `clients.test.ts` - Client module validation tests
- `configuration.test.ts` - Configuration file structure tests
- `projectStructure.test.ts` - Project organization and setup tests
- `setup.ts` - Jest global test setup and environment configuration

### Key Test Principles

1. **MCP Policy Enforcement**: All tests verify that handlers use `azureDevOpsMcpClient` exclusively
2. **Configuration Validation**: Tests ensure all configuration files are valid JSON and properly structured
3. **Structure Validation**: Tests verify project organization and required file existence
4. **TypeScript Compliance**: Tests validate TypeScript configuration and type safety

## CLI
After building, you can run:
```
ops360-ai --help
```
The CLI binary name remains ops360-ai until the package is renamed.
```
ops360-ai plan-backlog '{"requirements":"docs/Requirements.md"}'
```
Or via ts-node:
```
npm run cli -- plan-backlog '{"requirements":"docs/Requirements.md"}'
```

## Notes
This repo provides the agent core and API client wiring. The runtime host is expected to call `activateAgent()` and route inputs to the command handlers.
