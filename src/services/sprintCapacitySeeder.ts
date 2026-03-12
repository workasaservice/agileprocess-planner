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
 * Load per-user capacity from Neon config_capacity for project members.
 * Values are converted to per-day using current sprint working days.
 */
async function loadMemberCapacitiesPerDay(projectId: string, workingDays: number): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  try {
    const rows = await neonMcpClient.query<any>(
      `SELECT c.user_id as "userId", c.productive_hours_per_sprint as "productiveHoursPerSprint"
       FROM config_capacity c
       JOIN config_project_members cpm ON cpm.user_id = c.user_id
       WHERE cpm.project_id = $1
         AND c.productive_hours_per_sprint IS NOT NULL
         AND c.productive_hours_per_sprint > 0`,
      [projectId]
    );

    if (Array.isArray(rows)) {
      for (const row of rows) {
        const userId = String(row.userId || "").trim();
        const productiveHours = Number(row.productiveHoursPerSprint);
        if (!userId || !Number.isFinite(productiveHours) || productiveHours <= 0) {
          continue;
        }

        // Round to 2 decimals so non-integer per-day values are preserved.
        const perDay = Math.round((productiveHours / Math.max(1, workingDays)) * 100) / 100;
        result.set(userId, perDay);
      }
    }
  } catch (error) {
    console.warn(`Failed to load member capacities for project ${projectId}: ${error}`);
  }

  return result;
}

/**
 * Resolve Azure DevOps identity ID for a user email/unique name
 * First checks Neon for stored identity, then queries Azure API as fallback
 * Stores resolved identities in Neon for future use
 */
async function resolveAzureIdentityId(
  userId: string,
  projectId: string,
  teamId: string,
  teamMembers: any[]
): Promise<string | null> {
  try {
    // Step 1: Check Neon first
    const neonUser = await neonMcpClient.query<any>(
      `SELECT azure_identity_id FROM config_users 
       WHERE user_principal_name = $1 OR user_id = $1 OR mail_nickname = $1
       LIMIT 1`,
      [userId]
    );
    
    if (Array.isArray(neonUser) && neonUser.length > 0 && neonUser[0].azure_identity_id) {
      return neonUser[0].azure_identity_id;
    }
    
    // Step 2: Not in Neon, match from already-fetched team members
    if (Array.isArray(teamMembers) && teamMembers.length > 0) {
      const member = teamMembers.find((m: any) => {
        const uniqueName = m.identity?.uniqueName || m.identity?.displayName || '';
        const displayName = m.identity?.displayName || '';
        return uniqueName.toLowerCase() === userId.toLowerCase() || 
               displayName.toLowerCase() === userId.toLowerCase();
      });
      
      if (member && member.identity && member.identity.id) {
        // Store in Neon for future use
        const azureId = member.identity.id;
        try {
          await neonMcpClient.query(
            `UPDATE config_users 
             SET azure_identity_id = $1, updated_at = NOW()
             WHERE user_principal_name = $2 OR user_id = $2 OR mail_nickname = $2`,
            [azureId, userId]
          );
        } catch (updateErr) {
          // Silently fail - identity is still usable
        }
        return azureId;
      }
    }
    
    console.warn(`[Capacity Seeding] No Azure identity found for user: ${userId}`);
    return null;
  } catch (error) {
    console.error(`[Capacity Seeding] Failed to resolve identity for ${userId}: ${error}`);
    return null;
  }
}

/**
 * Get all team members for a project from Neon config
 * Resolves Azure DevOps identity IDs from Neon (preferred) or Azure API (fallback)
 */
