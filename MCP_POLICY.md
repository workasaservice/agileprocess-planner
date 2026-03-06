# MCP-ONLY POLICY - Architecture Enforcement

## 🔒 Core Policy

**All external API calls MUST go through Model Context Protocol (MCP) servers.**

Direct HTTP/REST calls to external services (Azure DevOps, Microsoft Graph, etc.) are **STRICTLY PROHIBITED**.

---

## ✅ ALLOWED PATTERNS

### Approved API Calls
```typescript
// ✓ CORRECT - All calls go through MCP clients
azureDevOpsMcpClient.callTool("create-work-item", { project, title, ... });
microsoftGraphMcpClient.callTool("create-user", { displayName, userPrincipalName, ... });
agileCoreClient.callTool("plan-backlog", { ... });
```

### Approved Client Methods
```typescript
// Defined in:
// - src/clients/azureDevOpsMcpClient.ts
// - src/clients/microsoftGraphRealMcpClient.ts
// - src/clients/agileCoreClient.ts

azureDevOpsMcpClient.isConfigured()
azureDevOpsMcpClient.callTool(tool, args)

microsoftGraphMcpClient.callTool(tool, args)

agileCoreClient.isConfigured()
agileCoreClient.callTool(tool, args)
```

---

## ❌ PROHIBITED PATTERNS

### Direct HTTP Libraries (BANNED)
```typescript
// ✗ WRONG - Direct axios to Azure DevOps
const response = await axios.post("https://dev.azure.com/...", { ... });

// ✗ WRONG - Direct fetch to Microsoft Graph
const response = await fetch("https://graph.microsoft.com/...", { ... });

// ✗ WRONG - Using curl in shell scripts
curl -X POST https://dev.azure.com/...

// ✗ WRONG - XMLHttpRequest or other HTTP clients
const xhr = new XMLHttpRequest();
xhr.open("POST", "https://dev.azure.com/...");
```

### Service URLs (BANNED)
```typescript
// Do NOT call these URLs directly:
❌ https://dev.azure.com/*
❌ https://graph.microsoft.com/*
❌ Any service HTTP endpoint without going through MCP
```

---

## 📋 Service to MCP Client Mapping

| Service | MCP Client | Tools |
|---------|-----------|-------|
| Azure DevOps | `azureDevOpsMcpClient` | create-work-item, list-sprints, create-sprint, ... |
| Microsoft Graph | `microsoftGraphMcpClient` | create-user, list-groups, add-group-member, ... |
| Agile Core | `agileCoreClient` | plan-backlog, plan-feature, plan-sprint |

---

## 🛡️ Why MCP-Only?

### Security
- ✓ Centralized authentication management
- ✓ No credentials in client code
- ✓ Token refresh managed by MCP server
- ✓ Secrets stored securely in MCP configuration

### Auditability
- ✓ All API calls logged through MCP
- ✓ Full request/response audit trail
- ✓ User attribution for all changes
- ✓ Compliance-ready logging

### Reliability
- ✓ Built-in rate limiting and throttling
- ✓ Automatic retry logic for transient failures
- ✓ Centralized error handling
- ✓ Connection pooling and management

### Maintainability
- ✓ Single point of change for API versions
- ✓ Centralized dependency updates
- ✓ Easy to mock for testing
- ✓ Consistent error handling

---

## 🚀 Implementation Examples

### ✓ CORRECT: Create Work Item via MCP

```typescript
import { azureDevOpsMcpClient } from "../clients/azureDevOpsMcpClient";

// This goes through MCP server
const workItem = await azureDevOpsMcpClient.callTool("create-work-item", {
  project: "MotherOps-Alpha",
  type: "Task",
  title: "Sprint Planning",
  description: "Plan sprint work",
  iterationPath: "MotherOps-Alpha\\Sprint 2026-03",
});
```

**What happens internally:**
1. Client validates arguments
2. Client sends to MCP server via stdio/HTTP
3. MCP server authenticates with Azure DevOps
4. MCP server makes the actual API call
5. MCP server logs the request/response
6. Response returns to client
7. Client returns to caller

---

### ✗ WRONG: Direct API Call (PROHIBITED)

```typescript
import axios from "axios";

// DO NOT DO THIS!
const client = axios.create({
  baseURL: "https://dev.azure.com/",
  headers: { Authorization: `Basic ${token}` },
});

const workItem = await client.post("/workasaservice/_apis/wit/workitems", {
  fields: { "System.Title": "Sprint Planning" },
});
```

