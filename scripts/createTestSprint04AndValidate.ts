#!/usr/bin/env tsx

import "dotenv/config";
import fs from "fs";
import path from "path";
import { createSprintsAndSeed } from "../src/handlers/createSprintsAndSeed";
import { azureDevOpsMcpClient } from "../src/clients/azureDevOpsMcpClient";
import { neonMcpClient } from "../src/clients/neonMcpClient";

type ProjectConfig = {
  projectId: string;
  teamName: string;
};

const PROJECTS: ProjectConfig[] = [
  { projectId: "MotherOps-Alpha", teamName: "MotherOps-Alpha Team" },
  { projectId: "MotherOps-Beta", teamName: "MotherOps-Beta Team" }
];

function getArgValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  return process.argv[index + 1];
}

const SPRINT_NAME = getArgValue("--sprint-name") || "TestSprint 05";
const START_DATE = getArgValue("--start-date") || "2026-03-23";
const FINISH_DATE = getArgValue("--finish-date") || "2026-03-29";

async function syncCapacityFromRepoFileToNeon(): Promise<void> {
  const capacityFilePath = path.resolve(process.cwd(), "capacity");
  if (!fs.existsSync(capacityFilePath)) {
    console.log("[Capacity Sync] Skipped: capacity file not found");
    return;
  }

  const raw = fs.readFileSync(capacityFilePath, "utf8");
  const parsed = JSON.parse(raw) as { capacity?: Array<Record<string, unknown>> };
  const rows = Array.isArray(parsed.capacity) ? parsed.capacity : [];

  let updated = 0;
  let notFound = 0;

  for (const row of rows) {
    const displayName = String(row.member || "").trim();
    const focusFactor = Number(row.focusFactor);
    const productiveHoursPerSprint = Number(row.productiveHoursPerSprint);
    const totalCapacityHours = Number(row.totalHoursSixSprints || row.totalCapacityHours || 0);

    if (!displayName || !Number.isFinite(productiveHoursPerSprint) || productiveHoursPerSprint <= 0) {
      continue;
    }

    const user = await neonMcpClient.query<any>(
      `SELECT user_id as "userId", role_id as "roleId"
       FROM config_users
       WHERE LOWER(display_name) = LOWER($1)
       LIMIT 1`,
      [displayName]
    );

    if (!Array.isArray(user) || user.length === 0) {
      notFound++;
      continue;
    }

    const userId = String(user[0].userId);
    const roleId = String(user[0].roleId || "engineer");

    await neonMcpClient.query(
      `WITH updated AS (
         UPDATE config_capacity
         SET role_id = $2,
             focus_factor = $3,
             productive_hours_per_sprint = $4,
             total_capacity_hours = $5,
             updated_at = NOW()
         WHERE user_id = $1
         RETURNING user_id
       )
       INSERT INTO config_capacity
       (user_id, role_id, focus_factor, productive_hours_per_sprint, total_capacity_hours, created_at, updated_at)
       SELECT $1, $2, $3, $4, $5, NOW(), NOW()
       WHERE NOT EXISTS (SELECT 1 FROM updated)`,
      [
        userId,
        roleId,
        Number.isFinite(focusFactor) ? focusFactor : 0.7,
        productiveHoursPerSprint,
        Number.isFinite(totalCapacityHours) && totalCapacityHours > 0 ? totalCapacityHours : productiveHoursPerSprint
      ]
    );

    updated++;
  }

  console.log(`[Capacity Sync] Neon config_capacity upserted: ${updated}, unmatched names: ${notFound}`);
}

function iterationPathCandidates(iterationPath: string): string[] {
  const trimmedLeading = iterationPath.replace(/^\\+/, "");
  const withoutIterationNode = trimmedLeading.replace(/\\Iteration\\/i, "\\");
  return Array.from(new Set([withoutIterationNode, trimmedLeading, iterationPath].map((p) => p.trim()).filter(Boolean)));
}

