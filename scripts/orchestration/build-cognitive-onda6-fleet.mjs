#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');
const runId = `cognitive-onda6-${new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')}`;
const outPath = join(REPO, 'scripts/orchestration/manifests/cognitive-organism', 'onda-6-hypproof.json');
mkdirSync(dirname(outPath), { recursive: true });

const PRELUDE = `# COGNITIVE ORGANISM — Onda 6 subagent

OpenCode V4 Pro subagent. Read PCI + plan + delegation rules + CLAUDE.md FIRST.

## ABSOLUTE PROHIBITIONS

- NO touch on frontend, *.tsx, e2e, frontend-admin, protected files.
- NO change to existing HTTP controller signatures (additive only).
- NO suppression / skip / @ts-ignore / NOSONAR / git restore.
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
    id: 'UTP-HYPPROOF',
    title: 'Hypothesis-to-Proof Engine (Camada XX)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-HYPPROOF-001..008
Implements Camada XX. Loop fechado: hipótese → micro-teste → autorização → execução → observação → conclusão honesta → atualização de crença.

## DELIVERABLE \`backend/src/kloel/hypproof/\`:
- types.ts: Hypothesis, MicroExperiment, AuthorizationRequest, ExperimentRun, Observation, ProofVerdict (confirmed|refuted|inconclusive), BeliefUpdate, DiscoveryNarrative.
- hypothesis-formulator.ts (HYPPROOF-001): generates testable hypotheses from spine signals.
- micro-experiment.designer.ts (HYPPROOF-002): low-risk test design.
- authorization.gateway.ts (HYPPROOF-003): integrates with Camada XIII delegation state.
- experiment-runner.ts (HYPPROOF-004): idempotent execution with correlation id.
- observation.collector.ts (HYPPROOF-005): anti-overclaim, requires evidence count.
- proof-evaluator.ts (HYPPROOF-006): verdicts based on observed deltas.
- belief-update.ts (HYPPROOF-007): emits cognition.belief_updated.
- discovery-narrative.builder.ts (HYPPROOF-008): commercial-language narrative.
- hypproof.module.ts + hypproof.spec.ts (>= 14 tests).

EDITABLE SET: \`backend/src/kloel/hypproof/**\`, \`backend/src/app.module.ts\` (additive).
`,
  },
  {
    id: 'UTP-COMMEM',
    title: 'Proprietary Commercial Memory (Camada XXI)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-COMMEM-001..007
Tudo aprendido vira capital exportável da empresa.

## DELIVERABLE \`backend/src/kloel/commem/\`:
- types.ts: AggregatedLedgerEntry, MemoryProjection, ExportedCapsule, TimeMachineQuery, ValueQuantification, Narrative, AttributionGuardResult.
- ledger.service.ts (COMMEM-001): aggregator over the spine per workspace.
- memory.projector.ts (COMMEM-002): projects per dimension.
- exporter.service.ts (COMMEM-003): real, auditable export.
- time-machine.service.ts (COMMEM-004): query memory at any past time.
- value-quantifier.ts (COMMEM-005): real value quantification.
- narrative.builder.ts (COMMEM-006): periodic narrative.
- attribution.guard.ts (COMMEM-007): no cross-workspace leak.
- commem.module.ts + commem.spec.ts (>= 14 tests).

EDITABLE SET: \`backend/src/kloel/commem/**\`, \`backend/src/app.module.ts\` (additive).
`,
  },
  {
    id: 'UTP-CLARITY',
    title: 'Decision Clarity (Camada XXII)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-CLARITY-001..006
Reduzir o mundo a poucas decisões certas agora. Default é silêncio.

## DELIVERABLE \`backend/src/kloel/clarity/\`:
- types.ts: AttentionRanking, DecisionTier (AGORA|ESTA_SEMANA|PARA_SABER|ARQUIVO), NoiseFilter, AnxietyMode, ClarityFeedback, ShortNarrative.
- attention.ranker.ts (CLARITY-001): rank by urgency × impact × reversibility.
- hierarchy.projector.ts (CLARITY-002): projects to AGORA/SEMANA/SABER/ARQUIVO.
- noise.filter.ts (CLARITY-003): suppresses items below threshold; default silence.
- anxiety-mode.detector.ts (CLARITY-004): when triggered, switch to AGORA-only mode.
- feedback.loop.ts (CLARITY-005): user feedback affects ranking.
- short-narrative.builder.ts (CLARITY-006): brief "what matters now" message.
- clarity.module.ts + clarity.spec.ts (>= 12 tests).

EDITABLE SET: \`backend/src/kloel/clarity/**\`, \`backend/src/app.module.ts\` (additive).
`,
  },
  {
    id: 'UTP-ABI-006-007-008',
    title: 'ABI substitution in whatsapp-brain + unified-agent + adjacent',
    prompt: `${PRELUDE}

## YOUR UTPs: UTP-ABI-006, UTP-ABI-007, UTP-ABI-008
Substitute role:'system' instructional payloads with ABI in three more flows. Each behind a feature flag with A/B baseline preservation.

## DELIVERABLE

For each of these services, locate the LLM call site that builds the system message and add an ABI-based path behind a feature flag (env var):

1. \`backend/src/kloel/whatsapp-brain.service.ts\` — flag KLOEL_WHATSAPP_BRAIN_USE_ABI.
2. \`backend/src/kloel/unified-agent.service.ts\` — flag KLOEL_UNIFIED_AGENT_USE_ABI. **MOST CRITICAL** — must preserve full A/B with baseline preservation.
3. (parallel within ABI-008) Same pattern for: \`kloel-reply-engine.service.ts\`, \`kloel-thinker.service.ts\`, \`kloel-lead-brain.service.ts\`, \`kloel-lead-processor.service.ts\`, \`kloel-composer.service.ts\`, \`unified-agent-response.service.ts\` — each behind their own KLOEL_<NAME>_USE_ABI flag, default OFF.

For EACH service:
- inject AbiBuilderService (Optional).
- when flag ON: build ABI via AbiBuilderService, validate via validateAbiPayload, on validation FAIL fall back to legacy.
- when flag OFF: legacy path unchanged.
- canonical fallback system text (when flag ON and we still need a system slot): 'Estado cognitivo distribuído. Verbalize a partir do estado abaixo. Nunca invente fato fora do estado.'

## CONTRACT SPEC

For each service, create \`backend/src/kloel/<service-basename>.abi-substitution.spec.ts\`:
- flag OFF: legacy system prompt is sent.
- flag ON: system slot contains only canonical fallback OR is absent; user message contains validated ABI.
- validation FAIL falls back to legacy.

DO NOT mock the LLM client beyond what's strictly necessary. DO NOT call real LLM.

## VALIDATION

\`\`\`sh
node scripts/pci/validate.mjs --strict
cd backend && npx tsc --noEmit
cd backend && npx jest --testPathPatterns='abi-substitution' --no-coverage
\`\`\`

EDITABLE SET:
- \`backend/src/kloel/whatsapp-brain.service.ts\` (additive injection)
- \`backend/src/kloel/unified-agent.service.ts\` (additive injection)
- \`backend/src/kloel/kloel-reply-engine.service.ts\` (additive)
- \`backend/src/kloel/kloel-thinker.service.ts\` (additive)
- \`backend/src/kloel/kloel-lead-brain.service.ts\` (additive)
- \`backend/src/kloel/kloel-lead-processor.service.ts\` (additive)
- \`backend/src/kloel/kloel-composer.service.ts\` (additive)
- \`backend/src/kloel/unified-agent-response.service.ts\` (additive)
- \`backend/src/kloel/*.abi-substitution.spec.ts\` (new)
- \`backend/src/kloel/kloel.module.ts\` (additive imports/providers)

## ROLLBACK

Every flag defaults OFF. Operators flip ON via env when ready. Single revert commit reverts.
`,
  },
];

const manifest = {
  runId,
  concurrency: 4,
  staggerMs: 8000,
  timeoutSec: 0,
  dir: REPO,
  skipPermissions: true,
  tasks,
};

writeFileSync(outPath, JSON.stringify(manifest, null, 2));
process.stderr.write(`wrote ${outPath} — ${tasks.length} tasks\n`);
process.stdout.write(JSON.stringify({ runId, manifest: outPath, taskCount: tasks.length }) + '\n');
