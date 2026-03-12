# Configuration Architecture

**Date**: March 4, 2026  
**Version**: 1.0  
**Purpose**: Modular, normalized configuration system with referential integrity

---

## Overview

The configuration system uses a **modular, linked structure** where data is normalized across separate files with referential integrity via ID fields. This ensures:

- **Single source of truth** — Each entity defined once (e.g., roles, users, capacity)
- **Reduced duplication** — No copy-paste of role definitions or capacity factors
- **Referential integrity** — All IDs are consistent across files
- **Maintainability** — Changes in one file automatically propagate via ID links
- **Scalability** — Easy to add new users, roles, or projects

### Sprint Hierarchy Requirement (MotherOps)

For sprint ceremony automation, the required backlog shape per sprint is:

- Parent user story: `Meetings - <SprintName>`
- Parent user story: `UnPlanned - <SprintName>`
- Ceremony tasks must be created under `Meetings`
- Contingency/buffer tasks must be created under `UnPlanned`
- Avoid leaving ceremony/contingency tasks in `Unparented Items`

---

## File Structure

```
config/
├── users.json              # User records with role and project references (via IDs)
├── roles.json              # Role definitions with capacity and activity info
├── capacity.json           # Capacity matrix (hours/sprint per user+role)
├── projects.json           # Azure DevOps projects, teams, member lists
├── unified-config.json     # Consolidated service configs (agent, services, validation)
├── generated-iterations.json  # OUTPUT: Auto-generated sprint iterations
└── README.md               # This file

root/
└── users.credentials.json  # CREDENTIALS (git-ignored): Passwords linked via userId
```

---

## Key Files

### 📄 config/users.json

**Purpose**: Central user registry  
**Primary Key**: `userId` (e.g., "tom-baker")  
**Records**: 16 users

**Structure**:
```json
{
  "users": [
    {
      "userId": "tom-baker",
      "displayName": "Tom Baker",
      "userPrincipalName": "tom.baker@workasaservice.ai",
      "roleId": "product-dad",              // Link to roles.json
      "projectIds": ["MotherOps-Alpha"],   // Link to projects.json
      ...
    }
  ]
}
```

**Key Fields**:
- **userId** — Unique identifier (kebab-case, used everywhere)
- **roleId** — Links to `roles.json` (not embedded)
- **projectIds** — Array of project IDs (links to `projects.json`)
- **Azure AD fields** — displayName, userPrincipalName, mailNickname, givenName, surname, jobTitle, department, usageLocation, accountEnabled

**Used by**:
- `src/handlers/createUsers.ts` — Creates Azure AD users
- `config/capacity.json` — Links capacity records to users
- `config/projects.json` — Lists project members

---

### 📄 config/roles.json

**Purpose**: Role definitions  
**Primary Key**: `roleId` (e.g., "product-dad")  
**Records**: 16 roles

**Structure**:
```json
{
  "roles": [
    {
      "roleId": "product-dad",
      "roleName": "Product Dad",
      "subtitle": "Sets Goals",
      "defaultFocusFactor": 0.6,
      "defaultActivity": "Product Management"
    }
  ]
}
```

**Key Fields**:
- **roleId** — Unique identifier for role
- **roleName**, **subtitle** — Display name and description
- **defaultFocusFactor** — Hours multiplier (0.4 = 32 hrs/sprint, 0.7 = 56 hrs/sprint)
- **defaultActivity** — Primary work activity/type

**Used by**:
- `config/users.json` — References roleId for each user
- `config/capacity.json` — References roleId for capacity calculations

---

### 📄 config/capacity.json

**Purpose**: Capacity planning matrix  
**Primary Keys**: `userId` + `roleId`  
**Records**: 16 (one per user)

**Structure**:
```json
{
  "capacity": [
    {
      "userId": "tom-baker",           // Link to users.json
      "roleId": "product-dad",         // Link to roles.json
      "focusFactor": 0.6,
      "productiveHoursPerSprint": 48,
      "totalCapacityHours": 48
    }
  ]
}
```

**Key Fields**:
- **userId**, **roleId** — Links to other files
- **focusFactor** — Percentage of full capacity (0.0-1.0)
- **productiveHoursPerSprint** — Calculated: focusFactor × 80 hours

**Used by**:
- Capacity planning and workload distribution
- Resource allocation tools
- Sprint planning automation

---

### 📄 config/projects.json