async function getSprintItemsWithPathFallback(projectId: string, iterationPath: string, workItemType: string): Promise<any[]> {
  const candidates = iterationPathCandidates(iterationPath);
  for (const candidate of candidates) {
    try {
      const result: any = await azureDevOpsMcpClient.callTool("get-sprint-work-items", {
        project: projectId,
        iterationPath: candidate,
        workItemType,
        fields: ["System.Id", "System.Title", "System.WorkItemType", "System.IterationPath"]
      });
      const items = Array.isArray(result?.workItems) ? result.workItems : [];
      if (items.length > 0) {
        return items;
      }
    } catch {
      // Try next path variant.
    }
  }
  return [];
}

async function loadProjectMembers(projectId: string): Promise<string[]> {
  const rows = await neonMcpClient.query<any>(
    `SELECT cpu.user_id as "userId"
     FROM config_project_members cpu
     WHERE cpu.project_id = $1
     ORDER BY cpu.user_id`,
    [projectId]
  );

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((r) => String(r.userId)).filter(Boolean);
}

async function syncMembersToTeam(project: ProjectConfig): Promise<void> {
  console.log(`\n[Sync] ${project.projectId} / ${project.teamName}`);
  const members = await loadProjectMembers(project.projectId);

  let added = 0;
  let already = 0;
  let failed = 0;

  for (const memberId of members) {
    try {
      await azureDevOpsMcpClient.callTool("add-team-member", {
        project: project.projectId,
        team: project.teamName,
        memberId
      });
      added++;
      console.log(`  + Added: ${memberId}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("already") || msg.includes("409") || msg.includes("exists")) {
        already++;
      } else {
        failed++;
        console.log(`  ! Failed: ${memberId} -> ${msg}`);
      }
    }
  }

  console.log(`  Summary: added=${added}, already=${already}, failed=${failed}`);

  const teamMembersResult: any = await azureDevOpsMcpClient.callTool("get-team-members", {
    project: project.projectId,
    team: project.teamName
  });

  const teamMembers = Array.isArray(teamMembersResult?.value) ? teamMembersResult.value : [];
  let identitiesUpdated = 0;

  for (const member of teamMembers) {
    const email = member?.identity?.uniqueName || member?.identity?.displayName;
    const azureId = member?.identity?.id || member?.id;
    if (!email || !azureId) {
      continue;
    }

    await neonMcpClient.query(
      `UPDATE config_users
       SET azure_identity_id = $1, updated_at = NOW()
       WHERE user_principal_name ILIKE $2 OR user_id ILIKE $2 OR mail_nickname ILIKE $2`,
      [String(azureId), String(email)]
    );
    identitiesUpdated++;
  }

  console.log(`  Identity updates in Neon: ${identitiesUpdated}`);
}

async function cleanupExistingSprint(project: ProjectConfig): Promise<void> {
  console.log(`\n[Cleanup] ${project.projectId} - ${SPRINT_NAME}`);

  try {
    await azureDevOpsMcpClient.callTool("delete-iteration", {
      project: project.projectId,
      name: SPRINT_NAME
    });
    console.log("  ✓ Deleted existing sprint iteration from Azure");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
      console.log("  - No existing sprint iteration in Azure");
    } else {
      console.log(`  ! Azure cleanup warning: ${msg}`);
    }
  }

  await neonMcpClient.query(
    `DELETE FROM sprint_seed_artifacts
     WHERE seed_run_id IN (
       SELECT id FROM sprint_seed_runs WHERE sprint_id = $1 AND project_id = $2
     )`,
    [SPRINT_NAME, project.projectId]
  );

  await neonMcpClient.query(
    `DELETE FROM sprint_seed_runs WHERE sprint_id = $1 AND project_id = $2`,
    [SPRINT_NAME, project.projectId]
  );

  await neonMcpClient.query(
    `DELETE FROM config_project_iterations WHERE sprint_name = $1 AND project_id = $2`,
    [SPRINT_NAME, project.projectId]
  );

  console.log("  ✓ Neon cleanup complete");
}

async function createSprint(project: ProjectConfig): Promise<void> {
  console.log(`\n[Create] ${project.projectId} - ${SPRINT_NAME}`);

  const schedule = {
    sprints: [
      {
        name: SPRINT_NAME,
        startDate: START_DATE,
        finishDate: FINISH_DATE
      }
    ]
  };

  const result = await createSprintsAndSeed({
    projectId: project.projectId,
    teamName: project.teamName,
    schedule: JSON.stringify(schedule),
    dryRun: false
  });

  if (!result.success) {
    throw new Error(`createSprintsAndSeed failed for ${project.projectId}: ${result.errors?.join("; ")}`);
  }

  console.log("  ✓ Sprint created and seeded");
}

async function verify(project: ProjectConfig): Promise<void> {
  console.log(`\n[Verify] ${project.projectId} - ${SPRINT_NAME}`);

  const rows = await neonMcpClient.query<any>(
    `SELECT iteration_id as "iterationId", iteration_path as "iterationPath", start_date as "startDate", finish_date as "finishDate"
     FROM config_project_iterations
     WHERE project_id = $1 AND sprint_name = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [project.projectId, SPRINT_NAME]
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`No iteration metadata found in Neon for ${project.projectId}/${SPRINT_NAME}`);
  }

  const iterationId = rows[0].iterationId as string;
  const iterationPath = rows[0].iterationPath as string;

  console.log(`  Iteration ID: ${iterationId}`);
  console.log(`  Iteration Path: ${iterationPath}`);
  console.log(`  Dates: ${rows[0].startDate} -> ${rows[0].finishDate}`);

  const projectMembers = await neonMcpClient.query<any>(
    `SELECT cpu.user_id as "userId", cu.azure_identity_id as "azureIdentityId"
     FROM config_project_members cpu
     JOIN config_users cu ON cpu.user_id = cu.user_id
     WHERE cpu.project_id = $1
     ORDER BY cpu.user_id`,
    [project.projectId]
  );

  const members = Array.isArray(projectMembers) ? projectMembers : [];
  const missingIdentity = members.filter((m) => !m.azureIdentityId);
  console.log(`  Members in project: ${members.length}`);
  console.log(`  Members with azure_identity_id: ${members.length - missingIdentity.length}`);

  const capacities: any = await azureDevOpsMcpClient.callTool("list-sprint-capacities", {
    project: project.projectId,
    team: project.teamName,
    iterationId
  });

  const capacityRows = Array.isArray(capacities?.value) ? capacities.value : [];
  console.log(`  Capacity rows in Azure: ${capacityRows.length}`);

  const start = new Date(START_DATE);
  const finish = new Date(FINISH_DATE);
  const workingDays = (() => {
    let count = 0;
    const cursor = new Date(start);
    while (cursor <= finish) {
      const day = cursor.getDay();
      if (day >= 1 && day <= 5) {
        count++;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return Math.max(1, count);
  })();

  const expectedRows = await neonMcpClient.query<any>(
    `SELECT c.user_id as "userId",
            cu.azure_identity_id as "azureIdentityId",
            c.productive_hours_per_sprint as "productiveHoursPerSprint"
     FROM config_capacity c
     JOIN config_users cu ON cu.user_id = c.user_id
     JOIN config_project_members cpm ON cpm.user_id = c.user_id
     WHERE cpm.project_id = $1
       AND cu.azure_identity_id IS NOT NULL
       AND c.productive_hours_per_sprint IS NOT NULL
       AND c.productive_hours_per_sprint > 0`,
    [project.projectId]
  );

  const expectedByAzureId = new Map<string, { userId: string; expectedPerDay: number }>();
  if (Array.isArray(expectedRows)) {
    for (const row of expectedRows) {
      const azureIdentityId = String(row.azureIdentityId || "").trim();
      const productive = Number(row.productiveHoursPerSprint);
      if (!azureIdentityId || !Number.isFinite(productive) || productive <= 0) {
        continue;
      }
      const expectedPerDay = Math.round((productive / workingDays) * 100) / 100;
      expectedByAzureId.set(azureIdentityId, {
        userId: String(row.userId),
        expectedPerDay
      });
    }
  }

  let verifiedByMember = 0;
  let neonCapacityMatches = 0;
  let neonCapacityMismatches = 0;

  const compareWithNeon = (teamMemberId: string, actualCapacity: number): void => {
    const expected = expectedByAzureId.get(teamMemberId);
    if (!expected) {
      return;
    }
    if (Math.abs(expected.expectedPerDay - actualCapacity) < 0.01) {
      neonCapacityMatches++;
      return;
    }

    neonCapacityMismatches++;
    console.log(
      `  ! Capacity mismatch ${expected.userId}: Azure=${actualCapacity} vs Neon=${expected.expectedPerDay} (h/day)`
    );
  };

  for (const row of capacityRows) {
    const teamMemberId = String(row?.teamMember?.id || "").trim();
    const activities = Array.isArray(row?.activities) ? row.activities : [];
    const dev = activities.find((a: any) => String(a?.name || "") === "Development");
    const actual = Number(dev?.capacityPerDay);
    if (!teamMemberId || !Number.isFinite(actual)) {
      continue;
    }
    compareWithNeon(teamMemberId, actual);
  }

  if (capacityRows.length === 0) {
    for (const member of members) {
      if (!member.azureIdentityId) {
        continue;
      }
      try {
        const one: any = await azureDevOpsMcpClient.callTool("get-sprint-capacity", {
          project: project.projectId,
          team: project.teamName,
          iterationId,
          teamMemberId: member.azureIdentityId
        });
        if (Array.isArray(one?.activities) && one.activities.length > 0) {
          verifiedByMember++;

          const dev = one.activities.find((a: any) => String(a?.name || "") === "Development");
          const actual = Number(dev?.capacityPerDay);
          if (Number.isFinite(actual)) {
            compareWithNeon(String(member.azureIdentityId), actual);
          }
        }
      } catch {
        // Ignore per-member lookup failures; summary below highlights gaps.
      }
    }
    console.log(`  Capacity verified by per-member lookup: ${verifiedByMember}`);
  }

  if (expectedByAzureId.size > 0) {
    console.log(
      `  Neon capacity parity: matches=${neonCapacityMatches}, mismatches=${neonCapacityMismatches}, expected=${expectedByAzureId.size}`
    );
  }

  const stories = await getSprintItemsWithPathFallback(project.projectId, iterationPath, "User Story");
  const tasks = await getSprintItemsWithPathFallback(project.projectId, iterationPath, "Task");

  const storyTitles = new Set(stories.map((s: any) => String(s?.fields?.["System.Title"] || "")));
  const hasMeetings = storyTitles.has("Meetings");
  const hasUnplanned = storyTitles.has("UnPlanned");

  console.log(`  User Stories: ${stories.length} (Meetings=${hasMeetings}, UnPlanned=${hasUnplanned})`);
  console.log(`  Tasks: ${tasks.length}`);

  if (missingIdentity.length > 0) {
    console.log("  ! Missing azure_identity_id for:");
    for (const m of missingIdentity) {
      console.log(`    - ${m.userId}`);
    }
  }

  if (!hasMeetings || !hasUnplanned) {
    throw new Error(`Default parent user stories missing for ${project.projectId}`);
  }

  if (capacityRows.length < members.length && verifiedByMember < members.length) {
    console.log("  ! Capacity rows are fewer than project members (check team membership/capacity defaults)");
  }

  console.log("  ✓ Verification completed");
}

async function main() {
  console.log("\n" + "=".repeat(80));
  console.log("TEST SPRINT - FULL CREATE + VALIDATION");
  console.log("=".repeat(80));
  console.log(`Sprint: ${SPRINT_NAME}`);
  console.log(`Dates: ${START_DATE} -> ${FINISH_DATE}`);

  await syncCapacityFromRepoFileToNeon();

  for (const project of PROJECTS) {
    await syncMembersToTeam(project);
    await cleanupExistingSprint(project);
    await createSprint(project);
    await verify(project);
  }

  console.log("\n" + "=".repeat(80));
  console.log(`SUCCESS: ${SPRINT_NAME} created and validated for Alpha/Beta`);
  console.log("=".repeat(80) + "\n");
}

main().catch((error) => {
  console.error("\nFAILED:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
