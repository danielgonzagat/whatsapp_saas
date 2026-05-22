#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');
const runId = `cognitive-onda9-${new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')}`;
const outPath = join(REPO, 'scripts/orchestration/manifests/cognitive-organism', 'onda-9-evolution.json');
mkdirSync(dirname(outPath), { recursive: true });

const PRELUDE = `# COGNITIVE ORGANISM — Onda 9 subagent (final wave)

OpenCode V4 Pro subagent. Read PCI + plan + delegation rules + CLAUDE.md FIRST.

## ABSOLUTE PROHIBITIONS

- NO touch on frontend, *.tsx, e2e, frontend-admin, protected files.
- NO change to existing HTTP controller signatures (additive only).
- NO suppression / skip / TypeScript ignore comments / static-analysis suppressions / git restore.
- NO new event names outside PCI.1.
- NO \`prismaAny\` in NEW code.
- NO behavioral instruction strings.

## REQUIRED VALIDATION

\`\`\`sh
node scripts/pci/validate.mjs --strict
cd backend && npx tsc --noEmit
cd backend && npx jest --testPathPatterns='<spec>' --no-coverage
\`\`\`
`;

const tasks = [
  {
    id: 'UTP-EVOL',
    title: 'Composed Self-Evolution (Camada XXXII)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-EVOL-001..010
Auto-aperfeiçoamento sob governança humana absoluta.

## DELIVERABLE \`backend/src/kloel/evol/\`:
- types.ts: SelfGap, ImprovementProposal, HumanAuthorization, AgentOrchestrationBridge, ExperimentRun, RTierDelta, AutomaticRollback, ProtectedFilesFirewall, CodacyRigorCheck, EvolutionAudit.
- gap.detector.ts (EVOL-001): identifies own gaps with commercial impact estimate.
- proposal.builder.ts (EVOL-002): improvement proposal with evidence.
- human-authorization.gateway.ts (EVOL-003): human approval REQUIRED.
- agent-orchestration.bridge.ts (EVOL-004): proxy to authorized coding agents.
- experiment.runner.ts (EVOL-005): integrates HYPPROOF.
- r-tier-delta.monitor.ts (EVOL-006): tracks R-tier delta.
- automatic-rollback.service.ts (EVOL-007): rollback ≤24h if regression.
- protected-files.firewall.ts (EVOL-008): blocks each touch on protected files.
- codacy-rigor.enforcer.ts (EVOL-009): blocks each reduction of MAX-RIGOR.
- evolution-audit.log.ts (EVOL-010): audit trail.
- evol.module.ts + evol.spec.ts (>= 16 tests).
EDITABLE SET: \`backend/src/kloel/evol/**\`, \`backend/src/app.module.ts\` (additive).
`,
  },
  {
    id: 'UTP-INCENT',
    title: 'Incentive Integrity (Camada XXXIV)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-INCENT-001..008
Recomendação cruzada sem conflito oculto, sem viés de plataforma.

## DELIVERABLE \`backend/src/kloel/incent/\`:
- types.ts: RecommendationExplanation, ConflictDetection, SilenceUnderConflict, PlatformBias, Disclosure, ThirdPartyAuditExport, UserFeedbackCorrection, RecommendationAttribution.
- recommendation-explainer.ts (INCENT-001): "porque isso, para você".
- conflict.detector.ts (INCENT-002).
- conflict-silence.enforcer.ts (INCENT-003): silence under conflict.
- platform-bias.monitor.ts (INCENT-004): audit weight by internal revenue.
- disclosure.engine.ts (INCENT-005): auto-disclose Kloel↔party links.
- third-party-audit.export.ts (INCENT-006): exportable audit bundle.
- user-feedback-correction.service.ts (INCENT-007).
- recommendation-attribution.builder.ts (INCENT-008).
- incent.module.ts + incent.spec.ts (>= 14 tests).
EDITABLE SET: \`backend/src/kloel/incent/**\`, \`backend/src/app.module.ts\` (additive).
`,
  },
  {
    id: 'UTP-ABI-009',
    title: 'Empty kloel.prompts.ts and buildSystemPrompt instructional blocks',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-ABI-009
Final cutover — empty the legacy prompt files and the buildSystemPrompt
function. Only do this AFTER ABI-005..008 substitutions are stable.

## DELIVERABLE

1. \`backend/src/kloel/kloel.prompts.ts\`: Replace contents with a single
   exported constant \`CANONICAL_FALLBACK_SYSTEM_PROMPT\` containing ONLY:
   "Estado cognitivo distribuído. Verbalize a partir do estado abaixo. Nunca invente fato fora do estado."
   Remove all other persona/role/few-shot content.
2. \`backend/src/kloel/kloel.prompts.helpers.ts\`: Replace contents with a
   stub re-export of CANONICAL_FALLBACK_SYSTEM_PROMPT, keeping function
   signatures of helpers but having them return the canonical fallback
   constant.
3. \`backend/src/kloel/unified-agent-context.service.ts\`: Find the
   buildSystemPrompt function and reduce it to return
   CANONICAL_FALLBACK_SYSTEM_PROMPT (preserve signature). Add a deprecation
   comment explaining the ABI cutover.

## CONTRACT SPEC

Create \`backend/src/kloel/abi-009-prompt-emptied.spec.ts\`:
- Asserts kloel.prompts.ts no longer contains "você é", "always", "never",
  persona declarations, few-shot patterns.
- Asserts buildSystemPrompt returns canonical fallback.
- Asserts unified-agent-context-data.service.ts is unaffected (data path).

## ROLLBACK

If ABI substitutions had a regression, revert this single commit.

## VALIDATION

\`\`\`sh
node scripts/pci/validate.mjs --strict
cd backend && npx tsc --noEmit
cd backend && npx jest --testPathPatterns='abi-009-prompt-emptied|unified-agent' --no-coverage
\`\`\`

EDITABLE SET:
- \`backend/src/kloel/kloel.prompts.ts\`
- \`backend/src/kloel/kloel.prompts.helpers.ts\`
- \`backend/src/kloel/unified-agent-context.service.ts\` (only buildSystemPrompt body)
- \`backend/src/kloel/abi-009-prompt-emptied.spec.ts\` (new)
`,
  },
];

const manifest = {
  runId,
  concurrency: 3,
  staggerMs: 8000,
  timeoutSec: 0,
  dir: REPO,
  skipPermissions: true,
  tasks,
};

writeFileSync(outPath, JSON.stringify(manifest, null, 2));
process.stderr.write(`wrote ${outPath} — ${tasks.length} tasks\n`);
process.stdout.write(JSON.stringify({ runId, manifest: outPath, taskCount: tasks.length }) + '\n');
