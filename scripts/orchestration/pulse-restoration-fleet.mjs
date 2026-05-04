#!/usr/bin/env node
/**
 * Phase A: Restoration fleet builder.
 *
 * Detects truncated files (main module missing exports that callers expect, with content in
 * `__companions__/<basename>.companion.ts`) and produces one EDIT-ONLY task per truncated file.
 *
 * Subagents do NOT commit. They:
 *   1. Read main + companion
 *   2. Fold companion's executable surface back into main, preserving every public export
 *   3. Run smoke import on main
 *   4. Output JSON {file, exportsRecovered[], smokeImport, blockers[]}
 *
 * The orchestrator (CEO) reads each JSON, validates, and commits sequentially.
 *
 * Usage:
 *   node scripts/orchestration/pulse-restoration-fleet.mjs > artifacts/pulse-liquefaction/wave-A-manifest.json
 */
import { readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const COMPANIONS_DIR = join(REPO_ROOT, 'scripts/pulse/__companions__');
const PULSE_DIR = join(REPO_ROOT, 'scripts/pulse');

function listCompanions() {
  if (!existsSync(COMPANIONS_DIR)) return [];
  return readdirSync(COMPANIONS_DIR)
    .filter((f) => f.endsWith('.companion.ts'))
    .map((f) => {
      const base = f.replace(/\.companion\.ts$/, '');
      return { companion: `scripts/pulse/__companions__/${f}`, base };
    });
}

function findMainForBase(base) {
  // Search recursively for scripts/pulse/<base>.ts (could be in subdirs)
  function scan(dir) {
    if (!existsSync(dir)) return null;
    for (const entry of readdirSync(dir)) {
      if (entry === '__companions__' || entry === '__parts__' || entry === '__tests__' || entry === '__diagnostics__' || entry === '__fixtures__' || entry === 'node_modules') continue;
      const p = join(dir, entry);
      const s = statSync(p);
      if (s.isFile() && entry === `${base}.ts`) {
        return p.replace(REPO_ROOT + '/', '');
      } else if (s.isDirectory()) {
        const found = scan(p);
        if (found) return found;
      }
    }
    return null;
  }
  return scan(PULSE_DIR);
}

function smokeImportFails(filePath) {
  const tsNode = resolve(REPO_ROOT, 'backend/node_modules/.bin/ts-node');
  const tsconfig = resolve(REPO_ROOT, 'scripts/pulse/tsconfig.json');
  const stem = filePath.replace(/\.ts$/, '');
  const result = spawnSync(tsNode, ['--transpile-only', '--project', tsconfig, '-e', `require('./${stem}'); console.log('OK');`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30000,
  });
  return { failed: result.status !== 0, stderr: (result.stderr || '').slice(0, 500) };
}

function buildPrompt(mainFile, companionFile) {
  return `# Phase A — RESTORATION ONLY for \`${mainFile}\`

## Mission (self-contained — token economy: be efficient)

PULSE governance: \`scripts/pulse/**\` must be 100% dynamic with ZERO auditor debt. The auditor \`scripts/pulse/no-hardcoded-reality-audit.ts\` is **GOVERNANCE-LOCKED — never touch**.

Your file \`${mainFile}\` is **TRUNCATED** — main module lost public exports that callers use. Real implementation lives in \`${companionFile}\`. **Your job is RESTORATION only**, NOT liquefaction. Liquefaction comes in a later phase.

## Restoration recipe

1. Read \`${mainFile}\` and \`${companionFile}\` in full.
2. Identify every public export the companion holds that the main file should re-export. Compare callers (\`grep -r "from ['\\"]./${basename(mainFile, '.ts')}\\b" scripts/pulse/\`) to confirm which names must resolve from \`${mainFile}\`.
3. Fold the companion's executable surface back into \`${mainFile}\` — copy implementations, types, helpers required for those exports. Preserve every existing main-file export too. Aim for a single \`${mainFile}\` that is self-contained except for legitimate kernel/types/utility imports.
4. The companion may contain hardcoded literals/regex/booleans. **DO NOT liquefy them in this task** — liquefaction is Phase C. Just preserve them as-is during the fold-back.
5. Leave the companion file in place (don't delete) — Phase C may still reference it. Optionally add a \`/* RESTORED: contents folded back into ${mainFile} on $(date -I) */\` comment at the top of the companion.

## Validation (run all, capture results)

\`\`\`sh
# 1. Smoke import — every recovered export must resolve
./backend/node_modules/.bin/ts-node --transpile-only --project scripts/pulse/tsconfig.json -e "const m=require('./${mainFile.replace(/\.ts$/, '')}'); console.log('EXPORTS:', Object.keys(m).join(','));"

# 2. If a spec exists, run it
if ls scripts/pulse/__tests__/${basename(mainFile, '.ts')}.spec.ts 2>/dev/null; then
  npx vitest run scripts/pulse/__tests__/${basename(mainFile, '.ts')}.spec.ts 2>&1 | tail -10
fi

# 3. File-level auditor count
./backend/node_modules/.bin/ts-node --transpile-only --project scripts/pulse/tsconfig.json -e "const m=require('./scripts/pulse/no-hardcoded-reality-audit'); const r=m.auditPulseNoHardcodedReality(process.cwd()); let c=0; for(const f of r.findings) if (f.filePath==='${mainFile}') c++; console.log('FILE_DEBT:', c);"
\`\`\`

The auditor count for this file MAY GO UP after restoration (real code = real surface). That is acceptable and expected — **do not panic or revert**. Phase C will reduce it.

## CRITICAL: DO NOT COMMIT

You only EDIT and validate. The orchestrator commits sequentially across all Phase A subagents to avoid commit races. Just leave \`${mainFile}\` in working-tree-modified state.

## Output (last block of your response, JSON only)

\`\`\`json
{
  "mainFile": "${mainFile}",
  "companionFile": "${companionFile}",
  "exportsRecovered": ["..."],
  "exportsRequiredByCallers": ["..."],
  "exportsStillMissing": ["..."],
  "smokeImport": "ok|failed",
  "smokeImportError": "<stderr if failed>",
  "specPass": "passed|none|failed|<count>",
  "auditorBefore": <number|null>,
  "auditorAfter": <number>,
  "linesAdded": <approx>,
  "blockers": [{"kind": "<text>", "reason": "<text>"}]
}
\`\`\`

## Hard constraints

- Edit ONLY \`${mainFile}\` (and \`${companionFile}\` ONLY to add the optional comment header).
- DO NOT touch any other PULSE file.
- DO NOT touch \`scripts/pulse/no-hardcoded-reality-audit.ts\`.
- DO NOT use \`: any\`, \`@ts-ignore\`, \`eslint-disable\`, \`biome-ignore\`, \`NOSONAR\`.
- DO NOT use \`git restore\`, \`git checkout --\`, \`git reset --hard\`, \`git stash\` (you have a stashed checkpoint already), \`--no-verify\`.
- DO NOT \`git add\` or \`git commit\`.
- Watch for active PULSE daemon: \`pgrep -af 'ts-node.*scripts/pulse/index\\.ts.*(--watch|--continuous|--daemon)' | grep -v opencode\`. Abort if found.
- Time budget: 20 minutes hard.
`;
}

const candidates = [];
for (const { companion, base } of listCompanions()) {
  const main = findMainForBase(base);
  if (!main) continue;
  const smoke = smokeImportFails(main);
  if (smoke.failed) {
    candidates.push({ main, companion, base, smokeError: smoke.stderr });
  }
}

const tasks = candidates.map((c) => ({
  id: 'restore-' + c.base.replace(/[\/.]/g, '-'),
  title: `Restore ${c.main}`,
  prompt: buildPrompt(c.main, c.companion),
}));

const manifest = {
  runId: `pulse-liquefy-A-${new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')}`,
  concurrency: Math.min(12, tasks.length),
  timeoutSec: 0,
  dir: REPO_ROOT,
  skipPermissions: true,
  tasks,
};

writeFileSync(join(REPO_ROOT, 'artifacts/pulse-liquefaction/wave-A-manifest.json'), JSON.stringify(manifest, null, 2));
process.stdout.write(JSON.stringify({
  runId: manifest.runId,
  concurrency: manifest.concurrency,
  truncatedFilesFound: tasks.length,
  files: candidates.map((c) => ({ main: c.main, companion: c.companion, smokeError: c.smokeError.split('\n')[0].slice(0, 150) })),
}, null, 2));
