# Azure DevOps Service Principal Authentication Setup

This guide will help you migrate from Personal Access Token (PAT) to Service Principal authentication for Azure DevOps.

## Why Service Principal?

- ✅ **No expiration** - Unlike PATs that expire
- ✅ **Better security** - No user-specific credentials
- ✅ **Compliance** - Meets enterprise security requirements
- ✅ **Auditable** - Clear service identity in logs
- ✅ **Automation-friendly** - Perfect for CI/CD and scripts

## Step 1: Create App Registration in Azure Portal

1. **Navigate to Azure Portal**
   - Go to [Azure Portal](https://portal.azure.com)
   - Search for "App registrations" or navigate to **Azure Active Directory** → **App registrations**

2. **Create new registration**
   - Click **+ New registration**
   - **Name**: `AgilePlanner-ServicePrincipal` (or your preferred name)
   - **Supported account types**: "Accounts in this organizational directory only"
   - **Redirect URI**: Leave blank (not needed for service-to-service auth)
   - Click **Register**

3. **Note down the credentials**
   After registration, you'll see the overview page. Copy these values:
   - **Application (client) ID** - Example: `12345678-1234-1234-1234-123456789abc`
   - **Directory (tenant) ID** - Example: `87654321-4321-4321-4321-cba987654321`

4. **Create a client secret**
   - In the left menu, click **Certificates & secrets**
   - Click **+ New client secret**
   - **Description**: `AgilePlanner Authentication`
   - **Expires**: Choose based on your security policy (recommended: 24 months)
   - Click **Add**
   - **⚠️ IMPORTANT**: Copy the **Value** immediately (you won't see it again!)
   - Example: `abc123~xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

## Step 2: Grant Azure DevOps Access

1. **Navigate to Azure DevOps Organization Settings**
   - Go to `https://dev.azure.com/workasaservice/_settings/`
   - Click on **Users** in the left sidebar

2. **Add the Service Principal as a user**
   - Click **+ Add users**
   - In the "Users or Service Principals" field, paste the **Application (client) ID** from Step 1
   - Select access level: **Basic** (or **Stakeholder** if read-only access is sufficient)
   - Click **Add**

3. **Grant Project-level permissions**
   - Navigate to your project: `https://dev.azure.com/workasaservice/Automate`
   - Click **Project settings** (bottom left)
   - Click **Permissions** → **Users**
   - Find your service principal by the Application ID
   - Add to appropriate group or grant specific permissions:
     - For full access: Add to **Project Administrators**
     - For work item access: Add to **Contributors**
     - For read-only: Add to **Readers**

## Step 3: Configure Permissions (Fine-grained)

If you need specific permissions instead of group membership:

1. Go to **Organization Settings** → **Permissions**
2. Find the service principal
3. Grant these permissions as needed:
   - **Work Items**: Create, Edit, Delete
   - **Iterations**: View, Edit
   - **Teams**: View, Edit
   - **Build**: Queue builds, Edit build definitions
   - **Release**: Manage releases

## Step 4: Update Environment Variables

Replace your current `.env` file PAT configuration:

```bash
# OLD (PAT-based)
# AZURE_DEVOPS_PAT=xxxxx

# NEW (Service Principal-based)
AZURE_DEVOPS_AUTH_TYPE=service_principal
AZURE_DEVOPS_TENANT_ID=your-tenant-id-from-step1
AZURE_DEVOPS_CLIENT_ID=your-application-client-id-from-step1
AZURE_DEVOPS_CLIENT_SECRET=your-client-secret-from-step1
AZURE_DEVOPS_ORG=workasaservice
AZURE_DEVOPS_PROJECT=Automate
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/workasaservice/
```

## Step 5: Test the Connection

Run this command to verify your setup:

```bash
npm run cli -- test-auth
```

Or test manually with a simple work item query:

```bash
npm run cli -- query-iterations
```

## Troubleshooting

### Error: "unauthorized_client"
- Check that the Service Principal has been added to Azure DevOps organization
- Verify the client ID and tenant ID are correct

### Error: "invalid_client"
- Check that the client secret is correct and not expired
- Ensure there are no extra spaces in the secret value

### Error: "Insufficient permissions"
- Verify the service principal has been granted appropriate permissions in Azure DevOps
- Check both organization-level and project-level permissions

### Error: "The token is not yet valid"
- Check your system clock is synchronized
- Verify the tenant ID is correct

## Security Best Practices

1. **Rotate secrets regularly** - Set calendar reminders before expiration
2. **Use Key Vault** - Store secrets in Azure Key Vault for production
3. **Least privilege** - Grant only necessary permissions
4. **Monitor usage** - Review service principal activity in Azure AD logs
5. **Separate environments** - Use different service principals for dev/staging/prod

## Migration Checklist

- [ ] Create App Registration in Azure Portal
- [ ] Note down Tenant ID, Client ID
- [ ] Create and save Client Secret
- [ ] Add Service Principal to Azure DevOps organization
- [ ] Grant appropriate permissions
- [ ] Update `.env` file with new credentials
- [ ] Test authentication with a simple command
- [ ] Update CI/CD pipelines with new credentials
- [ ] Delete or disable old PAT
- [ ] Document the setup in your team wiki

## References

- [Microsoft Docs: Service Principal & Managed Identity Authentication](https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/service-principal-managed-identity?view=azure-devops)
- [Azure DevOps Security Best Practices](https://learn.microsoft.com/en-us/azure/devops/organizations/security/security-best-practices)
