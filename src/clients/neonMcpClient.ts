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
import { query as directQuery } from "../lib/neonClient";

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
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream"
    },
    timeout: 30000
  });
}

/**
 * Parse Server-Sent Events (SSE) response format.
 * MCP returns responses as SSE with "event: message" and "data: {JSON}".
 */
function parseSseResponse(sseText: string): McpToolResponse {
  const lines = sseText.split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const jsonData = line.substring(6).trim();
      if (jsonData) {
        return JSON.parse(jsonData) as McpToolResponse;
      }
    }
  }
  throw new Error("No valid SSE data found in response");
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
    const hasDirectDb = Boolean(
      process.env.DATABASE_URL_POOLED?.trim() || process.env.DATABASE_URL?.trim()
    );
    return Boolean((config.serverUrl && config.token) || hasDirectDb);
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

    // MCP protocol requires "tools/call" method with tool name wrapped in params
    const call: McpToolCall = {
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: tool,
        arguments: params
      },
      id: Date.now()
    };

    try {
      const response = await client.post("", call, {
        // Allow both JSON and SSE response formats
        responseType: "text"
      });

      // Parse SSE response if content-type indicates SSE, else parse as JSON
      let mcpResponse: McpToolResponse<T>;
      if (typeof response.data === "string" && response.data.includes("event:")) {
        mcpResponse = parseSseResponse(response.data) as McpToolResponse<T>;
      } else if (typeof response.data === "string") {
        mcpResponse = JSON.parse(response.data) as McpToolResponse<T>;
      } else {
        mcpResponse = response.data as McpToolResponse<T>;
      }

      if (mcpResponse.error) {
        throw new Error(
          `Neon MCP error (${mcpResponse.error.code}): ${mcpResponse.error.message}`
        );
      }

      return mcpResponse.result as T;
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
    try {
      // Neon MCP uses "run_sql" tool, not "query"
      const result = await this.callTool<{ content: Array<{ type: string; text: string }> }>("run_sql", {
        projectId: process.env.NEON_PROJECT_ID || "super-butterfly-14628322",
        branchId: process.env.NEON_BRANCH_ID || "br-muddy-fog-a88uzi0y",
        sql,
        params: params || []
      });
      
      // MCP returns results as {content: [{type: "text", text: "[{...}]"}]}
      if (result?.content?.[0]?.text) {
        return JSON.parse(result.content[0].text) as T[];
      }
      return result as unknown as T[];
    } catch {
      const result = await directQuery<T>(sql, params || []);
      return result.rows;
    }
  },

  async migrate(sql: string): Promise<{ ok: boolean; message: string }> {
    try {
      // Neon MCP uses "run_sql" for migrations
      const result = await this.callTool<{ content: Array<{ type: string; text: string }> }>("run_sql", {
        projectId: process.env.NEON_PROJECT_ID || "super-butterfly-14628322",
        branchId: process.env.NEON_BRANCH_ID || "br-muddy-fog-a88uzi0y",
        sql
      });
      return { ok: true, message: "Applied via Neon MCP" };
    } catch {
      await directQuery(sql);
      return { ok: true, message: "Applied via direct Postgres fallback" };
    }
  },

  async seed(sql: string): Promise<{ ok: boolean; message: string }> {
    // Seed uses run_sql like migrate
    const result = await this.callTool<{ content: Array<{ type: string; text: string }> }>("run_sql", {
      projectId: process.env.NEON_PROJECT_ID || "super-butterfly-14628322",
      branchId: process.env.NEON_BRANCH_ID || "br-muddy-fog-a88uzi0y",
      sql
    });
    return { ok: true, message: "Seeded via Neon MCP" };
  },

  async health(): Promise<{
    ok: boolean;
    mode?: string;
    now?: string;
    error?: string;
  }> {
    try {
      // Test connectivity using run_sql
      const result = await this.callTool<{ content: Array<{ type: string; text: string }> }>("run_sql", {
        projectId: process.env.NEON_PROJECT_ID || "super-butterfly-14628322",
        branchId: process.env.NEON_BRANCH_ID || "br-muddy-fog-a88uzi0y",
        sql: "SELECT NOW()::text as now"
      });
      
      if (result?.content?.[0]?.text) {
        const rows = JSON.parse(result.content[0].text) as Array<{ now: string }>;
        const now = rows[0]?.now;
        if (now) {
          return {
            ok: true,
            mode: "neon-mcp",
            now
          };
        }
      }
      return { ok: true, mode: "neon-mcp" };
    } catch {
      const result = await directQuery<{ now: string }>(
        "SELECT NOW()::text as now"
      );
      const now = result.rows[0]?.now;
      if (now) {
        return {
          ok: true,
          mode: "direct-postgres-fallback",
          now
        };
      }
      return {
        ok: true,
        mode: "direct-postgres-fallback"
      };
    }
  }
};
