import fs from "fs";
import path from "path";
import { azureDevOpsMcpClient } from "../clients/azureDevOpsMcpClient";
import { loadConfiguration, User, Project } from "../lib/configLoader";

/**
 * Configuration structure for meetings automation
 */
interface MeetingsConfig {
  workItemTemplates: {
    epic: {
      type: string;
      title: string;
      description: string;
      tags: string[];
    };
    feature: {
      type: string;
      title: string;
      description: string;
      tags: string[];
    };
    userStory: {
      type: string;
      title: string;
      descriptionTemplate: string;
      tags: string[];
      acceptanceCriteria: string[];
    };
    task: {
      type: string;
      titleTemplate: string;
      descriptionTemplate: string;
      tags: string[];
      estimatedHours: number;
    };
  };
  projects: Array<{
    projectId: string;
    projectName: string;
    teamName: string;
    enabled: boolean;
  }>;
  settings: {
    createEpicPerProject: boolean;
    createFeaturePerProject: boolean;
    createUserStoryPerSprint: boolean;
    createTaskPerTeamMember: boolean;
    assignTasksToMembers: boolean;
    linkWorkItemHierarchy: boolean;
    skipExistingWorkItems: boolean;
    saveWorkItemIds: boolean;
    outputFile: string;
  };
}

/**
 * Sprint iteration structure from generated-iterations.json
 */
interface SprintIteration {
  projectId: string;
  projectName: string;
  sprintName: string;
  iterationId: string;
  iterationPath: string;
  startDate: string;
  finishDate: string;
}

/**
 * Created work item tracking
 */
interface CreatedWorkItem {
  id: number | string;
  type: string;
  title: string;
  url?: string;
  projectId: string;
  parentId?: number | string;
  sprintPath?: string;
}

/**
 * Output structure for tracking created work items
 */
interface MeetingsWorkItemsOutput {
  createdAt: string;
  totalWorkItems: number;
  breakdown: {
    epics: number;
    features: number;
    userStories: number;
    tasks: number;
  };
  projects: Array<{
    projectId: string;
    projectName: string;
    epicId: number | string;
    featureId: number | string;
    sprints: Array<{
      sprintName: string;
      iterationPath: string;
      userStoryId: number | string;
      tasks: Array<{
        taskId: number | string;
        firstName: string;
        userId: string;
      }>;
    }>;
  }>;
}

/**
 * Load meetings automation configuration
 */
function loadMeetingsConfig(): MeetingsConfig {
  const configPath = path.join(process.cwd(), "config", "meetings-automation.json");
  
  if (!fs.existsSync(configPath)) {
    throw new Error(`Meetings configuration not found at ${configPath}`);
  }
  
  const configContent = fs.readFileSync(configPath, "utf-8");
  return JSON.parse(configContent) as MeetingsConfig;
}

/**
 * Load sprint iterations from generated-iterations.json
 */
function loadSprintIterations(): SprintIteration[] {
  const iterationsPath = path.join(process.cwd(), "config", "generated-iterations.json");
  
  if (!fs.existsSync(iterationsPath)) {
    throw new Error(`Sprint iterations not found at ${iterationsPath}`);
  }
  
  const iterationsContent = fs.readFileSync(iterationsPath, "utf-8");
  const data = JSON.parse(iterationsContent);
  
  // The file has structure: { results: [ { project, name, startDate, ... } ] }
  const rawResults = data.results || [];
  
  // Transform to our expected format
  return rawResults.map((item: any) => ({
    projectId: item.project,
    projectName: item.project,
    sprintName: item.name,
    iterationId: item.iterationId,
    iterationPath: item.iterationPath,
    startDate: item.startDate,
    finishDate: item.finishDate,
  }));
}

/**
 * Get team members for a project with their roles
 */
