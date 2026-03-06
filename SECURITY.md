# Security Policy

## Reporting Security Vulnerabilities

If you discover a security vulnerability, please email **security@example.com** instead of using the public issue tracker. Do not publicly disclose the vulnerability until we've had a chance to address it.

**Response Timeline:**
- Security issues will be reviewed within 24 hours
- A patch will be released as soon as possible, typically within 7 days

## Security Guidelines

### Credentials and Secrets

**NEVER commit credentials to the repository**, including:
- Azure DevOps Personal Access Tokens (PATs)
- Microsoft Graph/Azure AD client secrets
- API keys or tokens
- Service connection details
- User passwords or credentials

**Files that are git-ignored for security:**
- `.env.*` — Environment variables
- `mcp/microsoft-graph.json` — Azure AD credentials
- `azure-devops.json` — Azure DevOps PAT
- `users.credentials.json` — User authentication data
- `users.json` — User data
- `*.sh` — Shell scripts with embedded tokens
- `*assignments.json` — Sensitive user assignments

### Configuration Management

**Local Configuration:**
1. Create a `.env.local` file for sensitive settings (git-ignored)
2. Load credentials from environment variables at runtime
3. Never hardcode secrets in source files

**Example:**
```bash
# .env.local (git-ignored)
AZURE_DEVOPS_TOKEN=your-token-here
GRAPH_CLIENT_SECRET=your-secret-here
```

### Credential Rotation

If credentials have been accidentally exposed:

1. **Immediately rotate credentials:**
   - Azure DevOps: Regenerate PAT in https://dev.azure.com/_usersSettings/tokens
   - Azure AD: Rotate client secret in Azure Portal
   - GitHub: Invalidate any exposed tokens

2. **Scan commit history:**
   - Use tools like `git-secrets` or `truffleHog` to scan for old credentials
   - If found in history, use `git-filter-branch` or `BFG` to remove

3. **Alert the team:**
   - Notify security and development teams immediately
   - Document the incident and remediation steps

### Code Security Best Practices

1. **Authentication:**
   - Use MCP (Model Context Protocol) for all external service interactions
   - Never make direct HTTP calls with embedded tokens
   - Use service principals and managed identities when available

2. **Data Protection:**
   - Encrypt sensitive data at rest and in transit
   - Validate and sanitize all user inputs
   - Use parameterized queries to prevent injection attacks

3. **Dependencies:**
   - Keep npm packages updated: `npm audit`
   - Review security advisories regularly
   - Avoid packages with known vulnerabilities

4. **Logging:**
   - Never log sensitive information (tokens, passwords, PII)
   - Redact credentials from error messages
   - Be cautious with debug output in production

## Security Checklist Before Commits

- [ ] No hardcoded tokens, keys, or passwords
- [ ] No `.env` or `.env.local` files committed
- [ ] No credential JSON files in git
- [ ] All dependencies are up-to-date (`npm audit`)
- [ ] No secrets in commit messages or comments
- [ ] Sensitive operations are logged safely (no credentials)

## Dependency Security

### npm Audit
```bash
npm audit           # Check for vulnerabilities
npm audit fix       # Auto-fix when possible
npm update          # Update packages
```

### Third-Party Libraries
- Review licenses before adding new dependencies
- Prefer packages with active maintenance
- Check for known vulnerabilities in npm registry

## Environment-Specific Security

### Development
- Use local configuration files (git-ignored)
- Never use production secrets in development
- Be cautious with personal access tokens

### Production
- Use managed identities where available
- Rotate secrets regularly
- Enable audit logging
- Monitor for unauthorized access

## Questions?

For security questions or to report a vulnerability, contact: **security@example.com**

---

**Last Updated:** March 2026  
**Policy Version:** 1.0
