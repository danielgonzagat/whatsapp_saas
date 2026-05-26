#!/usr/bin/env node
// Aggregate runner for all canonicalization gates under scripts/ops/canonical/.
// Runs each gate script, collects results, exits 0 only if all pass.
//
// Exit 0 = all gates clean. Exit 1 = one or more gates failed.

import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const GATES = [
  { name: 'G13: Math.random ban', script: 'gate-math-random.mjs' },
  { name: 'G1: prismaAny ban', script: 'gate-prisma-any.mjs' },
  { name: 'G5: Asaas ban', script: 'gate-asaas-ban.mjs' },
];

let failures = 0;
const results = [];

for (const gate of GATES) {
  const scriptPath = join(__dirname, gate.script);
  const result = spawnSync(process.execPath, [scriptPath], {
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: 60_000,
  });
  const passed = result.status === 0;
  if (!passed) failures++;
  results.push({
    gate: gate.name,
    passed,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  });
}

console.log('=== Canonicalization Gates Report ===\n');
for (const r of results) {
  const icon = r.passed ? '✅' : '❌';
  console.log(`${icon} ${r.gate}: ${r.passed ? 'PASS' : 'FAIL'}`);
  if (r.stdout) console.log(`   ${r.stdout}`);
  if (r.stderr) {
    for (const line of r.stderr.split('\n')) console.log(`   ${line}`);
  }
  console.log('');
}

console.log(`Total: ${results.length - failures}/${results.length} gates passed`);
process.exit(failures > 0 ? 1 : 0);
