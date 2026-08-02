import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemasDir = join(__dirname, '..', 'db-schemas');
const outputFile = join(schemasDir, 'combined-schema.sql');

const files = readdirSync(schemasDir)
  .filter((f) => /^\d{2}-.*\.sql$/.test(f))
  .sort();

const combined = files
  .map((f) => `-- === ${f} ===\n${readFileSync(join(schemasDir, f), 'utf-8')}`)
  .join('\n\n');

writeFileSync(outputFile, combined);
console.log(`Combined ${files.length} schema files into ${outputFile}`);
