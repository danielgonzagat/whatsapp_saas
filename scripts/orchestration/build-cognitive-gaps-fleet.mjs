#!/usr/bin/env node
/**
 * Build manifest for the 8 production-readiness gaps identified in the
 * cognitive organism audit. Each subagent owns one gap.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');
const runId = `cognitive-gaps-${new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')}`;
const outPath = join(REPO, 'scripts/orchestration/manifests/cognitive-organism', 'production-gaps.json');
mkdirSync(dirname(outPath), { recursive: true });
const PRELUDE = `# COGNITIVE ORGANISM — production-readiness gap subagent
OpenCode V4 Pro subagent. Read PCI + plan + delegation rules + CLAUDE.md FIRST.
## MANDATORY PRE-READ
1. \`docs/plans/KLOEL_COGNITIVE_ORGANISM_PLAN.md\` (the 100%-pronto criteria — Parte 4)
2. \`docs/contracts/pci/MANIFEST.md\` + all 6 PCI files
3. \`scripts/decomp/cognitive-organism-subagent-delegation-rules.md\`
4. \`backend/src/kloel/lineage/lineage-ledger.service.ts\`
5. \`backend/src/kloel/spine/spine-emitter.service.ts\`
6. \`backend/src/kloel/abi/abi-builder.service.ts\`
7. \`backend/src/kloel/mind/mind-bg.processor.ts\` + \`multi-timescale.coordinator.ts\`
8. \`backend/src/kloel/pulse-gates/gate-mode-controller.ts\`
9. \`CLAUDE.md\`
## ABSOLUTE PROHIBITIONS
- NO touch on frontend, *.tsx, e2e, frontend-admin, protected files
  (CLAUDE.md, AGENTS.md, ops/, husky, eslint, ai-models.ts, PULSE auditor,
  docs/contracts/pci/, docs/plans/KLOEL_COGNITIVE_ORGANISM_PLAN.md,
  scripts/decomp/cognitive-organism-subagent-delegation-rules.md).
- NO change to existing HTTP controller signatures (additive only).
- NO suppression / skip / TypeScript ignore comments / static-analysis suppressions / git restore.
- NO new event names outside PCI.1.
- NO \`prismaAny\` in NEW code.
- NO behavioral instruction strings.
## REQUIRED VALIDATION
\`\`\`sh
node scripts/pci/validate.mjs --strict
cd backend && npx tsc --noEmit
cd backend && npx jest --testPathPatterns='<your contract spec>' --no-coverage
\`\`\`
Exit 0 required on the relevant test path. The repo has pre-existing TS
errors in agent-runtime/ and kloel-chat-tools — leave those alone unless
the gap explicitly says to address them.
## DELIVERABLE FORMAT
\`\`\`
EXIT <utp-id>
files_added: [...]
files_modified: [...]
validation: { pci_validate, tsc, contract_spec(N) }
\`\`\`
`;
const tasks = [
  {
    id: 'UTP-GAP-GENESIS-BOOTSTRAP',
    title: 'Wire Genesis bootstrap into OnModuleInit',
    prompt: `${PRELUDE}
## YOUR UTP: gap A — Genesis bootstrap wiring
Genesis Event is not emitted on app boot. \`LineageLedgerService.bootstrapGenesis()\`
exists but no module calls it. Wire it via NestJS lifecycle hook so that
on every app start, if the ledger is empty, the canonical Genesis Event
is appended as entry 1.
## DELIVERABLE
1. Modify \`backend/src/kloel/lineage/lineage.module.ts\` to implement
   \`OnModuleInit\` (Nest lifecycle) that calls
   \`LineageLedgerService.bootstrapGenesis()\` lazily. Use \`forwardRef\`
   if there's a circular dep. Idempotent — multiple inits should not
   create duplicates.
2. Add \`backend/src/kloel/lineage/lineage-bootstrap.spec.ts\` that:
   - Bootstraps an app context with InMemoryLineageLedgerRepository
   - Verifies onModuleInit creates entry 1 with canonical Genesis
   - Verifies a second module init does NOT duplicate (idempotent)
   - Verifies the LineageGuardService reports 'intact' immediately after boot
3. Validation:
   - \`node scripts/pci/validate.mjs --strict\` exits 0
   - \`cd backend && npx tsc --noEmit\` no new errors in lineage/
   - \`cd backend && npx jest --testPathPatterns='kloel/lineage/lineage-bootstrap' --no-coverage\` passes
EDITABLE SET:
- \`backend/src/kloel/lineage/lineage.module.ts\`
- \`backend/src/kloel/lineage/lineage-bootstrap.spec.ts\` (new)
DO NOT touch files outside the assigned set.
## ROLLBACK
Single revert of this commit restores pre-bootstrap state. Lineage
Ledger remains empty until first event arrives via other path.
`,
  },
  {
    id: 'UTP-GAP-MIND-BULLMQ',
    title: 'Wire MIND BG processor to BullMQ cron',
    prompt: `${PRELUDE}
## YOUR UTP: gap B — MIND BG processor on BullMQ schedule (B8)
The plan requires "Background activity contínua sem trigger externo"
(B8 + V4). The pure tick function exists at
\`backend/src/kloel/mind/mind-bg.processor.ts\` but is not wired to a
scheduler. Wire it via BullMQ + cron so it runs at the configured
timescales (immediate/short/medium/long).
## DELIVERABLE
1. Read \`backend/package.json\` to confirm \`bullmq\` and
   \`@nestjs/bullmq\` are available — they should be (this repo uses
   BullMQ extensively in worker/).
2. Add \`backend/src/kloel/mind/mind-bg.scheduler.ts\` — a NestJS
   \`@Injectable()\` service with:
   - \`OnModuleInit\` that registers a recurring BullMQ job at the
     "short" timescale interval (5s default from
     MultiTimescaleCoordinator).
   - The job calls \`MindBackgroundProcessor.tick({ now, recentEvents:
     spine.recentEventsAsRef(500), workingMemory: [] })\` — wire the
     SpineEmitterService dependency. Working memory empty is OK for now;
     real working-memory wiring is a separate UTP.
   - Adds an env flag \`KLOEL_MIND_BG_ENABLED\` defaulting to
     \`process.env.NODE_ENV !== 'test'\` so jest doesn't fire the loop.
3. Add the scheduler as a provider in \`mind.module.ts\` (additive).
4. Create \`backend/src/kloel/mind/mind-bg.scheduler.spec.ts\` that:
   - Disables BullMQ via the env flag and asserts no job runs.
   - With a mocked BullMQ \`Queue\`, verifies the recurring job is
     registered with the right pattern on init.
5. Validation:
   - \`cd backend && npx tsc --noEmit\` clean for mind/
   - \`cd backend && npx jest --testPathPatterns='kloel/mind/mind-bg.scheduler' --no-coverage\` passes
EDITABLE SET:
- \`backend/src/kloel/mind/mind-bg.scheduler.ts\` (new)
- \`backend/src/kloel/mind/mind-bg.scheduler.spec.ts\` (new)
- \`backend/src/kloel/mind/mind.module.ts\` (additive provider only)
DO NOT touch worker/ or other modules.
## ROLLBACK
Single revert removes scheduler. Pure tick function in
mind-bg.processor.ts continues to be callable manually.
`,
  },
  {
    id: 'UTP-GAP-PULSE-EMITTER',
    title: 'Wire PULSE gates to emit pulse.gate_passed / pulse.gate_failed events',
    prompt: `${PRELUDE}
## YOUR UTP: gap — Spine emission of PULSE gate verdicts
PULSE gates run as pure functions but their verdicts are never written
to the spine. Per PCI.1 §3.14, every gate run should produce a
\`pulse.gate_passed\` or \`pulse.gate_failed\` event.
## DELIVERABLE
1. Add \`backend/src/kloel/pulse-gates/pulse-spine.bridge.ts\` —
   \`@Injectable()\` service:
   - Method: \`recordVerdict(verdict: GateVerdict, opts?: { workspaceId?, correlationId? }): Promise<void>\`
   - Emits via \`SpineEmitterService\` a \`pulse.gate_passed\` or
     \`pulse.gate_failed\` event with truthMode='observed',
     provenance={ source: 'production', processor: 'pulse-spine-bridge',
     processorVersion: '1.0.0', schemaVersion: '1.0.0' }.
   - Payload includes gateName, mode, reason, evidence.
2. Add \`backend/src/kloel/pulse-gates/pulse-spine.bridge.spec.ts\`:
   - Verifies gate PASS → pulse.gate_passed event on spine
   - Verifies gate FAIL → pulse.gate_failed event with reason
   - Verifies workspaceId and correlationId propagation
3. Wire the bridge as a provider in a new
   \`backend/src/kloel/pulse-gates/pulse-gates.module.ts\` that imports
   SpineModule. Export the bridge.
4. Validation: tsc + jest \`kloel/pulse-gates/\` clean.
EDITABLE SET:
- \`backend/src/kloel/pulse-gates/pulse-spine.bridge.ts\` (new)
- \`backend/src/kloel/pulse-gates/pulse-spine.bridge.spec.ts\` (new)
- \`backend/src/kloel/pulse-gates/pulse-gates.module.ts\` (new)
- \`backend/src/app.module.ts\` (additive import of PulseGatesModule)
`,
  },
  {
    id: 'UTP-GAP-V-TIER-CERTIFIER',
    title: 'Build V-tier certifier endpoint',
    prompt: `${PRELUDE}
## YOUR UTP: gap — V-tier certifier
Per Parte 4 V1..V16, the plan requires runtime verification of 16 V-tier
criteria. Build a certifier service that reads runtime state and
produces a structured verdict for each V1..V16.
## DELIVERABLE
1. \`backend/src/kloel/v-tier/v-tier.types.ts\`: VerificationVerdict {
   criterionId, status: 'PASS'|'FAIL'|'INSUFFICIENT_EVIDENCE', evidence,
   measuredAt }.
2. \`backend/src/kloel/v-tier/v-tier-certifier.service.ts\`:
   - \`@Injectable()\` service that consumes SpineEmitterService,
     LineageGuardService, AbiBuilderService, ValenceTaggerService,
     HebbianService, and the gate-mode-controller.
   - Method: \`certify(): Promise<{ overall: 'PASS'|'PARTIAL'|'FAIL',
     verdicts: VerificationVerdict[] }>\` that runs each of V1..V16:
       * V1 (no behavioral instruction): grep kloel.prompts.ts +
         kloel.prompts.helpers.ts for forbidden patterns. Pre-Onda 9 cutover
         expects only the canonical fallback string.
       * V2 (ABI is only structural message): assert AbiBuilderService
         outputs match validateAbiPayload.
       * V3 (event spine ratio ≥1:1): compute events/operations from
         spine.recentEvents() — INSUFFICIENT_EVIDENCE if buffer <100.
       * V4 (BG activity contínua): check MindBgScheduler is registered.
       * V5 (valence coverage ≥80% terminals): scan
         spine.recentEventsAsRef() with ValenceTaggerService.coverage().
       * V6 (Hebbian non-uniform): check HebbianService.top()[0]?.weight
         > 0.
       * V7 (PULSE certifies): run all canonical gates; PASS if all PASS.
       * V8 (component-auditable): always PASS (architectural property).
       * V9 (Genesis verifiable+immutable): run
         verifyGenesisEvent(GENESIS_EVENT).
       * V10 (Identity Projector audience isolation): smoke-test the 4
         audiences; assert public never contains 'kléos'.
       * V11 (Dynamic Goal Field operacional): check
         GoalFieldService.registeredDetectors().length>=29.
       * V12 (machine + human auditable): always PASS.
       * V13 (Workspace Local Identity ativa): INSUFFICIENT_EVIDENCE
         when no workspaces meet volume threshold.
       * V14 (Goal Field commercial dominance ≥50%): check last
         GoalFieldService.runCycle() result — INSUFFICIENT_EVIDENCE
         until shadow mode collected >20 cycles.
       * V15 (dissolução verificável): check spine.recentEvents()
         contains events from each of the 7 B17 surfaces.
       * V16 (remoção degrada cognição): always PASS (architectural).
3. \`backend/src/kloel/v-tier/v-tier-certifier.service.spec.ts\` (>= 16
   tests, one per V criterion, using fixtures).
4. \`backend/src/kloel/v-tier/v-tier.module.ts\` + AppModule wiring.
EDITABLE SET:
- \`backend/src/kloel/v-tier/**\`
- \`backend/src/app.module.ts\` (additive)
`,
  },
  {
    id: 'UTP-GAP-CAPABILITY-REGISTRY',
    title: 'Capability Registry with runtime evidence',
    prompt: `${PRELUDE}
## YOUR UTP: gap — Capability registry feeding no-overclaim gate
The no-overclaim gate (PCI.4 §3.4) requires every available capability
to have \`runtimeEvidencePct > 0\`. The ABI builder currently hardcodes
1% for each provided capability. Build a real capability registry.
## DELIVERABLE
1. \`backend/src/kloel/capability-registry/capability-registry.types.ts\`:
   CapabilityRecord { id, maturity: 'developing'|'operational'|
   'productionReady', runtimeEvidencePct, lastInvokedAt, invokeCount,
   successCount, failureCount }.
2. \`backend/src/kloel/capability-registry/capability-registry.service.ts\`:
   - In-memory Map<string, CapabilityRecord>.
   - \`register(id)\`: registers a new capability at maturity='developing',
     runtimeEvidencePct=0.
   - \`recordInvocation(id, outcome: 'success'|'failure')\`: increments
     counters, recomputes runtimeEvidencePct as
     min(100, successCount + 0.5*failureCount).
   - \`promoteIfReady(id)\`: developing→operational if evidence>=5%;
     operational→productionReady if evidence>=20% AND last 3 ciclos
     non-regressive (use a simple counter for now).
   - \`snapshot()\`: returns all CapabilityRecords for ABI consumption.
3. \`backend/src/kloel/capability-registry/capability-registry.service.spec.ts\`:
   register/record/promote/snapshot all covered (>= 12 tests).
4. \`backend/src/kloel/capability-registry/capability-registry.module.ts\`
   + AppModule wiring.
EDITABLE SET:
- \`backend/src/kloel/capability-registry/**\`
- \`backend/src/app.module.ts\` (additive)
`,
  },
  {
    id: 'UTP-GAP-ABI-AB-TELEMETRY',
    title: 'ABI A/B telemetry for cutover decisions',
    prompt: `${PRELUDE}
## YOUR UTP: gap — A/B telemetry for ABI substitution decisions
UTP-ABI-005..009 cutovers are behind feature flags. Per E.14, baseline
+ A/B is required before promotion. Build a telemetry collector that
records both legacy and ABI paths and computes deltas.
## DELIVERABLE
1. \`backend/src/kloel/abi-ab/abi-ab.types.ts\`: AbExperimentSample {
   sampleId, flowName, abiUsed: boolean, latencyMs, success: boolean,
   collectedAt, workspaceId? }.
2. \`backend/src/kloel/abi-ab/abi-ab-telemetry.service.ts\`:
   - \`record(sample)\`: appends to in-memory buffer (cap 10000).
   - \`reportDelta(flowName)\`: computes ABI vs legacy success rate and
     latency p50/p95 over the buffer.
   - \`shouldRollback(flowName, opts?)\`: returns true if ABI success
     rate is >5% below legacy OR latency p95 is >2× legacy.
3. Spec: covers all three methods (>= 10 tests).
4. Module + AppModule wiring.
EDITABLE SET:
- \`backend/src/kloel/abi-ab/**\`
- \`backend/src/app.module.ts\` (additive)
`,
  },
  {
    id: 'UTP-GAP-DASHBOARD-DAILY',
    title: 'Daily Commercial Worker Dashboard endpoint',
    prompt: `${PRELUDE}
## YOUR UTP: gap R6 — Dashboard de Trabalhador Comercial Diário operacional
R6 requires "Dashboard de Trabalhador Comercial Diário operacional". Build
a read-only service that aggregates today's state into a dashboard payload.
## DELIVERABLE
1. \`backend/src/kloel/daily-dashboard/daily-dashboard.types.ts\`:
   DailyDashboard { workspaceId, generatedAt, hotLeadsWithoutResponse,
   abandonedCarts, leadsAwaitingFollowup, dealsAtRisk,
   topThreeOpportunities, suggestedActions[], commercialMood }.
2. \`backend/src/kloel/daily-dashboard/daily-dashboard.service.ts\`:
   - Consumes SpineEmitterService (recent events),
     GoalFieldService.runCycle() for top opportunities,
     ValenceAggregatorService for commercial mood,
     AttentionService for top entities.
   - \`generate(workspaceId): Promise<DailyDashboard>\` composes the
     payload over the last 24h of events.
   - PURE: no LLM call, no behavioral instruction.
3. Spec: covers empty/few/many events shapes (>= 10 tests).
4. Module + AppModule wiring.
EDITABLE SET:
- \`backend/src/kloel/daily-dashboard/**\`
- \`backend/src/app.module.ts\` (additive)
`,
  },
  {
    id: 'UTP-GAP-PCI-WHATSAPP-TERMINALS',
    title: 'Per-channel terminal valence policy + truthMode contract',
    prompt: `${PRELUDE}
## YOUR UTP: gap — formalize per-channel terminal valence policy
Previous hardening added whatsapp.message_received as terminal with
neutral valence. This should be a configurable policy, not a hardcoded
list. Build a per-channel terminal policy + truthMode contract module.
## DELIVERABLE
1. \`backend/src/kloel/channel-policy/channel-policy.types.ts\`:
   ChannelTerminalPolicy { channelName, terminalEventNames: string[],
   defaultValenceByName: Record<string, AbiValence>,
   defaultTruthModeByName: Record<string, AbiTruthMode> }.
2. \`backend/src/kloel/channel-policy/channel-policy.registry.ts\`:
   - Built-in policies for: whatsapp, web, email, ads.
   - \`get(channelName)\`: returns policy or undefined.
   - \`applyTo(event)\`: if event matches a policy entry and has no
     explicit valence/truthMode, fills the defaults.
3. Spec (>= 12 tests).
4. Module + AppModule wiring.
EDITABLE SET:
- \`backend/src/kloel/channel-policy/**\`
- \`backend/src/app.module.ts\` (additive)
`,
  },
];
const manifest = {
  runId,
  concurrency: 8,
  staggerMs: 8000,
  timeoutSec: 0,
  dir: REPO,
  skipPermissions: true,
  tasks,
};
writeFileSync(outPath, JSON.stringify(manifest, null, 2));
process.stderr.write(`wrote ${outPath} — ${tasks.length} tasks, conc=${manifest.concurrency}\n`);
process.stdout.write(JSON.stringify({ runId, manifest: outPath, taskCount: tasks.length }) + '\n');
