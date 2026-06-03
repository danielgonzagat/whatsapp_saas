#!/usr/bin/env node
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'security-invariants.mjs',
  'gates/registry.ts',
  'server-tools-exec.ts',
  'atomic-only-hook.mjs',
  'server-helpers-io.ts',
];

function copyFixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-security-readonly-'));
  for (const file of files) {
    const dest = path.join(tmp, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(sourceDir, file), dest);
  }
  return tmp;
}

function readBaseline(tmp) {
  return fs.existsSync(path.join(tmp, '.security-baseline.json'))
    ? fs.readFileSync(path.join(tmp, '.security-baseline.json'), 'utf8')
    : '';
}

function run(tmp, args) {
  return childProcess.execFileSync(process.execPath, [path.join(tmp, 'security-invariants.mjs'), ...args], {
    cwd: tmp,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function record(results, name, ok, detail) {
  results.push({ name, ok, detail });
}

function main() {
  const results = [];
  const tmp = copyFixture();
  try {
    const first = JSON.parse(run(tmp, ['--enforce', '--ratchet']));
    const before = readBaseline(tmp);
    const registryPath = path.join(tmp, 'gates/registry.ts');
    const registry = fs.readFileSync(registryPath, 'utf8').replace(/(WRITE_GATES[^=]*=\s*\[\n)/, '$1  extraStrongGate,\n');
    fs.writeFileSync(registryPath, registry);

    const readonly = JSON.parse(run(tmp, ['--enforce']));
    const afterReadonly = readBaseline(tmp);
    const ratchet = JSON.parse(run(tmp, ['--enforce', '--ratchet']));
    const afterRatchet = readBaseline(tmp);

    record(results, 'initial ratchet establishes fixture baseline', first.ok === true && first.persisted === true && before.includes('writeGates'), { first });
    record(results, 'plain --enforce is read-only', readonly.ok === true && readonly.persisted === false && afterReadonly === before, { readonly });
    record(results, 'explicit --ratchet persists strengthening only when requested', ratchet.ok === true && ratchet.persisted === true && afterRatchet !== before && ratchet.baseline.writeGates > first.baseline.writeGates, { ratchet });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return { ok: results.every((entry) => entry.ok), results };
}

const result = main();
if (jsonMode) {
  process.stdout.write(JSON.stringify(result) + '\n');
} else {
  for (const entry of result.results) process.stdout.write(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}\n`);
}
process.exit(result.ok ? 0 : 1);
