/**
 * Sprint Capacity Seeding Service
 * 
 * Automatically seeds team member capacity for new sprints based on Neon-stored defaults.
 * 
 * Policy:
 * - Sources defaults from `sprint_capacity_defaults` table (per role, project, team)
 * - Uses formula: `productive_hours_per_sprint / working_days`
 * - Upserts capacity only when member has no existing capacity (preserves manual edits)
 * - Records all operations to `sprint_seed_artifacts` for audit trail
 * - Requires PERSISTENCE_MODE=postgres
 */

import { neonMcpClient } from "../clients/neonMcpClient";
import { azureDevOpsMcpClient } from "../clients/azureDevOpsMcpClient";
import { requirePostgresMode, requireNeonMcpConfigured, loadConfigurationAsync } from "../lib/configLoader";

export interface CapacitySeederResult {
  success: boolean;
  membersSeedCount: number;
  memberSkipCount: number;
  errors: string[];
  summary: Record<string, any>;
}

export interface CapacitySeederConfig {
  projectId: string;
  teamId: string;
  sprintId: string; // Azure DevOps iteration ID
  sprintStartDate: Date;
  sprintEndDate: Date;
  iterationPath: string;
  dryRun?: boolean;
}

/**
 * Calculate working days between two dates (Mon-Fri only)
 */
function calculateWorkingDays(startDate: Date, endDate: Date): number {
  let count = 0;
  const current = new Date(startDate);
  
  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    // 1 = Monday, 5 = Friday
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return Math.max(1, count); // At least 1 day to avoid division by zero
}

/**
 * Load default capacity for a given project/team from Neon
 */
async function loadDefaultCapacities(projectId: string, teamId: string): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  
  try {
    const defaults = await neonMcpClient.query<any>(
      `SELECT role_id as "roleId", capacity_per_day as "capacityPerDay"
       FROM sprint_capacity_defaults
       WHERE project_id = $1 AND team_id = $2 AND is_active = true`,
      [projectId, teamId]
    );

    if (Array.isArray(defaults)) {
      for (const def of defaults) {
        result.set(def.roleId, def.capacityPerDay);
      }
    }
  } catch (error) {
    console.warn(`Failed to load capacity defaults for project ${projectId}: ${error}`);
  }
  
  return result;
}

/**
 * Get all team members for a project from Neon config
 */
async function getTeamMembers(projectId: string): Promise<Array<{userId: string; roleId: string}>> {
  const members: Array<{userId: string; roleId: string}> = [];
  
  try {
    const rows = await neonMcpClient.query<any>(
      `SELECT cpu.user_id as "userId", cu.role_id as "roleId"
       FROM config_project_members cpu
       JOIN config_users cu ON cpu.user_id = cu.user_id
       WHERE cpu.project_id = $1`,
      [projectId]
    );

    if (Array.isArray(rows)) {
      for (const row of rows) {
        members.push({
          userId: row.userId,
          roleId: row.roleId
        });
      }
    }
  } catch (error) {
    console.warn(`Failed to load team members: ${error}`);
  }
  
  return members;
}

/**
 * Seed capacity for a single team member in Azure DevOps
 * Uses MCP callTool to update team capacity
 */
async function seedMemberCapacity(
  projectId: string,
  teamId: string,
  sprintId: string,
  userId: string,
  capacityPerDay: number,
  dryRun: boolean = false
): Promise<{success: boolean; error?: string}> {
  if (dryRun) {
    return { success: true };
  }

  try {
    // Call MCP tool to update team member capacity
    // The tool name follows Azure DevOps Capacity API patterns
    const result = await azureDevOpsMcpClient.callTool("update-team-capacity", {
      project: projectId,
      team: teamId,
      teamId: teamId,
      teamMemberId: userId,
      iterationId: sprintId,
      activities: [
        {
          name: "Development",
          capacityPerDay: capacityPerDay
        }
      ]
    });

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`Failed to seed capacity for member ${userId}: ${errorMsg}`);
    return { 
      success: false, 
      error: errorMsg 
    };
  }
}

/**
 * Check if a team member already has capacity assigned for a sprint
 * Returns capacity value if exists, null if not assigned
 */
async function getMemberExistingCapacity(
  projectId: string,
  teamId: string,
  userId: string,
  sprintId: string
): Promise<number | null> {
  try {
    const result = await azureDevOpsMcpClient.callTool("get-sprint-capacity", {
      project: projectId,
      team: teamId,
      teamId: teamId,
      teamMemberId: userId,
      iterationId: sprintId
    });

    if (result && result.activities && result.activities.length > 0) {
      const devActivity = result.activities.find((a: any) => a.name === "Development");
      if (devActivity && devActivity.capacityPerDay !== null && devActivity.capacityPerDay !== undefined) {
        return devActivity.capacityPerDay;
      }
    }

    return null;
  } catch (error) {
    // If get fails, assume not assigned
    return null;
  }
}

/**
 * Record capacity seeding artifact in Neon for audit trail
 */
