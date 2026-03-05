import fs from "fs";
import path from "path";
import { azureDevOpsMcpClient } from "../clients/azureDevOpsMcpClient";

interface AutomationConfig {
  description: string;
  schedule: {
    startDate: string;
    endDate: string;
    sprintDurationWeeks: number;
    workingDays: string[];
    namingTemplate: string;
    dateFormat: string;
  };
  projects: Array<{
    project: string;
    team: string;
    enabled: boolean;
  }>;
  execution: {
    dryRun: boolean;
    skipExisting: boolean;
    outputFile: string;
  };
  validation: {
    requireMondayStart: boolean;
    requireFridayEnd: boolean;
    maxSprintsPerProject: number;
  };
}

interface SprintWindow {
  name: string;
  startDate: string;
  finishDate: string;
  project: string;
  team: string;
}

interface CreatedIteration {
  project: string;
  team: string;
  name: string;
  startDate: string;
  finishDate: string;
  iterationId?: string;
  iterationPath?: string;
  status: "created" | "skipped" | "error";
  error?: string;
}

function loadConfig(configPath?: string): AutomationConfig {
  const defaultPath = path.resolve(process.cwd(), "config/capacity-automation.json");
  const targetPath = configPath ? path.resolve(process.cwd(), configPath) : defaultPath;

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Configuration file not found: ${targetPath}`);
  }

  const raw = fs.readFileSync(targetPath, "utf8");
  return JSON.parse(raw) as AutomationConfig;
}

function parseDate(dateStr: string): Date {
  // Parse as local date to avoid timezone issues
  const parts = dateStr.split('-');
  if (parts.length !== 3) {
    throw new Error(`Invalid date format: ${dateStr}. Expected YYYY-MM-DD`);
  }
  const year = parseInt(parts[0]!, 10);
  const month = parseInt(parts[1]!, 10) - 1; // Month is 0-indexed
  const day = parseInt(parts[2]!, 10);
  return new Date(year, month, day);
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNextMonday(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  result.setDate(result.getDate() + daysUntilMonday);
  return result;
}

function addWeeks(date: Date, weeks: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + weeks * 7);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getLastFridayOfWeek(monday: Date): Date {
  // For a 2-week sprint starting Monday, the last Friday is 11 days later
  // Week 1: Mon(0), Tue(1), Wed(2), Thu(3), Fri(4)
  // Week 2: Mon(7), Tue(8), Wed(9), Thu(10), Fri(11)
  return addDays(monday, 11);
}

function generateSprintWindows(config: AutomationConfig): SprintWindow[] {
  const windows: SprintWindow[] = [];
  const startDate = parseDate(config.schedule.startDate);
  const endDate = parseDate(config.schedule.endDate);
  const durationWeeks = config.schedule.sprintDurationWeeks;

  // Validate start date is Monday if required
  if (config.validation.requireMondayStart && startDate.getDay() !== 1) {
    throw new Error(`Start date ${config.schedule.startDate} is not a Monday`);
  }

  let currentStart = new Date(startDate);

  for (const projectConfig of config.projects) {
    if (!projectConfig.enabled) {
      continue;
    }

    let sprintCount = 0;
    currentStart = new Date(startDate);

    while (currentStart <= endDate && sprintCount < config.validation.maxSprintsPerProject) {
      const finishDate = getLastFridayOfWeek(currentStart);

      // Stop if finish date exceeds end date
      if (finishDate > endDate) {
        break;
      }

      const sprintName = config.schedule.namingTemplate.replace("{date}", formatDate(currentStart));

      windows.push({
        name: sprintName,
        startDate: formatDate(currentStart),
        finishDate: formatDate(finishDate),
        project: projectConfig.project,
        team: projectConfig.team
      });

      sprintCount++;
      currentStart = addWeeks(currentStart, durationWeeks);
    }
  }

  return windows;
}

async function getExistingSprints(project: string, team: string): Promise<Set<string>> {
  try {
    const result = await azureDevOpsMcpClient.callTool("list-sprints", { project, team });
    const sprints = result.value || [];
    return new Set(sprints.map((s: any) => s.name));
  } catch (error) {
    console.warn(`Could not fetch existing sprints for ${project}: ${error}`);
    return new Set();
  }
}

async function createSprintViaMcp(window: SprintWindow, dryRun: boolean): Promise<CreatedIteration> {
  const result: CreatedIteration = {
    project: window.project,
    team: window.team,
    name: window.name,
    startDate: window.startDate,
    finishDate: window.finishDate,
    status: "created"
  };

  if (dryRun) {
    result.status = "skipped";
    return result;
  }

  try {
    const mcpResult = await azureDevOpsMcpClient.callTool("create-sprint", {
      project: window.project,
      team: window.team,
      name: window.name,
      startDate: window.startDate,
      finishDate: window.finishDate
    });

    result.iterationId = mcpResult.iterationId || mcpResult.identifier;
    result.iterationPath = mcpResult.iterationPath || mcpResult.path;
    result.status = "created";
  } catch (error) {
    result.status = "error";
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

export async function createSprints(input: any) {
  const configPath = input.config || input.configPath;
  const config = loadConfig(configPath);

  console.log(`\n📅 Sprint Creation Automation`);
  console.log(`Mode: ${config.execution.dryRun ? "DRY RUN" : "APPLY"}`);
  console.log(`Schedule: ${config.schedule.startDate} to ${config.schedule.endDate}`);
  console.log(`Duration: ${config.schedule.sprintDurationWeeks} weeks per sprint\n`);

  // Generate sprint windows
  const windows = generateSprintWindows(config);
  console.log(`Generated ${windows.length} sprint windows across ${config.projects.filter(p => p.enabled).length} projects\n`);

  const results: CreatedIteration[] = [];

  // Group windows by project for batch operations
  const windowsByProject = new Map<string, SprintWindow[]>();
  for (const window of windows) {
    const key = `${window.project}::${window.team}`;
    if (!windowsByProject.has(key)) {
      windowsByProject.set(key, []);
    }
    windowsByProject.get(key)!.push(window);
  }

  // Process each project
  for (const [projectKey, projectWindows] of windowsByProject) {
    const parts = projectKey.split("::");
    const project = parts[0];
    const team = parts[1];
    
    if (!project || !team) {
      console.error(`Invalid project key: ${projectKey}`);
      continue;
    }
    
    console.log(`\n🔧 Processing ${project} (${team})...`);

    // Get existing sprints if we need to skip them
    let existingSprints = new Set<string>();
    if (config.execution.skipExisting) {
      existingSprints = await getExistingSprints(project, team);
      console.log(`   Found ${existingSprints.size} existing sprints`);
    }

    // Create each sprint
    for (const window of projectWindows) {
      if (config.execution.skipExisting && existingSprints.has(window.name)) {
        console.log(`   ⏭️  Skipping existing: ${window.name}`);
        results.push({
          ...window,
          status: "skipped"
        });
        continue;
      }

      if (config.execution.dryRun) {
        console.log(`   🔍 Would create: ${window.name} (${window.startDate} to ${window.finishDate})`);
      } else {
        console.log(`   ✨ Creating: ${window.name} (${window.startDate} to ${window.finishDate})`);
      }

      const result = await createSprintViaMcp(window, config.execution.dryRun);
      results.push(result);

      if (result.status === "error") {
        console.error(`   ❌ Error: ${result.error}`);
      } else if (result.status === "created") {
        console.log(`   ✅ Created: ${result.iterationId}`);
      }
    }
  }

  // Generate summary
  const summary = {
    total: results.length,
    created: results.filter(r => r.status === "created").length,
    skipped: results.filter(r => r.status === "skipped").length,
    errors: results.filter(r => r.status === "error").length,
    results
  };

  console.log(`\n📊 Summary:`);
  console.log(`   Total:   ${summary.total}`);
  console.log(`   Created: ${summary.created}`);
  console.log(`   Skipped: ${summary.skipped}`);
  console.log(`   Errors:  ${summary.errors}`);

  // Write output file if not dry run
  if (!config.execution.dryRun && config.execution.outputFile) {
    const outputPath = path.resolve(process.cwd(), config.execution.outputFile);
    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), "utf8");
    console.log(`\n💾 Output written to: ${config.execution.outputFile}`);
  }

  return summary;
}
