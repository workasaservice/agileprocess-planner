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
  referenceName: string;
  description: string;
  type: string;
  required: boolean;
  defaultValue?: number;
}

interface EffortTrackingConfig {
  processTemplate: {
    reuseExistingProcess?: boolean;
    existingProcessName?: string;
    createNewIfNotExists?: boolean;
    name: string;
    description: string;
    inheritsFrom: string;
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
  const { name, description, inheritsFrom } = config.processTemplate;

  console.log(`Creating inherited process: ${name}`);

  const result = await mcpClient.callTool("create-process", {
    name,
    description,
    parentProcessTypeId: inheritsFrom,
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
  console.log(`  Adding field: ${field.name} (${field.referenceName})`);

  try {
    await mcpClient.callTool("add-field-to-work-item-type", {
      processId,
      witRefName: workItemType,
      referenceName: field.referenceName,
      name: field.name,
      description: field.description,
      type: field.type,
      required: field.required,
      defaultValue: field.defaultValue,
    });

    console.log(`    ✓ Field added: ${field.name}`);
  } catch (error: any) {
    if (error.message?.includes("already exists")) {
      console.log(`    ⊙ Field already exists: ${field.name}`);
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
        referenceName: field.referenceName,
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
 */
async function storeConfigInDatabase(
  db: Pool,
  config: EffortTrackingConfig,
  processId: string,
  organizationUrl: string,
  projectName: string
): Promise<void> {
  console.log(`Storing configuration in database...`);

  const query = `
    INSERT INTO effort_tracking_config (
      organization_url,
      project_name,
      process_template_id,
      process_template_name,
      field_configuration,
      automation_rules,
      validation_rules,
      reporting_config,
      is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (organization_url, project_name)
    DO UPDATE SET
      process_template_id = EXCLUDED.process_template_id,
      field_configuration = EXCLUDED.field_configuration,
      automation_rules = EXCLUDED.automation_rules,
      validation_rules = EXCLUDED.validation_rules,
      reporting_config = EXCLUDED.reporting_config,
      updated_at = CURRENT_TIMESTAMP
  `;

  await db.query(query, [
    organizationUrl,
    projectName,
    processId,
    config.processTemplate.name,
    JSON.stringify(config.processTemplate.workItemTypes.Task.fields),
    JSON.stringify(config.automation),
    JSON.stringify(config.validation),
    JSON.stringify(config.reporting),
    true,
  ]);

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
