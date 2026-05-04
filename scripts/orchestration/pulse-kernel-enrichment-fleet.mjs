#!/usr/bin/env node
/**
 * Wave K3 builder — 25 subagents in parallel, each writing ONE kernel
 * primitive to a unique stage file under `scripts/pulse/__kernel_additions__/`.
 *
 * Stage-file pattern eliminates edit conflicts (each subagent owns its own
 * file, kernel main is untouched until merger phase).
 *
 * After all 24 implementers finish, the 25th subagent (or CEO) folds the
 * additions into the main kernel via re-export.
 *
 * Aggregates kernel extension requests from prior waves, deduplicates, and
 * fills out to 24 specific primitives based on observed type contracts.
 *
 * Usage:
 *   node scripts/orchestration/pulse-kernel-enrichment-fleet.mjs > artifacts/pulse-liquefaction/wave-K3-manifest.json
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

function extractLastJson(text) {
  const fences = [...text.matchAll(/```json\s*([\s\S]*?)```/g)].map((m) => m[1].trim());
  for (let i = fences.length - 1; i >= 0; i--) {
    try { return JSON.parse(fences[i]); } catch {}
    try { return JSON.parse(fences[i].replace(/\\(?!["\\/bfnrtu])/g, '\\\\')); } catch {}
  }
  return null;
}

// Collect kernel extension requests from all prior wave .out files
function collectRequests() {
  const fleetDir = join(REPO_ROOT, 'artifacts/opencode-fleet');
  const requests = [];
  if (!existsSync(fleetDir)) return requests;
  for (const runDir of readdirSync(fleetDir)) {
    const dirPath = join(fleetDir, runDir);
    if (!statSync(dirPath).isDirectory()) continue;
    if (!/^pulse-liquefy-/.test(runDir)) continue;
    for (const f of readdirSync(dirPath)) {
      if (!f.endsWith('.out')) continue;
      try {
        const text = readFileSync(join(dirPath, f), 'utf8');
        const j = extractLastJson(text);
        if (!j) continue;
        if (Array.isArray(j.kernelExtensionsRequested)) {
          for (const r of j.kernelExtensionsRequested) requests.push({ ...r, sourceFile: j.file, sourceWave: runDir });
        }
      } catch {}
    }
  }
  return requests;
}

// Discover type contract files (types.*.ts) and their union types
function listTypeContracts() {
  const pulseDir = join(REPO_ROOT, 'scripts/pulse');
  const contracts = [];
  function scan(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '__tests__' || entry === '__companions__' || entry === '__parts__' || entry === '__diagnostics__' || entry === '__fixtures__' || entry === '__kernel_additions__') continue;
      const p = join(dir, entry);
      const s = statSync(p);
      if (s.isFile() && /^types\.[a-z0-9_-]+\.ts$/.test(entry)) {
        contracts.push(p.replace(REPO_ROOT + '/', ''));
      } else if (s.isDirectory()) {
        scan(p);
      }
    }
  }
  scan(pulseDir);
  return contracts;
}

// Extract union type names from a contract file (lightweight regex)
function extractUnionTypeNames(filePath) {
  const text = readFileSync(join(REPO_ROOT, filePath), 'utf8');
  const matches = [...text.matchAll(/^export\s+type\s+(Pulse[A-Z]\w*)\s*=\s*(?:[^;]+\s*\|\s*['"][^'"]+['"][\s\S]*?);/gm)];
  return matches.map((m) => m[1]);
}

const requests = collectRequests();
const contracts = listTypeContracts();

// Build candidate primitives from type contracts
const candidates = [];
for (const contract of contracts) {
  const unions = extractUnionTypeNames(contract);
  for (const typeName of unions) {
    candidates.push({
      functionName: `discover${typeName.replace(/^Pulse/, '')}Labels`,
      typeName,
      contractFile: contract,
      source: 'discovered',
    });
  }
}

// Add explicitly-requested primitives that aren't auto-discovered
const requestNames = new Set(candidates.map((c) => c.functionName));
for (const r of requests) {
  if (!r.name) continue;
  if (requestNames.has(r.name)) continue;
  candidates.push({
    functionName: r.name,
    signature: r.signature,
    rationale: r.rationale,
    source: 'requested',
    sourceFile: r.sourceFile,
  });
  requestNames.add(r.name);
}

// Dedupe + take top 24 (1 task reserved for merger)
const seen = new Set();
const unique = [];
for (const c of candidates) {
  if (seen.has(c.functionName)) continue;
  seen.add(c.functionName);
  unique.push(c);
  if (unique.length >= 24) break;
}

function buildPrimitivePrompt(primitive) {
  const isAstUnion = primitive.source === 'discovered' && primitive.contractFile && primitive.typeName;
  return `# Wave K3 Stage File — Implement \`${primitive.functionName}\`

## Mission (self-contained)

PULSE goal: \`scripts/pulse/**\` 100% dynamic, ZERO auditor debt. The auditor \`scripts/pulse/no-hardcoded-reality-audit.ts\` is governance-LOCKED — never touch.

You write ONE stage file. The CEO will fold all 24 stage files into the main kernel later via re-export.

## Your stage file

\`\`\`
scripts/pulse/__kernel_additions__/${primitive.functionName}.ts
\`\`\`

Create the directory if it doesn't exist. Create ONLY this file. Do NOT touch \`dynamic-reality-kernel.ts\` or any other file.

## What to implement

${isAstUnion ? `\`\`\`ts
import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel';

/**
 * Returns the string-literal union members of \`${primitive.typeName}\` declared in
 * \`${primitive.contractFile}\`, derived dynamically via TypeScript AST. No hardcoded list.
 */
