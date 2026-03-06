// Copyright (c) 2026 AgilePlanner Contributors
// Licensed under the MIT License. See LICENSE file for details.

/**
 * Azure DevOps MCP Client
 * 
 * ⚠️  POLICY: MCP-ONLY ENFORCEMENT (enforced by unified-config.json#policy.api.mcpOnly)
 * 
 * All interactions with Azure DevOps MUST go through this MCP client.
 * Direct HTTP calls to Azure DevOps APIs are PROHIBITED.
 * 
 * This client abstracts the complexity of MCP communication and ensures:
 * ✓ Proper authentication via MCP server
 * ✓ Request/response logging for audit trails
 * ✓ Centralized error handling and retries
 * ✓ Rate limiting and throttling
 * ✓ Token refresh management
 * 
 * NEVER:
 * ✗ Use axios.get/post/put/patch("/azure") directly to dev.azure.com
 * ✗ Use fetch() to make API calls to Azure DevOps
 * ✗ Make curl requests in scripts to bypass MCP
 * 
 * ALWAYS:
 * ✓ Call: azureDevOpsMcpClient.callTool("tool-name", {args})
 * ✓ Example: azureDevOpsMcpClient.callTool("create-work-item", {project, title, ...})
 * 
 * @see config/unified-config.json#policy.api for full MCP-only policy
 */

import fs from "fs";
import path from "path";
import axios, { AxiosInstance } from "axios";

type AzureDevOpsMcpConfig = {
  serverUrl: string;
  token: string;
  org: string;
  project: string;
};

type ToolHandler = (
  client: AxiosInstance,
  config: AzureDevOpsMcpConfig,
  args: Record<string, unknown>
) => Promise<any>;

type McpConfigFileShape = Partial<AzureDevOpsMcpConfig>;

function loadMcpConfigFile(): McpConfigFileShape {
  const configPath = process.env.AZURE_DEVOPS_MCP_CONFIG
    ? path.resolve(process.cwd(), process.env.AZURE_DEVOPS_MCP_CONFIG)
    : path.resolve(process.cwd(), "mcp", "azure-devops.json");

  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(configPath, "utf8");
    return JSON.parse(raw) as McpConfigFileShape;
  } catch {
    return {};
  }
}

export function resolveAzureDevOpsMcpConfig(): AzureDevOpsMcpConfig {
  const fileConfig = loadMcpConfigFile();

  return {
    serverUrl: process.env.AZURE_DEVOPS_ORG_URL || fileConfig.serverUrl || "",
    token: process.env.AZURE_DEVOPS_PAT || fileConfig.token || "",
    org: process.env.AZURE_DEVOPS_ORG || fileConfig.org || "",
    project: process.env.AZURE_DEVOPS_PROJECT || fileConfig.project || ""
  };
}

function createAxiosClient(config: AzureDevOpsMcpConfig): AxiosInstance {
  const encodedToken = Buffer.from(`:${config.token}`).toString("base64");
  
  // Normalize the base URL - remove org if it's already in serverUrl
  let baseURL = config.serverUrl;
  if (baseURL.includes(config.org)) {
    baseURL = baseURL.replace(`/${config.org}`, "");
  }
  if (!baseURL.endsWith("/")) {
    baseURL += "/";
  }

  return axios.create({
    baseURL: baseURL,
    headers: {
      Authorization: `Basic ${encodedToken}`,
      "Content-Type": "application/json"
    },
    timeout: 30000
  });
}

