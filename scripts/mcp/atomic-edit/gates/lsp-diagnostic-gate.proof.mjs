/**
 * LSP Diagnostic Gate — Proof Corpus
 *
 * Verifies that the lsp-diagnostic-gate correctly:
 *   1. Detects language from file extension
 *   2. Routes to correct LSP
 *   3. Handles missing LSP Mesh gracefully (abstain, not block)
 *   4. Returns proper verdict structure
 *
 * Run: node --experimental-vm-modules gates/lsp-diagnostic-gate.proof.mjs
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dynamic import of the gate module
const gateMod = await import('./lsp-diagnostic-gate.ts');

// ── Test: Language detection ────────────────────────────────────────

const TESTS = [
  { file: 'src/index.ts', expected: true, desc: 'TypeScript detected' },
  { file: 'app.py', expected: true, desc: 'Python detected' },
  { file: 'main.go', expected: true, desc: 'Go detected' },
  { file: 'lib.rs', expected: true, desc: 'Rust detected' },
  { file: 'server.c', expected: true, desc: 'C detected' },
  { file: 'Main.java', expected: true, desc: 'Java detected' },
  { file: 'App.kt', expected: true, desc: 'Kotlin detected' },
  { file: 'index.php', expected: true, desc: 'PHP detected' },
  { file: 'main.swift', expected: true, desc: 'Swift detected' },
  { file: 'init.lua', expected: true, desc: 'Lua detected' },
  { file: 'schema.graphql', expected: true, desc: 'GraphQL detected' },
  { file: 'script.sh', expected: true, desc: 'Bash detected' },
  { file: 'config.yaml', expected: true, desc: 'YAML detected' },
  { file: 'README.md', expected: true, desc: 'Markdown detected' },
  { file: 'data.json', expected: true, desc: 'JSON detected' },
  { file: 'style.css', expected: true, desc: 'CSS detected' },
  { file: 'schema.prisma', expected: true, desc: 'Prisma detected' },
  { file: 'Dockerfile.foo', expected: false, desc: 'Unknown ext (no .dockerfile ext routing)' },
  { file: 'image.png', expected: false, desc: 'PNG not a source language' },
  { file: 'video.mp4', expected: false, desc: 'Video not a source language' },
];

let passed = 0;
let failed = 0;

for (const test of TESTS) {
  const result = gateMod.appliesTo(test.file);
  if (result === test.expected) {
    passed++;
    console.log(`  ✅ ${test.desc}`);
  } else {
    failed++;
    console.log(`  ❌ ${test.desc}: expected ${test.expected}, got ${result}`);
  }
}

console.log(`\nappliesTo: ${passed}/${TESTS.length} passed, ${failed} failed`);

// ── Test: Sync evaluate abstains correctly ──────────────────────────

const syncCtx = {
  file: '/tmp/test.py',
  before: 'x = 1',
  after: 'x = 2',
  operator: 'replace_text',
  language: 'python',
  syntaxBefore: 0,
  syntaxAfter: 0,
};

const syncResult = gateMod.evaluateSync(syncCtx);
if (syncResult.id === 'lsp-diagnostic-gate' && syncResult.status === 'unjudged') {
  passed++;
  console.log('  ✅ Sync evaluate abstains gracefully');
} else {
  failed++;
  console.log(`  ❌ Sync evaluate failed: ${JSON.stringify(syncResult)}`);
}

// ── Test: Verify module exports ─────────────────────────────────────

if (gateMod.name === 'lsp-diagnostic-gate' && gateMod.version === '1.0.0') {
  passed++;
  console.log('  ✅ Module exports name and version');
} else {
  failed++;
  console.log('  ❌ Module exports mismatch');
}

if (typeof gateMod.evaluate === 'function' && typeof gateMod.evaluateSync === 'function') {
  passed++;
  console.log('  ✅ Both evaluate and evaluateSync exported');
} else {
  failed++;
  console.log('  ❌ Missing evaluate functions');
}

console.log(`\nTotal: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
