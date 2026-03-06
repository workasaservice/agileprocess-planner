#!/usr/bin/env python3
"""
❌ DEPRECATED: createAzureUsers.py

This Python script made direct requests to Microsoft Graph API, violating the MCP-only policy.

✅ MIGRATION: Use the MCP-only TypeScript handler instead

BEFORE (Direct API calls - DEPRECATED):
  python3 scripts/createAzureUsers.py --file users.json

AFTER (MCP-only - RECOMMENDED):
  npm run create-users -- --file users.json

The TypeScript handler uses microsoftGraphRealMcpClient for all operations.
No direct HTTP calls. Full MCP-only compliance per docs/MCP_ONLY_POLICY.md

See:
- src/handlers/createUsers.ts
- src/clients/microsoftGraphRealMcpClient.ts
- docs/MCP_ONLY_POLICY.md
"""

import sys

print("❌ ERROR: createAzureUsers.py is deprecated.")
print("")
print("✅ Use the MCP-only TypeScript handler instead:")
print("   npm run create-users -- --file users.json")
print("")
print("The Python script has been removed to enforce MCP-only architecture.")
print("All Microsoft Graph operations now flow through the MCP client.")
print("")
sys.exit(1)
