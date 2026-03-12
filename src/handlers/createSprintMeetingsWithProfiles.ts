import fs from "fs";
import path from "path";
import { azureDevOpsMcpClient } from "../clients/azureDevOpsMcpClient";
import { loadConfiguration, User, Project } from "../lib/configLoader";

/**
 * Profile-based configuration for team meeting automation
 */
interface ProfileConfig {
  profiles: {
    [profileName: string]: {
      description: string;
      taskStructure: "individual-per-member" | "role-based" | "single-shared-task";
      rotation?: {
        enabled: boolean;
        roles: string[];
        frequency: "weekly" | "monthly" | "per-sprint";
      };
      ceremonies: Array<{
        name: string;
        description: string;
        durationMinutes: number;
        participants: "all-members" | "specific-roles";
        estimatedHours?: number;
      }>;
    };
  };
  teamAssignments: {
    [teamName: string]: {
      profileName: string;
      customizations?: {
        additionalCeremonies?: Array<any>;
        skipCeremonies?: string[];
        overrideEstimatedHours?: { [ceremonyName: string]: number };
      };
    };
  };
  rotationState?: {
    [teamName: string]: {
      currentFacilitator?: string;
      currentNotetaker?: string;
      rotationIndex?: number;
      lastUpdated?: string;
    };
  };
}

/**
 * Load team meeting profiles configuration
 */
