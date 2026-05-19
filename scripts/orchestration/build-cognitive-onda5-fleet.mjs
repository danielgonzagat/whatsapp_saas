#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');
const runId = `cognitive-onda5-${new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')}`;
const outPath = join(REPO, 'scripts/orchestration/manifests/cognitive-organism', 'onda-5-delegation.json');
mkdirSync(dirname(outPath), { recursive: true });

const PRELUDE = `# COGNITIVE ORGANISM — Onda 5 subagent

OpenCode V4 Pro subagent for Kloel Cognitive Organism mission.

## MANDATORY PRE-READ

1. \`docs/plans/KLOEL_COGNITIVE_ORGANISM_PLAN.md\`
2. \`docs/contracts/pci/MANIFEST.md\` + all 6 PCI files
3. \`scripts/decomp/cognitive-organism-subagent-delegation-rules.md\`
4. \`backend/src/kloel/spine/spine-emitter.service.ts\`
5. \`backend/src/kloel/recovery/\` (Onda 4 — recovery consumer)
6. \`backend/src/kloel/postsale-consumers/\` (Onda 4 — postsale consumer)
7. \`backend/src/kloel/coldstart/\` (Onda 4 — coldstart consumer)
8. \`CLAUDE.md\`

## ABSOLUTE PROHIBITIONS

- NO touch on frontend, *.tsx, *.vue, e2e, frontend-admin.
- NO change to existing HTTP controllers (additive only).
- NO touch on protected files.
- NO suppression / skip tags / TypeScript ignore comments / static-analysis suppressions.
- NO \`git restore\`.
- NO new event names outside PCI.1.
- NO \`prismaAny\` in NEW code.
- NO behavioral instruction strings.

## REQUIRED VALIDATION

\`\`\`sh
node scripts/pci/validate.mjs --strict
cd backend && npx tsc --noEmit
cd backend && npx jest --testPathPatterns='<your spec>' --no-coverage
\`\`\`

## DELIVERABLE FORMAT

\`\`\`
EXIT <utp-id>
files_added: [...]
files_modified: [...]
gates_status: { prompt-leakage, evidence-provenance }
validation: { pci_validate, tsc, contract_spec(N) }
\`\`\`
`;

const tasks = [
  {
    id: 'UTP-DELEG',
    title: 'Delegation Confidence Tracking (Camada XIII)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-DELEG-001..006

Implements Camada XIII. Confiança crescente de delegação por área operacional.

## DELIVERABLE \`backend/src/kloel/delegation/\`:
- delegation.types.ts: DelegationState, GraduationVerdict, AutonomySuggestion.
- delegation-state.tracker.ts (DELEG-001): per-workspace per-area state.
- graduation.detector.ts (DELEG-002): detects when an area is ready for higher autonomy.
- autonomy-suggestion.builder.ts (DELEG-003): proposes autonomy expansion with evidence.
- autonomy-rollback.policy.ts (DELEG-004): demotes autonomy if confidence breaks.
- area-by-area-graduation.service.ts (DELEG-005): independent graduation per area.
- delegation-evidence.builder.ts (DELEG-006): packages evidence bundle.
- delegation.module.ts + delegation.spec.ts (>= 12 tests).

EDITABLE SET: \`backend/src/kloel/delegation/**\`, \`backend/src/app.module.ts\` (additive).
`,
  },
  {
    id: 'UTP-OFFER',
    title: 'Offer Evolution Intelligence (Camada XV)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-OFFER-001..009

Implements Camada XV. Aponta o que mudar no produto/oferta com evidência.

## DELIVERABLE \`backend/src/kloel/offer/\`:
- offer.types.ts: BonusDesirability, PromiseStrength, ProductVersionFit, PositioningMismatch, PagePromiseMismatch, PricingPsychologySignal.
- detectors/: 6 detectors (one per signal above).
- offer-insight.ranker.ts (OFFER-007): rank by impactMultiplicative * confidence.
- offer-confidence.guard.ts (OFFER-008): floor.
- offer-delivery.service.ts (OFFER-009): channel/timing.
- offer.module.ts + offer.spec.ts (>= 14 tests).

EDITABLE SET: \`backend/src/kloel/offer/**\`, \`backend/src/app.module.ts\` (additive).
`,
  },
  {
    id: 'UTP-OWNER-CRIT',
    title: 'Owner Criterion Memory (Camada XVI)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-OWNER-CRIT-001..008

Implements Camada XVI. Kloel aprende como o dono quer operar — por convivência.

## DELIVERABLE \`backend/src/kloel/owner-criterion/\`:
- owner-criterion.types.ts: DecisionObservation, CorrectionObservation, ToneObservation, RiskObservation, EthicalObservation, ApprovalObservation.
- observers/decision.observer.ts (OWNER-CRIT-001).
- observers/correction.observer.ts (OWNER-CRIT-002).
- observers/tone.observer.ts (OWNER-CRIT-003).
- observers/risk-tolerance.observer.ts (OWNER-CRIT-004).
- observers/ethical-line.observer.ts (OWNER-CRIT-005).
- observers/approval-threshold.observer.ts (OWNER-CRIT-006).
- owner-criterion.projector.ts (OWNER-CRIT-007): projects criterion into ABI as context.
- owner-criterion.evidence.builder.ts (OWNER-CRIT-008): builds evidence per criterion.
- owner-criterion.module.ts + owner-criterion.spec.ts (>= 14 tests).

EDITABLE SET: \`backend/src/kloel/owner-criterion/**\`, \`backend/src/app.module.ts\` (additive).
`,
  },
  {
    id: 'UTP-HEALTHYMONEY',
    title: 'Healthy Money Optimization (Camada XIX)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-HEALTHYMONEY-001..008

Implements Camada XIX. Receita boa cresce e receita ruim cai.

## DELIVERABLE \`backend/src/kloel/healthy-money/\`:
- healthy-money.types.ts: RevenueQualityScore, MarginProjection, RefundRiskProjection, SupportCostProjection, BrandWearSignal, UnhealthySaleBlock, BlockerPolicy.
- revenue-quality.scorer.ts (HEALTHYMONEY-001).
- margin.projector.ts (HEALTHYMONEY-002).
- refund-risk.projector.ts (HEALTHYMONEY-003).
- support-cost.projector.ts (HEALTHYMONEY-004).
- brand-wear.detector.ts (HEALTHYMONEY-005).
- unhealthy-sale.blocker.ts (HEALTHYMONEY-006).
- blocker-policy.service.ts (HEALTHYMONEY-007): owner-revisable policy.
- healthy-vs-unhealthy.dashboard.ts (HEALTHYMONEY-008): aggregator for the dashboard payload.
- healthy-money.module.ts + healthy-money.spec.ts (>= 14 tests).

EDITABLE SET: \`backend/src/kloel/healthy-money/**\`, \`backend/src/app.module.ts\` (additive).
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
