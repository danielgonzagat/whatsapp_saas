#!/usr/bin/env node
/**
 * Build manifest for Onda 3 second-order consumers:
 *   - WISDOM (Camada VI) — cross-workspace abstract patterns
 *   - DRIFT (Camada X) — behavioral drift observability
 *   - TEAM (Camada XII) — team augmentation
 *   - INSIGHT (Camada VII) — strategic insight engine
 *
 * Conc=4, stagger=8s, no timeout.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');
const runId = `cognitive-onda3-${new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')}`;
const outPath = join(REPO, 'scripts/orchestration/manifests/cognitive-organism', 'onda-3-second-order.json');
mkdirSync(dirname(outPath), { recursive: true });

const PRELUDE = `# COGNITIVE ORGANISM — Onda 3 second-order consumer subagent

You are an OpenCode V4 Pro subagent for the Kloel Cognitive Organism mission.

## MANDATORY PRE-READ

1. \`docs/plans/KLOEL_COGNITIVE_ORGANISM_PLAN.md\`
2. \`docs/contracts/pci/MANIFEST.md\`
3. \`docs/contracts/pci/01-event-taxonomy.md\`
4. \`docs/contracts/pci/02-abi-schema.md\`
5. \`docs/contracts/pci/05-universal-conventions.md\`
6. \`scripts/decomp/cognitive-organism-subagent-delegation-rules.md\`
7. \`backend/src/kloel/spine/spine-emitter.service.ts\`
8. \`backend/src/kloel/abi/abi-schema.ts\`
9. \`backend/src/kloel/local-identity/local-identity.service.ts\` (LOCAL-IDENT consumer)
10. \`backend/src/kloel/maturity/maturity.classifier.ts\` (MATURITY consumer)
11. \`CLAUDE.md\`

If any file is missing or its checksum mismatches, STOP and report.

## ABSOLUTE PROHIBITIONS

- NO touch on frontend, *.tsx, *.vue, e2e, frontend-admin.
- NO change to existing HTTP controller/route/DTO signature (additive only).
- NO touch on protected files.
- NO suppression comments / skip tags / @ts-ignore / NOSONAR.
- NO \`git restore\`.
- NO new event names outside PCI.1.
- NO \`prismaAny\` in NEW code.
- NO behavioral instruction strings.

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
  evidence-provenance: PASS|FAIL
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
    id: 'UTP-WISDOM',
    title: 'Cross-Workspace Commercial Wisdom (Camada VI)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-WISDOM-001..008

Implements Camada VI. Extracts ABSTRACT patterns across workspaces with
k-anonymity + diff-privacy noise; never lets identifiable data cross
workspace boundaries.

## DELIVERABLE

Create \`backend/src/kloel/wisdom/\`:

- wisdom.types.ts: Pattern { patternId, description, applicableConditions,
  evidenceWorkspacesCount, confidence }, AggregatedSignal type.
- wisdom-pattern-extractor.service.ts (WISDOM-001): pure function over a
  list of per-workspace event sets → array of candidate patterns.
- wisdom-anonymizer.ts (WISDOM-002): k-anonymity (drop patterns
  validated by < K workspaces) + diff-privacy noise (Laplacian on counts).
- wisdom-validator.ts (WISDOM-003): "validation by N workspaces" — only
  patterns confirmed by ≥ N (default 3) workspaces are kept.
- wisdom-taxonomy.ts (WISDOM-004): structured tags for patterns
  (verticalHint, tickethint, stageHint, channelHint).
- wisdom-projector.service.ts (WISDOM-005): builds AbiWisdomPattern[]
  array sized for ABI consumption.
- wisdom-relevance-filter.ts (WISDOM-006): filters by vertical/ticket/
  stage/channel relevance to a target workspace.
- wisdom-opt.ts (WISDOM-007): per-workspace + per-role opt-in/out
  registry (in-memory map; persistence later).
- wisdom-attribution.guard.ts (WISDOM-008): spec proving NO identifiable
  data leaks (assertion that pattern descriptions never contain
  workspaceIds, leadIds, productIds, or PII keywords).
- wisdom.module.ts: NestJS wiring.
- wisdom.spec.ts: covers each piece. >= 14 tests.

## VALIDATION

\`\`\`sh
node scripts/pci/validate.mjs --strict
cd backend && npx tsc --noEmit
cd backend && npx jest --testPathPatterns='kloel/wisdom/' --no-coverage
\`\`\`

## EDITABLE SET

- \`backend/src/kloel/wisdom/**\`
- \`backend/src/app.module.ts\` (additive import only)
`,
  },
  {
    id: 'UTP-DRIFT',
    title: 'Behavioral Drift Observability (Camada X)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-DRIFT-001..006

Implements Camada X. Weekly behavior snapshots per workspace with
drift detection + attribution + commercial-language explanation.

## DELIVERABLE

Create \`backend/src/kloel/drift/\`:

- drift.types.ts: BehaviorSnapshot, DriftReport, AttributedDrift.
- behavior-snapshot.service.ts (DRIFT-001): collects metrics per week
  (conversion rate, avg latency, objection mix, payment success rate,
  churn rate) — pure function over events.
- drift-detector.ts (DRIFT-002): compares snapshot vs N previous snapshots
  using simple statistical tests (mean drift > 1.5σ).
- drift-attribution.service.ts (DRIFT-003): identifies the most likely
  causing event/learning that occurred between snapshots.
- drift-explanation.builder.ts (DRIFT-004): generates a commercial-language
  explanation (no jargon) suitable for the dono.
- drift-narrative.builder.ts (DRIFT-005): weekly narrative composing
  multiple drifts into a story.
- drift-evidence-collector.ts (DRIFT-006): builds before/after evidence
  bundles for each drift.
- drift.module.ts + drift.spec.ts (>= 12 tests).

## VALIDATION

\`\`\`sh
node scripts/pci/validate.mjs --strict
cd backend && npx tsc --noEmit
cd backend && npx jest --testPathPatterns='kloel/drift/' --no-coverage
\`\`\`

## EDITABLE SET

- \`backend/src/kloel/drift/**\`
- \`backend/src/app.module.ts\` (additive import only)
`,
  },
  {
    id: 'UTP-TEAM',
    title: 'Team Augmentation (Camada XII)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-TEAM-001..007

Implements Camada XII. Augments human team without replacing — pre-conv
context, next-best-action suggestion, forgotten-followup rescue,
blind-spot illuminator, smart handoff, respect protocol, feedback loop.

## DELIVERABLE

Create \`backend/src/kloel/team/\`:

- team.types.ts: PreCallContext, NextBestAction, FeedbackEntry.
- pre-call-context.builder.ts (TEAM-001): bundles relevant lead history
  + valence trace + open questions for an operator about to enter conv.
- next-best-action.suggester.ts (TEAM-002): top 3 suggestions ranked by
  fit (uses INSIGHT/MATURITY when available; degrades gracefully when not).
- forgotten-followup.rescuer.ts (TEAM-003): scans spine for leads in
  silent state past budget without operator action.
- blind-spot-illuminator.ts (TEAM-004): identifies hot leads operator
  hasn't touched in window.
- smart-handoff.service.ts (TEAM-005): packages full context for human
  takeover (no information loss).
- team-respect.protocol.ts (TEAM-006): rules for suggestion-not-command
  framing; operator can dismiss/override every suggestion without
  punishment.
- operator-feedback.loop.ts (TEAM-007): operator feedback flows back to
  valence aggregator.
- team.module.ts + team.spec.ts (>= 14 tests).

## VALIDATION

\`\`\`sh
node scripts/pci/validate.mjs --strict
cd backend && npx tsc --noEmit
cd backend && npx jest --testPathPatterns='kloel/team/' --no-coverage
\`\`\`

## EDITABLE SET

- \`backend/src/kloel/team/**\`
- \`backend/src/app.module.ts\` (additive import only)

## ANTI-CONFLICT NOTE

The repo already has a \`backend/src/team/\` (TeamModule for human team
management). Your work goes into \`backend/src/kloel/team/\` — distinct.
`,
  },
  {
    id: 'UTP-INSIGHT',
    title: 'Strategic Insight Engine (Camada VII)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-INSIGHT-001..011

Implements Camada VII. Detectors for revenue leaks + ranking by
financial impact + confidence floor + delivery at right moment/channel.

## DELIVERABLE

Create \`backend/src/kloel/insight/\`:

- insight.types.ts: Insight { insightId, kind, description, evidence,
  estimatedFinancialImpactCents, confidence, recommendedChannel,
  recommendedTiming }.
- detectors/funnel-bottleneck.detector.ts (INSIGHT-001): finds drop-off
  stages.
- detectors/offer-fit.detector.ts (INSIGHT-002): correlations
  product↔conversion.
- detectors/objection-pattern.detector.ts (INSIGHT-003): clustering of
  objection kinds.
- detectors/qualification-leak.detector.ts (INSIGHT-004): leads
  qualified but lost.
- detectors/cooling-window.detector.ts (INSIGHT-005): time→conversion
  decay analysis.
- detectors/pricing-elasticity.detector.ts (INSIGHT-006): price-vs-
  conversion correlation.
- detectors/channel-roi.detector.ts (INSIGHT-007): per-channel cost vs
  attributed revenue.
- detectors/product-positioning.detector.ts (INSIGHT-008): position vs
  perception drift.
- insight-ranker.ts (INSIGHT-RANK-001): sorts by impact * confidence.
- insight-confidence.guard.ts (INSIGHT-CONF-001): floor; below threshold
  insights are not delivered.
- insight-delivery.service.ts (INSIGHT-DEL-001): chooses channel/timing.
- insight.module.ts + insight.spec.ts (>= 18 tests).

## VALIDATION

\`\`\`sh
node scripts/pci/validate.mjs --strict
cd backend && npx tsc --noEmit
cd backend && npx jest --testPathPatterns='kloel/insight/' --no-coverage
\`\`\`

## EDITABLE SET

- \`backend/src/kloel/insight/**\`
- \`backend/src/app.module.ts\` (additive import only)
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
process.stderr.write(`wrote ${outPath} — ${tasks.length} tasks, conc=${manifest.concurrency}\n`);
process.stdout.write(JSON.stringify({ runId, manifest: outPath, taskCount: tasks.length }) + '\n');