**Purpose**: Azure DevOps project/team structure  
**Primary Key**: `projectId` (e.g., "MotherOps-Alpha")  
**Records**: 2 projects (Alpha and Beta)

**Structure**:
```json
{
  "projects": [
    {
      "projectId": "MotherOps-Alpha",
      "projectName": "MotherOps-Alpha",
      "teamId": "0f7bfd25-797d-4d11-85fd-9030440a6565",
      "teamName": "MotherOps-Alpha Team",
      "members": ["tom-baker", "kate-baker", ...],  // Links to users.json (by userId)
      "iterations": [
        {
          "sprintName": "Sprint 2026-03-09",
          "iterationId": "0fa0857b-8f5e-4833-aaeb-1718b49bd349",
          "startDate": "2026-03-09",
          "finishDate": "2026-03-20"
        }
      ]
    }
  ]
}
```

**Key Fields**:
- **projectId** — Azure DevOps project identifier
- **teamId** — Azure DevOps team GUID
- **members** — Array of userId values (links to `users.json`)
- **iterations** — Array of sprint/iteration info

**Used by**:
- MCP client for Azure DevOps operations
- Team member assignment
- Iteration/sprint management

---

### 📄 config/unified-config.json

**Purpose**: Consolidated service configurations  
**Replaces**: `default-config.json` + `capacity-automation.json`

**Structure**:
```json
{
  "agent": { ... },           // Agent definition and commands
  "services": {               // External service configs
    "agileCore": { ... },
    "microsoftGraph": { ... },
    "azureDevOps": { ... }
  },
  "sprints": { ... },         // Sprint automation settings
  "validation": { ... },      // Validation rules
  "security": { ... },        // Security policies
  "configuration": { ... }    // Configuration sources
}
```

**Sections**:
- **agent** — Command list, agent metadata
- **services** — Credentials placeholders, endpoints for external services
- **sprints** — Schedule, projects, execution mode
- **validation** — Validation rules for sprints, users
- **security** — MCP-only policy, credentials separation
- **configuration** — Maps data sources to files

**Used by**:
- `src/agent.ts` — Loads service configs and command registry
- `src/handlers/*` — Reference service endpoints and settings

---

### 📄 users.credentials.json (git-ignored)

**Purpose**: Store passwords separately from user data  
**Primary Key**: `userId` — **Same as in users.json**  
**Records**: 16 credentials

**Structure**:
```json
{
  "credentials": [
    {
      "userId": "user-id",
      "userPrincipalName": "user@example.com",
      "password": "SecurePassword123!"
    }
  ]
}
```

**Security**:
- ✅ Git-ignored (NOT checked into version control)
- ✅ Passwords ONLY (other data comes from `config/users.json`)
- ✅ Linked via userId for safe joining

**Used by**:
- `src/handlers/createUsers.ts` — Joins with `config/users.json` on userId

---

## Referential Integrity

### ID Links (How files reference each other)

```
users.json
├─ roleId ─────────────────→ roles.json (roleId)
└─ projectIds ─────────────→ projects.json (projectId[])

capacity.json
├─ userId ─────────────────→ users.json (userId)
└─ roleId ─────────────────→ roles.json (roleId)

projects.json
└─ members: userId[] ──────→ users.json (userId)

users.credentials.json
└─ userId ─────────────────→ users.json (userId)
```

### Example: Complete User Record

User "Tom Baker" is represented across THREE files:

**config/users.json**:
```json
{
  "userId": "tom-baker",
  "displayName": "Tom Baker",
  "userPrincipalName": "tom.baker@workasaservice.ai",
  "roleId": "product-dad",
  "projectIds": ["MotherOps-Alpha"]
}
```

**config/roles.json** (referenced by roleId):
```json
{
  "roleId": "product-dad",
  "roleName": "Product Dad",
  "defaultFocusFactor": 0.6
}
```

**config/capacity.json** (linked by userId + roleId):
```json
{
  "userId": "tom-baker",
  "roleId": "product-dad",
  "focusFactor": 0.6,
  "productiveHoursPerSprint": 48
}
```

**config/projects.json** (referenced in members array):
```json
{
  "projectId": "MotherOps-Alpha",
  "members": ["tom-baker", ...],  // Tom is member of Alpha
  ...
}
```

**users.credentials.json** (linked by userId):
```json
{
  "userId": "user-id",
  "userPrincipalName": "user@example.com",
  "password": "SecurePassword123!"
}
```

---

## Loading Configuration

### In Code

