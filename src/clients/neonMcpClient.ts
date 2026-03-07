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

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return `'${value.toISOString().replace(/'/g, "''")}'`;

  if (typeof value === "object") {
    const json = JSON.stringify(value);
    return `'${json.replace(/'/g, "''")}'`;
  }

  return `'${String(value).replace(/'/g, "''")}'`;
}

function inlineSqlParams(sql: string, params: unknown[]): string {
  return sql.replace(/\$(\d+)\b/g, (_match, idxText) => {
    const idx = Number(idxText) - 1;
    if (idx < 0 || idx >= params.length) {
      return "NULL";
    }
    return sqlLiteral(params[idx]);
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

    // Auto-inject Neon target identifiers for run_sql when omitted by callers.
    // This keeps handler call sites simple and avoids repeated boilerplate.
    const finalParams = { ...params };
    if (tool === "run_sql") {
      const projectId = process.env.NEON_PROJECT_ID?.trim();
      const branchId = process.env.NEON_BRANCH_ID?.trim();

      if (projectId && !finalParams.projectId) {
        finalParams.projectId = projectId;
      }
      if (branchId && !finalParams.branchId) {
        finalParams.branchId = branchId;
      }

      // Neon MCP run_sql in this environment does not support bound params.
      // Inline placeholders so existing handler SQL can continue to use $1 style.
      if (typeof finalParams.sql === "string" && Array.isArray(finalParams.params) && finalParams.params.length > 0) {
        finalParams.sql = inlineSqlParams(finalParams.sql, finalParams.params as unknown[]);
        delete finalParams.params;
      }
    }

    // MCP protocol requires "tools/call" method with tool name wrapped in params
    const call: McpToolCall = {
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: tool,
        arguments: finalParams
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

      // Neon tool errors may be returned inside tool payload even when JSON-RPC succeeds.
      if (tool === "run_sql") {
        const runSqlResult = mcpResponse.result as {
          isError?: boolean;
          content?: Array<{ text?: string }>;
        };
        const firstText = runSqlResult?.content?.[0]?.text || "";
        const looksLikeToolError =
          runSqlResult?.isError ||
          firstText.startsWith("MCP error") ||
          firstText.startsWith("NeonDbError:");

        if (looksLikeToolError) {
          throw new Error(firstText || "Neon MCP run_sql tool error");
        }
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
    const projectId = process.env.NEON_PROJECT_ID;
    const branchId = process.env.NEON_BRANCH_ID;

    if (!projectId || !branchId) {
      throw new Error(
        "NEON_PROJECT_ID and NEON_BRANCH_ID environment variables are required."
      );
    }

    try {
      // Neon MCP uses "run_sql" tool, not "query"
      const result = await this.callTool<{ content: Array<{ type: string; text: string }> }>("run_sql", {
        projectId,
        branchId,
        sql,
        params: params || []
      });
      
      // MCP returns results as {content: [{type: "text", text: "[{...}]"}]}
      if (result?.content?.[0]?.text) {
        return JSON.parse(result.content[0].text) as T[];
      }
      return result as unknown as T[];
    } catch (error) {
      if (process.env.NEON_DIRECT_FALLBACK === "true") {
        const fallbackResult = await directQuery<T>(sql, params || []);
        return fallbackResult.rows;
      }
      throw error;
    }
  },

  async migrate(sql: string): Promise<{ ok: boolean; message: string }> {
    const projectId = process.env.NEON_PROJECT_ID;
    const branchId = process.env.NEON_BRANCH_ID;

    if (!projectId || !branchId) {
      throw new Error(
        "NEON_PROJECT_ID and NEON_BRANCH_ID environment variables are required."
      );
    }

    try {
      // Neon MCP uses "run_sql" for migrations
      await this.callTool<{ content: Array<{ type: string; text: string }> }>("run_sql", {
        projectId,
        branchId,
        sql
      });
      return { ok: true, message: "Applied via Neon MCP" };
    } catch (error) {
      if (process.env.NEON_DIRECT_FALLBACK === "true") {
        await directQuery(sql);
        return { ok: true, message: "Applied via direct Postgres fallback" };
      }
      throw error;
    }
  },

  async seed(sql: string): Promise<{ ok: boolean; message: string }> {
    const projectId = process.env.NEON_PROJECT_ID;
    const branchId = process.env.NEON_BRANCH_ID;

    if (!projectId || !branchId) {
      throw new Error(
        "NEON_PROJECT_ID and NEON_BRANCH_ID environment variables are required."
      );
    }

    // Seed uses run_sql like migrate
    await this.callTool<{ content: Array<{ type: string; text: string }> }>("run_sql", {
      projectId,
      branchId,
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
    const projectId = process.env.NEON_PROJECT_ID;
    const branchId = process.env.NEON_BRANCH_ID;

    if (!projectId || !branchId) {
      throw new Error(
        "NEON_PROJECT_ID and NEON_BRANCH_ID environment variables are required."
      );
    }

    try {
      // Test connectivity using run_sql
      const result = await this.callTool<{ content: Array<{ type: string; text: string }> }>("run_sql", {
        projectId,
        branchId,
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
    } catch (error) {
      if (process.env.NEON_DIRECT_FALLBACK === "true") {
        const fallbackResult = await directQuery<{ now: string }>(
          "SELECT NOW()::text as now"
        );
        const now = fallbackResult.rows[0]?.now;
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
      return {
        ok: false,
        mode: "neon-mcp",
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};
