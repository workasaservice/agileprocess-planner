# Neon MCP Configuration & Setup Guide

**Status**: ✅ Configured & Initialized (March 5, 2026)

## Overview

This project uses **Neon Serverless Postgres** with **MCP (Model Context Protocol)** enforcement for database operations. All database interactions must go through the `neonMcpClient` (MCP-only policy).

## Prerequisites

- Neon account at https://console.neon.tech
- API key from Neon console (Account → API Keys)
- Local `.env` file (not committed to git)

## Configuration Steps

### 1. Obtain NEON_MCP_API_KEY

```bash
# Navigate to https://console.neon.tech
# → Account → API Keys
# → Create new or copy existing API key
# Format: napi_<hex_string>
```

### 2. Configure Local .env

Create or update `.env` in the project root:

```bash
# Persistence mode
PERSISTENCE_MODE=postgres

# Neon connection (already configured)
DATABASE_URL_POOLED=postgresql://neondb_owner:npg_<passhash>@ep-<region>.eastus2.azure.neon.tech/neondb?sslmode=require&channel_binding=require

# Neon MCP API key (get from console.neon.tech)
NEON_MCP_API_KEY=napi_<your_key_from_neon_console>

# JSON migration control
INCLUDE_SENSITIVE_JSON=false
```

### 3. Initialize Database

```bash
# Build TypeScript
npm run build

# Apply migrations (schema)
npm run db:migrate

# Seed baseline data
npm run db:seed

# Validate end-to-end
npm run db:e2e

# Run tests
npm test
```

## Database State After Initialization

```json
{
  "organizations": 1,
  "projects": 2,
  "teams": 2,
  "json_documents": 28,
  "invalid_json_documents": 1
}
```

### Baseline Data

**Organization**: `workasaservice`

**Projects**:
- MotherOps-Alpha
- MotherOps-Beta

**Teams**:
- MotherOps-Alpha Team
- MotherOps-Beta Team

**JSON Documents**: 28 files imported (6 excluded by default as containing sensitive data)

## MCP-Only Enforcement

All database operations must use `neonMcpClient`:

```typescript
// ✅ ALLOWED - Use MCP client
import { neonMcpClient } from "src/clients/neonMcpClient";

const orgs = await neonMcpClient.query("SELECT * FROM organizations");
await neonMcpClient.migrate("ALTER TABLE ...");
await neonMcpClient.health();

// ❌ PROHIBITED - Direct pool access
import { neonClient } from "src/lib/neonClient";
const pool = neonClient.getPool();  // FORBIDDEN
pool.query("...");                  // FORBIDDEN
```

## Neon MCP Client Methods

### `isConfigured(): boolean`
Check if MCP client is properly configured with URL and token.

### `callTool<T>(tool: string, params: Record<string, unknown>): Promise<T>`
Generic MCP protocol caller for any tool.

### `query<T>(sql: string, params?: unknown[]): Promise<T[]>`
Execute SELECT/DML query.

**Example**:
```typescript
const workItems = await neonMcpClient.query<{id: string; title: string}>(
  "SELECT id, title FROM work_items WHERE status = $1",
  ["Active"]
);
```

### `migrate(sql: string): Promise<{ ok: boolean; message: string }>`
Run migration script.

### `seed(sql: string): Promise<{ ok: boolean; message: string }>`
Run seed script.

### `health(): Promise<{ ok: boolean; mode?: string; now?: string; error?: string }>`
Check Neon MCP endpoint health.

**Example**:
```typescript
const health = await neonMcpClient.health();
// {
//   "ok": true,
//   "mode": "postgres",
//   "now": "2026-03-05 05:23:43.549726+00"
// }
```

## Environment Variables Reference

| Variable | Purpose | Required | Example |
|----------|---------|----------|---------|
| `PERSISTENCE_MODE` | Use database or JSON | Yes | `postgres` |
| `DATABASE_URL_POOLED` | Neon pooled connection URL | Yes | `postgresql://...?sslmode=require` |
| `DATABASE_URL` | Fallback direct connection | No | (same format as above) |
| `NEON_MCP_API_KEY` | MCP authentication token | Yes (for MCP) | `napi_...` |
| `NEON_MCP_SERVER_URL` | MCP endpoint URL | No | `https://mcp.neon.tech/mcp` |
| `NEON_DATABASE` | Database name | No | `neondb` |
| `INCLUDE_SENSITIVE_JSON` | Import secrets from JSON | No | `false` |

## Troubleshooting

### "NEON_MCP_API_KEY is not configured"
- Verify `.env` has correct API key from Neon console
- Check `.env` is in project root (not committed to git)
- Run `npm run db:health` to test connectivity

### "Neon MCP server URL is not configured"
- Default: `https://mcp.neon.tech/mcp`
- Set optional `NEON_MCP_SERVER_URL` in `.env` if using custom endpoint

### "Permission denied" on JSON document import
- Set `INCLUDE_SENSITIVE_JSON=false` to skip secrets (default)
- Set `INCLUDE_SENSITIVE_JSON=true` to import all files

### SSL connection errors
- Neon requires SSL: `sslmode=require&channel_binding=require` (already in URL)
- Use pooled URL for serverless: `*-pooler.eastus2.azure.neon.tech`

## Files Structure

```
mcp/
  neon.json                    # Neon MCP endpoint config (committed)

src/clients/
  neonMcpClient.ts             # MCP client implementation

src/lib/
  neonClient.ts                # Raw Postgres pool (use via MCP only)

src/db/
  migrate.ts                   # Migration runner
  seed.ts                      # Seed runner
  migrateJsonDocuments.ts      # JSON → Postgres importer
  e2eCheck.ts                  # Validation script

db/migrations/
  0001_init_multitenant.sql   # Main schema
  0002_json_documents.sql     # JSON storage table
  0003_json_documents_raw.sql # Validity tracking

db/seeds/
  0001_seed_current_org.sql   # Baseline data

config/
  unified-config.json          # Policy enforcement config
```

## MCP Policy

**Location**: `config/unified-config.json#policy.api`

```json
{
  "mcpOnly": true,
  "allowed": [
    "neonMcpClient.callTool()",
    "neonMcpClient.query()",
    "neonMcpClient.migrate()",
    "neonMcpClient.seed()",
    "neonMcpClient.health()"
  ],
  "prohibited": [
    "new pg.Pool()",
    "neonClient.getPool()",
    "Direct SQL execution"
  ]
}
```

## Next Steps

1. ✅ Configure `.env` with `NEON_MCP_API_KEY`
2. ✅ Run initialization pipeline (`npm run db:migrate && npm run db:seed`)
3. ✅ Verify database state (`npm run db:e2e`)
4. ⏭️  Implement data loading from Neon in handlers
5. ⏭️  Migrate read operations to use `neonMcpClient.query()`
6. ⏭️  Migrate write operations to use `neonMcpClient` with audit logging

## References

- [Neon Documentation](https://neon.tech/docs)
- [Neon MCP Endpoint](https://mcp.neon.tech/mcp)
- [MCP Protocol Spec](https://modelcontextprotocol.io)
- [MCP-Only Policy](MCP_POLICY.md)
- [Security Policy](../SECURITY.md)
