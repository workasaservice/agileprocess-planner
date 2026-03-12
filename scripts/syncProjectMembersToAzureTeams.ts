#!/usr/bin/env tsx

import "dotenv/config";
import { neonMcpClient } from "../src/clients/neonMcpClient";
import { azureDevOpsMcpClient } from "../src/clients/azureDevOpsMcpClient";

interface TeamConfig {
  project: string;
  team: string;
}

const TEAM_CONFIGS: TeamConfig[] = [
  { project: "MotherOps-Alpha", team: "MotherOps-Alpha Team" },
  { project: "MotherOps-Beta", team: "MotherOps-Beta Team" }
];

async function loadProjectMembers(project: string): Promise<string[]> {
  const rows = await neonMcpClient.query<any>(
    `SELECT cpu.user_id as "userId"
     FROM config_project_members cpu
     WHERE cpu.project_id = $1
     ORDER BY cpu.user_id`,
    [project]
  );

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((r) => String(r.userId)).filter(Boolean);
}

async function upsertTeamMemberIdentities(project: string, team: string): Promise<number> {
  const membersResult: any = await azureDevOpsMcpClient.callTool("get-team-members", {
    project,
    team
  });

  const members = Array.isArray(membersResult?.value) ? membersResult.value : [];
  let updated = 0;

  for (const member of members) {
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

    updated++;
  }

  return updated;
}

async function syncTeam(config: TeamConfig): Promise<void> {
  console.log(`\n=== ${config.project} / ${config.team} ===`);

  const members = await loadProjectMembers(config.project);
  console.log(`Project members from Neon: ${members.length}`);

  let added = 0;
  let already = 0;
  let failed = 0;

  for (const memberId of members) {
    try {
      await azureDevOpsMcpClient.callTool("add-team-member", {
        project: config.project,
        team: config.team,
        memberId
      });
      added++;
      console.log(`+ Added: ${memberId}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("already") || msg.includes("409") || msg.includes("exists")) {
        already++;
        console.log(`= Already member: ${memberId}`);
      } else {
        failed++;
        console.log(`! Failed: ${memberId} -> ${msg}`);
      }
    }
  }

  const updated = await upsertTeamMemberIdentities(config.project, config.team);
  console.log(`Identity updates in Neon: ${updated}`);
  console.log(`Summary: added=${added}, already=${already}, failed=${failed}`);
}

async function main() {
  for (const config of TEAM_CONFIGS) {
    await syncTeam(config);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