function getProjectTeamMembers(projectId: string, config: ReturnType<typeof loadConfiguration>): User[] {
  if (!config) {
    throw new Error("Configuration not loaded");
  }
  
  const project = config.projects.get(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found in configuration`);
  }
  
  const teamMembers: User[] = [];
  
  for (const userId of project.members) {
    const user = config.users.get(userId);
    if (user) {
      teamMembers.push(user);
    }
  }
  
  return teamMembers;
}

/**
 * Replace template variables
 */
function replaceTemplateVars(template: string, vars: Record<string, string>): string {
  let result = template;
  
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  
  return result;
}

/**
 * Create Epic for a project
 */
async function createEpic(
  config: MeetingsConfig,
  projectConfig: Project,
  dryRun: boolean
): Promise<CreatedWorkItem> {
  const epicTemplate = config.workItemTemplates.epic;
  
  console.log(`\n📋 Creating Epic: "${epicTemplate.title}" in ${projectConfig.projectName}...`);
  
  if (dryRun) {
    console.log(`   [DRY RUN] Would create Epic with:`);
    console.log(`   - Title: ${epicTemplate.title}`);
    console.log(`   - Description: ${epicTemplate.description}`);
    console.log(`   - Tags: ${epicTemplate.tags.join(", ")}`);
    
    return {
      id: `epic-${projectConfig.projectId}-dryrun`,
      type: epicTemplate.type,
      title: epicTemplate.title,
      projectId: projectConfig.projectId,
    };
  }
  
  const response = await azureDevOpsMcpClient.callTool("create-work-item", {
    type: epicTemplate.type,
    title: epicTemplate.title,
    description: epicTemplate.description,
    tags: epicTemplate.tags.join("; "),
    project: projectConfig.projectName,
  });
  
  const workItem = response as any;
  console.log(`   ✅ Epic created: ID ${workItem.id}`);
  
  return {
    id: workItem.id,
    type: epicTemplate.type,
    title: epicTemplate.title,
    url: workItem.url,
    projectId: projectConfig.projectId,
  };
}

/**
 * Create Feature for a project (child of Epic)
 */
async function createFeature(
  config: MeetingsConfig,
  projectConfig: Project,
  epicId: number | string,
  dryRun: boolean
): Promise<CreatedWorkItem> {
  const featureTemplate = config.workItemTemplates.feature;
  
  console.log(`\n📋 Creating Feature: "${featureTemplate.title}" in ${projectConfig.projectName}...`);
  
  if (dryRun) {
    console.log(`   [DRY RUN] Would create Feature with:`);
    console.log(`   - Title: ${featureTemplate.title}`);
    console.log(`   - Parent: Epic ${epicId}`);
    console.log(`   - Description: ${featureTemplate.description}`);
    console.log(`   - Tags: ${featureTemplate.tags.join(", ")}`);
    
    return {
      id: `feature-${projectConfig.projectId}-dryrun`,
      type: featureTemplate.type,
      title: featureTemplate.title,
      projectId: projectConfig.projectId,
      parentId: epicId,
    };
  }
  
  const response = await azureDevOpsMcpClient.callTool("create-work-item", {
    type: featureTemplate.type,
    title: featureTemplate.title,
    description: featureTemplate.description,
    tags: featureTemplate.tags.join("; "),
    parent: epicId.toString(),
    project: projectConfig.projectName,
  });
  
  const workItem = response as any;
  console.log(`   ✅ Feature created: ID ${workItem.id}`);
  
  return {
    id: workItem.id,
    type: featureTemplate.type,
    title: featureTemplate.title,
    url: workItem.url,
    projectId: projectConfig.projectId,
    parentId: epicId,
  };
}

/**
 * Create User Story for a sprint (child of Feature)
 */
async function createUserStory(
  config: MeetingsConfig,
  projectConfig: Project,
  sprint: SprintIteration,
  featureId: number | string,
  sprintNumber: number,
  dryRun: boolean
): Promise<CreatedWorkItem> {
  const userStoryTemplate = config.workItemTemplates.userStory;
  
  const description = replaceTemplateVars(userStoryTemplate.descriptionTemplate, {
    sprintName: sprint.sprintName,
    startDate: sprint.startDate,
    finishDate: sprint.finishDate,
  });
  
  const tags = userStoryTemplate.tags.map(tag => 
    replaceTemplateVars(tag, { sprintNumber: sprintNumber.toString() })
  );
  
  console.log(`\n   📝 Creating User Story: "${userStoryTemplate.title}" for ${sprint.sprintName}...`);
  
  if (dryRun) {
    console.log(`      [DRY RUN] Would create User Story with:`);
    console.log(`      - Title: ${userStoryTemplate.title}`);
    console.log(`      - Parent: Feature ${featureId}`);
    console.log(`      - Iteration: ${sprint.iterationPath}`);
    console.log(`      - Acceptance Criteria: ${userStoryTemplate.acceptanceCriteria.length} items`);
    
    return {
      id: `us-${sprint.sprintName}-dryrun`,
      type: userStoryTemplate.type,
      title: userStoryTemplate.title,
      projectId: projectConfig.projectId,
      parentId: featureId,
      sprintPath: sprint.iterationPath,
    };
  }
  
  // Format acceptance criteria as HTML list
  const acceptanceCriteria = userStoryTemplate.acceptanceCriteria
    .map(criterion => `<li>${criterion}</li>`)
    .join("\n");
  
  const fullDescription = `${description}\n\n<h3>Acceptance Criteria:</h3>\n<ul>\n${acceptanceCriteria}\n</ul>`;
  
  // Clean iteration path: remove leading backslash and \Iteration\ segment
  let cleanIterationPath = sprint.iterationPath.replace(/^\\+/, '');
  cleanIterationPath = cleanIterationPath.replace(/\\Iteration\\/, '\\');
  
  const response = await azureDevOpsMcpClient.callTool("create-work-item", {
    type: userStoryTemplate.type,
    title: userStoryTemplate.title,
    description: fullDescription,
    tags: tags.join("; "),
    parent: featureId.toString(),
    iterationPath: cleanIterationPath,
    project: projectConfig.projectName,
  });
  
  const workItem = response as any;
  console.log(`      ✅ User Story created: ID ${workItem.id}`);
  
  return {
    id: workItem.id,
    type: userStoryTemplate.type,
    title: userStoryTemplate.title,
    url: workItem.url,
    projectId: projectConfig.projectId,
    parentId: featureId,
    sprintPath: sprint.iterationPath,
  };
}

/**
 * Create Task for a team member (child of User Story)
 */
async function createTask(
  config: MeetingsConfig,
  projectConfig: Project,
  sprint: SprintIteration,
  user: User,
  userStoryId: number | string,
  dryRun: boolean
): Promise<CreatedWorkItem> {
  const taskTemplate = config.workItemTemplates.task;
  
  const title = replaceTemplateVars(taskTemplate.titleTemplate, {
    firstName: user.givenName,
  });
  
  const description = replaceTemplateVars(taskTemplate.descriptionTemplate, {
    firstName: user.givenName,
    fullName: user.displayName,
    sprintName: sprint.sprintName,
  });
  
  if (dryRun) {
    console.log(`         [DRY RUN] Task: ${title} (assigned to ${user.userPrincipalName})`);
    
    return {
      id: `task-${user.userId}-${sprint.sprintName}-dryrun`,
      type: taskTemplate.type,
      title: title,
      projectId: projectConfig.projectId,
      parentId: userStoryId,
      sprintPath: sprint.iterationPath,
    };
  }
  
  // Clean iteration path: remove leading backslash and \Iteration\ segment
  let cleanIterationPath = sprint.iterationPath.replace(/^\\+/, '');
  cleanIterationPath = cleanIterationPath.replace(/\\Iteration\\/, '\\');
  
  const taskParams: any = {
    type: taskTemplate.type,
    title: title,
    description: description,
    tags: taskTemplate.tags.join("; "),
    parent: userStoryId.toString(),
    iterationPath: cleanIterationPath,
    project: projectConfig.projectName,
  };
  
  // Assign task to team member if enabled
  if (config.settings.assignTasksToMembers) {
    taskParams.assignedTo = user.userPrincipalName;
  }
  
  const response = await azureDevOpsMcpClient.callTool("create-work-item", taskParams);
  
  const workItem = response as any;
  
  return {
    id: workItem.id,
    type: taskTemplate.type,
    title: title,
    url: workItem.url,
    projectId: projectConfig.projectId,
    parentId: userStoryId,
    sprintPath: sprint.iterationPath,
  };
}

/**
 * Save created work items to output file
 */
function saveWorkItemsOutput(output: MeetingsWorkItemsOutput, outputPath: string) {
  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });
  
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n💾 Work items saved to: ${outputPath}`);
}

