#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');
const runId = `cognitive-onda4-${new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')}`;
const outPath = join(REPO, 'scripts/orchestration/manifests/cognitive-organism', 'onda-4-encantamento.json');
mkdirSync(dirname(outPath), { recursive: true });

const PRELUDE = `# COGNITIVE ORGANISM — Onda 4 subagent

You are an OpenCode V4 Pro subagent for the Kloel Cognitive Organism mission.

## MANDATORY PRE-READ

1. \`docs/plans/KLOEL_COGNITIVE_ORGANISM_PLAN.md\`
2. \`docs/contracts/pci/MANIFEST.md\`
3. \`docs/contracts/pci/01-event-taxonomy.md\`
4. \`docs/contracts/pci/02-abi-schema.md\`
5. \`docs/contracts/pci/05-universal-conventions.md\`
6. \`scripts/decomp/cognitive-organism-subagent-delegation-rules.md\`
7. \`backend/src/kloel/spine/spine-emitter.service.ts\`
8. \`backend/src/kloel/wisdom/\` (Onda 3 — wisdom consumer)
9. \`backend/src/kloel/insight/\` (Onda 3 — insight consumer)
10. \`backend/src/kloel/maturity/\` (Onda 2 — maturity consumer)
11. \`CLAUDE.md\`

## ABSOLUTE PROHIBITIONS

- NO touch on frontend, *.tsx, *.vue, e2e, frontend-admin.
- NO change to existing HTTP controller signatures (additive only).
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
files_added: [...]
files_modified: [...]
gates_status: { prompt-leakage: PASS|FAIL, evidence-provenance: PASS|FAIL }
validation: { pci_validate, tsc, contract_spec(N) }
adjacency_conflicts: <none|list>
\`\`\`
`;

