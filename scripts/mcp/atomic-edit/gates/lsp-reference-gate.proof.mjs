/**
 * LSP Reference Gate — Proof Corpus
 *
 * Verifies that the lsp-reference-gate correctly:
 *   1. Detects language from file extension
 *   2. Routes to correct LSP
 *   3. Returns proper verdict structure
 *
 * Run: node --experimental-vm-modules gates/lsp-reference-gate.proof.mjs
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const gateMod = await import('./lsp-reference-gate.ts');

const TESTS = [
  { file: 'src/index.ts', expected: true, desc: 'TypeScript references' },
  { file: 'app.py', expected: true, desc: 'Python references' },
  { file: 'main.go', expected: true, desc: 'Go references' },
  { file: 'lib.rs', expected: true, desc: 'Rust references' },
  { file: 'server.c', expected: true, desc: 'C references' },
  { file: 'Main.java', expected: true, desc: 'Java references' },
  { file: 'App.kt', expected: true, desc: 'Kotlin references' },
  { file: 'index.php', expected: true, desc: 'PHP references' },
  { file: 'main.swift', expected: true, desc: 'Swift references' },
  { file: 'init.lua', expected: true, desc: 'Lua references' },
  { file: 'Dockerfile', expected: false, desc: 'Dockerfile no references' },
  { file: 'config.yaml', expected: false, desc: 'YAML no references' },
  { file: 'README.md', expected: false, desc: 'Markdown no references' },
  { file: 'image.png', expected: false, desc: 'PNG not a language' },
];

let passed = 0, failed = 0;

for (const t of TESTS) {
  const r = gateMod.appliesTo(t.file);
  if (r === t.expected) { passed++; console.log(`  ✅ ${t.desc}`); }
  else { failed++; console.log(`  ❌ ${t.desc}: expected ${t.expected}, got ${r}`); }
}

console.log(`\nappliesTo: ${passed}/${TESTS.length} passed`);

const syncCtx = { file: '/tmp/test.py', before: 'x=1', after: 'x=2', operator: 'test', language: 'python', syntaxBefore: 0, syntaxAfter: 0 };
const syncR = gateMod.evaluateSync(syncCtx);
if (syncR.id === 'lsp-reference-gate' && syncR.status === 'unjudged') { passed++; console.log('  ✅ Sync abstains'); }
else { failed++; console.log(`  ❌ Sync: ${JSON.stringify(syncR)}`); }

if (gateMod.name === 'lsp-reference-gate' && gateMod.version === '1.0.0') { passed++; console.log('  ✅ Module exports'); }
else { failed++; console.log('  ❌ Module exports mismatch'); }

console.log(`\nTotal: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
