import fs from "fs";
import path from "path";
import axios, { AxiosInstance } from "axios";
import { resolveAzureDevOpsMcpConfig } from "../clients/azureDevOpsMcpClient";

type UserTeamAssignment = {
  userPrincipalName: string;
  teams: string[];
};

type TeamAssignmentResult = {
  userPrincipalName: string;
  assignments: {
    teamName: string;
    teamId?: string;
    status: "success" | "failed" | "skipped";
    error?: string;
  }[];
};

function getAssignmentsFromInput(input: any): UserTeamAssignment[] {
  if (Array.isArray(input?.assignments)) {
    return input.assignments as UserTeamAssignment[];
  }
  if (Array.isArray(input?.payload?.assignments)) {
    return input.payload.assignments as UserTeamAssignment[];
  }
  if (Array.isArray(input?.data?.assignments)) {
    return input.data.assignments as UserTeamAssignment[];
  }
  
  // Support direct user list with devOpsTeams
  if (Array.isArray(input?.users)) {
    return input.users
      .filter((u: any) => u.devOpsTeams && u.devOpsTeams.length > 0)
      .map((u: any) => ({
        userPrincipalName: u.userPrincipalName,
        teams: u.devOpsTeams
      }));
  }
  
  if (Array.isArray(input)) {
    return input as UserTeamAssignment[];
  }
  
  return [];
}

function validateAssignment(assignment: UserTeamAssignment, index: number) {
  if (!assignment.userPrincipalName) {
    throw new Error(`Assignment at index ${index} is missing userPrincipalName.`);
  }
  if (!assignment.teams || !Array.isArray(assignment.teams) || assignment.teams.length === 0) {
    throw new Error(`Assignment at index ${index} is missing teams array.`);
  }
}

