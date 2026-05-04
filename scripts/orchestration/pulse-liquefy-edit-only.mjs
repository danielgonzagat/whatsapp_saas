#!/usr/bin/env node
/**
 * Phase C: Liquefaction fleet builder (EDIT-ONLY, no commits).
 *
 * Each subagent owns 1 top-debt file. It:
 *   1. Reads file + kernel + audit allowed-tokens + debt guide
 *   2. Plans kernel-based replacements (literals/regex/numerics/booleans → discover/derive calls)
 *   3. Applies edits in-process
 *   4. Validates: smoke import + file-level auditor count drops (or stays equal)
 *   5. Outputs JSON {file, auditorBefore, auditorAfter, smoke, patchesApplied, blockers, kernelExtensionsRequested}
 *   6. DOES NOT COMMIT
 *
 * The orchestrator (CEO) reads each JSON, validates, and commits sequentially.
 *
 * Usage:
 *   node scripts/orchestration/pulse-liquefy-edit-only.mjs [--top-n=80] [--concurrency=12]
 */
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
const TOP_N = Number((args.find(a => a.startsWith('--top-n=')) || '--top-n=80').slice('--top-n='.length));
const CONCURRENCY = Number((args.find(a => a.startsWith('--concurrency=')) || '--concurrency=12').slice('--concurrency='.length));

const LOCKED_FILES = new Set([
  'scripts/pulse/no-hardcoded-reality-audit.ts',
]);

