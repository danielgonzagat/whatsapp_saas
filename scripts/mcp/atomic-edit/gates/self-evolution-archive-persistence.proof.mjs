#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const selfSource = fs.readFileSync(path.join(sourceDir, 'server-tools-self.ts'), 'utf8');
const harnessSource = fs.readFileSync(path.join(sourceDir, 'self-evolution-harness.mjs'), 'utf8');
const results = [];

function record(name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

record(
  'real self-expansion names one durable evolution archive file',
  selfSource.includes("const SELF_EVOLUTION_ARCHIVE_REL = 'self-evolution-archive.jsonl'") &&
    selfSource.includes('function appendRealSelfExpansionArchive'),
);
record(
  'archive append is delegated to the deterministic harness appendArchiveJsonl mode',
  selfSource.includes("runSelfEvolutionHarness('--append-archive-jsonl'") &&
    harnessSource.includes('export function appendArchiveJsonl') &&
    harnessSource.includes('verifyArchiveJsonl(nextArchiveText)'),
);
record(
  'archive write remains inside self-expansion admission and final effect guard allows only the named archive',
  selfSource.includes('withSelfExpansionAdmission(() => atomicWrite(archivePath') &&
    selfSource.includes('function isSelfEvolutionArchiveEffect') &&
    selfSource.includes('!isSelfEvolutionArchiveEffect(rel)'),
);

const payload = { ok: results.every((result) => result.ok), results };
if (jsonMode) process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
else for (const result of results) process.stdout.write(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}\n`);
process.exit(payload.ok ? 0 : 1);
