#!/usr/bin/env node
/**
 * Combined recon+apply worker manifest builder.
 *
 * Each subagent owns ONE file. It does the full cycle in-process:
 *   1. Read file + kernel + audit allowed-tokens
 *   2. Identify hardcode findings
 *   3. Replace literals/regex/booleans/numerics with kernel discover/derive calls
 *   4. Validate via per-file auditor count (must go DOWN, never UP)
 *   5. Run import smoke
 *   6. Commit if successful
 *   7. Iterate up to 3 times if first pass had room for more reduction
 *   8. Report final JSON
 *
 * Subagent NEVER touches: auditor, governance-locked files, anything outside
 * scripts/pulse/. NEVER uses git restore/checkout--/reset --hard/--no-verify.
 *
 * Usage:
 *   node scripts/orchestration/pulse-liquefy-combined-worker.mjs [--top-n=80]
 */
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
const TOP_N = Number((args.find(a => a.startsWith('--top-n=')) || '--top-n=80').slice('--top-n='.length));
const CONCURRENCY = Number((args.find(a => a.startsWith('--concurrency=')) || '--concurrency=10').slice('--concurrency='.length));

const LOCKED_FILES = new Set([
  'scripts/pulse/no-hardcoded-reality-audit.ts',
]);

function isExcluded(filePath) {
  if (LOCKED_FILES.has(filePath)) return true;
  return false;
}

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
    process.stdout.write(JSON.stringify({total: r.findings.length, scanned: r.scannedFiles, byFile, byKindByFile}));
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
  return `# Combined Recon+Apply Worker — \`${filePath}\`

## Mission (self-contained — you have no memory of prior sessions)

PULSE is a verification machine inside this repo. Goal: **PULSE itself must be 100% dynamic with ZERO hardcode.** The auditor \`scripts/pulse/no-hardcoded-reality-audit.ts\` is **GOVERNANCE-LOCKED — never touch it under any circumstance**. The auditor reports **${currentDebt} findings** in your assigned file.

Your assigned file: \`${filePath}\`

## Finding mix in your file

\`\`\`json
${JSON.stringify(byKind, null, 2)}
\`\`\`

## Token economy mandate (Daniel is non-technical, no human reviewer)

You are the SOLE worker for this file. Daniel cannot validate your work. Your output reaches production. Therefore:
- Apply patches ONLY when truly dynamic (kernel-derived, AST-derived, runtime-evidence-derived).
- Skip "fake-dynamic" patches (lookup table wrapping literal, string-construction of identifier, function returning a literal).
- Never lower the auditor count by deleting code that has runtime behavior.
- Never break imports. Always validate with smoke.

## Liquefaction toolkit

Read in order:
1. \`scripts/pulse/dynamic-reality-kernel.ts\` — full primitive list (~50-65 \`discover*\`/\`derive*\` functions, including AST-derivation meta \`deriveStringUnionMembersFromTypeContract(filePath, typeName)\` and many union-label wrappers like \`discoverConvergenceUnitKindLabels()\`, \`discoverHarnessExecutionStatusLabels()\`, etc).
2. \`scripts/pulse/no-hardcoded-reality-audit.ts\` lines **79–220** — allowed-context kernel-grammar tokens (your patches must be in functions whose context contains these tokens, e.g. \`evidence\`, \`kernel\`, \`ast\`, \`schema\`, \`structural\`, \`grammar\`, \`token\`, \`gate\`, \`type\`).
3. \`docs/ai/PULSE_NO_HARDCODED_REALITY_DEBT_GUIDE.md\` — patterns that worked / failed before.
4. \`${filePath}\` in full.
5. If your file is truncated/companion-split, also read its companion at \`scripts/pulse/__companions__/<basename>.companion.ts\` — restoring main from companion FIRST (preserve all exports) is acceptable in this task.

## Workflow (do all steps; stop only on uncatchable error)

### Step A — Establish baseline
\`\`\`sh
./backend/node_modules/.bin/ts-node --transpile-only --project scripts/pulse/tsconfig.json -e "const m=require('./scripts/pulse/no-hardcoded-reality-audit'); const r=m.auditPulseNoHardcodedReality(process.cwd()); let c=0,k={}; for(const f of r.findings) if (f.filePath==='${filePath}') { c++; k[f.kind]=(k[f.kind]||0)+1; } console.log(JSON.stringify({file:'${filePath}', count:c, byKind:k}, null, 2));"
\`\`\`

Save the count as BEFORE.

### Step B — Identify and apply patches (iterate up to 3 cycles)

For each cycle:
1. Identify ~5-15 strong patch opportunities. Prefer:
   - **literals/regex** that match a kernel \`discover*/derive*\` function output → replace with kernel call
   - **\`isSameState(x, 'literal')\`** where \`'literal'\` is a member of a TS type-union → use \`discoverXxxLabels().has(x)\`
   - **numeric thresholds** with derivable origin → use \`deriveUnitValue()\`/\`deriveZeroValue()\`/AST contract
   - **filename literals** like \`'PULSE_CERTIFICATE.json'\` → \`discoverAllObservedArtifactFilenames().certificate\`
2. For each patch, edit the file (preserve exports!).
3. Add kernel imports at top (deduped).
4. After 5-15 patches, smoke-import:
   \`\`\`sh
   ./backend/node_modules/.bin/ts-node --transpile-only --project scripts/pulse/tsconfig.json -e "require('./${filePath.replace(/\.ts$/, '')}'); console.log('IMPORT_OK');"
   \`\`\`
   Must print \`IMPORT_OK\`. If error, REVERT just the bad patches by editing them out (NOT \`git restore\`); re-smoke. If you cannot recover after 2 attempts, STOP that cycle.
5. Re-run auditor for THIS file:
   \`\`\`sh
   (same auditor command as Step A)
   \`\`\`
6. If count went DOWN: continue (Step C if cycle limit hit, else next cycle from Step B).
7. If count went UP: surgical-revert the just-applied patches (edit file, undo those exact edits — do NOT use git). Re-smoke. Mark cycle as net-zero.
8. If count unchanged after 3 patches in a cycle: stop iterating.

### Step C — Commit (only if final count is strictly LESS than BEFORE)
\`\`\`sh
git add ${filePath}
git commit -m "refactor(pulse-liquefy): replace hardcoded with kernel discovery in $(basename ${filePath})"
\`\`\`
Do NOT use \`--no-verify\`. If husky/lint-staged complains about UNRELATED files (Onda 0 work, etc.), STAGE ONLY \`${filePath}\` (do \`git add ${filePath}\` not \`git add -A\`). If hooks still fail on unrelated files, that's blocker — report and don't force commit.

### Step D — Final report
Append a single fenced JSON block at end of your response:

\`\`\`json
{
  "file": "${filePath}",
  "auditorBefore": <number>,
  "auditorAfter": <number>,
  "patchesApplied": <number>,
  "patchesSkippedFakeDynamic": <number>,
  "cyclesRun": <number>,
  "importSmoke": "ok|failed",
  "commit": "<sha|null>",
  "blockers": [{"kind": "<text>", "reason": "<text>"}],
  "kernelExtensionsRequested": ["<new function name + signature>"]
}
\`\`\`

## Hard constraints

- Edit ONLY \`${filePath}\` (and its kernel import line at top). No other PULSE file.
- NEVER edit \`scripts/pulse/no-hardcoded-reality-audit.ts\`.
- NEVER edit \`scripts/pulse/dynamic-reality-kernel.ts\` (a separate Wave K subagent owns kernel changes — request extensions in your output instead).
- Do NOT use \`: any\`, \`@ts-ignore\`, \`eslint-disable\`, \`biome-ignore\`, \`NOSONAR\`, \`codacy:disable\`.
- NEVER \`git restore\`, \`git checkout --\`, \`git reset --hard\`, \`git stash\`, \`--no-verify\`.
- Stage ONLY your file when committing (\`git add ${filePath}\`, not \`-A\`).
- Watch for active PULSE daemon: \`pgrep -af 'ts-node.*scripts/pulse/index\\.ts.*(--watch|--continuous|--daemon)' | grep -v opencode\`. Abort if found (the daemon overwrites files).
- If the kernel lacks a primitive you need to liquefy a finding, list it under \`kernelExtensionsRequested\` (with desired name + signature + intended source-of-truth like "AST union members of \`type X\` in \`types.X.ts\`"). Do NOT invent fake-dynamic to avoid the request.
- Time budget: complete all 3 cycles or report partial in <30 minutes. Hard stop if you exceed.
`;
}

const audit = runAuditor();
const entries = Object.entries(audit.byFile)
  .filter(([f]) => !isExcluded(f))
  .sort((a, b) => b[1] - a[1])
  .slice(0, TOP_N);

const tasks = entries.map(([file, count]) => {
  const id = 'liquefy-' + file.replace(/^scripts\/pulse\//, '').replace(/[\/.]/g, '-').replace(/-ts$/, '');
  return {
    id,
    title: `Liquefy ${file}`,
    prompt: buildPrompt(file, count, audit.byKindByFile[file] || {}),
  };
});

const manifest = {
  runId: `pulse-liquefy-W-${new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')}`,
  concurrency: Math.min(CONCURRENCY, tasks.length),
  timeoutSec: 0,
  dir: REPO_ROOT,
  skipPermissions: true,
  tasks,
};

const outPath = resolve(REPO_ROOT, 'artifacts/pulse-liquefaction/wave-W-manifest.json');
writeFileSync(outPath, JSON.stringify(manifest, null, 2));

process.stdout.write(JSON.stringify({
  runId: manifest.runId,
  concurrency: manifest.concurrency,
  tasks: tasks.length,
  auditorTotal: audit.total,
  scanned: audit.scanned,
  manifestPath: outPath,
}, null, 2));
