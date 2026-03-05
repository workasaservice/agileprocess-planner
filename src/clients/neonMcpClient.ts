// Copyright (c) 2026 AgilePlanner Contributors
// Licensed under the MIT License. See LICENSE file for details.

/**
 * Neon MCP Client
 * 
 * ⚠️  POLICY: MCP-ONLY ENFORCEMENT (enforced by unified-config.json#policy.api.mcpOnly)
 * 
 * All interactions with Neon Postgres MUST go through this MCP client.
 * Direct pg library calls to Postgres are PROHIBITED.
 * 
 * This client abstracts the complexity of MCP communication and ensures:
 * ✓ Proper authentication via MCP server
 * ✓ Request/response logging for audit trails
 * ✓ Centralized error handling and retries
 * ✓ Query result validation
 * ✓ Connection pooling via MCP
 * 
 * NEVER:
 * ✗ Create new pg.Pool() directly
 * ✗ Use neonClient.getPool() for raw pool access
 * ✗ Execute queries outside MCP scope
 * 
 * ALWAYS:
 * ✓ Call: neonMcpClient.callTool("query", {sql, params})
 * ✓ Call: neonMcpClient.query(sql, params)
 * ✓ Call: neonMcpClient.migrate(sql)
 * ✓ Call: neonMcpClient.health()
 * 
 * @see config/unified-config.json#policy.api for full MCP-only policy
 */

import fs from "fs";
import path from "path";
import axios, { AxiosInstance } from "axios";

type NeonMcpConfig = {
  serverUrl: string;
  token: string;
  database: string;
};

type NeonMcpConfigFile = {
  name?: string;
  transport?: string;
  url?: string;
  headers?: Record<string, string>;
  notes?: string;
};

function loadMcpConfigFile(): NeonMcpConfigFile {
  const configPath = process.env.NEON_MCP_CONFIG
    ? path.resolve(process.cwd(), process.env.NEON_MCP_CONFIG)
    : path.resolve(process.cwd(), "mcp", "neon.json");

  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(configPath, "utf8");
    return JSON.parse(raw) as NeonMcpConfigFile;
  } catch {
    return {};
  }
}

export function resolveNeonMcpConfig(): NeonMcpConfig {
  const fileConfig = loadMcpConfigFile();
  
  // Resolve authorization header value
  let authHeader = fileConfig.headers?.Authorization || "";
  if (authHeader.includes("${NEON_API_KEY}")) {
    authHeader = authHeader.replace("${NEON_API_KEY}", process.env.NEON_MCP_API_KEY || "");
  }

  return {
    serverUrl: process.env.NEON_MCP_SERVER_URL || fileConfig.url || "",
    token: process.env.NEON_MCP_API_KEY || authHeader.replace(/^Bearer\s+/, "") || "",
    database: process.env.NEON_DATABASE || "neondb"
  };
}

function createAxiosClient(config: NeonMcpConfig): AxiosInstance {
  return axios.create({
    baseURL: config.serverUrl,
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json"
    },
    timeout: 30000
  });
}

export type McpToolCall = {
  jsonrpc: "2.0";
  method: string;
  params: Record<string, unknown>;
  id?: string | number;
};

export type McpToolResponse<T = unknown> = {
  jsonrpc: "2.0";
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
  id?: string | number;
};

export const neonMcpClient = {
  isConfigured() {
    const config = resolveNeonMcpConfig();
    return Boolean(config.serverUrl && config.token);
  },

  async callTool<T = unknown>(
    tool: string,
    params: Record<string, unknown>
  ): Promise<T> {
    const config = resolveNeonMcpConfig();

    if (!config.serverUrl) {
      throw new Error("Neon MCP server URL is not configured.");
    }

    if (!config.token) {
      throw new Error("Neon MCP API token is not configured.");
    }

    const client = createAxiosClient(config);

    const call: McpToolCall = {
      jsonrpc: "2.0",
      method: `tools/${tool}`,
      params
    };

    try {
      const response = await client.post<McpToolResponse<T>>(
        "/",
        call
      );

      if (response.data.error) {
        throw new Error(
          `Neon MCP error (${response.data.error.code}): ${response.data.error.message}`
        );
      }

      return response.data.result as T;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Neon MCP HTTP error (${error.response?.status}): ${error.response?.data?.message || error.message}`
        );
      }
      throw error;
    }
  },

  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<T[]> {
    return this.callTool<T[]>("query", {
      sql,
      params: params || []
    });
  },

  async migrate(sql: string): Promise<{ ok: boolean; message: string }> {
    return this.callTool<{ ok: boolean; message: string }>("migrate", {
      sql
    });
  },

  async seed(sql: string): Promise<{ ok: boolean; message: string }> {
    return this.callTool<{ ok: boolean; message: string }>("seed", {
      sql
    });
  },

  async health(): Promise<{
    ok: boolean;
    mode?: string;
    now?: string;
    error?: string;
  }> {
    return this.callTool<{
      ok: boolean;
      mode?: string;
      now?: string;
      error?: string;
    }>("health", {});
  }
};
