// Copyright (c) 2026 AgilePlanner Contributors
// Licensed under the MIT License. See LICENSE file for details.

import dotenv from "dotenv";

import { checkDatabaseHealth, closePool } from "../lib/neonClient";

dotenv.config();

async function run() {
  const health = await checkDatabaseHealth();
  console.log(JSON.stringify(health, null, 2));

  if (!health.ok) {
    process.exitCode = 1;
  }
}

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
