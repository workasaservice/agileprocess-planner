# Configuration Setup Guide

## Overview
This project requires several JSON configuration files that are gitignored (not committed to version control) because they contain environment-specific and potentially sensitive data.

## Quick Setup

Run the setup script to create config files from templates:

```bash
./scripts/setup-config.sh
```

This will create the following files from their `.sample` counterparts if they don't already exist:
- `config/users.json`
- `config/roles.json`
- `config/capacity.json`
- `config/projects.json`
- `users.credentials.json`

## Configuration Files

### config/users.json
Defines users in the system with their Azure AD profile information.

**Structure:**
```json
{
  "users": [
    {
      "userId": "unique-id",
      "displayName": "Full Name",
      "userPrincipalName": "email@domain.com",
      "mailNickname": "emailalias",
      "givenName": "First",
      "surname": "Last",
      "jobTitle": "Title",
      "department": "Department",
      "usageLocation": "US",
      "accountEnabled": true,
      "roleId": "reference-to-role",
      "projectIds": ["project-1", "project-2"]
    }
  ]
}
```

### config/roles.json
Defines roles with capacity planning defaults.

**Structure:**
```json
{
  "roles": [
    {
      "roleId": "unique-role-id",
      "roleName": "Developer",
      "subtitle": "Brief description",
      "description": "Detailed description",
      "defaultFocusFactor": 0.7,
      "defaultActivity": "Primary activity"
    }
  ]
}
```

**Key Fields:**
- `defaultFocusFactor`: Percentage of time available for focused work (0.0-1.0)

### config/capacity.json
Tracks individual user capacity per sprint.

**Structure:**
```json
{
  "capacity": [
    {
      "userId": "user-id",
      "roleId": "role-id",
      "focusFactor": 0.7,
      "productiveHoursPerSprint": 56,
      "totalCapacityHours": 80
    }
  ]
}
```

**Key Fields:**
- `focusFactor`: User's focus factor (overrides role default)
- `productiveHoursPerSprint`: Available hours per sprint for productive work
- `totalCapacityHours`: Total available hours per sprint

### config/projects.json
Defines Azure DevOps projects and team structure.

**Structure:**
```json
{
  "projects": [
    {
      "projectId": "azure-devops-project-id",
      "projectName": "ShortName",
      "projectFullName": "Full Project Name",
      "organization": "azure-devops-org",
      "teamId": "team-guid",
      "teamName": "Team Name",
      "members": ["user-id-1", "user-id-2"],
      "iterations": [
        {
          "sprintName": "Sprint 1",
          "iterationPath": "ProjectName\\Sprint 1",
          "iterationId": "iteration-guid",
          "startDate": "2024-01-01",
          "finishDate": "2024-01-14"
        }
      ]
    }
  ]
}
```

### users.credentials.json
**⚠️ SENSITIVE - Keep Secure**

Stores temporary user passwords for automated user creation.

**Structure:**
```json
{
  "credentials": [
    {
      "userId": "user-id",
      "userPrincipalName": "user@domain.com",
      "password": "SecurePassword123!"
    }
  ]
}
```

**Security Notes:**
- This file is gitignored - never commit it
- Use strong passwords
- Rotate credentials regularly
- Consider using environment variables for production

## Verification

After setup, verify your configuration:

```bash
npm test
```

All 129 tests should pass if configuration files are properly formatted.

## Troubleshooting

### Tests fail with "ENOENT: no such file"
Run the setup script: `./scripts/setup-config.sh`

### Tests fail with parsing errors
Check JSON syntax - use a JSON validator or `cat config/file.json | jq .`

### Tests fail with "No role found for roleId"
Ensure `roleId` in users.json matches a `roleId` in roles.json

### Tests fail with permission errors on setup script
Make it executable: `chmod +x scripts/setup-config.sh`

## Environment Variables

The following environment variables can be set (see .env file):

- `PERSISTENCE_MODE`: Set to `"json"` for file-based config (default) or `"postgres"` for database
- `AZURE_DEVOPS_ORG`: Your Azure DevOps organization
- `AZURE_DEVOPS_PAT`: Personal Access Token for Azure DevOps
- `GRAPH_CLIENT_ID`: Microsoft Graph API client ID
- `GRAPH_CLIENT_SECRET`: Microsoft Graph API client secret
- `GRAPH_TENANT_ID`: Azure AD tenant ID

## Further Reading

- [Main README](../README.md) - Project overview
- [Effort Tracking Testing Guide](../docs/EFFORT_TRACKING_TESTING.md) - Staging validation steps
- [Config README](../config/README.md) - Detailed configuration reference
