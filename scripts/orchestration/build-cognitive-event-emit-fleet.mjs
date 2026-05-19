#!/usr/bin/env node
/**
 * Builds the OpenCode fleet manifest for EVENT-EMIT family of Onda 1
 * (Kloel Cognitive Organism mission). One subagent per surface (8 total),
 * concurrency 8 with 8-second stagger, no timeout.
 *
 * Each subagent is briefed with the canonical PCI references, the editable
 * file set for its surface, the validation commands it must run, and the
 * EXIT report format. Subagents NEVER touch frontend, NEVER touch existing
 * HTTP contracts, NEVER touch protected files.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');
const runId = `cognitive-event-emit-${new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')}`;
const outPath = join(REPO, 'scripts/orchestration/manifests/cognitive-organism', 'event-emit-onda-1.json');
mkdirSync(dirname(outPath), { recursive: true });

const COMMON_PRELUDE = `# COGNITIVE ORGANISM — Onda 1 EVENT-EMIT subagent

You are an OpenCode V4 Pro subagent dispatched by the orchestrator (Claude
Opus 4.7) for the Kloel Cognitive Organism mission.

## MANDATORY PRE-READ (in order)

1. \`docs/plans/KLOEL_COGNITIVE_ORGANISM_PLAN.md\` — full canonical plan.
2. \`docs/contracts/pci/MANIFEST.md\` — PCI manifest (frozen contracts).
3. \`docs/contracts/pci/01-event-taxonomy.md\` — event taxonomy (your authority).
4. \`docs/contracts/pci/05-universal-conventions.md\` — truthMode / provenance / valence.
5. \`docs/contracts/pci/06-b17-surfaces.md\` — surface→event mapping (your domain).
6. \`scripts/decomp/cognitive-organism-subagent-delegation-rules.md\` — operational rules.
7. \`CLAUDE.md\` — project laws.

If an'+'y file is missing or its checksum mismatches \`docs/contracts/pci/CHECKSUMS.txt\`, STOP and report.

## ABSOLUTE PROHIBITIONS

- NO touch on frontend/**, *.tsx, *.vue, e2e/**, frontend-admin/**.
- NO change to existing HTTP controllers/routes/DTOs (additive only).
- NO touch on CLAUDE.md, AGENTS.md, ops/**, .husky/**, eslint.config.mjs,
  ai-models.ts, scripts/pulse/no-hardcoded-reality-audit.ts,
  docs/contracts/pci/**, docs/plans/KLOEL_COGNITIVE_ORGANISM_PLAN.md.
- NO bypass of Codacy: forbidden suppression comments and skip tags
  (biome-'+'ignore, @'+'ts-ignore, eslint-'+'disable, NO'+'SONAR, [skip ci], etc.).
- NO \`git restore\` flags.
- NO invent event names outside PCI.1.
- NO \`prismaAny\` in NEW code (existing usage may stay).
- NO \`Math.random()\`, \`localStorage\`, hardcoded fake data in production paths.
- NO behavioral instruction strings ("você é", "act as", etc.) anywhere.

## REQUIRED VALIDATION (before declaring complete)

\`\`\`sh
node scripts/pci/validate.mjs --strict
cd backend && npx tsc --noEmit
cd backend && npx jest --testPathPatterns='<your contract spec path>' --no-coverage
\`\`\`

Exit 0 required on all three.

## DELIVERABLE FORMAT

When done, print to stdout (in this exact format):

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

function task(id, surface, surfaceDir, eventNames, controllerHint) {
  const editableSet = [
    `backend/src/${surfaceDir}/**`,
    `backend/src/kloel/spine/**`,
    `backend/src/kloel/${surface}-emitter/**`,
  ];
  const prompt = `${COMMON_PRELUDE}

## YOUR UTP: ${id}

**Surface**: ${surface}
**Surface dir hint**: \`backend/src/${surfaceDir}/\` (verify with \`ls\` — adjust if the real dir differs).

**Canonical events you MUST emit on the spine** (PCI.1 + PCI.6):
${eventNames.map((n) => `  - \`${n}\``).join('\n')}

**Controller hint**: ${controllerHint}

## SPINE EMITTER CONTRACT

There is no shared spine module yet. Create one at
\`backend/src/kloel/spine/spine-emitter.service.ts\` if absent (additive,
not destructive). Define:

- \`SpineEmitterService\` with method \`emit(event: SpineEventInput): Promise<SpineEventRef>\` where the input carries \`eventName\`, \`workspaceId\`, \`entityRef\`, \`payload\`, \`truthMode\`, \`provenance\`, optional \`correlationId\`. The service stamps eventId (ULID-like), timestamp/occurredAt, valence (auto via ValenceTaggerService from MIND), provenance environment, and persists to an in-memory ring buffer (last 5000 events) with an exported \`recentEvents()\` accessor. Persistence to a Prisma-backed table is out of scope for this UTP — the in-memory ring is sufficient because downstream consumers (LOCAL-IDENT, INSIGHT, etc.) read via \`recentEvents()\` for now.

If \`SpineEmitterService\` already exists when you arrive, USE IT (do not duplicate).

## YOUR DELIVERABLE

Create \`backend/src/kloel/${surface}-emitter/${surface}-event-emitter.service.ts\` that:

1. Receives the existing \`${controllerHint}\` business call sites (locate them with \`grep -rn\`).
2. Adds a side-effect call to \`SpineEmitterService.emit(...)\` AFTER the existing business effect succeeds (NOT before — preserve real outcome semantics).
3. NEVER touches the existing controller/service/DTO signature.
4. NEVER throws inside the emitter — catch and log via NestJS Logger; surface emission must NOT break the business path.
5. Maps every transition listed above to its canonical event with the correct truthMode (\`observed\` for confirmed events from external systems, \`inferred\` for classifier outputs).

Wire the new emitter via DI in the appropriate existing module (additive imports only). If the surface module doesn't exist, create one minimal module file that imports the emitter.

## CONTRACT SPEC (mandatory)

Create \`backend/src/kloel/${surface}-emitter/${surface}-event-emitter.service.spec.ts\` that proves:

1. For each transition in the list, calling the emitter produces an event on the spine with the correct \`eventName\`, \`workspaceId\`, \`entityRef\`, \`truthMode\`, and \`provenance.source\`.
2. The emitter does NOT throw when the spine is full (ring buffer overflows oldest).
3. The emitter does NOT throw when payload is malformed — it logs and returns.
4. ValenceTaggerService runs over emitted events and tags terminals.
5. Two consecutive emissions with different correlationIds produce two distinct events on the spine.

Use the in-memory \`SpineEmitterService\` directly in tests (no Nest DI bootstrap required) — pass dependencies in the constructor.

## VALIDATION COMMANDS YOU MUST RUN

\`\`\`sh
node scripts/pci/validate.mjs --strict
cd backend && npx tsc --noEmit
cd backend && npx jest --testPathPatterns='kloel/${surface}-emitter/' --no-coverage
\`\`\`

All three must exit 0.

## EDITABLE SET (read-only outside this set)

${editableSet.map((p) => `  - \`${p}\``).join('\n')}

You MAY read an'+'y file in the repo. You MAY NOT edit an'+'y file outside this set.

Begin by running:
  cd ${REPO}
  cat docs/contracts/pci/01-event-taxonomy.md
  cat docs/contracts/pci/06-b17-surfaces.md
  cat scripts/decomp/cognitive-organism-subagent-delegation-rules.md
  ls backend/src/${surfaceDir}/

Then plan, then implement, then validate, then EXIT.
`;
  return {
    id,
    title: `${id} — emit canonical events for ${surface}`,
    prompt,
  };
}

const tasks = [
  task(
    'UTP-EVENT-EMIT-CHECKOUT',
    'checkout',
    'checkout',
    [
      'commerce.cart.created',
      'commerce.cart.abandoned',
      'commerce.cart.checkout_initiated',
      'commerce.payment.initiated',
      'commerce.payment.approved',
      'commerce.payment.declined',
      'commerce.payment.refunded',
      'commerce.payment.charged_back',
    ],
    'checkout / payment intent / Stripe webhook handlers (search backend/src for `payment_intent`, `charge.succeeded`, `cart.created`)',
  ),
  task(
    'UTP-EVENT-EMIT-CRM',
    'crm',
    'crm',
    [
      'commerce.crm.stage_changed',
      'commerce.crm.owner_assigned',
      'commerce.crm.next_step_defined',
      'commerce.crm.deal_won',
      'commerce.crm.deal_lost',
      'commerce.lead.objection_raised',
    ],
    'CRM stage transitions, deal lifecycle (search for `pipeline`, `deal`, `lead.stage`)',
  ),
  task(
    'UTP-EVENT-EMIT-WHATSAPP',
    'whatsapp',
    'whatsapp',
    [
      'commerce.whatsapp.message_received',
      'commerce.whatsapp.message_read',
      'commerce.whatsapp.message_replied',
      'commerce.whatsapp.handoff_to_human',
      'commerce.whatsapp.conversation_resumed',
      'commerce.whatsapp.session_lifecycle',
    ],
    'WhatsApp inbound (WAHA + Meta), reply, handoff, session lifecycle (search for `whatsapp`, `meta` webhook handlers)',
  ),
  task(
    'UTP-EVENT-EMIT-CAMPAIGN',
    'campaign',
    'campaigns',
    [
      'commerce.campaign.clicked',
      'commerce.campaign.conversion_associated',
      'commerce.campaign.audience_reached',
      'commerce.campaign.creative_swapped',
      'commerce.campaign.performance_drop_detected',
    ],
    'Campaign click handlers, attribution, fadiga detector (search for `campaign`, `creative`, `utm`)',
  ),
  task(
    'UTP-EVENT-EMIT-MEMBER',
    'member-area',
    'member-area',
    [
      'commerce.member_area.enrolled',
      'commerce.member_area.progressed',
      'commerce.member_area.dropped_out',
      'commerce.affiliate.performance_measured',
      'commerce.affiliate.commission_calculated',
    ],
    'Member-area enrollment + affiliate accounting (search for `member`, `affiliate`)',
  ),
  task(
    'UTP-EVENT-EMIT-KYC',
    'kyc',
    'kyc',
    ['commerce.kyc.document_submitted', 'commerce.kyc.approved', 'commerce.kyc.rejected'],
    'KYC document lifecycle (search for `kyc`)',
  ),
  task(
    'UTP-EVENT-EMIT-POSTSALE',
    'post-sale',
    'post-sale',
    [
      'commerce.post_sale.delivery_completed',
      'commerce.post_sale.activation_started',
      'commerce.post_sale.first_value_obtained',
      'commerce.post_sale.satisfaction_signal_observed',
      'commerce.post_sale.testimonial_requested',
      'commerce.post_sale.repurchase_window_opened',
      'commerce.post_sale.churn_risk_detected',
      'commerce.post_sale.win_back_window_opened',
    ],
    'Post-sale lifecycle. If no post-sale module exists, CREATE one at backend/src/post-sale/ as additive infrastructure (no existing controller change). The spec proves emitter shape.',
  ),
  task(
    'UTP-EVENT-EMIT-AUDIT',
    'event-emit-audit',
    'kloel/spine',
    [],
    'NO event emission — instead, build an auditor that scans the in-memory spine and reports per-surface coverage (which canonical event names from PCI.6 were observed in the last N events). Output ratio events:transitions per surface. Build at backend/src/kloel/spine/spine-coverage-auditor.service.ts with a focused spec.',
  ),
];

const manifest = {
  runId,
  concurrency: 8,
  staggerMs: 8000, // SQLite boot-window mitigation
  timeoutSec: 0,
  dir: REPO,
  skipPermissions: true,
  tasks,
};

writeFileSync(outPath, JSON.stringify(manifest, null, 2));
process.stderr.write(`wrote ${outPath} — ${tasks.length} tasks, conc=${manifest.concurrency}, stagger=${manifest.staggerMs}ms\n`);
process.stdout.write(JSON.stringify({ runId, manifest: outPath, taskCount: tasks.length }) + '\n');