export function ${primitive.functionName}(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    '${primitive.contractFile}',
    '${primitive.typeName}',
  );
}
\`\`\`

That's the canonical pattern. Verify by reading \`${primitive.contractFile}\` first to confirm the type \`${primitive.typeName}\` exists and is a string-literal union.` : `Function: \`${primitive.functionName}\`
Requested signature: ${primitive.signature || '(none provided)'}
Rationale: ${primitive.rationale || '(no rationale supplied)'}
Source file that requested it: ${primitive.sourceFile || '(unknown)'}

You must:
1. Identify the SOURCE OF TRUTH (TS type contract, runtime evidence file, manifest, observed catalog).
2. If source is a TS union type: use \`deriveStringUnionMembersFromTypeContract(file, typeName)\` from kernel.
3. If source is a runtime evidence JSON: read \`.pulse/current/<file>.json\` and extract.
4. If source is a manifest: read \`pulse.manifest.json\`.
5. If no clean source of truth exists: DO NOT fake it with a literal. Output \`{ "skipped": true, "reason": "no source of truth" }\` instead of writing the stage file.

NEVER stub with \`return new Set(['hardcoded'])\` — that's \`replacement_cheat_risk\` and will be flagged.`}

## Validation

After writing the stage file, smoke-import it:

\`\`\`sh
./backend/node_modules/.bin/ts-node --transpile-only --project scripts/pulse/tsconfig.json -e "const m=require('./scripts/pulse/__kernel_additions__/${primitive.functionName}'); const r = m.${primitive.functionName}(); console.log('IMPORT_OK; result:', r instanceof Set ? [...r] : r);"
\`\`\`

Must print \`IMPORT_OK\` and a non-empty result. If empty result OR error → diagnose:
- Type doesn't exist? Verify with \`grep "type ${primitive.typeName || 'XXX'}" scripts/pulse/types.*.ts\`
- AST parse fails? Maybe the type is computed/conditional, not a simple union — you cannot honestly derive it. Output \`{"skipped": true, "reason": "..."}\`

## Hard constraints

- Edit ONLY \`scripts/pulse/__kernel_additions__/${primitive.functionName}.ts\`. Create the directory if needed.
- DO NOT edit \`scripts/pulse/dynamic-reality-kernel.ts\` (CEO merges later).
- DO NOT edit \`scripts/pulse/no-hardcoded-reality-audit.ts\`.
- DO NOT \`git add\`, \`git commit\`, \`git stash\`, \`git restore\`, \`--no-verify\`. CEO commits.
- Do NOT \`: any\`, \`@ts-ignore\`, \`eslint-disable\`, \`biome-ignore\`, \`NOSONAR\`.

## Output (last block of your response, JSON only)

\`\`\`json
{
  "stageFile": "scripts/pulse/__kernel_additions__/${primitive.functionName}.ts",
  "functionName": "${primitive.functionName}",
  "implementationKind": "ast_union|runtime_evidence|manifest|skipped",
  "sourceFile": "<path>",
  "smokeImport": "ok|failed",
  "smokeResult": ["..."],
  "skipped": <bool>,
  "skipReason": "<text|null>"
}
\`\`\`
`;
}

const tasks = unique.slice(0, 24).map((p) => ({
  id: 'k3-' + p.functionName,
  title: `K3 stage: ${p.functionName}`,
  prompt: buildPrimitivePrompt(p),
}));

