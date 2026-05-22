#!/usr/bin/env node
/**
 * Build the OpenCode fleet manifest for Onda 2 first-order consumers
 * (LOCAL-IDENT + MATURITY + TRUST). Each consumes the spine that
 * Onda 1 EVENT-EMIT populates. Concurrency 6 (RAM-conscious), stagger 8s.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');
const runId = `cognitive-onda2-${new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')}`;
const outPath = join(REPO, 'scripts/orchestration/manifests/cognitive-organism', 'onda-2-consumers.json');
mkdirSync(dirname(outPath), { recursive: true });

const PRELUDE = `# COGNITIVE ORGANISM — Onda 2 first-order consumer subagent

You are an OpenCode V4 Pro subagent dispatched for the Kloel Cognitive
Organism mission, Onda 2 (consumers of the spine populated by Onda 1).

## MANDATORY PRE-READ (in order)

1. \`docs/plans/KLOEL_COGNITIVE_ORGANISM_PLAN.md\`
2. \`docs/contracts/pci/MANIFEST.md\`
3. \`docs/contracts/pci/01-event-taxonomy.md\`
4. \`docs/contracts/pci/02-abi-schema.md\`
5. \`docs/contracts/pci/05-universal-conventions.md\`
6. \`scripts/decomp/cognitive-organism-subagent-delegation-rules.md\`
7. \`backend/src/kloel/spine/spine-emitter.service.ts\` (the spine you consume)
8. \`backend/src/kloel/abi/abi-schema.ts\` (the field shape you contribute to)
9. \`CLAUDE.md\`

If a required file is missing or its checksum mismatches \`docs/contracts/pci/CHECKSUMS.txt\`, STOP and report.

## ABSOLUTE PROHIBITIONS

- NO touch on frontend/**, *.tsx, *.vue, e2e/**, frontend-admin/**.
- NO change to existing HTTP controllers/routes/DTOs (additive only).
- NO touch on protected files: CLAUDE.md, AGENTS.md, ops/**, .husky/**,
  eslint.config.mjs, ai-models.ts, scripts/pulse/no-hardcoded-reality-audit.ts,
  docs/contracts/pci/**, docs/plans/KLOEL_COGNITIVE_ORGANISM_PLAN.md,
  scripts/decomp/cognitive-organism-subagent-delegation-rules.md.
- NO suppression comments / skip tags (Biome ignore comments, TypeScript ignore comments,
  ESLint disable comments, static-analysis suppressions, [skip ci], etc.).
- NO \`git restore\`.
- NO invented event names outside PCI.1.
- NO \`prismaAny\` in NEW code.
- NO behavioral instruction strings ("você é", "act as", etc.) anywhere.

## REQUIRED VALIDATION

\`\`\`sh
node scripts/pci/validate.mjs --strict
cd backend && npx tsc --noEmit
cd backend && npx jest --testPathPatterns='<your contract spec>' --no-coverage
\`\`\`

Exit 0 required on all three.

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
pci_divergences: <none|list>
follow_ups: <none|list>
\`\`\`
`;

const tasks = [
  {
    id: 'UTP-LOCAL-IDENT',
    title: 'Local Operational Identity per workspace (Camada V)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-LOCAL-IDENT-001..007

Implements Camada V — Local Operational Identity. Derives a per-workspace
profile from the in-process spine (read via \`SpineEmitterService.recentEventsAsRef()\`)
and projects it as the \`workspaceLocalProfile\` field of the ABI (PCI.2 §3.12).

## DELIVERABLE

Create:

- \`backend/src/kloel/local-identity/local-identity.types.ts\` — internal
  shapes mirroring \`AbiWorkspaceLocalProfile\`.
- \`backend/src/kloel/local-identity/local-identity.service.ts\` — pure
  function \`deriveProfile(workspaceId, recentEvents): AbiWorkspaceLocalProfile | undefined\`.
  Returns undefined if event count < 100 (volume threshold per PCI.2).
  Derives:
    * operational: typical hours of activity, typical entity types
    * language: tone (from message_replied valence mix), vocabulary
      (top tokens from message payloads — when present)
    * product: catalog sketch (productIds seen in payments + roles inferred)
    * customer: typical profile (lead → conversion ratio, common stages)
    * temporal: peakHours (UTC), typicalCycleHours (median time
      lead.contacted → payment.approved when both present)
    * decisionPatterns: typicalNextSteps (from crm.next_step_defined),
      typicalEscalations (from whatsapp.handoff_to_human)
    * derivedFromEventsCount + derivedAt
- \`backend/src/kloel/local-identity/local-identity.service.spec.ts\`:
    * returns undefined below threshold
    * derives at threshold with synthetic 100-event sample
    * tone reflects valence mix
    * peakHours matches injected hour distribution
    * temporal cycle calculation is correct on a known fixture
    * pure: same input => same output
- \`backend/src/kloel/local-identity/local-identity.module.ts\` — exports service.
- Wire in AppModule alongside MindModule.

## VALIDATION

\`\`\`sh
node scripts/pci/validate.mjs --strict
cd backend && npx tsc --noEmit
cd backend && npx jest --testPathPatterns='kloel/local-identity/' --no-coverage
\`\`\`

## EDITABLE SET

- \`backend/src/kloel/local-identity/**\`
- \`backend/src/app.module.ts\` (additive import only)

You MAY read each file. You MAY NOT edit outside this set.
`,
  },
  {
    id: 'UTP-MATURITY',
    title: 'Commercial Maturity Recognition (Camada VIII)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-MATURITY-001..005

Implements Camada VIII. Classifies workspace commercial stage from the
spine (validation / tração / crescimento / maturidade / otimização) by
SIGNALS, not declaration.

## DELIVERABLE

Create:

- \`backend/src/kloel/maturity/maturity.types.ts\`: MaturityStage enum,
  MaturityVerdict { stage, confidence, signals, classifiedAt, transition }.
- \`backend/src/kloel/maturity/maturity-signals.collector.ts\` (UTP-MATURITY-001):
  pure function over events → SignalSummary { conversionsPerMonth,
  uniqueLeads, repeatPaymentRate, churnRate, productCount,
  campaignCount, refundRate, dealsClosedRate, supportToSalesRatio }.
- \`backend/src/kloel/maturity/maturity.classifier.ts\` (UTP-MATURITY-002):
  rule-based classifier with explicit thresholds — returns MaturityVerdict
  with confidence ∈ [0, 1]. Document each threshold in code.
- \`backend/src/kloel/maturity/maturity-goal-filter.service.ts\` (UTP-MATURITY-003):
  takes a list of GoalCandidates (from \`GoalFieldService\`) and a
  MaturityVerdict, returns the subset appropriate for the stage. Example:
  validation stage filters out scale-related goals; otimização stage
  filters out bootstrap goals.
- \`backend/src/kloel/maturity/maturity.transition-detector.ts\` (UTP-MATURITY-004):
  given a sequence of historical verdicts, detect transitions and report
  fromStage/toStage/observedAt.
- \`backend/src/kloel/maturity/maturity.guard.ts\` (UTP-MATURITY-005):
  pure function refuse(goal, verdict): { ok: boolean, reason?: string }
  that blocks recommendation of wrong-phase goals (ex: blocking a
  scale-only suggestion in validation stage).
- \`backend/src/kloel/maturity/maturity.spec.ts\`: covers all 5 UTPs with
  synthetic fixtures. >= 12 tests.
- \`backend/src/kloel/maturity/maturity.module.ts\` and AppModule wiring.

## VALIDATION

\`\`\`sh
node scripts/pci/validate.mjs --strict
cd backend && npx tsc --noEmit
cd backend && npx jest --testPathPatterns='kloel/maturity/' --no-coverage
\`\`\`

## EDITABLE SET

- \`backend/src/kloel/maturity/**\`
- \`backend/src/app.module.ts\` (additive import only)
`,
  },
  {
    id: 'UTP-TRUST',
    title: 'Trust Capital Protection (Camada IX)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-TRUST-001..008

Implements Camada IX. Per-conversation trust state with fatigue,
desperation, timing appropriateness, brand-protection, silence-as-action,
human-handoff trigger, recovery tactics.

## DELIVERABLE

Create:

- \`backend/src/kloel/trust/trust.types.ts\`: TrustState (trustScore [0..1],
  fatigueLevel, desperationLevel, lastInteractionAt,
  silentInteractionsCount, brandRiskFlags).
- \`backend/src/kloel/trust/trust-state-tracker.service.ts\` (TRUST-001):
  trackConversation(workspaceId, conversationRef, recentEvents) → TrustState.
- \`backend/src/kloel/trust/fatigue-detector.ts\` (TRUST-002):
  detects > N replies in M minutes from us OR repeated objections.
- \`backend/src/kloel/trust/desperation-detector.ts\` (TRUST-003):
  detects discount escalation or promise inflation in our outbound.
- \`backend/src/kloel/trust/timing-appropriateness.ts\` (TRUST-004):
  evaluates whether the next message is appropriate given local hour
  and user's typical reply window.
- \`backend/src/kloel/trust/brand-protection.guard.ts\` (TRUST-005):
  pure function evaluating an outbound draft for brand-risk patterns
  (false promises, complaint triggers).
- \`backend/src/kloel/trust/silence-as-action.policy.ts\` (TRUST-006):
  pure function deciding whether to remain silent based on TrustState.
- \`backend/src/kloel/trust/human-handoff.trigger.ts\` (TRUST-007):
  decides when to handoff (returns reason).
- \`backend/src/kloel/trust/trust-recovery.tactics.ts\` (TRUST-008):
  proposes a recovery action when trustScore drops.
- \`backend/src/kloel/trust/trust.spec.ts\`: >= 14 tests.
- \`backend/src/kloel/trust/trust.module.ts\` + AppModule wiring.

## VALIDATION

\`\`\`sh
node scripts/pci/validate.mjs --strict
cd backend && npx tsc --noEmit
cd backend && npx jest --testPathPatterns='kloel/trust/' --no-coverage
\`\`\`

## EDITABLE SET

- \`backend/src/kloel/trust/**\`
- \`backend/src/app.module.ts\` (additive import only)
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
process.stderr.write(`wrote ${outPath} — ${tasks.length} tasks, conc=${manifest.concurrency}, stagger=${manifest.staggerMs}ms\n`);
process.stdout.write(JSON.stringify({ runId, manifest: outPath, taskCount: tasks.length }) + '\n');