/**
 * Main handler for creating sprint meetings work items
 */
export async function createSprintMeetings(options: { dryRun?: boolean } = {}) {
  const dryRun = options.dryRun ?? false;
  
  console.log("\n🚀 Sprint Meetings Automation");
  console.log("================================\n");
  
  if (dryRun) {
    console.log("⚠️  DRY RUN MODE - No work items will be created\n");
  }
  
  // Validate MCP client
  if (!azureDevOpsMcpClient.isConfigured()) {
    throw new Error("Azure DevOps MCP client is not configured.");
  }
  
  // Load all configurations
  console.log("📂 Loading configurations...");
  const meetingsConfig = loadMeetingsConfig();
  const sprintIterations = loadSprintIterations();
  const systemConfig = loadConfiguration();
  
  if (!systemConfig) {
    throw new Error("Failed to load system configuration");
  }
  
  console.log(`   ✅ Loaded ${sprintIterations.length} sprint iterations`);
  console.log(`   ✅ Loaded ${systemConfig.users.size} users`);
  console.log(`   ✅ Loaded ${systemConfig.projects.size} projects`);
  
  // Initialize output tracking
  const output: MeetingsWorkItemsOutput = {
    createdAt: new Date().toISOString(),
    totalWorkItems: 0,
    breakdown: {
      epics: 0,
      features: 0,
      userStories: 0,
      tasks: 0,
    },
    projects: [],
  };
  
  // Process each project
  for (const projectSettings of meetingsConfig.projects) {
    if (!projectSettings.enabled) {
      console.log(`\n⏭️  Skipping disabled project: ${projectSettings.projectName}`);
      continue;
    }
    
    console.log(`\n\n🎯 Processing Project: ${projectSettings.projectName}`);
    console.log("=".repeat(60));
    
    // Get project configuration
    const projectConfig = systemConfig.projects.get(projectSettings.projectId);
    if (!projectConfig) {
      console.warn(`Warning: Project ${projectSettings.projectId} not found in system config, skipping...`);
      continue;
    }
    
    // Get team members
    const teamMembers = getProjectTeamMembers(projectSettings.projectId, systemConfig);
    console.log(`   👥 Team has ${teamMembers.length} members`);
    
    // Create Epic
    const epic = await createEpic(meetingsConfig, projectConfig, dryRun);
    output.breakdown.epics++;
    
    // Initialize project output
    const projectOutput: any = {
      projectId: projectSettings.projectId,
      projectName: projectSettings.projectName,
      epicId: epic.id,
      sprints: [],
    };
    
    // Create Feature (child of Epic) - only if enabled
    let parentId = epic.id;
    if (meetingsConfig.settings.createFeaturePerProject) {
      const feature = await createFeature(meetingsConfig, projectConfig, epic.id, dryRun);
      output.breakdown.features++;
      parentId = feature.id;
      projectOutput.featureId = feature.id;
    }
    
    // Get sprints for this project
    const projectSprints = sprintIterations.filter(s => s.projectId === projectSettings.projectId);
    console.log(`\n   📅 Processing ${projectSprints.length} sprints...`);
    
    // Process each sprint
    for (const [index, sprint] of projectSprints.entries()) {
      const sprintNumber = index + 1;
      
      // Create User Story for sprint (parent is either Epic or Feature)
      const userStory = await createUserStory(
        meetingsConfig,
        projectConfig,
        sprint,
        parentId,
        sprintNumber,
        dryRun
      );
      output.breakdown.userStories++;
      
      const sprintOutput = {
        sprintName: sprint.sprintName,
        iterationPath: sprint.iterationPath,
        userStoryId: userStory.id,
        tasks: [] as Array<{ taskId: number | string; firstName: string; userId: string }>,
      };
      
      // Create Tasks for each team member
      console.log(`      👤 Creating ${teamMembers.length} tasks for team members...`);
      
      for (const user of teamMembers) {
        const task = await createTask(
          meetingsConfig,
          projectConfig,
          sprint,
          user,
          userStory.id,
          dryRun
        );
        
        output.breakdown.tasks++;
        sprintOutput.tasks.push({
          taskId: task.id,
          firstName: user.givenName,
          userId: user.userId,
        });
      }
      
      if (!dryRun) {
        console.log(`      ✅ Created ${teamMembers.length} tasks`);
      }
      
      projectOutput.sprints.push(sprintOutput);
    }
    
    output.projects.push(projectOutput);
  }
  
  // Calculate total work items
  output.totalWorkItems = 
    output.breakdown.epics + 
    output.breakdown.features + 
    output.breakdown.userStories + 
    output.breakdown.tasks;
  
  // Save output if enabled and not dry run
  if (meetingsConfig.settings.saveWorkItemIds && !dryRun) {
    const outputPath = path.join(process.cwd(), meetingsConfig.settings.outputFile);
    saveWorkItemsOutput(output, outputPath);
  }
  
  // Print summary
  console.log("\n\n📊 Summary");
  console.log("=".repeat(60));
  console.log(`Total Work Items ${dryRun ? '(would be created)' : 'Created'}: ${output.totalWorkItems}`);
  console.log(`   - Epics: ${output.breakdown.epics}`);
  console.log(`   - Features: ${output.breakdown.features}`);
  console.log(`   - User Stories: ${output.breakdown.userStories}`);
  console.log(`   - Tasks: ${output.breakdown.tasks}`);
  
  for (const project of output.projects) {
    const totalTasksInProject = project.sprints.reduce((sum, s) => sum + s.tasks.length, 0);
    console.log(`\n   ${project.projectName}:`);
    console.log(`     - Sprints: ${project.sprints.length}`);
    console.log(`     - Tasks: ${totalTasksInProject}`);
  }
  
  if (dryRun) {
    console.log("\n⚠️  DRY RUN COMPLETE - No actual work items were created");
    console.log("Run without --dryRun to create work items in Azure DevOps\n");
  } else {
    console.log("\n✅ Sprint Meetings automation complete!\n");
  }
  
  return output;
}
