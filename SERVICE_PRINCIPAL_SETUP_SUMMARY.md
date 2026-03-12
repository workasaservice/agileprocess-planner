# Service Principal Authentication - Implementation Summary

## ✅ What's Been Completed

### 1. **Documentation Created**
- ✅ [AZURE_SERVICE_PRINCIPAL_SETUP.md](./AZURE_SERVICE_PRINCIPAL_SETUP.md) - Detailed setup guide with step-by-step instructions
- ✅ [MIGRATION_PAT_TO_SP.md](./MIGRATION_PAT_TO_SP.md) - Quick migration guide (5 minutes)
- ✅ [.env.example](./.env.example) - Updated with new environment variables

### 2. **Code Implementation**
- ✅ Created `/src/auth/azureDevOpsAuth.ts` - New authentication module supporting both PAT and Service Principal
- ✅ Updated `/src/clients/azureDevOpsMcpClient.ts` - Modified to use new auth module
- ✅ Created `/scripts/testAuthentication.ts` - Test script to verify authentication

### 3. **Configuration Files**
- ✅ Updated `.env` - Added new environment variables with placeholders
- ✅ Updated `package.json` - Added `npm run test-auth` script

## 📋 Next Steps for You

### Step 1: Azure Portal Setup (5 minutes)
1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **App registrations** → **+ New registration**
3. Name it `AgilePlanner-ServicePrincipal`
4. Copy these 3 values:
   - **Tenant ID** (from overview page)
   - **Client ID** (from overview page)
   - **Client Secret** (from "Certificates & secrets" → create new)

### Step 2: Azure DevOps Access (2 minutes)
1. Go to `https://dev.azure.com/workasaservice/_settings/users`
2. Click **+ Add users**
3. Paste the **Client ID** from Step 1
4. Grant access level: **Basic**
5. Navigate to Project Settings → Permissions
6. Add to **Contributors** or **Project Administrators** group

### Step 3: Update .env (1 minute)
Edit `.env` file and replace the placeholders:

```bash
AZURE_DEVOPS_AUTH_TYPE=service_principal
AZURE_DEVOPS_TENANT_ID=<paste-your-tenant-id>
AZURE_DEVOPS_CLIENT_ID=<paste-your-client-id>
AZURE_DEVOPS_CLIENT_SECRET=<paste-your-client-secret>
```

### Step 4: Test (30 seconds)
```bash
npm run test-auth
```

You should see:
```
✅ All tests passed! Authentication is working correctly.
```

## 🔄 Backward Compatibility

The code still supports PAT authentication for gradual migration:

```bash
# To use PAT (old method):
AZURE_DEVOPS_AUTH_TYPE=pat
AZURE_DEVOPS_PAT=your-pat-token

# To use Service Principal (new method):
AZURE_DEVOPS_AUTH_TYPE=service_principal
AZURE_DEVOPS_TENANT_ID=xxx
AZURE_DEVOPS_CLIENT_ID=xxx
AZURE_DEVOPS_CLIENT_SECRET=xxx
```

## 📚 Technical Details

### Authentication Flow

**PAT (Personal Access Token):**
```
Client → Azure DevOps API
  Headers: Authorization: Basic <base64(:PAT)>
```

**Service Principal (OAuth 2.0):**
```
1. Client → Azure AD Token Endpoint
   POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
   Body: client_id, client_secret, grant_type=client_credentials
   
2. Azure AD → Client
   Response: { access_token, expires_in }
   
3. Client → Azure DevOps API
   Headers: Authorization: Bearer <access_token>
```

### Token Caching
- OAuth tokens are cached for their lifetime (typically 60 minutes)
- Automatic refresh with 5-minute safety buffer
- No caching for PAT (not needed)

### Files Modified

1. **New Files:**
   - `src/auth/azureDevOpsAuth.ts` - Authentication logic
   - `scripts/testAuthentication.ts` - Test utility
   - `AZURE_SERVICE_PRINCIPAL_SETUP.md` - Setup guide
   - `MIGRATION_PAT_TO_SP.md` - Quick migration guide

2. **Modified Files:**
   - `src/clients/azureDevOpsMcpClient.ts` - Uses new auth module
   - `.env` - Added new environment variables
   - `.env.example` - Updated template
   - `package.json` - Added test-auth script

## 🔐 Security Benefits

- ✅ **No expiration** - Unlike PATs that expire periodically
- ✅ **Not user-specific** - Survives user account changes
- ✅ **Auditable** - Clear service principal in Azure AD logs
- ✅ **Revocable** - Can be revoked instantly from Azure Portal
- ✅ **Fine-grained permissions** - Can limit to specific Azure DevOps permissions

## 🐛 Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `unauthorized_client` | SP not added to Azure DevOps | Add Client ID as user in Azure DevOps |
| `invalid_client` | Wrong credentials | Verify Tenant ID, Client ID, Secret |
| `Insufficient permissions` | SP lacks permissions | Add to Contributors/Admins group |
| `The token is not yet valid` | Clock skew or wrong tenant | Verify tenant ID, check system clock |

## 📖 References

- [Microsoft Docs: Service Principal Authentication](https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/service-principal-managed-identity?view=azure-devops)
- [Azure DevOps REST API](https://learn.microsoft.com/en-us/rest/api/azure/devops)
- [OAuth 2.0 Client Credentials Flow](https://learn.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-client-creds-grant-flow)

---

**Ready to migrate?** See [MIGRATION_PAT_TO_SP.md](./MIGRATION_PAT_TO_SP.md) for the quickstart guide!