function createAzureDevOpsClient(): AxiosInstance {
  const config = resolveAzureDevOpsMcpConfig();
  
  if (!config.serverUrl || !config.token) {
    throw new Error("Azure DevOps is not properly configured.");
  }

  const encodedToken = Buffer.from(`:${config.token}`).toString("base64");
  
  let baseURL = config.serverUrl;
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

async function listTeams(client: AxiosInstance, org: string, project: string): Promise<any[]> {
  try {
    const response = await client.get(`${org}/_apis/projects/${project}/teams`, {
      params: { "api-version": "7.0" }
    });
    return response.data.value || [];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Failed to list teams: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

async function getTeamByName(client: AxiosInstance, org: string, project: string, teamName: string): Promise<any | null> {
  try {
    const response = await client.get(`${org}/_apis/projects/${project}/teams/${encodeURIComponent(teamName)}`, {
      params: { "api-version": "7.0" }
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    if (axios.isAxiosError(error)) {
      throw new Error(`Failed to get team: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

async function addTeamMember(
  client: AxiosInstance,
  org: string,
  project: string,
  teamId: string,
  userDescriptor: string
): Promise<void> {
  try {
    // Note: Azure DevOps uses a different API for team members
    // This adds a user to a team by their descriptor
    await client.put(
      `${org}/_apis/projects/${project}/teams/${teamId}/members/${userDescriptor}`,
      {},
      { params: { "api-version": "7.0" } }
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Failed to add team member: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

async function getUserByEmail(client: AxiosInstance, org: string, email: string): Promise<any | null> {
  try {
    // Search for user by email using the Graph API
    const response = await client.get(`${org}/_apis/graph/users`, {
      params: {
        "api-version": "7.0-preview.1",
        subjectTypes: "aad"
      }
    });
    
    const users = response.data.value || [];
    const user = users.find((u: any) => 
      u.mailAddress?.toLowerCase() === email.toLowerCase() ||
      u.principalName?.toLowerCase() === email.toLowerCase()
    );
    
    return user || null;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Failed to get user: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}

function resolveDocsPath(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(process.cwd(), "docs", `devops-team-assignments-${stamp}.md`);
}

function ensureDocsDir(filePath: string) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function formatDoc(results: TeamAssignmentResult[], generatedAt: string, org: string, project: string): string {
  const lines: string[] = [];

  lines.push("# Azure DevOps Team Assignments");
  lines.push("");
  lines.push(`Generated: ${generatedAt}`);
  lines.push(`Organization: ${org}`);
  lines.push(`Project: ${project}`);
  lines.push("");

  let totalAssignments = 0;
  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  results.forEach((result) => {
    result.assignments.forEach((assignment) => {
      totalAssignments++;
      if (assignment.status === "success") successCount++;
      else if (assignment.status === "failed") failedCount++;
      else if (assignment.status === "skipped") skippedCount++;
    });
  });

  lines.push(`**Summary:**`);
  lines.push(`- Total Assignments: ${totalAssignments}`);
  lines.push(`- ✅ Success: ${successCount}`);
  lines.push(`- ❌ Failed: ${failedCount}`);
  lines.push(`- ⏭️ Skipped: ${skippedCount}`);
  lines.push("");

  lines.push("## Assignment Details");
  lines.push("");

  results.forEach((result) => {
    lines.push(`### ${result.userPrincipalName}`);
    lines.push("");

    lines.push("| Status | Team | Team ID | Notes |");
    lines.push("|--------|------|---------|-------|");

    result.assignments.forEach((assignment) => {
      const statusIcon = assignment.status === "success" ? "✅" : assignment.status === "failed" ? "❌" : "⏭️";
      const teamName = assignment.teamName;
      const teamId = assignment.teamId || "-";
      const notes = assignment.error || (assignment.status === "skipped" ? "Already a member" : "-");
      lines.push(`| ${statusIcon} | ${teamName} | ${teamId} | ${notes} |`);
    });

    lines.push("");
  });

  return lines.join("\n");
}

export async function assignUsersToDevOpsTeams(args: Record<string, any>): Promise<any> {
  const config = resolveAzureDevOpsMcpConfig();
  
  if (!config.serverUrl || !config.token) {
    return {
      success: false,
      error: "Azure DevOps is not configured. Please set AZURE_DEVOPS_ORG_URL and AZURE_DEVOPS_PAT environment variables."
    };
  }

  let input: any;
  const filePath = args.file || args.input || args.path;

  if (filePath) {
    const fullPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        error: `File not found: ${filePath}`
      };
    }

    try {
      const raw = fs.readFileSync(fullPath, "utf8");
      input = JSON.parse(raw);
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to read or parse file: ${err.message}`
      };
    }
  } else {
    input = args;
  }

  const assignments = getAssignmentsFromInput(input);

  if (!assignments || assignments.length === 0) {
    return {
      success: false,
      error: "No assignments found in input. Expected { assignments: [{ userPrincipalName, teams: [...] }] } structure."
    };
  }

  // Validate all assignments before processing
  for (let i = 0; i < assignments.length; i++) {
    const assignment = assignments[i];
    if (!assignment) {
      return {
        success: false,
        error: `Invalid assignment at index ${i}`
      };
    }
    try {
      validateAssignment(assignment, i);
    } catch (err: any) {
      return {
        success: false,
        error: err.message
      };
    }
  }

  const client = createAzureDevOpsClient();
  const results: TeamAssignmentResult[] = [];

  console.log(`\n🔄 Processing Azure DevOps team assignments for ${assignments.length} user(s)...\n`);
  console.log(`   Organization: ${config.org}`);
  console.log(`   Project: ${config.project}\n`);

  for (const assignment of assignments) {
    const result: TeamAssignmentResult = {
      userPrincipalName: assignment.userPrincipalName,
      assignments: []
    };

    try {
      // Get user from Azure DevOps
      const user = await getUserByEmail(client, config.org, assignment.userPrincipalName);
      
      if (!user) {
        console.log(`❌ User not found in Azure DevOps: ${assignment.userPrincipalName}`);
        assignment.teams.forEach((teamName) => {
          result.assignments.push({
            teamName,
            status: "failed",
            error: "User not found in Azure DevOps. Please ensure the user has been added to the organization."
          });
        });
        results.push(result);
        continue;
      }

      console.log(`\n👤 Processing user: ${assignment.userPrincipalName}`);

      // Process each team assignment
      for (const teamName of assignment.teams) {
        try {
          // Get team
          const team = await getTeamByName(client, config.org, config.project, teamName);
          
          if (!team) {
            console.log(`   ❌ Team not found: ${teamName}`);
            result.assignments.push({
              teamName,
              status: "failed",
              error: "Team not found"
            });
            continue;
          }

          // Add user to team
          await addTeamMember(client, config.org, config.project, team.id, user.descriptor);
          console.log(`   ✅ Added to team: ${teamName}`);
          
          result.assignments.push({
            teamName,
            teamId: team.id,
            status: "success"
          });

        } catch (err: any) {
          // Check if already a member
          if (err.message.includes("already") || err.message.includes("exists")) {
            console.log(`   ⏭️  Already in team: ${teamName}`);
            result.assignments.push({
              teamName,
              status: "skipped"
            });
          } else {
            console.log(`   ❌ Failed to add to team: ${teamName}`);
            console.log(`      Error: ${err.message}`);
            
            result.assignments.push({
              teamName,
              status: "failed",
              error: err.message
            });
          }
        }
      }

    } catch (err: any) {
      console.log(`❌ Error processing user: ${assignment.userPrincipalName}`);
      console.log(`   Error: ${err.message}`);
      
      assignment.teams.forEach((teamName) => {
        result.assignments.push({
          teamName,
          status: "failed",
          error: `User processing error: ${err.message}`
        });
      });
    }

    results.push(result);
  }

  // Generate documentation
  const generatedAt = new Date().toISOString();
  const docPath = resolveDocsPath();
  ensureDocsDir(docPath);
  const doc = formatDoc(results, generatedAt, config.org, config.project);
  fs.writeFileSync(docPath, doc, "utf8");

  let totalAssignments = 0;
  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  results.forEach((result) => {
    result.assignments.forEach((assignment) => {
      totalAssignments++;
      if (assignment.status === "success") successCount++;
      else if (assignment.status === "failed") failedCount++;
      else if (assignment.status === "skipped") skippedCount++;
    });
  });

  console.log(`\n✨ Azure DevOps team assignment complete!`);
  console.log(`   Total Assignments: ${totalAssignments}`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Failed: ${failedCount}`);
  console.log(`   Skipped: ${skippedCount}`);
  console.log(`   Documentation: ${docPath}\n`);

  return {
    success: true,
    summary: {
      totalAssignments,
      success: successCount,
      failed: failedCount,
      skipped: skippedCount
    },
    results,
    documentationPath: docPath
  };
}