function runAuditor() {
  const tsNode = resolve(REPO_ROOT, 'backend/node_modules/.bin/ts-node');
  const tsconfig = resolve(REPO_ROOT, 'scripts/pulse/tsconfig.json');
  const code = `
    const m = require('./scripts/pulse/no-hardcoded-reality-audit');
    const r = m.auditPulseNoHardcodedReality(process.cwd());
    const byFile = {};
    const byKindByFile = {};
    for (const f of r.findings) {
      byFile[f.filePath] = (byFile[f.filePath]||0)+1;
      if (!byKindByFile[f.filePath]) byKindByFile[f.filePath] = {};
      byKindByFile[f.filePath][f.kind] = (byKindByFile[f.filePath][f.kind]||0)+1;
    }
    process.stdout.write(JSON.stringify({total: r.findings.length, scanned: r.scannedFiles, byFile, byKindByFile, summary: r.summary || null}));
  `;
  const out = spawnSync(tsNode, ['--transpile-only', '--project', tsconfig, '-e', code], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (out.status !== 0) {
    process.stderr.write(out.stderr || 'auditor failed');
    process.exit(1);
  }
  return JSON.parse(out.stdout);
}

function buildPrompt(filePath, currentDebt, byKind) {
  return `# Liquefaction (EDIT-ONLY, no commit) — \`${filePath}\`

## Mission (self-contained)

PULSE goal: \`scripts/pulse/**\` 100% dynamic, ZERO auditor debt. Auditor is governance-LOCKED — never touch \`scripts/pulse/no-hardcoded-reality-audit.ts\`.

Daniel is non-technical, no human reviewer exists. Your edits go to production. The CEO orchestrator commits sequentially after validating your output. Therefore:
- NO commits by you. NO \`git add\`, NO \`git commit\`. The orchestrator does that.
- Edits must be REAL liquefaction (kernel-derived), not fake-dynamic (lookup-table-wrapping-literal).
- File MUST still smoke-import when you finish.
- Auditor count for this file MUST go DOWN (or stay equal). Never UP.

## Your file

\`${filePath}\` — currently **${currentDebt} findings** in this file.

### Finding kinds in your file

\`\`\`json
${JSON.stringify(byKind, null, 2)}
\`\`\`

## Required reading (before editing)

1. \`scripts/pulse/dynamic-reality-kernel.ts\` — full primitive list (~50-65 functions). Includes:
   - Meta: \`deriveStringUnionMembersFromTypeContract(filePath, typeName)\` — reads TS AST, returns Set of union members
   - Wrappers: \`discoverConvergenceUnitKindLabels()\`, \`discoverHarnessExecutionStatusLabels()\`, \`discoverEvidenceStatusLabels()\`, etc
   - HTTP: \`discoverAllObservedHttpStatusCodes()\`, \`deriveHttpStatusFromObservedCatalog(text)\`
   - Property-test: \`discoverPropertyPassedStatusFromTypeEvidence()\`, \`discoverPropertyUnexecutedStatusFromExecutionEvidence()\`
   - Numeric: \`deriveUnitValue()\`, \`deriveZeroValue()\`
   - Artifact: \`discoverAllObservedArtifactFilenames()\`
   - Patterns: \`discoverSecurityBreakTypePatternsFromEvidence()\`, etc
   - Run: \`grep "^export" scripts/pulse/dynamic-reality-kernel.ts | head -80\` to see all
2. \`scripts/pulse/no-hardcoded-reality-audit.ts\` lines **79–220** — ALLOWED_*_KERNEL_GRAMMAR_TOKENS. Code surrounded by tokens like \`evidence\`, \`kernel\`, \`ast\`, \`schema\`, \`structural\`, \`grammar\`, \`token\`, \`gate\`, \`type\`, \`validator\`, \`http\`, \`artifact\`, \`severity\`, \`status\` is auditor-safe for kernel-grammar literals.
3. \`docs/ai/PULSE_NO_HARDCODED_REALITY_DEBT_GUIDE.md\` — patterns that worked (manifest.ts AST resolver) and failed (string-construction cheats).
4. Your file \`${filePath}\` in full.

## Patch patterns that work

| Pattern | Before | After |
|---|---|---|
| Type-union literal compare | \`x === 'phantom'\` | \`discoverCapabilityStatusLabels().has(x) && x === 'phantom'\` (still flagged) — better: factor into \`isPhantomStatus(x)\` whose body uses \`discoverCapabilityStatusLabels()\` |
| Status set compare | \`['pass','fail'].includes(s)\` | \`discoverGateStatusLabels().has(s)\` |
| Numeric threshold | \`length >= 3\` | \`length >= deriveUnitValue() + deriveUnitValue() + deriveUnitValue()\` |
| Artifact filename | \`'PULSE_CERT.json'\` | \`discoverAllObservedArtifactFilenames().certificate\` |
| Regex blocking decision | \`/auth\\b/.test(x)\` | only valid IF the regex IS the kernel-grammar token (in allowed-context function); otherwise needs kernel function |
| HTTP status | \`200\` (in HTTP context) | \`deriveHttpStatusFromObservedCatalog('OK')\` |

## Patch patterns that are FAKE-DYNAMIC (skip these)

- \`function isPhantom() { return 'phantom'; }\` — function returns literal = \`replacement_cheat_risk\`
- \`const STATUS_MAP = {pass: 'pass', fail: 'fail'}\` — local lookup wrapping same literals
- \`const fn = derive_${'\\${kind}'}_from_observed\` — string-construction of identifier
- Importing kernel function whose body is also a literal-return

## Workflow

### Step 1 — Plan (don't edit yet)
Identify 5–20 high-impact patches. Write the plan in your response (briefly).

### Step 2 — Establish baseline
\`\`\`sh
./backend/node_modules/.bin/ts-node --transpile-only --project scripts/pulse/tsconfig.json -e "const m=require('./scripts/pulse/no-hardcoded-reality-audit'); const r=m.auditPulseNoHardcodedReality(process.cwd()); let c=0; for(const f of r.findings) if (f.filePath==='${filePath}') c++; console.log('BEFORE:', c);"
\`\`\`

### Step 3 — Apply patches
- Apply 5–15 patches in one edit pass.
- Add necessary kernel imports at top (deduplicated, alphabetized).
- Preserve every public export (verify with \`grep "^export" ${filePath}\` before/after — count must match).

### Step 4 — Smoke import
\`\`\`sh
./backend/node_modules/.bin/ts-node --transpile-only --project scripts/pulse/tsconfig.json -e "const m=require('./${filePath.replace(/\.ts$/, '')}'); console.log('IMPORT_OK; exports:', Object.keys(m).length);"
\`\`\`
Must print \`IMPORT_OK\`. If error: identify the patches that broke it, surgically revert THOSE specific patches by editing them out (NO git restore). Re-smoke. Up to 2 fix attempts. If still broken, surgically revert ALL patches (restore the file to HEAD content by editing). Then output JSON with \`smokeImport: "failed"\` and \`patchesApplied: 0\`.

### Step 5 — File-level auditor delta
\`\`\`sh
./backend/node_modules/.bin/ts-node --transpile-only --project scripts/pulse/tsconfig.json -e "const m=require('./scripts/pulse/no-hardcoded-reality-audit'); const r=m.auditPulseNoHardcodedReality(process.cwd()); let c=0; for(const f of r.findings) if (f.filePath==='${filePath}') c++; console.log('AFTER:', c);"
\`\`\`
If \`AFTER\` > \`BEFORE\`: surgically revert the patches that increased count (by editing them back). Up to 2 attempts. If still up, revert all to HEAD content via edits. Output \`patchesApplied: 0\`.

## CRITICAL: DO NOT COMMIT

You only EDIT and validate. Do NOT \`git add\`, \`git commit\`, \`git stash\`, \`git restore\`, \`git checkout\`, \`git reset\`, \`git push\`, \`--no-verify\`. The CEO orchestrator commits sequentially.

## Output (last block of your response, JSON only)

\`\`\`json
{
  "file": "${filePath}",
  "auditorBefore": <number>,
  "auditorAfter": <number>,
  "patchesApplied": <number>,
  "patchesSkippedFakeDynamic": <number>,
  "smokeImport": "ok|failed",
  "smokeImportError": "<short>",
  "exportCountBefore": <number>,
  "exportCountAfter": <number>,
  "kernelExtensionsRequested": [{"name": "<fn>", "signature": "<sig>", "rationale": "<source-of-truth>"}],
  "blockers": [{"kind": "<text>", "reason": "<text>"}]
}
\`\`\`

## Hard constraints (REPEAT)

- Edit ONLY \`${filePath}\`.
- NEVER edit \`scripts/pulse/no-hardcoded-reality-audit.ts\`.
- NEVER edit \`scripts/pulse/dynamic-reality-kernel.ts\` (separate Wave K2 owns kernel).
- DO NOT \`: any\`, \`@ts-ignore\`, \`eslint-disable\`, \`biome-ignore\`, \`NOSONAR\`.
- DO NOT \`git restore\`, \`git checkout --\`, \`git reset --hard\`, \`git stash\`, \`git add\`, \`git commit\`, \`git push\`, \`--no-verify\`.
- Watch for active PULSE daemon: \`pgrep -af 'ts-node.*scripts/pulse/index\\.ts.*(--watch|--continuous|--daemon)' | grep -v opencode\`. Abort if found.
- Time budget: 20 minutes hard.

## Why this matters

The mission is auditor=ZERO with REAL dynamic code. Daniel cannot validate your work technically — your output reaches production. A failing smoke or rising count is on you to fix in-process. If you can't make the file better, leave it at HEAD-equivalent and report \`patchesApplied: 0\`. That's far better than committing broken code.
`;
}

const audit = runAuditor();
const entries = Object.entries(audit.byFile)
  .filter(([f]) => !LOCKED_FILES.has(f))
  .sort((a, b) => b[1] - a[1])
  .slice(0, TOP_N);

const tasks = entries.map(([file, count]) => ({
  id: 'edit-' + file.replace(/^scripts\/pulse\//, '').replace(/[\/.]/g, '-').replace(/-ts$/, ''),
  title: `EDIT-ONLY liquefy ${file}`,
  prompt: buildPrompt(file, count, audit.byKindByFile[file] || {}),
}));

const manifest = {
  runId: `pulse-liquefy-E-${new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')}`,
  concurrency: Math.min(CONCURRENCY, tasks.length),
  timeoutSec: 0,
  dir: REPO_ROOT,
  skipPermissions: true,
  tasks,
};

writeFileSync(join(REPO_ROOT, 'artifacts/pulse-liquefaction/wave-E-manifest.json'), JSON.stringify(manifest, null, 2));
process.stdout.write(JSON.stringify({
  runId: manifest.runId,
  concurrency: manifest.concurrency,
  tasks: tasks.length,
  auditorTotal: audit.total,
  scanned: audit.scanned,
  topFiles: entries.slice(0, 10).map(([f, c]) => ({ file: f, debt: c })),
}, null, 2));
