#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(sourceDir, 'server-tools-self.ts'), 'utf8');

const checks = [
  {
    name: 'success path computes diffEffect from the pre-expansion snapshot',
    ok: /const effects = diffEffect\(snap\);[\s\S]*return ok\(\{/.test(source),
  },
  {
    name: 'success receipt exposes changedFiles and limitReached',
    ok: /effect:\s*\{[\s\S]*changedFiles:\s*effects\.length,[\s\S]*limitReached:\s*snap\.limitReached/.test(source),
  },
  {
    name: 'success receipt exposes per-file byte effects',
    ok: /files:\s*effects/.test(source),
  },
  {
    name: 'tool description advertises full byte-effect diff',
    ok: /receipt includes the full byte-effect diff/.test(source),
  },
];

const result = { ok: checks.every((entry) => entry.ok), results: checks };
if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
else for (const entry of checks) process.stdout.write(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}\n`);
process.exit(result.ok ? 0 : 1);
