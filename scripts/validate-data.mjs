// Phase 0 stub: checks every JSON file in src/data parses. Real schema checks arrive with the data.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../src/data/', import.meta.url).pathname;
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
let failed = false;

for (const file of files) {
  try {
    JSON.parse(readFileSync(join(dir, file), 'utf8'));
  } catch (err) {
    failed = true;
    console.error(`FAIL ${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

if (failed) process.exit(1);
console.log(`validate-data: ${files.length} JSON file(s) parsed OK (stub).`);
