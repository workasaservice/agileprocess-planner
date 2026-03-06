/**
 * Initialize Effort Tracking Fields
 * Creates or updates Azure DevOps process template with custom effort fields
 * for task work items (Original Estimate, Remaining Work, Completed Work)
 */

import { Pool } from "pg";
import { AzureDevOpsMcpClient } from "../clients/azureDevOpsMcpClient";
import * as fs from "fs";
import * as path from "path";

interface EffortFieldConfig {
  name: string;
  displayName: string;
  description: string;
  type: string;
  isRequired: boolean;
  defaultValue?: number;
  layoutGroup?: string;
  layoutOrder?: number;
}

interface EffortTrackingConfig {
  processTemplate: {
    reuseExistingProcess?: boolean;
    existingProcessName?: string;
    createNewIfNotExists?: boolean;
    name: string;
    description: string;
    baseProcess: string;
    workItemTypes: {
      Task: {
        fields: EffortFieldConfig[];
        layout: {
          section: string;
          group: string;
          order: number;
        };
      };
    };
  };
  automation: any;
  validation: any;
  reporting: any;
}

/**
 * Load effort tracking configuration
 */
function loadEffortConfig(): EffortTrackingConfig {
  const configPath = path.join(
    process.cwd(),
    "config",
    "effort-tracking-config.json"
  );
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

/**
 * Check if a process template exists
 */
async function processExists(
  mcpClient: AzureDevOpsMcpClient,
  processName: string
): Promise<string | null> {
  try {
    const result = await mcpClient.callTool("list-processes", {});
    const processes = result.value || [];
    
    const found = processes.find(
      (p: any) => p.name === processName
    );
    
    return found ? found.typeId : null;
  } catch (error) {
    console.error(`Error checking process existence:`, error);
    return null;
  }
}

/**
 * Create an inherited process from Agile
 */
async function createInheritedProcess(
  mcpClient: AzureDevOpsMcpClient,
  config: EffortTrackingConfig
): Promise<string> {
  const { name, description, baseProcess } = config.processTemplate;

  console.log(`Creating inherited process: ${name}`);

  const result = await mcpClient.callTool("create-process", {
    name,
    description,
    parentProcessTypeId: baseProcess,
  });

  console.log(`✓ Process created: ${name} (ID: ${result.typeId})`);
  return result.typeId;
}

/**
 * Add custom field to work item type
 */
async function addCustomField(
  mcpClient: AzureDevOpsMcpClient,
  processId: string,
  workItemType: string,
  field: EffortFieldConfig
): Promise<void> {
  console.log(`  Adding field: ${field.displayName} (${field.name})`);

  try {
    await mcpClient.callTool("add-field-to-work-item-type", {
      processId,
      witRefName: workItemType,
      referenceName: field.name,
      name: field.displayName,
      description: field.description,
      type: field.type,
      required: field.isRequired,
      defaultValue: field.defaultValue,
    });

    console.log(`    ✓ Field added: ${field.displayName}`);
  } catch (error: any) {
    if (error.message?.includes("already exists")) {
      console.log(`    ⊙ Field already exists: ${field.displayName}`);
    } else {
      throw error;
    }
  }
}

/**
 * Configure field layout (grouping and ordering)
 */
async function configureFieldLayout(
  mcpClient: AzureDevOpsMcpClient,
  processId: string,
  workItemType: string,
  fields: EffortFieldConfig[],
  layout: { section: string; group: string; order: number }
): Promise<void> {
  console.log(`  Configuring field layout: ${layout.group}`);

  try {
    await mcpClient.callTool("add-group-to-work-item-type", {
      processId,
      witRefName: workItemType,
      pageId: layout.section,
      groupId: layout.group,
      label: layout.group,
      order: layout.order,
    });

    console.log(`    ✓ Group created: ${layout.group}`);
  } catch (error: any) {
    if (error.message?.includes("already exists")) {
      console.log(`    ⊙ Group already exists: ${layout.group}`);
    } else {
      console.warn(`    ⚠ Could not create group:`, error.message);
    }
  }

  // Add each field to the group
  for (const field of fields) {
    try {
      await mcpClient.callTool("add-field-to-group", {
        processId,
        witRefName: workItemType,
        groupId: layout.group,
        referenceName: field.name,
      });

      console.log(`    ✓ Field added to group: ${field.name}`);
    } catch (error: any) {
      console.warn(`    ⚠ Could not add field to group:`, error.message);
    }
  }
}

/**
 * Apply process template to project
 */
async function applyProcessToProject(
  mcpClient: AzureDevOpsMcpClient,
  processId: string,
  projectName: string
): Promise<void> {
  console.log(`Applying process to project: ${projectName}`);

  try {
    await mcpClient.callTool("update-project-process", {
      projectId: projectName,
      processId,
    });

    console.log(`✓ Process applied to project: ${projectName}`);
  } catch (error: any) {
    if (error.message?.includes("already using")) {
      console.log(`⊙ Project already using this process: ${projectName}`);
    } else {
      throw error;
    }
  }
}

/**
 * Store effort tracking configuration in database
 * Inserts one row per field into effort_tracking_config to match the schema.
 */
async function storeConfigInDatabase(
  db: Pool,
  config: EffortTrackingConfig,
  processId: string,
  _organizationUrl: string,
  _projectName: string
): Promise<void> {
  console.log(`Storing configuration in database...`);

  const insertFieldQuery = `
    INSERT INTO effort_tracking_config (
      process_id,
      work_item_type,
      field_name,
      field_display_name,
      field_type,
      default_value,
      is_required,
      layout_group,
      layout_order
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (process_id, work_item_type, field_name)
    DO UPDATE SET
      field_display_name = EXCLUDED.field_display_name,
      field_type = EXCLUDED.field_type,
      default_value = EXCLUDED.default_value,
      is_required = EXCLUDED.is_required,
      layout_group = EXCLUDED.layout_group,
      layout_order = EXCLUDED.layout_order,
      updated_at = CURRENT_TIMESTAMP
  `;

  const taskFields = config.processTemplate.workItemTypes.Task.fields;

  for (const field of taskFields) {
    await db.query(insertFieldQuery, [
      processId,
      "Task",
      field.name,
      field.displayName,
      field.type,
      field.defaultValue ?? null,
      field.isRequired,
      field.layoutGroup ?? null,
      field.layoutOrder ?? null,
    ]);
  }

  console.log(`✓ Configuration stored in database`);
}

/**
 * Main handler: Initialize effort tracking fields
 */
export async function initEffortFields(
  db: Pool,
  mcpClient: AzureDevOpsMcpClient,
  options: {
    organizationUrl: string;
    projectName: string;
    applyToProject?: boolean;
  }
): Promise<void> {
  console.log("\n=== Initializing Effort Tracking Fields ===\n");

  const { organizationUrl, projectName, applyToProject = true } = options;

  // Load configuration
  const config = loadEffortConfig();
  console.log(`Loaded config: ${config.processTemplate.name}`);

  // Check for existing process based on configuration
  let processId: string | null = null;
  
  if (config.processTemplate.reuseExistingProcess) {
    const existingProcessName = config.processTemplate.existingProcessName ?? "WaaS";
    console.log(`Looking for existing process: ${existingProcessName}`);
    processId = await processExists(
      mcpClient,
      existingProcessName
    );
    
    if (!processId) {
      if (config.processTemplate.createNewIfNotExists) {
        console.log(`Process not found. Creating new process: ${config.processTemplate.name}`);
        processId = await createInheritedProcess(mcpClient, config);
      } else {
        throw new Error(
          `Process "${existingProcessName}" not found and createNewIfNotExists is false`
        );
      }
    } else {
      console.log(`⊙ Found existing process: ${existingProcessName} (ID: ${processId})`);
    }
  } else {
    // Create or check for new process
    processId = await processExists(
      mcpClient,
      config.processTemplate.name
    );

    if (!processId) {
      processId = await createInheritedProcess(mcpClient, config);
    } else {
      console.log(`⊙ Process already exists: ${config.processTemplate.name} (ID: ${processId})`);
    }
  }

  // Add custom fields to Task work item type
  console.log(`\nConfiguring Task work item type...`);
  const taskConfig = config.processTemplate.workItemTypes.Task;

  for (const field of taskConfig.fields) {
    await addCustomField(
      mcpClient,
      processId,
      "Microsoft.VSTS.WorkItemTypes.Task",
      field
    );
  }

  // Configure field layout
  await configureFieldLayout(
    mcpClient,
    processId,
    "Microsoft.VSTS.WorkItemTypes.Task",
    taskConfig.fields,
    taskConfig.layout
  );

  // Apply process to project if requested
  if (applyToProject) {
    console.log();
    await applyProcessToProject(mcpClient, processId, projectName);
  }

  // Store configuration in database
  console.log();
  await storeConfigInDatabase(
    db,
    config,
    processId,
    organizationUrl,
    projectName
  );

  console.log("\n✓ Effort tracking fields initialized successfully\n");
}
