// Copyright (c) 2026 AgilePlanner Contributors
// Licensed under the MIT License. See LICENSE file for details.

import crypto from "crypto";
import fs from "fs";
import path from "path";

import dotenv from "dotenv";

import { closePool, query } from "../lib/neonClient";

dotenv.config();

const EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
]);

const EXCLUDED_FILES = new Set([
  "package-lock.json",
  "mcp-server/package-lock.json",
]);

function isSensitiveFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return [
    "credentials",
    "secret",
    "token",
    "password",
    "azure-devops.json",
    "microsoft-graph.json",
  ].some((token) => lower.includes(token));
}

function categoryForPath(filePath: string): string {
  if (filePath.startsWith("config/")) {
    return "config";
  }
  if (filePath.startsWith("mcp/")) {
    return "mcp";
  }
  if (filePath.startsWith("contracts/")) {
    return "contracts";
  }
  if (filePath.endsWith("package.json")) {
    return "package";
  }
  return "data";
}

function walkJsonFiles(rootDir: string, currentDir: string, output: string[]): void {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolute = path.join(currentDir, entry.name);
    const relative = path.relative(rootDir, absolute).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }
      walkJsonFiles(rootDir, absolute, output);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    if (EXCLUDED_FILES.has(relative)) {
      continue;
    }

    output.push(relative);
  }
}

function parseJsonOrFallback(
  filePath: string,
  raw: string
): { parsed: unknown; isValidJson: boolean; rawContent: string | null } {
  if (!raw.trim()) {
    return {
      parsed: {},
      isValidJson: false,
      rawContent: raw,
    };
  }

  try {
    return {
      parsed: JSON.parse(raw),
      isValidJson: true,
      rawContent: null,
    };
  } catch {
    // Support JSONC-like files (such as tsconfig.json) and trailing commas.
    if (filePath === "tsconfig.json") {
      const cleaned = raw
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/,\s*([}\]])/g, "$1");
      try {
        return {
          parsed: JSON.parse(cleaned),
          isValidJson: true,
          rawContent: null,
        };
      } catch {
        return {
          parsed: {},
          isValidJson: false,
          rawContent: raw,
        };
      }
    }

    return {
      parsed: {},
      isValidJson: false,
      rawContent: raw,
    };
  }
}

async function run() {
  const root = process.cwd();
  const includeSensitive = process.env.INCLUDE_SENSITIVE_JSON === "true";

  const allFiles: string[] = [];
  walkJsonFiles(root, root, allFiles);

  const skipped: string[] = [];
  let invalidCount = 0;
  let imported = 0;

  for (const relPath of allFiles.sort()) {
    const absPath = path.join(root, relPath);
    const raw = fs.readFileSync(absPath, "utf8");
    const sensitive = isSensitiveFile(relPath);

    if (sensitive && !includeSensitive) {
      skipped.push(relPath);
      continue;
    }

    const parsedResult = parseJsonOrFallback(relPath, raw);
    const parsed = parsedResult.parsed;
    if (!parsedResult.isValidJson) {
      invalidCount += 1;
    }

    const sourceHash = crypto.createHash("sha256").update(raw).digest("hex");

    await query(
      `
        INSERT INTO json_documents (
          file_path,
          category,
          is_sensitive,
          source_hash,
          payload,
          is_valid_json,
          raw_content,
          imported_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NOW(), NOW())
        ON CONFLICT (file_path)
        DO UPDATE SET
          category = EXCLUDED.category,
          is_sensitive = EXCLUDED.is_sensitive,
          source_hash = EXCLUDED.source_hash,
          payload = EXCLUDED.payload,
          is_valid_json = EXCLUDED.is_valid_json,
          raw_content = EXCLUDED.raw_content,
          imported_at = NOW(),
          updated_at = NOW()
      `,
      [
        relPath,
        categoryForPath(relPath),
        sensitive,
        sourceHash,
        JSON.stringify(parsed),
        parsedResult.isValidJson,
        parsedResult.rawContent,
      ]
    );

    imported += 1;
  }

  console.log(
    JSON.stringify(
      {
        imported,
        invalidCount,
        skippedCount: skipped.length,
        skipped,
        includeSensitive,
      },
      null,
      2
    )
  );
}

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
