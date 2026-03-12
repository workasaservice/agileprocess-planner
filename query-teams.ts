#!/usr/bin/env ts-node

import dotenv from 'dotenv';
import { neonMcpClient } from './src/clients/neonMcpClient';

dotenv.config();

async function queryTeams() {
  console.log('🔍 Querying teams from database...\n');

  const projects = await neonMcpClient.query(
    `SELECT project_id, project_name, team_name FROM config_projects WHERE project_id IN ('MotherOps-Alpha', 'MotherOps-Beta')`
  );

  console.log('Teams configured:');
  projects.forEach((p: any) => {
    console.log(`  Project: ${p.project_id}`);
    console.log(`  Name: ${p.project_name}`);
    console.log(`  Team: ${p.team_name}\n`);
  });
}

queryTeams().catch(console.error);
