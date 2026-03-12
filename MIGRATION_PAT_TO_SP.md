# Quick Migration Guide: PAT → Service Principal

This is a quick reference for migrating from Personal Access Token (PAT) to Service Principal authentication.

## ⚡ Quick Steps

### 1. Azure Portal Setup (5 minutes)

```bash
# Open Azure Portal
https://portal.azure.com

# Navigate to: App registrations → + New registration
# Name: AgilePlanner-ServicePrincipal
# Click: Register
```

**📋 Copy these 3 values:**
- ✅ **Application (client) ID**: `________-____-____-____-____________`
- ✅ **Directory (tenant) ID**: `________-____-____-____-____________`
- ✅ **Client secret**: Create under "Certificates & secrets" → Copy the Value

### 2. Azure DevOps Access (2 minutes)

```bash
# Open Azure DevOps
https://dev.azure.com/workasaservice/_settings/users

# Add user (paste the Application ID from step 1)
# Access level: Basic
# Click: Add

# Navigate to Project Settings → Permissions
# Add service principal to: Contributors (or Project Administrators)
```

### 3. Update .env (1 minute)

```bash
# Edit .env file and add these lines:
AZURE_DEVOPS_AUTH_TYPE=service_principal
AZURE_DEVOPS_TENANT_ID=<paste-tenant-id>
AZURE_DEVOPS_CLIENT_ID=<paste-client-id>
AZURE_DEVOPS_CLIENT_SECRET=<paste-client-secret>

# Keep existing (no changes needed):
AZURE_DEVOPS_ORG=workasaservice
AZURE_DEVOPS_PROJECT=Automate
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/workasaservice/

# Comment out or remove old PAT:
# AZURE_DEVOPS_PAT=xxxxx
```

### 4. Test (30 seconds)

```bash
npm run test-auth
```

Expected output:
```
🔐 Testing Azure DevOps Authentication...

📋 Step 1: Loading configuration
   Auth Type: service_principal
   Tenant ID: ✅ Set
   Client ID: ✅ Set
   Client Secret: ✅ Set (hidden)

✓ Step 2: Validating configuration
   ✅ Configuration is valid

🔑 Step 3: Obtaining authentication token
   Token Type: bearer
   Expires in: 59 minutes
   ✅ Token obtained successfully

🌐 Step 4: Testing Azure DevOps API connection
   Organization: workasaservice
   Project: Automate
   ✅ API call successful
   Found X work items

✅ All tests passed! Authentication is working correctly.
```

### 5. Verify Everything Works

```bash
# Test with your existing commands
npm run cli -- query-iterations
npm run cli -- create-sprints-and-seed --project "MotherOps-Alpha" --team "MotherOps-Alpha Team" --schedule test-schedule.json
```

## 🔧 Troubleshooting

### ❌ "unauthorized_client"
→ Service Principal not added to Azure DevOps  
→ Go to Step 2, add the Application ID as a user

### ❌ "invalid_client" 
→ Wrong client secret or expired  → Check for copy/paste errors, no extra spaces

### ❌ "Insufficient permissions"
→ Service Principal doesn't have permissions  
→ Add to "Contributors" or "Project Administrators" group

### ❌ "The token is not yet valid"
→ System clock issue or wrong tenant ID  
→ Verify tenant ID is correct

## 📚 Full Documentation

- [Detailed Setup Guide](./AZURE_SERVICE_PRINCIPAL_SETUP.md) - Complete step-by-step with screenshots
- [Microsoft Docs](https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/service-principal-managed-identity?view=azure-devops) - Official documentation

## 🎯 Benefits

- ✅ **No expiration** - Unlike PATs that expire every 90 days
- ✅ **Better security** - Not tied to a user account
- ✅ **Compliance** - Meets enterprise security requirements
- ✅ **Auditable** - Clear service identity in logs
- ✅ **Automation-friendly** - Perfect for CI/CD pipelines

## 🔐 After Migration

1. **Delete your PAT** in Azure DevOps:
   - Go to: `https://dev.azure.com/workasaservice/_usersSettings/tokens`
   - Click the PAT → Revoke

2. **Update CI/CD pipelines** if you use them:
   - GitHub Actions, Azure Pipelines, etc.
   - Add the 3 secrets (TENANT_ID, CLIENT_ID, CLIENT_SECRET)

3. **Document for your team**:
   - Share this guide with team members
   - Update any team wikis or documentation

---

**Questions?** See [AZURE_SERVICE_PRINCIPAL_SETUP.md](./AZURE_SERVICE_PRINCIPAL_SETUP.md) for detailed instructions.
