# Azure AD User Management Setup Guide

This guide will help you set up and use the Azure AD user management features in AgilePlanner.

## Prerequisites

1. **Azure AD Tenant** with appropriate permissions
2. **Azure AD App Registration** (Service Principal) with the following API permissions:
   - Microsoft Graph API:
     - `User.ReadWrite.All` (Application permission)
     - `Group.ReadWrite.All` (Application permission)
     - `Directory.ReadWrite.All` (Application permission - optional, for advanced scenarios)
3. **Azure DevOps Organization** with:
   - Personal Access Token (PAT) with at least these scopes:
     - Work Items (Read, Write, & Manage)
     - Project and Team (Read, Write, & Manage)
     - User Entitlements (Read)

## Step-by-Step Setup

### 1. Create Azure AD App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** > **App registrations** > **New registration**
3. Name it (e.g., "AgilePlanner User Management")
4. Select **Accounts in this organizational directory only**
5. Click **Register**

### 2. Configure API Permissions

1. In your app registration, go to **API permissions**
2. Click **Add a permission** > **Microsoft Graph** > **Application permissions**
3. Add these permissions:
   - `User.ReadWrite.All`
   - `Group.ReadWrite.All`
4. Click **Grant admin consent** (requires Global Administrator role)

### 3. Create Client Secret

1. Go to **Certificates & secrets** > **New client secret**
2. Add a description (e.g., "AgilePlanner Secret")
3. Select expiration period
4. Click **Add**
5. **Copy the secret value immediately** (you won't be able to see it again)

### 4. Get Your Tenant and Client IDs

1. Go to **Overview** page of your app registration
2. Copy these values:
   - **Application (client) ID** → This is your `AZURE_CLIENT_ID`
   - **Directory (tenant) ID** → This is your `AZURE_TENANT_ID`

### 5. Configure Environment Variables

Create or update your `.env` file:

```bash
# Azure AD / Microsoft Graph
AZURE_TENANT_ID=your-tenant-id-from-step-4
AZURE_CLIENT_ID=your-client-id-from-step-4
AZURE_CLIENT_SECRET=your-secret-from-step-3

# Azure DevOps
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-org-name
AZURE_DEVOPS_ORG=your-org-name
AZURE_DEVOPS_PROJECT=your-project-name
AZURE_DEVOPS_PAT=your-personal-access-token
```

### 6. Verify Configuration

Run the validation script to check your configuration:

```bash
npm run validate-mcp
```

## Usage Examples

### Example 1: Create Users

Create a `users.json` file:

```json
{
  "users": [
    {
      "displayName": "Alice Johnson",
      "userPrincipalName": "alice.johnson@yourdomain.com",
      "mailNickname": "alicejohnson",
      "givenName": "Alice",
      "surname": "Johnson",
      "jobTitle": "Senior Developer",
      "department": "Engineering",
      "usageLocation": "US",
      "groups": ["Engineering Team", "Senior Staff"],
      "devOpsTeams": ["Backend Squad"]
    }
  ]
}
```

Run:
```bash
npm run cli create-users --file users.json
```

### Example 2: Assign Users to Azure AD Groups

If you already have users created and want to assign them to groups:

```json
{
  "assignments": [
    {
      "userPrincipalName": "alice.johnson@yourdomain.com",
      "groups": ["Engineering Team", "Project Alpha"]
    }
  ]
}
```

Run:
```bash
npm run cli assign-users-to-groups --file assignments.json
```

### Example 3: Assign Users to Azure DevOps Teams

```json
{
  "assignments": [
    {
      "userPrincipalName": "alice.johnson@yourdomain.com",
      "teams": ["Development Team", "Backend Squad"]
    }
  ]
}
```

Run:
```bash
npm run cli assign-users-to-devops-teams --file team-assignments.json
```

### Example 4: Create Users and Assign to Both Groups and Teams

You can combine everything in one file:

```json
{
  "users": [
    {
      "displayName": "Bob Smith",
      "userPrincipalName": "bob.smith@yourdomain.com",
      "mailNickname": "bobsmith",
      "givenName": "Bob",
      "surname": "Smith",
      "jobTitle": "QA Engineer",
      "department": "Quality",
      "usageLocation": "US",
      "groups": ["QA Team"],
      "devOpsTeams": ["QA Squad"]
    }
  ]
}
```

Then run all three commands:
```bash
npm run cli create-users --file users.json
npm run cli assign-users-to-groups --file users.json
npm run cli assign-users-to-devops-teams --file users.json
```

## Field Reference

### Required Fields
- `displayName` - Full name of the user
- `userPrincipalName` - Email address (e.g., user@domain.com)
- `mailNickname` - Email alias (usually first part of email)

### Optional Fields
- `givenName` - First name
- `surname` - Last name
- `jobTitle` - Job title
- `department` - Department name
- `usageLocation` - Two-letter country code (e.g., "US", "GB")
- `password` - Initial password (auto-generated if not provided)
- `accountEnabled` - Boolean (default: true)
- `forceChangePasswordNextSignIn` - Boolean (default: true)
- `groups` - Array of Azure AD group names
- `devOpsTeams` - Array of Azure DevOps team names

## Output and Documentation

All operations generate detailed markdown documentation in the `docs/` folder:

- `users-created-*.md` - User creation summary with Azure Portal links
- `group-assignments-*.md` - Azure AD group assignment results
- `devops-team-assignments-*.md` - Azure DevOps team assignment results

Each document includes:
- Summary statistics (success, failed, skipped)
- Detailed tables with status for each operation
- Direct links to Azure Portal for created resources
- Error messages for failed operations

## Troubleshooting

### "Failed to acquire access token"
- Verify your `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, and `AZURE_CLIENT_SECRET` are correct
- Check that your app registration's secret hasn't expired
- Ensure you've granted admin consent for the API permissions

### "User not found in Azure DevOps"
- The user must first be invited to the Azure DevOps organization
- Azure AD users may need to accept the Azure DevOps invitation first
- Check that the user's email matches their Azure DevOps account

### "Group not found"
- Verify the group name matches exactly (case-sensitive)
- Check that the group exists in Azure AD
- Ensure your service principal has permissions to read groups

### "Team not found"
- Verify the team name matches exactly (case-sensitive)
- Check that the team exists in your Azure DevOps project
- Ensure your PAT has Team (Read) permission

## Security Best Practices

1. **Store secrets securely**: Never commit `.env` file to version control
2. **Rotate secrets regularly**: Update client secrets and PATs periodically
3. **Use least privilege**: Only grant the minimum required permissions
4. **Monitor usage**: Review Azure AD sign-in logs regularly
5. **Use managed identities**: If running in Azure, use managed identities instead of client secrets

## Next Steps

- Review [users.json.example](../users.json.example) for more examples
- Check the main [README.md](../README.md) for other commands
- Generate documentation: All commands create markdown reports in `docs/`
