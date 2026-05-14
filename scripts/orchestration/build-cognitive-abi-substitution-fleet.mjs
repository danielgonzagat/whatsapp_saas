#!/usr/bin/env node
/**
 * Build manifest for ABI substitution UTPs:
 *   - UTP-ABI-005: substitute role:'system' instructional with ABI in
 *     guest-chat.service.ts (isolated flow, low risk)
 *
 * This is the first prompt cutover (PCI.2 §8). Subsequent UTPs ABI-006..009
 * substitute progressively more critical paths.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');
const runId = `cognitive-abi-sub-${new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')}`;
const outPath = join(REPO, 'scripts/orchestration/manifests/cognitive-organism', 'abi-substitution-onda-2.json');
mkdirSync(dirname(outPath), { recursive: true });

const PRELUDE = `# COGNITIVE ORGANISM — Onda 2 ABI substitution subagent

You are an OpenCode V4 Pro subagent for the Kloel Cognitive Organism mission.

## MANDATORY PRE-READ

1. \`docs/plans/KLOEL_COGNITIVE_ORGANISM_PLAN.md\`
2. \`docs/contracts/pci/MANIFEST.md\`
3. \`docs/contracts/pci/02-abi-schema.md\` (the schema you must use)
4. \`docs/contracts/pci/04-pulse-gates.md\` (gates that block prompt-leakage)
5. \`scripts/decomp/cognitive-organism-subagent-delegation-rules.md\`
6. \`backend/src/kloel/abi/abi-schema.ts\` (TS shape)
7. \`backend/src/kloel/abi/abi-builder.service.ts\` (existing builder)
8. \`backend/src/kloel/abi/abi-validator.ts\` (validator + prompt-leakage scan)
9. \`backend/src/kloel/lineage/identity-projector.service.ts\`
10. \`CLAUDE.md\`

If any file is missing or its checksum mismatches, STOP and report.

## ABSOLUTE PROHIBITIONS

- NO touch on frontend, *.tsx, *.vue, e2e, frontend-admin.
- NO change to existing HTTP controller/route/DTO signature (additive only).
- NO touch on protected files (CLAUDE.md, AGENTS.md, ops, husky, eslint,
  ai-models.ts, scripts/pulse/no-hardcoded-reality-audit.ts,
  docs/contracts/pci, docs/plans/KLOEL_COGNITIVE_ORGANISM_PLAN.md,
  scripts/decomp/cognitive-organism-subagent-delegation-rules.md).
- NO suppression comments / skip tags / @ts-ignore / NOSONAR.
- NO \`git restore\`.
- NO new event names outside PCI.1.
- NO behavioral instruction strings ("você é", "act as", etc.) in any
  outgoing payload.

## REQUIRED VALIDATION

\`\`\`sh
node scripts/pci/validate.mjs --strict
cd backend && npx tsc --noEmit
cd backend && npx jest --testPathPatterns='<your contract spec>' --no-coverage
\`\`\`

Exit 0 required.

## DELIVERABLE FORMAT

\`\`\`
EXIT <utp-id>
files_added:
  - <path>
files_modified:
  - <path>
gates_status:
  prompt-leakage: PASS|FAIL
  no-roleplay: PASS|FAIL
  identity-projection: PASS|FAIL
validation:
  pci_validate: PASS|FAIL
  tsc: PASS|FAIL
  contract_spec: PASS|FAIL  (count: <N>)
adjacency_conflicts: <none|list>
follow_ups: <none|list>
\`\`\`
`;

const tasks = [
  {
    id: 'UTP-ABI-005',
    title: 'Substitute system prompt with ABI in guest-chat.service.ts',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-ABI-005

Implements PCI.2 §8 — substitute the existing \`role: 'system'\` instructional
payload in \`backend/src/kloel/guest-chat.service.ts\` with the
\`AbiBuilderService\` output, behind a feature flag.

## DELIVERABLE

1. Inspect existing \`backend/src/kloel/guest-chat.service.ts\` to locate the
   call site that builds the LLM message (search for \`role: 'system'\`,
   \`messages:\`, or model invocation).
2. Inject \`AbiBuilderService\` (from \`./abi/abi-builder.service\`) and the
   \`Reflector\`-based feature flag detector via \`process.env\`. The flag
   name is \`KLOEL_GUEST_CHAT_USE_ABI\` (string \`"on"\` enables, anything
   else disables — defaults to disabled).
3. When flag is on:
   - Compose the ABI via \`AbiBuilderService.build({...})\` with
     audience='public', currentInput from the user message,
     perceptionSnapshot derived from the request context.
   - Validate the ABI via \`validateAbiPayload(abi)\` (from abi-validator).
     If FAIL, log warning and fall back to the legacy path (do NOT block
     production).
   - Pass the ABI as JSON in the \`role: 'user'\` message (NOT system).
     The system slot, if present, MUST contain ONLY the literal text:
     \`Estado cognitivo distribuído. Verbalize a partir do estado abaixo. Nunca invente fato fora do estado.\`
4. When flag is off: legacy code path runs unchanged.

## CONTRACT SPEC

Create \`backend/src/kloel/guest-chat.abi-substitution.spec.ts\`:

- Asserts that with flag OFF, the legacy code path fires (existing system
  prompt is sent — capture the messages array).
- Asserts that with flag ON, the system slot contains ONLY the canonical
  fallback string AND no behavioral instruction patterns
  (\`/\\bvoc[êe]\\s+/i\`, \`/\\byou are\\b/i\`, \`/\\bsempre\\b/i\`,
  \`/\\bnunca\\b/i\`).
- Asserts that with flag ON, the user message contains a JSON-stringified
  ABI payload validating against \`validateAbiPayload\` (PASS).
- Asserts the \`AbiBuilderService\` was called with audience=public.
- Asserts no LLM call when input is empty (early return).

Mock the LLM client / external dependencies via Jest's standard mocks.
DO NOT call the real LLM in tests.

## VALIDATION

\`\`\`sh
node scripts/pci/validate.mjs --strict
cd backend && npx tsc --noEmit
cd backend && npx jest --testPathPatterns='guest-chat.abi-substitution' --no-coverage
\`\`\`

## EDITABLE SET

- \`backend/src/kloel/guest-chat.service.ts\`
- \`backend/src/kloel/guest-chat.abi-substitution.spec.ts\` (new)
- \`backend/src/kloel/kloel.module.ts\` (additive providers/imports only)

## ROLLBACK

The feature flag is the rollback. Default OFF means production behavior
unchanged. Operators turn ON via env var when ready.

Begin: read the existing guest-chat.service.ts, plan, implement, validate, EXIT.
`,
  },
];

const manifest = {
  runId,
  concurrency: 1,
  staggerMs: 0,
  timeoutSec: 0,
  dir: REPO,
  skipPermissions: true,
  tasks,
};

writeFileSync(outPath, JSON.stringify(manifest, null, 2));
process.stderr.write(`wrote ${outPath} — ${tasks.length} tasks\n`);
process.stdout.write(JSON.stringify({ runId, manifest: outPath, taskCount: tasks.length }) + '\n');
