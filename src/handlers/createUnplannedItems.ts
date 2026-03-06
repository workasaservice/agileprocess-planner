import fs from "fs";
import path from "path";
import { azureDevOpsMcpClient } from "../clients/azureDevOpsMcpClient";
import { loadConfiguration, User } from "../lib/configLoader";

/**
 * Unplanned work profile configuration
 */
interface UnplannedProfile {
  description: string;
  taskStructure: "individual-per-member" | "role-based" | "single-shared-task";
  bufferPolicy: {
    enabled: boolean;
    bufferPercentage: number;
    description: string;
  };
  categories: Array<{
    name: string;
    description: string;
    allocatedPercentage: number;
  }>;
}

interface UnplannedConfig {
  version?: string;
  approach?: string;
  description?: string;
  settings?: {
    enabled?: boolean;
    createPerSprint?: boolean;
    createPerTeam?: boolean;
    assignTasksToMembers?: boolean;
    estimatedHoursPerTask?: number;
    tags?: string[];
  };
  profiles: {
    [profileName: string]: UnplannedProfile;
  };
  teamAssignments: {
    [teamName: string]: {
      profileName: string;
      bufferHoursPerMember: number;
      customizations?: {
        overrideBufferPercentage?: number;
        notes?: string;
      };
    };
  };
  projects?: Array<{
    projectId: string;
    projectName: string;
    teamName: string;
    enabled: boolean;
    overrideEstimatedHours?: number;
  }>;
  bufferAllocationState?: {
    [teamName: string]: {
      lastCalculated?: string;
      currentBufferPercentage: number;
      bufferHoursPerMember: number;
      totalTeamBufferHours?: number;
      lastUpdated?: string;
    };
  };
}

/**
 * Load unplanned automation configuration
 */
function loadUnplannedConfig(): UnplannedConfig {
  const configPath = path.join(process.cwd(), "config", "unplanned-automation.json");

  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  const content = fs.readFileSync(configPath, "utf-8");
  return JSON.parse(content);
}

/**
 * Load unplanned profiles configuration
 */
