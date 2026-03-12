#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';

// Check if we have a backup of the old generated-iterations.json
const backupPath = path.join(process.cwd(), 'config', 'generated-iterations.json.backup');
const mainPath = path.join(process.cwd(), 'config', 'generated-iterations.json');

if (fs.existsSync(mainPath)) {
  const content = fs.readFileSync(mainPath, 'utf-8');
  const data = JSON.parse(content);
  
  console.log('Current iterations in JSON:');
  console.log(`Total: ${data.total}`);
  console.log('\nFirst 3 iterations:');
  data.results.slice(0, 3).forEach((iter: any) => {
    console.log(`  ${iter.name}`);
    console.log(`  Path: ${iter.iterationPath}\n`);
  });
}