async function getTeamMembers(projectId: string, teamId: string): Promise<Array<{userId: string; roleId: string; azureIdentityId: string | null}>> {
  const members: Array<{userId: string; roleId: string; azureIdentityId: string | null}> = [];
  
  try {
    const teamMembersResult = await azureDevOpsMcpClient.callTool("get-team-members", {
      project: projectId,
      team: teamId
    });
    const teamMembers = Array.isArray(teamMembersResult?.value) ? teamMembersResult.value : [];

    // Get project members with their stored Azure identities from Neon
    const rows = await neonMcpClient.query<any>(
      `SELECT cpu.user_id as "userId", cu.role_id as "roleId", cu.azure_identity_id as "azureIdentityId"
       FROM config_project_members cpu
       JOIN config_users cu ON cpu.user_id = cu.user_id
       WHERE cpu.project_id = $1`,
      [projectId]
    );

    if (Array.isArray(rows)) {
      for (const row of rows) {
        let azureIdentityId = row.azureIdentityId;
        
        // If not in Neon, resolve from Azure
        if (!azureIdentityId) {
          azureIdentityId = await resolveAzureIdentityId(row.userId, projectId, teamId, teamMembers);
        }
        
        members.push({
          userId: row.userId,
          roleId: row.roleId,
          azureIdentityId
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
 */
async function seedMemberCapacity(
  projectId: string,
  teamId: string,
  sprintId: string,
  teamMemberRef: string,
  capacityPerDay: number,
  dryRun: boolean = false
): Promise<{success: boolean; error?: string}> {
  if (dryRun) {
    return { success: true };
  }

  try {
    const result = await azureDevOpsMcpClient.callTool("update-team-capacity", {
      project: projectId,
      team: teamId,
      teamId: teamId,
      teamMemberId: teamMemberRef,
      iterationId: sprintId,
      activities: [
        {
          name: "Development",
          capacityPerDay: capacityPerDay
        }
      ],
      daysOff: []
    });

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`Failed to seed capacity for member ${teamMemberRef}: ${errorMsg}`);
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
  teamMemberRef: string,
  sprintId: string
): Promise<number | null> {
  try {
    const result = await azureDevOpsMcpClient.callTool("list-sprint-capacities", {
      project: projectId,
      team: teamId,
      iterationId: sprintId
    });

    if (result && Array.isArray(result.value)) {
      // Find the specific team member's capacity
      const memberCapacity = result.value.find((c: any) => 
        c.teamMember && (
          c.teamMember.id === teamMemberRef ||
          c.teamMember.uniqueName?.toLowerCase?.() === teamMemberRef.toLowerCase() ||
          c.teamMember.displayName?.toLowerCase?.() === teamMemberRef.toLowerCase()
        )
      );
      
      if (memberCapacity && memberCapacity.activities && memberCapacity.activities.length > 0) {
        const devActivity = memberCapacity.activities.find((a: any) => a.name === "Development");
        if (devActivity && devActivity.capacityPerDay !== null && devActivity.capacityPerDay !== undefined) {
          return devActivity.capacityPerDay;
        }
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
  if (seedRunId <= 0) {
    return;
  }

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
    const memberCapacities = await loadMemberCapacitiesPerDay(config.projectId, workingDays);
    
    if (defaultCapacities.size === 0) {
      console.warn(`[Capacity Seeding] No default capacities found for project ${config.projectId}, team ${config.teamId}`);
      result.success = false;
      result.errors.push(`No default capacity configuration found`);
      return result;
    }

    // Get all team members with Azure identity resolution
    const teamMembers = await getTeamMembers(config.projectId, config.teamId);
    
    if (teamMembers.length === 0) {
      console.warn(`[Capacity Seeding] No team members found for project ${config.projectId}`);
      result.success = false;
      result.errors.push(`No team members found`);
      return result;
    }

    // Seed capacity for each team member
    for (const member of teamMembers) {
      
      const memberCapacity = memberCapacities.get(member.userId);
      const roleDefaultCapacity = defaultCapacities.get(member.roleId);
      const selectedCapacity = memberCapacity ?? roleDefaultCapacity;

      if (selectedCapacity === undefined || selectedCapacity === null) {
        result.memberSkipCount++;
        console.log(`[Capacity Seeding] Skipping ${member.userId} (${member.roleId}) - no default capacity`);
        continue;
      }

      const capacitySource = memberCapacity !== undefined ? "config_capacity" : "sprint_capacity_defaults";

      // Capacity API requires a resolved Azure identity ID, not an email/user alias.
      if (!member.azureIdentityId) {
        result.memberSkipCount++;
        console.log(`[Capacity Seeding] Skipping ${member.userId} - no azure_identity_id`);
        await recordCapacityArtifact(
          seedRunId || 0,
          member.userId,
          member.roleId,
          selectedCapacity,
          false,
          false,
          "Skipped: missing azure_identity_id"
        );
        continue;
      }

      const teamMemberRef = member.azureIdentityId;

      // Check if member already has capacity
      const existingCapacity = await getMemberExistingCapacity(
        config.projectId,
        config.teamId,
        teamMemberRef,
        config.sprintId
      );

      if (existingCapacity !== null && existingCapacity > 0) {
        result.memberSkipCount++;
        console.log(`[Capacity Seeding] Skipping ${member.userId} - already has capacity: ${existingCapacity}h/day`);
        await recordCapacityArtifact(seedRunId || 0, member.userId, member.roleId, selectedCapacity, false, false);
        continue;
      }

      // Seed capacity using Azure identity ID
      const seedResult = await seedMemberCapacity(
        config.projectId,
        config.teamId,
        config.sprintId,
        teamMemberRef,
        selectedCapacity,
        config.dryRun
      );

      if (seedResult.success) {
        result.membersSeedCount++;
        console.log(`[Capacity Seeding] ✓ Seeded ${member.userId} with ${selectedCapacity}h/day (${capacitySource})`);
        await recordCapacityArtifact(seedRunId || 0, member.userId, member.roleId, selectedCapacity, true, true);
      } else {
        result.success = false;
        result.errors.push(`Failed to seed ${member.userId}: ${seedResult.error}`);
        console.error(`[Capacity Seeding] ✗ Failed to seed ${member.userId}: ${seedResult.error}`);
        await recordCapacityArtifact(seedRunId || 0, member.userId, member.roleId, selectedCapacity, true, false, seedResult.error);
      }
    }

    result.summary = {
      totalDefaults: defaultCapacities.size,
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
