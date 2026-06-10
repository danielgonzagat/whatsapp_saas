#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolSource = fs.readFileSync(path.join(sourceDir, 'server-tools-codex-config.ts'), 'utf8');
const selfSource = fs.readFileSync(path.join(sourceDir, 'server-tools-self.ts'), 'utf8');
const latticeSource = fs.readFileSync(path.join(sourceDir, 'gates/self-expansion-validator-lattice.proof.mjs'), 'utf8');
const distToolPath = path.join(sourceDir, 'dist', 'server-tools-codex-config.js');
const distTool = fs.existsSync(distToolPath) ? fs.readFileSync(distToolPath, 'utf8') : '';
const inputSchema = toolSource.match(/atomic_codex_memory_note_create[\s\S]*?inputSchema:\s*\{([\s\S]*?)\n\s*\},\n\s*\},\n\s*async/)?.[1] ?? '';

function record(results, name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

function main() {
  const results = [];
  record(
    results,
    'atomic_codex_memory_note_create is registered as a narrow CODEX_HOME memory tool',
    /server\.registerTool\(\s*['"]atomic_codex_memory_note_create['"]/.test(toolSource) &&
      toolSource.includes('function codexMemoryNoteTarget') &&
      toolSource.includes("path.join(codexHome, 'memories', 'extensions', 'ad_hoc', 'notes')"),
    {
      registered: toolSource.includes('atomic_codex_memory_note_create'),
      hasTargetFunction: toolSource.includes('function codexMemoryNoteTarget'),
      hardwiredNotesDir: toolSource.includes("path.join(codexHome, 'memories', 'extensions', 'ad_hoc', 'notes')"),
    },
  );
  record(
    results,
    'memory note schema accepts content and slug but no caller-controlled path',
    /slug:\s*z\.string\(\)/.test(inputSchema) &&
      /content:\s*z\.string\(\)/.test(inputSchema) &&
      /timestamp:\s*z\.string\(\)\.optional\(\)/.test(inputSchema) &&
      !/\bfile\s*:|targetPath|absPath|path\s*:/.test(inputSchema),
    { inputSchema },
  );
  record(
    results,
    'memory note filename is validated and cannot escape CODEX_HOME',
    toolSource.includes('MEMORY_NOTE_SLUG_RE') &&
      toolSource.includes('MEMORY_NOTE_TIMESTAMP_RE') &&
      toolSource.includes('refused: Codex memory note target escaped CODEX_HOME') &&
      toolSource.includes('refused: invalid Codex memory note slug') &&
      toolSource.includes('refused: invalid Codex memory note timestamp'),
    {},
  );
  record(
    results,
    'memory note content is bounded positive-only material',
    toolSource.includes('MEMORY_NOTE_MAX_BYTES') &&
      toolSource.includes('refused: Codex memory note content is empty') &&
      toolSource.includes('refused: Codex memory note content contains NUL bytes') &&
      toolSource.includes('refused: Codex memory note content exceeds'),
    {},
  );
  record(
    results,
    'memory note creation is no-overwrite atomic create with post-write verification',
    toolSource.includes('function writeNewFileAtomically') &&
      toolSource.includes('fs.linkSync(tmp, target)') &&
      toolSource.includes('refused: Codex memory note already exists') &&
      toolSource.includes('post-write verification failed: Codex memory note bytes differ from requested content'),
    {},
  );
  record(
    results,
    'memory note proof is permanently in the self-expansion lattice',
    selfSource.includes("phase: 'codex-memory'") &&
      selfSource.includes('node gates/codex-memory-note-tool.proof.mjs --json') &&
      latticeSource.includes('node gates/codex-memory-note-tool.proof.mjs --json') &&
      latticeSource.includes("'codex-memory'"),
    {},
  );
  record(
    results,
    'compiled dist exposes the memory note tool after build',
    distTool.includes('atomic_codex_memory_note_create'),
    { distToolPath, distPresent: distTool.length > 0 },
  );

  const ok = results.every((result) => result.ok);
  const payload = { ok, results };
  if (jsonMode) console.log(JSON.stringify(payload, null, 2));
  else console.log(ok ? 'codex memory note tool proof OK' : 'codex memory note tool proof FAILED');
  process.exit(ok ? 0 : 1);
}

main();