**Problems:**
- ✗ Credentials hardcoded in client
- ✗ No audit logging
- ✗ No centralized error handling
- ✗ No rate limiting
- ✗ Difficult to test
- ✗ Violates MCP policy

---

## 🔍 Enforcement Mechanisms

### 1. Code Review Checklist
Before approving PRs, verify:
- [ ] No direct axios/fetch calls to service URLs
- [ ] All API calls use MCP client methods
- [ ] MCP tools are defined in appropriate client file
- [ ] Error handling uses MCP client's centralized handling

### 2. Linting Rules (ESLint)
```json
{
  "rules": {
    "no-direct-service-calls": "error"
  }
}
```

### 3. TypeScript Configuration
MCP client return types checked at compile time.
Invalid tool names will fail type checking.

### 4. Runtime Validation
If direct API calls are detected:
```typescript
throw new Error(
  "POLICY VIOLATION: Direct API call detected. " +
  "All API calls must go through MCP clients. " +
  "See MCP_POLICY.md for approved patterns."
);
```

---

## 📝 Policy Location

**Configuration File:**
- `config/unified-config.json` → `policy.api` section

**Policy Documentation:**
- `MCP_POLICY.md` (this file)

**Client Headers:**
- All client files have MCP-only policy header comments
- Each handler file references the policy

---

## 🔄 Adding New Services

When integrating a new external service:

1. **Create MCP Client**
   ```typescript
   // src/clients/newServiceMcpClient.ts
   export const newServiceMcpClient = {
     isConfigured() { /* ... */ },
     async callTool(tool: string, args: Record<string, unknown>) { /* ... */ }
   };
   ```

2. **Document in unified-config.json**
   ```json
   {
     "services": {
       "newService": {
         "mcp": {
           "tools": ["list-items", "create-item", ...]
         }
       }
     }
   }
   ```

3. **Never create direct HTTP module**
   - Don't bypass MCP

4. **Add to MCP_POLICY.md**
   - Update service table
   - Add to allowed patterns

---

## ✋ Policy Violations

### Reporting a Violation
If you find direct API calls or service bypasses:
1. Document the location (file, line)
2. Create an issue with "policy-violation" label
3. Propose refactoring to use MCP client

### Fixing a Violation
1. Locate the direct API call
2. Identify the target service
3. Use corresponding MCP client
4. Add comments explaining the change
5. Test with MCP server running

### Example Fix
```typescript
// BEFORE (Direct API - VIOLATION)
const response = await axios.post("https://dev.azure.com/...", {});

// AFTER (MCP - COMPLIANT)
const response = await azureDevOpsMcpClient.callTool("create-work-item", {
  // arguments
});
```

---

## 📚 Related Documentation

- [Agent Implementation](src/agent.ts) - Command registration
- [CLI Interface](src/cli.ts) - Command execution
- [MCP Server Setup](mcp/) - Server configuration
- [Config System](config/unified-config.json) - Service definitions

---

## 🎯 Dashboard & Monitoring

### Policy Compliance Check
```bash
npm run policy-check
```

Scans codebase for:
- ✓ Direct axios imports used for service calls
- ✓ Hardcoded service URLs
- ✓ Unvalidated HTTP client usage

### Compliance Report
```
✓ MCP Policy Compliance: 100%
  - 0 direct API calls found
  - 0 service URL bypasses detected
  - All 50+ API calls route through MCP
```

---

## 🤝 Team Guidelines

1. **Always ask:** "Should this go through MCP?"
   - If calling an external service → YES, use MCP
   - If local file I/O → OK
   - If internal utility → OK

2. **MCP is the default**
   - Assume MCP client exists
   - If not, create one before implementation
   - Never workaround with direct calls

3. **Share MCP patterns**
   - When creating new client, document the tools
   - Update this policy file
   - Review examples with team

4. **Keep credentials out of code**
   - All service credentials in MCP config files
   - Client code has NO secrets
   - Even PAT tokens stay in mcp/*.json

---

## 📞 Questions?

- **MCP client question?** Check the client file header
- **Service integration question?** See "Adding New Services"
- **Policy clarification?** Review approved/prohibited patterns
- **Unsure?** Default to MCP, then verify

---

**Last Updated:** 2026-03-04  
**Policy Version:** 1.0  
**Status:** ACTIVE ENFORCEMENT
