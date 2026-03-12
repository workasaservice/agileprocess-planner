#!/usr/bin/env tsx

import "dotenv/config";
import { neonMcpClient } from "../src/clients/neonMcpClient";
import fs from "fs";
import path from "path";

(async () => {
  try {
    const sql = fs.readFileSync(
      path.resolve(process.cwd(), "db/migrations/012-sprint-hierarchy-cache.sql"),
      "utf8"
    );
    
    // Clean SQL: remove comment lines and split into statements
    const cleanSql = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    
    const statements = cleanSql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    
    console.log(`Running ${statements.length} migration statements...`);
    
    for (const [index, statement] of statements.entries()) {
      console.log(`  [${index + 1}/${statements.length}] ${statement.substring(0, 50)}...`);
      await neonMcpClient.query(statement);
    }
    
    console.log("✓ Migration 012-sprint-hierarchy-cache applied successfully");
  } catch (error) {
    console.error("✗ Migration failed:", error);
    process.exit(1);
  }
})();
