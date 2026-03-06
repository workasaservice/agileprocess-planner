// Copyright (c) 2026 AgilePlanner Contributors
// Licensed under the MIT License. See LICENSE file for details.

import fs from "fs";
import path from "path";

import dotenv from "dotenv";

import { closePool, query } from "../lib/neonClient";

dotenv.config();

function getSqlFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

async function run() {
  const root = process.cwd();
  const migrationsDir = path.resolve(root, "db/migrations");

  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  const files = getSqlFiles(migrationsDir);
  if (files.length === 0) {
    console.log("No migration files found.");
    return;
  }

  for (const file of files) {
    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, "utf8").trim();

    if (!sql) {
      console.log(`Skipping empty migration: ${file}`);
      continue;
    }

    console.log(`Applying migration: ${file}`);
    await query(sql);
  }

  console.log(`Applied ${files.length} migration(s).`);
}

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