// Add the merger task
tasks.push({
  id: 'k3-merger',
  title: 'K3 merger: fold __kernel_additions__/*.ts into main kernel',
  prompt: `# Wave K3 Merger — Fold stage files into main kernel

## Mission (self-contained)

24 sibling subagents wrote ONE stage file each at \`scripts/pulse/__kernel_additions__/<functionName>.ts\`. Each exports one new \`discover*\`/\`derive*\` primitive. Your job is the merger: re-export all of them from \`scripts/pulse/dynamic-reality-kernel.ts\` and validate.

## Wait pattern

The 24 stage subagents are running in parallel with you. After your initial check, if fewer than 20 stage files exist in \`scripts/pulse/__kernel_additions__/\`, sleep 10 minutes (\`sleep 600\`) and re-check. Repeat up to 3 times. Then proceed with whatever exists.

## Steps

1. List all valid stage files:
\`\`\`sh
ls scripts/pulse/__kernel_additions__/*.ts 2>/dev/null
\`\`\`

2. For each, verify it imports cleanly:
\`\`\`sh
for f in scripts/pulse/__kernel_additions__/*.ts; do
  stem="\${f%.ts}"
  ./backend/node_modules/.bin/ts-node --transpile-only --project scripts/pulse/tsconfig.json -e "const m=require('./$stem'); console.log('OK:', Object.keys(m));" 2>&1 | head -2
done
\`\`\`
Skip any that fail import.

3. Open \`scripts/pulse/dynamic-reality-kernel.ts\` and ADD re-export lines at the END of the file (after all existing exports):

\`\`\`ts
// Wave K3 — kernel enrichment via stage files
export { discoverXxxLabels } from './__kernel_additions__/discoverXxxLabels';
export { discoverYyyLabels } from './__kernel_additions__/discoverYyyLabels';
// ... one line per valid stage file
\`\`\`

Use the exact filename basename (without \`.ts\`) and import the named export.

4. Validate the kernel itself:
\`\`\`sh
./backend/node_modules/.bin/ts-node --transpile-only --project scripts/pulse/tsconfig.json -e "const m=require('./scripts/pulse/dynamic-reality-kernel'); const newFns = Object.keys(m).filter(k => k.startsWith('discover') || k.startsWith('derive')); console.log('TOTAL_PRIMITIVES:', newFns.length);"
\`\`\`

Should print a number larger than ~65 (current kernel count + new primitives).

5. Run auditor for the kernel file specifically:
\`\`\`sh
./backend/node_modules/.bin/ts-node --transpile-only --project scripts/pulse/tsconfig.json -e "const m=require('./scripts/pulse/no-hardcoded-reality-audit'); const r=m.auditPulseNoHardcodedReality(process.cwd()); let c=0; for(const f of r.findings) if (f.filePath==='scripts/pulse/dynamic-reality-kernel.ts') c++; console.log('kernel debt:', c);"
\`\`\`

The kernel-file debt may rise slightly (more code = more surface) but the GLOBAL debt should drop in the next Wave E because the new primitives unlock liquefaction in many files.

## DO NOT COMMIT

CEO commits the kernel + stage files together after validating your output.

## Output (final JSON)

\`\`\`json
{
  "stageFilesFound": <n>,
  "stageFilesValid": <n>,
  "primitivesAdded": ["..."],
  "primitivesSkipped": [{"name": "...", "reason": "..."}],
  "kernelImportOk": "ok|failed",
  "kernelDebtBefore": <number>,
  "kernelDebtAfter": <number>,
  "globalAuditorAfter": <number>
}
\`\`\`

## Hard constraints

- Edit ONLY \`scripts/pulse/dynamic-reality-kernel.ts\` (re-export lines).
- DO NOT modify any stage file.
- DO NOT edit auditor or any other file.
- DO NOT commit. CEO commits.
`,
});

const manifest = {
  runId: `pulse-liquefy-K3-${new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')}`,
  concurrency: 25,
  timeoutSec: 0,
  dir: REPO_ROOT,
  skipPermissions: true,
  tasks,
};

writeFileSync(join(REPO_ROOT, 'artifacts/pulse-liquefaction/wave-K3-manifest.json'), JSON.stringify(manifest, null, 2));
process.stdout.write(JSON.stringify({
  runId: manifest.runId,
  tasks: tasks.length,
  concurrency: manifest.concurrency,
  primitives: unique.slice(0, 24).map((p) => ({ name: p.functionName, source: p.source, type: p.typeName, contract: p.contractFile })),
  totalRequestsCollected: requests.length,
  totalContractsScanned: contracts.length,
}, null, 2));
