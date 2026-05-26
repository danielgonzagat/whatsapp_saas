#!/usr/bin/env node
// tools/saas-compiler/run.mjs — orchestrator for the full intent→prod loop.
//
// CLI: node tools/saas-compiler/run.mjs <intents/*.md>
//
// Pipeline:
//   1. intent-to-spec.mjs <intent.md>  → <intent.spec.json>
//   2. spec-to-code.mjs <spec.json>    → auto-pr job
//   3. (auto-pr loop-runner ships the PR; auto-merger lands it)
//   4. (verify-in-prod.mjs runs on a cron after merge)
//
// This runner just steps 1+2. The rest is the existing autonomous pipeline.

import { spawnSync } from 'node:child_process';
import { argv, exit } from 'node:process';
import { join } from 'node:path';

const ROOT = process.cwd();
const intentArg = argv[2];
if (!intentArg) { console.error('usage: run.mjs <intents/file.md>'); exit(2); }

const specPath = intentArg.replace(/\.md$/, '.spec.json');

console.log('[saas-compiler] 1/2 intent → spec');
let r = spawnSync('node', [join(ROOT, 'tools/saas-compiler/intent-to-spec.mjs'), intentArg], { stdio: 'inherit' });
if (r.status !== 0) exit(r.status || 1);

console.log('[saas-compiler] 2/2 spec → code (auto-pr job)');
r = spawnSync('node', [join(ROOT, 'tools/saas-compiler/spec-to-code.mjs'), specPath], { stdio: 'inherit' });
if (r.status !== 0) exit(r.status || 1);

console.log('[saas-compiler] done. The auto-PR loop-runner will pick the job up within 5 min.');
console.log('[saas-compiler] To verify after merge: node tools/saas-compiler/verify-in-prod.mjs ' + specPath);