async function recordCapacityArtifact(
  seedRunId: number,
  userId: string,
  roleId: string,
  capacityPerDay: number,
  wasSeedingAttempted: boolean,
  wasSeeded: boolean,
  error?: string
): Promise<void> {
  const title = `${userId} (${roleId}): ${capacityPerDay}h/day${wasSeedingAttempted ? (wasSeeded ? ' ✓' : ' ✗') : ' (skipped)'}`;

  try {
    await neonMcpClient.query(
      `INSERT INTO sprint_seed_artifacts 
       (seed_run_id, artifact_type, external_id, work_item_title, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        seedRunId,
        "capacity",
        userId,
        title
      ]
    );
  } catch (insertError) {
    // Backward-compatible fallback for older table shape without external_id.
    try {
      await neonMcpClient.query(
        `INSERT INTO sprint_seed_artifacts 
         (seed_run_id, artifact_type, work_item_title, work_item_url, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [
          seedRunId,
          "capacity",
          title,
          `capacity://${userId}`
        ]
      );
    } catch (fallbackError) {
      console.warn(`Failed to record capacity artifact: ${fallbackError}`);
    }
  }
}

/**
 * Main capacity seeding function
 * Called by orchestration command to seed capacity for all team members in a new sprint
 */
export async function seedSprintCapacity(
  config: CapacitySeederConfig,
  seedRunId?: number
): Promise<CapacitySeederResult> {
  // Enforce postgres mode
  requirePostgresMode();
  requireNeonMcpConfigured();

  const result: CapacitySeederResult = {
    success: true,
    membersSeedCount: 0,
    memberSkipCount: 0,
    errors: [],
    summary: {}
  };

  try {
    // Load configuration async (required for postgres mode)
    await loadConfigurationAsync();

    // Calculate working days in sprint
    const workingDays = calculateWorkingDays(config.sprintStartDate, config.sprintEndDate);

    console.log(`[Capacity Seeding] Sprint: ${config.iterationPath}`);
    console.log(`[Capacity Seeding] Working days: ${workingDays}`);
    console.log(`[Capacity Seeding] Dry run: ${config.dryRun ? 'yes' : 'no'}`);

    // Load default capacities per role
    const defaultCapacities = await loadDefaultCapacities(config.projectId, config.teamId);
    
    if (defaultCapacities.size === 0) {
      console.warn(`[Capacity Seeding] No default capacities found for project ${config.projectId}, team ${config.teamId}`);
      result.errors.push(`No default capacity configuration found`);
      return result;
    }

    // Get all team members
    const teamMembers = await getTeamMembers(config.projectId);
    
    if (teamMembers.length === 0) {
      console.warn(`[Capacity Seeding] No team members found for project ${config.projectId}`);
      result.errors.push(`No team members found`);
      return result;
    }

    // Seed capacity for each team member
    for (const member of teamMembers) {
      const defaultCapacity = defaultCapacities.get(member.roleId);
      
      if (!defaultCapacity) {
        result.memberSkipCount++;
        console.log(`[Capacity Seeding] Skipping ${member.userId} (${member.roleId}) - no default capacity`);
        continue;
      }

      // Check if member already has capacity
      const existingCapacity = await getMemberExistingCapacity(
        config.projectId,
        config.teamId,
        member.userId,
        config.sprintId
      );

      if (existingCapacity !== null && existingCapacity > 0) {
        result.memberSkipCount++;
        console.log(`[Capacity Seeding] Skipping ${member.userId} - already has capacity: ${existingCapacity}h/day`);
        await recordCapacityArtifact(seedRunId || 0, member.userId, member.roleId, defaultCapacity, false, false);
        continue;
      }

      // Seed capacity
      const seedResult = await seedMemberCapacity(
        config.projectId,
        config.teamId,
        config.sprintId,
        member.userId,
        defaultCapacity,
        config.dryRun
      );

      if (seedResult.success) {
        result.membersSeedCount++;
        console.log(`[Capacity Seeding] ✓ Seeded ${member.userId} with ${defaultCapacity}h/day`);
        await recordCapacityArtifact(seedRunId || 0, member.userId, member.roleId, defaultCapacity, true, true);
      } else {
        result.success = false;
        result.errors.push(`Failed to seed ${member.userId}: ${seedResult.error}`);
        console.error(`[Capacity Seeding] ✗ Failed to seed ${member.userId}: ${seedResult.error}`);
        await recordCapacityArtifact(seedRunId || 0, member.userId, member.roleId, defaultCapacity, true, false, seedResult.error);
      }
    }

    result.summary = {
      totalMembers: teamMembers.length,
      seeded: result.membersSeedCount,
      skipped: result.memberSkipCount,
      errors: result.errors.length
    };

    console.log(`[Capacity Seeding] Complete: ${result.membersSeedCount} seeded, ${result.memberSkipCount} skipped`);

  } catch (error) {
    result.success = false;
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(errorMsg);
    console.error(`[Capacity Seeding] Fatal error: ${errorMsg}`);
  }

  return result;
}