const tasks = [
  {
    id: 'UTP-RECOVERY',
    title: 'Mature Failure Recovery (Camada XIV)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-RECOVERY-001..007

Implements Camada XIV. Erro converte confiança em vez de destruir.

## DELIVERABLE

\`backend/src/kloel/recovery/\`:

- recovery.types.ts: ErrorClassification, RecoveryAction, TrustAfterError.
- self-error-detector.ts (RECOVERY-001): scans recent events for our
  failures (handoffs, declines, classifier-misclassifications inferred
  via correction events).
- error-acknowledgment.builder.ts (RECOVERY-002): generates a non-
  defensive acknowledgement message draft.
- error-explanation.builder.ts (RECOVERY-003): commercial-language
  explanation of what went wrong.
- error-non-repeat.guard.ts (RECOVERY-004): registers the error fingerprint
  + blocks repeat actions.
- error-damage-recovery.tactics.ts (RECOVERY-005): proposes a recovery
  action (small concession, expedited handling, etc.).
- error-narrative.builder.ts (RECOVERY-006): folds the error+recovery
  into the weekly narrative (DRIFT consumer).
- trust-after-error.tracker.ts (RECOVERY-007): tracks trust trajectory
  post-error. Reports non-repetition rate + auto-detection rate (V/R18
  metrics).
- recovery.module.ts + recovery.spec.ts (>= 12 tests).

## EDITABLE SET
- \`backend/src/kloel/recovery/**\`
- \`backend/src/app.module.ts\` (additive)
`,
  },
  {
    id: 'UTP-COLDSTART',
    title: 'Cold-Start Discovery (Camada XVII)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-COLDSTART-001..008

Implements Camada XVII. Empresa sem histórico chega a primeira verdade
comercial em ≤30 dias.

## DELIVERABLE

\`backend/src/kloel/coldstart/\`:

- coldstart.types.ts: NoHistoryMode, FirstTruthRoadmap, HypothesisTemplate,
  GuidedQuestion, MicroTest, ProgressSnapshot.
- no-history-mode.detector.ts (COLDSTART-001): identifies workspaces
  with insufficient events and marks NoHistoryMode.
- first-truth-roadmap.builder.ts (COLDSTART-002): generates a 30-day
  roadmap with milestones.
- hypothesis-template-bank.ts (COLDSTART-003): bank of common templates
  (uses WISDOM patterns when available).
- guided-question.generator.ts (COLDSTART-004): converts a hypothesis
  into a question for the dono.
- micro-test.designer.ts (COLDSTART-005): designs a low-risk test for
  one hypothesis.
- first-truth.detector.ts (COLDSTART-006): detects when the first
  commercial truth has been established.
- progress.tracker.ts (COLDSTART-007): tracks completion vs roadmap.
- graduation.service.ts (COLDSTART-008): graduates a workspace out of
  cold-start mode.
- coldstart.module.ts + coldstart.spec.ts (>= 14 tests).

## EDITABLE SET
- \`backend/src/kloel/coldstart/**\`
- \`backend/src/app.module.ts\` (additive)
`,
  },
  {
    id: 'UTP-WOW',
    title: 'First-Hour Wow (Camada XI)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-WOW-001..006

Implements Camada XI. Choque de valor nos primeiros minutos.

## DELIVERABLE

\`backend/src/kloel/wow/\`:

- wow.types.ts: HistoryIngestion, FirstHourPattern, RankedInsight,
  EvidenceBundle, OrchestrationOutcome.
- cold-start-ingestion.service.ts (WOW-001): rapid ingestion of any
  history available at workspace activation.
- pattern-detector.service.ts (WOW-002): runs WISDOM, INSIGHT, MATURITY
  consumers on the ingested history (re-uses those services — does NOT
  re-implement).
- insight-ranker.ts (WOW-003): ranks discovered insights by impact.
- evidence-builder.ts (WOW-004): packages each insight with traceable
  evidence.
- confidence-floor.ts (WOW-005): blocks low-confidence insights.
- first-hour.orchestrator.service.ts (WOW-006): orchestrates the first-
  hour user contact + delivery + acknowledgement.
- wow.module.ts + wow.spec.ts (>= 12 tests).

## EDITABLE SET
- \`backend/src/kloel/wow/**\`
- \`backend/src/app.module.ts\` (additive)
`,
  },
  {
    id: 'UTP-POSTSALE-CONSUMERS',
    title: 'Post-Sale & LTV Engine (Camada XVIII)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-POSTSALE-001..012

Implements Camada XVIII (consumer logic — NOT the emitter, which already
exists at backend/src/kloel/post-sale-emitter/).

## DELIVERABLE

\`backend/src/kloel/postsale-consumers/\`:

- postsale-consumers.types.ts: AntiRemorseSignal, ActivationProgress,
  FirstValueDetection, SatisfactionSignal, TestimonialReadiness,
  RepurchaseWindow, ChurnRiskAssessment, RetentionTactic, WinBackPlan,
  LtvProjection.
- anti-remorse.service.ts (POSTSALE-001): post-purchase reassurance.
- activation-companion.service.ts (POSTSALE-002): tracks activation steps.
- first-value.detector.ts (POSTSALE-003): detects first user-perceived
  value. Emits commerce.post_sale.first_value_obtained via SpineEmitter.
- satisfaction-collector.service.ts (POSTSALE-004): structured intake
  of NPS/CSAT/behavioral signals.
- testimonial-timing.advisor.ts (POSTSALE-005): when to ask.
- referral-prompt-timing.advisor.ts (POSTSALE-006): when to offer
  referral.
- repurchase-window.detector.ts (POSTSALE-007): identifies optimal
  upsell windows.
- expansion-fit.detector.ts (POSTSALE-008): detects fit for expansion
  products.
- churn-risk.detector.ts (POSTSALE-009): probabilistic model.
- retention-honest.tactics.ts (POSTSALE-010): no manipulation, only
  transparent retention.
- winback-window.advisor.ts (POSTSALE-011): when to attempt win-back.
- ltv-projection.service.ts (POSTSALE-012): per-cohort LTV projection.
- postsale-consumers.module.ts + postsale-consumers.spec.ts (>= 18 tests).

## EDITABLE SET
- \`backend/src/kloel/postsale-consumers/**\`
- \`backend/src/app.module.ts\` (additive)
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
