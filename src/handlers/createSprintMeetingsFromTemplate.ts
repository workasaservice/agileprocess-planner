import fs from "fs";
import path from "path";
import { azureDevOpsMcpClient } from "../clients/azureDevOpsMcpClient";
import { loadConfiguration } from "../lib/configLoader";

/**
 * Template settings configuration
 */
interface TemplateSettings {
  enabled: boolean;
  templates: {
    [projectName: string]: {
      templateWorkItemId: number | null;
      includeChildren: boolean;
    };
  };
}

/**
 * Meetings automation configuration
 */
interface MeetingsConfig {
  version: string;
  approach: string;
  templateSettings?: TemplateSettings;
  [key: string]: any;
}

/**
 * Load template configuration
 */
function loadTemplateConfig(): MeetingsConfig {
  const configPath = path.join(process.cwd(), "config", "meetings-automation.json");
  
  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }
  
  const content = fs.readFileSync(configPath, "utf-8");
  return JSON.parse(content);
}

/**
 * Load sprint iterations from config
 */
function loadSprintIterations() {
  const sprintsPath = path.join(process.cwd(), "config", "generated-iterations.json");
  
  if (!fs.existsSync(sprintsPath)) {
    throw new Error(`Sprint iterations file not found: ${sprintsPath}`);
  }
  
  const content = fs.readFileSync(sprintsPath, "utf-8");
  const data = JSON.parse(content);
  return data.results || data.iterations || [];
}

/**
 * Replace template placeholders with sprint-specific values
 */
function replaceTemplatePlaceholders(text: string, sprintName: string, dates: string): string {
  return text
    .replace(/TEMPLATE/g, "")
    .replace(/\{\{sprintName\}\}/g, sprintName)
    .replace(/\{\{dates\}\}/g, dates)
    .trim();
}

/**
 * Clone a meeting work item from template
 */
async function cloneMeetingFromTemplate(
  projectName: string,
  templateId: number,
  iterationPath: string,
  sprintName: string,
  includeChildren: boolean
): Promise<any> {
  console.log(`    Cloning from template ID ${templateId}...`);

  // Clone the work item using the MCP client
  const result = await azureDevOpsMcpClient.callTool("clone-work-item", {
    project: projectName,
    templateWorkItemId: templateId,
    updateFields: {
      "System.Title": `Meetings - ${sprintName}`,
      "System.IterationPath": iterationPath,
    },
    includeChildren: includeChildren,
  });

  return result;
}

/**
 * Validate template configuration
 */
function validateTemplateConfig(config: MeetingsConfig, projectName: string): void {
  if (!config.templateSettings || !config.templateSettings.enabled) {
    throw new Error(
      "Template-based creation is not enabled. Set templateSettings.enabled = true in meetings-automation.json"
    );
  }

  const templates = config.templateSettings.templates;
  if (!templates || !templates[projectName]) {
    throw new Error(
      `No template configuration found for project: ${projectName}\n` +
      `Add template settings to meetings-automation.json under templateSettings.templates.${projectName}`
    );
  }

  const templateId = templates[projectName].templateWorkItemId;
  if (!templateId || templateId === null) {
    throw new Error(
      `Template work item ID not configured for project: ${projectName}\n\n` +
      `To use template-based creation:\n` +
      `1. Manually create a "Meetings - TEMPLATE" work item in Azure DevOps UI\n` +
      `2. Add all standard tasks as children (one per team member or role)\n` +
      `3. Note the work item ID\n` +
      `4. Update meetings-automation.json:\n` +
      `   templateSettings.templates.${projectName}.templateWorkItemId = <ID>`
    );
  }
}

/**
 * Main handler: Create sprint meetings from template work items
 */
export async function createSprintMeetingsFromTemplate(options: {
  dryRun?: boolean;
} = {}): Promise<void> {
  const dryRun = options.dryRun ?? false;

  console.log("=== Create Sprint Meetings from Templates ===");
  console.log(`Dry Run: ${dryRun}`);
  console.log();

  // Load configurations
  const config = loadConfiguration();
  const meetingsConfig = loadTemplateConfig();
  const iterations = loadSprintIterations();

  if (!config) {
    throw new Error("Failed to load system configuration");
  }

  console.log(`Loaded ${config.projects.size} projects`);
  console.log(`Loaded ${iterations.length} sprint iterations`);
  console.log(`Approach: ${meetingsConfig.approach || "unknown"}`);
  console.log();

  let totalIssuesPlanned = 0;
  let totalTasksPlanned = 0;

  // Process each project
  for (const [projectId, project] of config.projects) {
    console.log(`\n--- Processing Project: ${project.projectName} ---`);

    // Validate template configuration for this project
    try {
      validateTemplateConfig(meetingsConfig, project.projectName);
    } catch (err: any) {
      console.error(`⊘ ${err.message}`);
      continue;
    }

    if (!meetingsConfig.templateSettings) {
      console.error(`⊘ Template settings not configured`);
      continue;
    }

    const templateSettings = meetingsConfig.templateSettings.templates[project.projectName];
    if (!templateSettings) {
      console.error(`⊘ No template settings for project ${project.projectName}`);
      continue;
    }

    const templateId = templateSettings.templateWorkItemId;
    if (!templateId) {
      console.error(`⊘ No template ID configured for project ${project.projectName}`);
      continue;
    }

    const includeChildren = templateSettings.includeChildren ?? true;

    console.log(`Template ID: ${templateId}`);
    console.log(`Include Children: ${includeChildren}`);

    // Process each sprint for this project
    const projectSprints = iterations.filter((s: any) => s.project === project.projectId || s.projectId === projectId);
    
    for (const sprint of projectSprints) {
      const sprintName = sprint.name || sprint.sprintName;
      const iterationPath = sprint.iterationPath;
      const sprintDates = `${sprint.startDate || "TBD"} - ${sprint.endDate || "TBD"}`;

      console.log(`\n  Sprint: ${sprintName}`);

      if (dryRun) {
        console.log(`    [DRY RUN] Would clone template ${templateId} → Meetings - ${sprintName}`);
        console.log(`    [DRY RUN] Iteration: ${iterationPath}`);
        if (includeChildren) {
          console.log(`    [DRY RUN] Would include all child tasks from template`);
        }
        totalIssuesPlanned++;
        // Estimate child tasks (this would need to query the template in a real scenario)
        if (includeChildren) {
          totalTasksPlanned += 5; // Placeholder estimate
        }
      } else {
        // Clone the work item from template
        const clonedResult: any = await cloneMeetingFromTemplate(
          project.projectName,
          templateId,
          iterationPath,
          sprintName,
          includeChildren
        );

        const clonedId = clonedResult.id;
        console.log(`    ✓ Cloned Issue ${clonedId}: Meetings - ${sprintName}`);
        totalIssuesPlanned++;

        if (includeChildren && clonedResult.childrenCloned) {
          const childCount = clonedResult.childrenCloned.length;
          console.log(`    ✓ Cloned ${childCount} child tasks`);
          totalTasksPlanned += childCount;
        }
      }
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Total Issues: ${totalIssuesPlanned}`);
  console.log(`Total Tasks: ${totalTasksPlanned} ${dryRun ? "(estimated)" : ""}`);
  console.log(`Total Work Items: ${totalIssuesPlanned + totalTasksPlanned}`);
  
  if (dryRun) {
    console.log("\n[DRY RUN] No work items were created. Remove --dryRun to execute.");
  } else {
    console.log("\n✓ Sprint meetings created successfully from templates!");
  }
}