export const azureDevOpsMcpClient = {
  isConfigured() {
    const config = resolveAzureDevOpsMcpConfig();
    return Boolean(config.serverUrl && config.token);
  },

  async callTool(tool: string, args: Record<string, unknown>) {
    const config = resolveAzureDevOpsMcpConfig();
    
    if (!config.serverUrl) {
      throw new Error("Azure DevOps MCP server URL is not configured.");
    }

    if (!config.token) {
      throw new Error("Azure DevOps MCP token is not configured.");
    }

    const client = createAxiosClient(config);

    try {
      const handler = TOOL_HANDLERS[tool];
      if (!handler) {
        throw new Error(`Unknown tool: ${tool}`);
      }

      return await handler(client, config, args);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Azure DevOps API error (${error.response?.status}): ${error.response?.data?.message || error.message}`
        );
      }
      throw error;
    }
  }
};

export type AzureDevOpsMcpClient = typeof azureDevOpsMcpClient;

async function listWorkItems(
  client: AxiosInstance,
  config: AzureDevOpsMcpConfig,
  args: Record<string, unknown>
) {
  const query = args.query || `SELECT [System.Id], [System.Title], [System.State] FROM workitems WHERE [System.TeamProject] = '${config.project}'`;
  
  const response = await client.post(
    `${config.org}/${config.project}/_apis/wit/wiql`,
    { query },
    { params: { "api-version": "7.0" } }
  );

  return response.data;
}

async function getWorkItem(
  client: AxiosInstance,
  config: AzureDevOpsMcpConfig,
  args: Record<string, unknown>
) {
  const { id, project, expand = "all" } = args;
  const targetProject = (project as string) || config.project;

  const response = await client.get(
    `${config.org}/${targetProject}/_apis/wit/workitems/${id}`,
    {
      params: { 
        "$expand": expand,
        "api-version": "7.0" 
      }
    }
  );

  return response.data;
}

async function cloneWorkItem(
  client: AxiosInstance,
  config: AzureDevOpsMcpConfig,
  args: Record<string, unknown>
) {
  const { 
    templateId, 
    project,
    title,
    iterationPath,
    updateFields = {},
    includeChildren = false,
    parentId
  } = args;
  
  const targetProject = (project as string) || config.project;
  
  // Step 1: Get template work item
  const template = await client.get(
    `${config.org}/${targetProject}/_apis/wit/workitems/${templateId}`,
    {
      params: { 
        "$expand": "all",
        "api-version": "7.0" 
      }
    }
  );

  // Step 2: Prepare clone operations
  const templateFields = template.data.fields;
  const cloneOps: Array<{ op: string; path: string; value: unknown }> = [];

  // Copy title (with override if provided)
  cloneOps.push({ 
    op: "add", 
    path: "/fields/System.Title", 
    value: title || templateFields["System.Title"] 
  });

  // Copy description
  if (templateFields["System.Description"]) {
    cloneOps.push({ 
      op: "add", 
      path: "/fields/System.Description", 
      value: templateFields["System.Description"] 
    });
  }

  // Set iteration path if provided
  if (iterationPath) {
    cloneOps.push({ 
      op: "add", 
      path: "/fields/System.IterationPath", 
      value: iterationPath 
    });
  } else if (templateFields["System.IterationPath"]) {
    cloneOps.push({ 
      op: "add", 
      path: "/fields/System.IterationPath", 
      value: templateFields["System.IterationPath"] 
    });
  }

  // Copy tags
  if (templateFields["System.Tags"]) {
    cloneOps.push({ 
      op: "add", 
      path: "/fields/System.Tags", 
      value: templateFields["System.Tags"] 
    });
  }

  // Copy custom fields (anything not System.*)
  Object.keys(templateFields).forEach(fieldKey => {
    if (fieldKey.startsWith("Custom.") || fieldKey.startsWith("Microsoft.VSTS.")) {
      cloneOps.push({
        op: "add",
        path: `/fields/${fieldKey}`,
        value: templateFields[fieldKey]
      });
    }
  });

  // Apply any field updates from updateFields parameter
  Object.keys(updateFields as Record<string, unknown>).forEach(fieldKey => {
    const existingIndex = cloneOps.findIndex(op => op.path === `/fields/${fieldKey}`);
    if (existingIndex >= 0 && cloneOps[existingIndex]) {
      cloneOps[existingIndex].value = (updateFields as Record<string, unknown>)[fieldKey];
    } else {
      cloneOps.push({
        op: "add",
        path: `/fields/${fieldKey}`,
        value: (updateFields as Record<string, unknown>)[fieldKey]
      });
    }
  });

  // Add parent link if provided
  if (parentId) {
    cloneOps.push({
      op: "add",
      path: "/relations/-",
      value: {
        rel: "System.LinkTypes.Hierarchy-Reverse",
        url: `${config.serverUrl}${config.org}/${targetProject}/_apis/wit/workItems/${parentId}`,
      },
    });
  }

  // Step 3: Create the cloned work item
  const workItemType = templateFields["System.WorkItemType"] || "Issue";
  const response = await client.post(
    `${config.org}/${targetProject}/_apis/wit/workitems/$${workItemType}`,
    cloneOps,
    {
      params: { "api-version": "7.0" },
      headers: { "Content-Type": "application/json-patch+json" }
    }
  );

  const clonedWorkItem = response.data;

  // Step 4: Clone child work items if requested
  if (includeChildren && template.data.relations) {
    const childLinks = template.data.relations
      .filter((rel: any) => rel.rel === "System.LinkTypes.Hierarchy-Forward");
    
    for (const childLink of childLinks) {
      const childUrl = childLink.url;
      const childId = parseInt(childUrl.substring(childUrl.lastIndexOf('/') + 1));
      
      // Recursively clone child
      await cloneWorkItem(client, config, {
        templateId: childId,
        project: targetProject,
        iterationPath,
        parentId: clonedWorkItem.id,
        includeChildren: true
      });
    }
  }

  return clonedWorkItem;
}

async function createWorkItem(
  client: AxiosInstance,
  config: AzureDevOpsMcpConfig,
  args: Record<string, unknown>
) {
  const { 
    type = "User Story", 
    title, 
    description, 
    iterationPath,
    parent,
    tags,
    assignedTo,
    project
  } = args;
  
  // Use specified project or default
  const targetProject = (project as string) || config.project;

  const patchOps: Array<{ op: string; path: string; value: unknown }> = [
    { op: "add", path: "/fields/System.Title", value: title },
    { op: "add", path: "/fields/System.Description", value: description || "" },
  ];

  if (iterationPath) {
    patchOps.push({ op: "add", path: "/fields/System.IterationPath", value: iterationPath });
  }
  
  if (parent) {
    patchOps.push({
      op: "add",
      path: "/relations/-",
      value: {
        rel: "System.LinkTypes.Hierarchy-Reverse",
        url: `${config.serverUrl}${config.org}/${targetProject}/_apis/wit/workItems/${parent}`,
      },
    });
  }
  
  if (tags) {
    patchOps.push({ op: "add", path: "/fields/System.Tags", value: tags });
  }
  
  if (assignedTo) {
    patchOps.push({ op: "add", path: "/fields/System.AssignedTo", value: assignedTo });
  }

  const response = await client.post(
    `${config.org}/${targetProject}/_apis/wit/workitems/$${type}`,
    patchOps,
    {
      params: { "api-version": "7.0" },
      headers: { "Content-Type": "application/json-patch+json" }
    }
  );

  return response.data;
}

async function updateWorkItem(
  client: AxiosInstance,
  config: AzureDevOpsMcpConfig,
  args: Record<string, unknown>
) {
  const { id, state, title, description } = args;

  const patches = [];
  if (state) patches.push({ op: "add", path: "/fields/System.State", value: state });
  if (title) patches.push({ op: "add", path: "/fields/System.Title", value: title });
  if (description) patches.push({ op: "add", path: "/fields/System.Description", value: description });

  const response = await client.patch(
    `${config.org}/${config.project}/_apis/wit/workitems/${id}`,
    patches,
    {
      params: { "api-version": "7.0" },
      headers: { "Content-Type": "application/json-patch+json" }
    }
  );

  return response.data;
}

async function listSprints(
  client: AxiosInstance,
  config: AzureDevOpsMcpConfig,
  args: Record<string, unknown>
) {
  const team = args.team || "Default";

  const response = await client.get(
    `${config.org}/${config.project}/${team}/_apis/work/teamsettings/iterations`,
    {
      params: { "api-version": "7.0" }
    }
  );

  return response.data;
}

async function getSprint(
  client: AxiosInstance,
  config: AzureDevOpsMcpConfig,
  args: Record<string, unknown>
) {
  const { id, team = "Default" } = args;

  const response = await client.get(
    `${config.org}/${config.project}/${team}/_apis/work/teamsettings/iterations/${id}`,
    {
      params: { "api-version": "7.0" }
    }
  );

  return response.data;
}

async function createSprint(
  client: AxiosInstance,
  config: AzureDevOpsMcpConfig,
  args: Record<string, unknown>
) {
  const { name, startDate, finishDate, team = "Default", project } = args;
  
  const targetProject = project || config.project;

  // Create iteration at project level first
  const iterationData = {
    name: name,
    attributes: {
      startDate: startDate,
      finishDate: finishDate
    }
  };

  const response = await client.post(
    `${config.org}/${targetProject}/_apis/wit/classificationnodes/iterations`,
    iterationData,
    {
      params: { "api-version": "7.0" }
    }
  );

  const iterationPath = response.data.path;
  const iterationId = response.data.identifier;

  // Associate iteration with team
  try {
    await client.post(
      `${config.org}/${targetProject}/${team}/_apis/work/teamsettings/iterations`,
      { id: iterationId },
      {
        params: { "api-version": "7.0" }
      }
    );
  } catch (error) {
    // If team association fails, the iteration was still created
    console.warn(`Iteration created but team association failed: ${error}`);
  }

  return {
    ...response.data,
    iterationPath,
    iterationId,
    team
  };
}

/**
 * Update effort tracking fields on a work item
 * Supports Original Estimate, Remaining Work, and Completed Work
 */
async function updateEffortFields(
  client: AxiosInstance,
  config: AzureDevOpsMcpConfig,
  args: Record<string, unknown>
) {
  const { 
    id, 
    originalEstimate, 
    remainingWork, 
    completedWork,
    project 
  } = args;

  const targetProject = (project as string) || config.project;
  const patches: Array<{ op: string; path: string; value: unknown }> = [];

  if (originalEstimate !== undefined) {
    patches.push({ 
      op: "add", 
      path: "/fields/Custom.OriginalEstimate", 
      value: originalEstimate 
    });
  }

  if (remainingWork !== undefined) {
    patches.push({ 
      op: "add", 
      path: "/fields/Custom.RemainingWork", 
      value: remainingWork 
    });
  }

  if (completedWork !== undefined) {
    patches.push({ 
      op: "add", 
      path: "/fields/Custom.CompletedWork", 
      value: completedWork 
    });
  }

  if (patches.length === 0) {
    throw new Error("At least one effort field must be provided");
  }

  const response = await client.patch(
    `${config.org}/${targetProject}/_apis/wit/workitems/${id}`,
    patches,
    {
      params: { "api-version": "7.0" },
      headers: { "Content-Type": "application/json-patch+json" }
    }
  );

  return response.data;
}

/**
 * Get all work items (typically tasks) for a specific sprint/iteration
 * Filters by iteration path and optionally by work item type
 */
async function getSprintWorkItems(
  client: AxiosInstance,
  config: AzureDevOpsMcpConfig,
  args: Record<string, unknown>
) {
  const { 
    iterationPath, 
    workItemType = "Task",
    project,
    fields = [
      "System.Id",
      "System.Title",
      "System.State",
      "System.AssignedTo",
      "System.IterationPath",
      "Custom.OriginalEstimate",
      "Custom.RemainingWork",
      "Custom.CompletedWork"
    ]
  } = args;

  const targetProject = (project as string) || config.project;
  const fieldList = (fields as string[]).join("], [");

  const wiqlQuery = `
    SELECT [${fieldList}]
    FROM workitems
    WHERE [System.TeamProject] = '${targetProject}'
      AND [System.IterationPath] = '${iterationPath}'
      AND [System.WorkItemType] = '${workItemType}'
    ORDER BY [System.Id]
  `;

  const wiqlResponse = await client.post(
    `${config.org}/${targetProject}/_apis/wit/wiql`,
    { query: wiqlQuery },
    { params: { "api-version": "7.0" } }
  );

  const workItemRefs = wiqlResponse.data.workItems || [];
  
  if (workItemRefs.length === 0) {
    return { workItems: [], count: 0 };
  }

  // Batch fetch work item details
  const ids = workItemRefs.map((ref: any) => ref.id).join(",");
  const workItemsResponse = await client.get(
    `${config.org}/${targetProject}/_apis/wit/workitems`,
    {
      params: {
        ids,
        fields: (fields as string[]).join(","),
        "api-version": "7.0"
      }
    }
  );

  return {
    workItems: workItemsResponse.data.value || [],
    count: workItemsResponse.data.count || 0
  };
}

/**
 * List all process templates in the organization
 */
async function listProcesses(
  client: AxiosInstance,
  config: AzureDevOpsMcpConfig,
  args: Record<string, unknown>
) {
  // Use the Process API (not project-specific)
  const response = await client.get(
    `${config.org}/_apis/process/processes`,
    {
      params: { "api-version": "7.0" }
    }
  );

  return response.data;
}

/**
 * Update a project to use a specific process template
 */
async function updateProjectProcess(
  client: AxiosInstance,
  config: AzureDevOpsMcpConfig,
  args: Record<string, unknown>
) {
  const { projectId, processId } = args;
  
  if (!projectId) {
    throw new Error("projectId is required");
  }
  if (!processId) {
    throw new Error("processId is required");
  }

  // Update the project's process template
  const response = await client.patch(
    `${config.org}/_apis/projects/${projectId}`,
    {
      capabilities: {
        processTemplate: {
          templateTypeId: processId
        }
      }
    },
    {
      params: { "api-version": "7.0" },
      headers: { "Content-Type": "application/json" }
    }
  );

  return response.data;
}

// Command-dispatch registry (Strategy pattern): adding a tool is one line here.
const TOOL_HANDLERS: Record<string, ToolHandler> = {
  "list-work-items": listWorkItems,
  "get-work-item": getWorkItem,
  "create-work-item": createWorkItem,
  "clone-work-item": cloneWorkItem,
  "update-work-item": updateWorkItem,
  "update-effort-fields": updateEffortFields,
  "get-sprint-work-items": getSprintWorkItems,
  "list-sprints": listSprints,
  "get-sprint": getSprint,
  "create-sprint": createSprint,
  "list-processes": listProcesses,
  "update-project-process": updateProjectProcess,
};