**Example: Load all configurations into memory**:
```typescript
// src/agent.ts or config loader helper
import users from '../config/users.json';
import roles from '../config/roles.json';
import capacity from '../config/capacity.json';
import projects from '../config/projects.json';
import credentials from '../users.credentials.json';

// Build lookup maps for fast access
const userMap = new Map(users.users.map(u => [u.userId, u]));
const roleMap = new Map(roles.roles.map(r => [r.roleId, r]));
const capacityMap = new Map(capacity.capacity.map(c => [c.userId, c]));
const credMap = new Map(credentials.credentials.map(c => [c.userId, c]));

// Join user data when creating users
const userWithCreds = {
  ...userMap.get('tom-baker'),
  ...credMap.get('tom-baker')  // Add password
};
```

---

## Migration from Old Structure

### Old files (replaceable):
- ✅ users.json (root) → migrated to config/users.json
- ✅ capacity (root) → migrated to config/capacity.json
- ✅ config/default-config.json → merged into config/unified-config.json
- ✅ config/capacity-automation.json → merged into config/unified-config.json

### Files to keep:
- ✅ users.credentials.json (updated with userId field, git-ignored)
- ✅ config/users.json (new, replaces root users.json)
- ✅ config/roles.json (new)
- ✅ config/capacity.json (new, replaces root capacity)
- ✅ config/projects.json (new)
- ✅ config/unified-config.json (new, replaces two old files)

---

## Validation

### Consistency Checks

To verify referential integrity:

```bash
# Check all roleIds in users.json exist in roles.json
jq -r '.users[].roleId' config/users.json | sort -u > /tmp/used_roles
jq -r '.roles[].roleId' config/roles.json | sort -u > /tmp/defined_roles
diff /tmp/defined_roles /tmp/used_roles

# Check all userIds in capacity.json exist in users.json
jq -r '.capacity[].userId' config/capacity.json | sort -u > /tmp/capacity_users
jq -r '.users[].userId' config/users.json | sort -u > /tmp/defined_users
diff /tmp/defined_users /tmp/capacity_users

# Check all projectIds in users.json are in projects.json
jq -r '.users[]|.projectIds[]' config/users.json | sort -u > /tmp/user_projects
jq -r '.projects[].projectId' config/projects.json | sort -u > /tmp/defined_projects
diff /tmp/defined_projects /tmp/user_projects
```

---

## Best Practices

1. **Never embed data** — Use IDs to link between files
2. **Single source of truth** — Define each entity once (e.g., role definition in roles.json only)
3. **Keep credentials separate** — Passwords only in git-ignored users.credentials.json
4. **Validate on load** — Check referential integrity when loading config
5. **Use helper functions** — Create config loader that joins data as needed
6. **Document linking** — Comment on which fields are IDs that link to other files

---

## Change Examples

### Add a new user

1. Add to `config/users.json`:
   ```json
   { "userId": "new-user", "roleId": "head-chef", "projectIds": ["MotherOps-Beta"], ... }
   ```

2. Add to `config/capacity.json`:
   ```json
   { "userId": "new-user", "roleId": "head-chef", "focusFactor": 0.7, ... }
   ```

3. Update `config/projects.json` (add "new-user" to MotherOps-Beta members array)

4. Add to `users.credentials.json`:
   ```json
   { "userId": "new-user", "userPrincipalName": "new-user@...", "password": "..." }
   ```

### Update a role

1. Edit `config/roles.json` (change one entry)
2. No other files need changes — all references are via roleId

### Add a new project

1. Add to `config/projects.json`:
   ```json
   { "projectId": "NewProject", "teamId": "...", "members": [...], ... }
   ```

2. Update relevant users in `config/users.json` (add projectId to projectIds array)

---

## Related Documentation

- [MCP_ONLY_POLICY.md](../docs/MCP_ONLY_POLICY.md) — MCP-only architecture enforcement
- [SPRINT_AUTOMATION.md](../docs/SPRINT_AUTOMATION.md) — Year-long sprint automation guide
- [COMPLIANCE_REPORT.md](../docs/COMPLIANCE_REPORT.md) — MCP compliance verification

---

## Summary

This modular configuration approach provides:
- ✅ Single source of truth for each entity type
- ✅ Referential integrity via ID linking
- ✅ Credential separation (git-ignored)
- ✅ Easy maintenance and scaling
- ✅ Clear separation of concerns
- ✅ Reduced data duplication

All 16 users, 2 projects, 16 roles, and 16 capacity records are now normalized and linked via consistent ID fields.