function loadProfilesConfig(): ProfileConfig {
  const configPath = path.join(process.cwd(), "config", "team-meeting-profiles.json");
  
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
 * Get team members for a specific project
 */
function getProjectTeamMembers(config: ReturnType<typeof loadConfiguration>, projectId: string): User[] {
  if (!config) {
    throw new Error("Configuration not loaded");
  }
  
  const project = config.projects.get(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
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
 * Get next person in rotation sequence
 */
function getNextInRotation(
  teamMembers: User[],
  currentIndex: number,
  role: string
): { member: User; nextIndex: number } {
  if (teamMembers.length === 0) {
    throw new Error(`Cannot rotate ${role}: team has no members`);
  }
  
  const nextIndex = (currentIndex + 1) % teamMembers.length;
  const member = teamMembers[nextIndex];
  
  if (!member) {
    throw new Error(`Member at index ${nextIndex} not found`);
  }
  
  return {
    member: member,
    nextIndex: nextIndex,
  };
}

/**
 * Create meetings user story (parent work item)
 */
async function createMeetingIssue(
  projectName: string,
  iterationPath: string,
  sprintName: string,
  ceremonies: any[],
  tags: string[]
): Promise<any> {
  const ceremoniesDescription = ceremonies
    .map((c) => `### ${c.name}\n${c.description}\n- Duration: ${c.durationMinutes} minutes`)
    .join("\n\n");

  const description = `Sprint meetings and ceremonies for ${sprintName}.\n\n${ceremoniesDescription}`;

  const result = await azureDevOpsMcpClient.callTool("create-work-item", {
    project: projectName,
    type: "User Story",
    title: `Meetings - ${sprintName}`,
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
  estimatedHours: number
): Promise<void> {
  for (const member of teamMembers) {
    const taskResult: any = await azureDevOpsMcpClient.callTool("create-work-item", {
      project: projectName,
      type: "Task",
      title: `Sprint Meetings - ${member.displayName}`,
      description: `Attend and participate in all sprint ceremonies for ${sprintName}.`,
      iterationPath: iterationPath,
      assignedTo: member.userId,
      estimatedHours: estimatedHours,
      tags: "meeting; sprint-ceremony",
    });

    await azureDevOpsMcpClient.callTool("link-work-items", {
      project: projectName,
      sourceId: parentId,
      targetId: taskResult.id,
      linkType: "System.LinkTypes.Hierarchy-Forward",
    });
  }
}

/**
 * Create role-based tasks with rotation
 */
async function createRoleBasedTasks(
  projectName: string,
  iterationPath: string,
  sprintName: string,
  parentId: number,
  teamMembers: User[],
  rotationState: any,
  teamName: string,
  estimatedHours: number
): Promise<void> {
  // Get current rotation index
  const currentIndex = rotationState.rotationIndex || 0;
  
  // Assign facilitator
  const facilitatorRotation = getNextInRotation(teamMembers, currentIndex, "facilitator");
  const facilitatorTask: any = await azureDevOpsMcpClient.callTool("create-work-item", {
    project: projectName,
    type: "Task",
    title: `Sprint Facilitator - ${sprintName}`,
    description: `Facilitate sprint ceremonies including planning, reviews, and retrospectives.`,
    iterationPath: iterationPath,
    assignedTo: facilitatorRotation.member.userId,
    estimatedHours: estimatedHours,
    tags: "meeting; facilitator; sprint-ceremony",
  });

  await azureDevOpsMcpClient.callTool("link-work-items", {
    project: projectName,
    sourceId: parentId,
    targetId: facilitatorTask.id,
    linkType: "System.LinkTypes.Hierarchy-Forward",
  });
  
  // Assign note-taker
  const notetakerRotation = getNextInRotation(teamMembers, facilitatorRotation.nextIndex, "notetaker");
  const notetakerTask: any = await azureDevOpsMcpClient.callTool("create-work-item", {
    project: projectName,
    type: "Task",
    title: `Sprint Note-taker - ${sprintName}`,
    description: `Take notes during sprint ceremonies and share summaries with the team.`,
    iterationPath: iterationPath,
    assignedTo: notetakerRotation.member.userId,
    estimatedHours: estimatedHours,
    tags: "meeting; notetaker; sprint-ceremony",
  });

  await azureDevOpsMcpClient.callTool("link-work-items", {
    project: projectName,
    sourceId: parentId,
    targetId: notetakerTask.id,
    linkType: "System.LinkTypes.Hierarchy-Forward",
  });
  
  // Update rotation state for next sprint
  rotationState.rotationIndex = notetakerRotation.nextIndex;
  rotationState.currentFacilitator = facilitatorRotation.member.displayName;
  rotationState.currentNotetaker = notetakerRotation.member.displayName;
  rotationState.lastUpdated = new Date().toISOString();
}

/**
 * Save updated rotation state back to config file
 */
function updateRotationState(profileConfig: ProfileConfig): void {
  const configPath = path.join(process.cwd(), "config", "team-meeting-profiles.json");
  fs.writeFileSync(configPath, JSON.stringify(profileConfig, null, 2), "utf-8");
  console.log("✓ Updated rotation state in team-meeting-profiles.json");
}

/**
 * Main handler: Create sprint meetings using team-specific profiles
 */
export async function createSprintMeetingsWithProfiles(options: {
  dryRun?: boolean;
} = {}): Promise<void> {
  const dryRun = options.dryRun ?? false;

  console.log("=== Create Sprint Meetings with Profiles ===");
  console.log(`Dry Run: ${dryRun}`);
  console.log();

  // Load configurations
  const config = loadConfiguration();
  const profileConfig = loadProfilesConfig();
  const iterations = loadSprintIterations();

  if (!config) {
    throw new Error("Failed to load system configuration");
  }

  console.log(`Loaded ${config.projects.size} projects`);
  console.log(`Loaded ${config.users.size} users`);
  console.log(`Loaded ${iterations.length} sprint iterations`);
  console.log(`Loaded ${Object.keys(profileConfig.profiles).length} meeting profiles`);
  console.log();

  // Initialize rotation state if not present
  if (!profileConfig.rotationState) {
    profileConfig.rotationState = {};
  }

  let totalIssuesPlanned = 0;
  let totalTasksPlanned = 0;

  // Process each project
  for (const [projectId, project] of config.projects) {
    const teamName = project.teamName;
    
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
    const teamMembers = getProjectTeamMembers(config, projectId);
    console.log(`Team Members: ${teamMembers.length}`);
    
    // Initialize rotation state for this team
    if (!profileConfig.rotationState[teamName]) {
      profileConfig.rotationState[teamName] = {
        rotationIndex: 0,
      };
    }

    const teamRotationState = profileConfig.rotationState[teamName]!;

    // Process each sprint for this project
    const projectSprints = iterations.filter((s: any) => s.project === project.projectId || s.projectId === projectId);
    
    for (const sprint of projectSprints) {
      const sprintName = sprint.name || sprint.sprintName;
      const iterationPath = sprint.iterationPath;

      console.log(`\n  Sprint: ${sprintName}`);

      if (dryRun) {
        console.log(`    [DRY RUN] Would create User Story: Meetings - ${sprintName}`);
        totalIssuesPlanned++;

        if (profile.taskStructure === "individual-per-member") {
          console.log(`    [DRY RUN] Would create ${teamMembers.length} individual tasks (one per member)`);
          totalTasksPlanned += teamMembers.length;
        } else if (profile.taskStructure === "role-based") {
          console.log(`    [DRY RUN] Would create 2 role-based tasks (facilitator, notetaker)`);
          console.log(`    [DRY RUN] Current rotation index: ${teamRotationState.rotationIndex || 0}`);
          totalTasksPlanned += 2;
        } else if (profile.taskStructure === "single-shared-task") {
          console.log(`    [DRY RUN] Would create 1 shared task for entire team`);
          totalTasksPlanned += 1;
        }
      } else {
        // Create parent User Story
        const issueResult: any = await createMeetingIssue(
          project.projectName,
          iterationPath,
          sprintName,
          profile.ceremonies,
          ["meeting", "sprint-ceremony"]
        );
        const issueId = issueResult.id;
        console.log(`    ✓ Created User Story ${issueId}: Meetings - ${sprintName}`);
        totalIssuesPlanned++;

        // Create tasks based on profile task structure
        const estimatedHours = profile.ceremonies[0]?.estimatedHours || 2;

        if (profile.taskStructure === "individual-per-member") {
          await createIndividualTasks(
            project.projectName,
            iterationPath,
            sprintName,
            issueId,
            teamMembers,
            estimatedHours
          );
          console.log(`    ✓ Created ${teamMembers.length} individual tasks`);
          totalTasksPlanned += teamMembers.length;
        } else if (profile.taskStructure === "role-based") {
          await createRoleBasedTasks(
            project.projectName,
            iterationPath,
            sprintName,
            issueId,
            teamMembers,
            teamRotationState,
            teamName,
            estimatedHours
          );
          console.log(`    ✓ Created 2 role-based tasks (Facilitator, Note-taker)`);
          console.log(`    ✓ Facilitator: ${teamRotationState.currentFacilitator}`);
          console.log(`    ✓ Note-taker: ${teamRotationState.currentNotetaker}`);
          totalTasksPlanned += 2;
        }
      }
    }
  }

  // Save rotation state if not dry run
  if (!dryRun) {
    updateRotationState(profileConfig);
  }

  console.log("\n=== Summary ===");
  console.log(`Total Issues: ${totalIssuesPlanned}`);
  console.log(`Total Tasks: ${totalTasksPlanned}`);
  console.log(`Total Work Items: ${totalIssuesPlanned + totalTasksPlanned}`);
  
  if (dryRun) {
    console.log("\n[DRY RUN] No work items were created. Remove --dryRun to execute.");
  } else {
    console.log("\n✓ Sprint meetings created successfully using team profiles!");
  }
}