function loadProfilesConfig(): UnplannedConfig {
  const configPath = path.join(process.cwd(), "config", "team-unplanned-profiles.json");

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
 * Create unplanned work issue (parent work item)
 */
async function createUnplannedIssue(
  projectName: string,
  iterationPath: string,
  sprintName: string,
  categories: any[],
  bufferPercentage: number,
  tags: string[]
): Promise<any> {
  const categoriesDescription = categories
    .map((c) => `- **${c.name}** (${c.allocatedPercentage}%): ${c.description}`)
    .join("\n");

  const description = `Capacity for unexpected work during ${sprintName}.\n\nBuffer Allocation: ${bufferPercentage}% of sprint capacity\n\nWork Categories:\n${categoriesDescription}\n\nThis issue tracks all unplanned work items that arise during the sprint that were not part of the original commitment.`;

  const result: any = await azureDevOpsMcpClient.callTool("create-work-item", {
    project: projectName,
    type: "Issue",
    title: `UnPlanned - ${sprintName}`,
    description: description,
    iterationPath: iterationPath,
    tags: tags.join("; "),
  });

  return result;
}

/**
 * Create individual tasks for each team member
 */
async function createIndividualTasks(
  projectName: string,
  iterationPath: string,
  sprintName: string,
  parentId: number,
  teamMembers: User[],
  bufferHours: number
): Promise<void> {
  for (const member of teamMembers) {
    await azureDevOpsMcpClient.callTool("create-work-item", {
      project: projectName,
      type: "Task",
      title: `UnPlanned Capacity - ${member.displayName}`,
      description: `Contingency capacity allocated to ${member.displayName} for unplanned work during ${sprintName}.\n\nThis task represents buffer time allocated for unexpected tasks or change requests that may arise.`,
      iterationPath: iterationPath,
      assignedTo: member.userId,
      estimatedHours: bufferHours,
      parentId: parentId,
      tags: "unplanned; contingency; buffer",
    });
  }
}

/**
 * Update buffer allocation state
 */
function updateAllocationState(profileConfig: UnplannedConfig): void {
  const configPath = path.join(process.cwd(), "config", "team-unplanned-profiles.json");
  fs.writeFileSync(configPath, JSON.stringify(profileConfig, null, 2), "utf-8");
  console.log("✓ Updated buffer allocation state in team-unplanned-profiles.json");
}

/**
 * Main handler: Create unplanned work items using team-specific profiles
 */
export async function createUnplannedItems(options: {
  dryRun?: boolean;
} = {}): Promise<void> {
  const dryRun = options.dryRun ?? false;

  console.log("=== Create UnPlanned Work Items ===");
  console.log(`Dry Run: ${dryRun}`);
  console.log();

  // Load configurations
  const config = loadConfiguration();
  const unplannedConfig = loadUnplannedConfig();
  const profileConfig = loadProfilesConfig();
  const iterations = loadSprintIterations();

  if (!config) {
    throw new Error("Failed to load system configuration");
  }

  console.log(`Loaded ${config.projects.size} projects`);
  console.log(`Loaded ${config.users.size} users`);
  console.log(`Loaded ${iterations.length} sprint iterations`);
  console.log();

  // Initialize buffer allocation state if not present
  if (!profileConfig.bufferAllocationState) {
    profileConfig.bufferAllocationState = {};
  }

  let totalIssuesCreated = 0;
  let totalTasksCreated = 0;

  // Process each project
  for (const [projectId, project] of config.projects) {
    const teamName = project.teamName;

    // Find project config
    const projectConfig = unplannedConfig.projects?.find((p) => p.projectName === project.projectName);
    if (!projectConfig || !projectConfig.enabled) {
      console.log(`⊘ Skipping project ${project.projectName} - not enabled in unplanned-automation.json`);
      continue;
    }

    // Get team profile assignment
    const teamAssignment = profileConfig.teamAssignments[teamName];
    if (!teamAssignment) {
      console.log(`⊘ Skipping team ${teamName} - no profile assignment found`);
      continue;
    }

    const profile = profileConfig.profiles[teamAssignment.profileName];
    if (!profile) {
      console.log(`⊘ Skipping team ${teamName} - profile ${teamAssignment.profileName} not found`);
      continue;
    }

    console.log(`\n--- Processing Team: ${teamName} (Profile: ${teamAssignment.profileName}) ---`);

    // Get team members
    const teamMembers: User[] = [];
    for (const userId of project.members) {
      const user = config.users.get(userId);
      if (user) {
        teamMembers.push(user);
      }
    }

    console.log(`Team Members: ${teamMembers.length}`);

    // Initialize buffer allocation state for this team
    if (!profileConfig.bufferAllocationState[teamName]) {
      profileConfig.bufferAllocationState[teamName] = {
        currentBufferPercentage: teamAssignment.customizations?.overrideBufferPercentage || profile.bufferPolicy.bufferPercentage,
        bufferHoursPerMember: teamAssignment.bufferHoursPerMember,
      };
    }

    const allocationState = profileConfig.bufferAllocationState[teamName];
    const bufferPercentage = allocationState.currentBufferPercentage;
    const bufferHours = teamAssignment.bufferHoursPerMember;

    // Process each sprint for this project
    const projectSprints = iterations.filter((s: any) => s.project === project.projectId || s.projectId === projectId);

    for (const sprint of projectSprints) {
      const sprintName = sprint.name || sprint.sprintName;
      const iterationPath = sprint.iterationPath;

      console.log(`\n  Sprint: ${sprintName} (Buffer: ${bufferPercentage}%)`);

      if (dryRun) {
        console.log(`    [DRY RUN] Would create Issue: UnPlanned - ${sprintName}`);
        console.log(`    [DRY RUN] Buffer allocation: ${bufferPercentage}% of sprint capacity`);
        console.log(`    [DRY RUN] Would create ${teamMembers.length} capacity tasks (${bufferHours}h per member)`);
        totalIssuesCreated++;
        totalTasksCreated += teamMembers.length;
      } else {
        // Create parent Issue
        const issueResult = await createUnplannedIssue(
          project.projectName,
          iterationPath,
          sprintName,
          profile.categories,
          bufferPercentage,
          unplannedConfig.settings?.tags || ["unplanned", "contingency"]
        );

        const issueId = issueResult.id;
        console.log(`    ✓ Created Issue ${issueId}: UnPlanned - ${sprintName}`);
        totalIssuesCreated++;

        // Create individual tasks for each team member
        await createIndividualTasks(
          project.projectName,
          iterationPath,
          sprintName,
          issueId,
          teamMembers,
          bufferHours
        );

        console.log(`    ✓ Created ${teamMembers.length} contingency capacity tasks`);
        console.log(`    ✓ Total buffer hours allocated: ${bufferHours * teamMembers.length}h (${bufferHours}h per member)`);
        totalTasksCreated += teamMembers.length;
      }
    }

    // Update allocation state
    allocationState.totalTeamBufferHours = bufferHours * teamMembers.length * projectSprints.length;
    allocationState.lastUpdated = new Date().toISOString();
  }

  // Save allocation state if not dry run
  if (!dryRun) {
    updateAllocationState(profileConfig);
  }

  console.log("\n=== Summary ===");
  console.log(`Total Issues: ${totalIssuesCreated}`);
  console.log(`Total Tasks: ${totalTasksCreated}`);
  console.log(`Total Work Items: ${totalIssuesCreated + totalTasksCreated}`);

  if (dryRun) {
    console.log("\n[DRY RUN] No work items were created. Remove --dryRun to execute.");
  } else {
    console.log("\n✓ UnPlanned work capacity items created successfully!");
  }
}
