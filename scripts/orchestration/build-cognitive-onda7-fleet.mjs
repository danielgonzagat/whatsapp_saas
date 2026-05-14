#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');
const runId = `cognitive-onda7-${new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')}`;
const outPath = join(REPO, 'scripts/orchestration/manifests/cognitive-organism', 'onda-7-roles.json');
mkdirSync(dirname(outPath), { recursive: true });

const PRELUDE = `# COGNITIVE ORGANISM — Onda 7 subagent

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
    id: 'UTP-ROLE',
    title: 'Role-Aware Commercial Intelligence (Camada XXIII)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-ROLE-001..008
Reconhece papel econômico real do dono (produtor/afiliado/agência/gestor/closer/creator/especialista).

## DELIVERABLE \`backend/src/kloel/role/\`:
- types.ts: Role enum, RoleDetection, LeverageMap, RoleMetric, RecommendationGuardResult, MultiHatProfile.
- role.detector.ts (ROLE-001): detects role from spine usage.
- role-context.projector.ts (ROLE-002): projects roleContext into ABI.
- leverage-map.service.ts (ROLE-003): maps real levers per role.
- role-metric.registry.ts (ROLE-004): per-role relevant metrics.
- recommendation-guard.ts (ROLE-005): blocks suggestions outside role's control radius.
- multi-hat.service.ts (ROLE-006): supports multi-role workspaces.
- aware-hierarchy.extender.ts (ROLE-007): role-aware AGORA hierarchy (extends Camada XXII clarity).
- aware-wisdom.extender.ts (ROLE-008): role-filtered wisdom (extends Camada VI).
- role.module.ts + role.spec.ts (>= 14 tests).
EDITABLE SET: \`backend/src/kloel/role/**\`, \`backend/src/app.module.ts\` (additive).
`,
  },
  {
    id: 'UTP-AFFIL',
    title: 'Affiliate Intelligence (Camada XXIV)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-AFFIL-001..012
Caçador de oportunidade + protetor de verba e conta para afiliados.

## DELIVERABLE \`backend/src/kloel/affil/\`:
- types.ts: OfferQuality, ProducerTrust, AudienceFit, AngleSuggestion, AngleFatigue, TrafficWaste, BudgetProtection, AccountProtection, CommissionComparison, OfferSwitch, ScaleVsAbandon, DiscoveryLoop.
- offer-quality.scorer.ts (AFFIL-001).
- producer-trust.scorer.ts (AFFIL-002).
- audience-fit.detector.ts (AFFIL-003).
- angle.suggester.ts (AFFIL-004).
- angle-fatigue.detector.ts (AFFIL-005).
- traffic-waste.detector.ts (AFFIL-006).
- budget.protection.ts (AFFIL-007).
- account.protection.ts (AFFIL-008).
- commission.comparator.ts (AFFIL-009).
- offer-switch.suggester.ts (AFFIL-010).
- scale-vs-abandon.advisor.ts (AFFIL-011).
- affil-discovery.loop.ts (AFFIL-012): integrates Camada XX hypproof.
- affil.module.ts + affil.spec.ts (>= 18 tests).
EDITABLE SET: \`backend/src/kloel/affil/**\`, \`backend/src/app.module.ts\` (additive).
`,
  },
  {
    id: 'UTP-AGENCY',
    title: 'Agency Intelligence (Camada XXV)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-AGENCY-001..008
Operar múltiplos clientes sem perder contexto, margem ou prioridade.

## DELIVERABLE \`backend/src/kloel/agency/\`:
- types.ts: PortfolioState, ClientContextBundle, PriorityRanking, MarginPerClient, ChurnRiskPerClient, TeamLoadBalance, InternalKnowledgeLeak, HandoffPackage.
- portfolio-state.service.ts (AGENCY-001).
- per-client-context.bundler.ts (AGENCY-002).
- priority.ranker.ts (AGENCY-003).
- margin-per-client.tracker.ts (AGENCY-004).
- churn-risk-per-client.detector.ts (AGENCY-005).
- team-load-balancer.ts (AGENCY-006).
- internal-knowledge-leak.guard.ts (AGENCY-007): zero leak between clients.
- handoff.service.ts (AGENCY-008).
- agency.module.ts + agency.spec.ts (>= 14 tests).
EDITABLE SET: \`backend/src/kloel/agency/**\`, \`backend/src/app.module.ts\` (additive).
`,
  },
  {
    id: 'UTP-CREATOR',
    title: 'Creator Intelligence (Camada XXVI)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-CREATOR-001..006
Monetizar audiência sem destruir relação.

## DELIVERABLE \`backend/src/kloel/creator/\`:
- types.ts: AudiencePartnerFit, MentionTiming, AudienceSaturation, AuthenticityProtection, EngagementVsConversion, CreatorTrustCapital.
- audience-partner-fit.detector.ts (CREATOR-001).
- mention-timing.advisor.ts (CREATOR-002).
- audience-saturation.detector.ts (CREATOR-003).
- authenticity.protector.ts (CREATOR-004).
- engagement-vs-conversion.tracker.ts (CREATOR-005).
- creator-trust-capital.tracker.ts (CREATOR-006): extends Camada IX trust.
- creator.module.ts + creator.spec.ts (>= 12 tests).
EDITABLE SET: \`backend/src/kloel/creator/**\`, \`backend/src/app.module.ts\` (additive).
`,
  },
  {
    id: 'UTP-CHANNEL',
    title: 'Channel Survival (Camada XXVIII)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-CHANNEL-001..008
Não morrer quando canal cai.

## DELIVERABLE \`backend/src/kloel/channel/\`:
- types.ts: ChannelConcentration, ChannelHealth, BanRisk, PolicyChange, ContingencyPlan, OwnedAudience, MigrationPlan, DiversificationRecommendation.
- concentration.detector.ts (CHANNEL-001).
- health.monitor.ts (CHANNEL-002).
- ban-risk.detector.ts (CHANNEL-003).
- policy-change.watcher.ts (CHANNEL-004).
- contingency-plan.builder.ts (CHANNEL-005).
- owned-audience.pusher.ts (CHANNEL-006).
- migration.orchestrator.ts (CHANNEL-007).
- diversification.recommender.ts (CHANNEL-008).
- channel.module.ts + channel.spec.ts (>= 14 tests).
EDITABLE SET: \`backend/src/kloel/channel/**\`, \`backend/src/app.module.ts\` (additive).
`,
  },
  {
    id: 'UTP-CASH',
    title: 'Cash as Oxygen (Camada XXIX)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-CASH-001..008
Caixa preservado como oxigênio.

## DELIVERABLE \`backend/src/kloel/cash/\`:
- types.ts: CashPosition, ReceivablesProjection, PayablesProjection, RunwayCalculation, RiskDetection, VolatilityTracking, ProtectiveAction, UnsafeOperationBlock.
- cash-position.tracker.ts (CASH-001): tracks position in 7/14/30 day windows.
- receivables.projector.ts (CASH-002).
- payables.projector.ts (CASH-003).
- runway.calculator.ts (CASH-004).
- risk.detector.ts (CASH-005): early warning.
- volatility.tracker.ts (CASH-006).
- protective-action.suggester.ts (CASH-007).
- unsafe-operation.blocker.ts (CASH-008).
- cash.module.ts + cash.spec.ts (>= 14 tests).
EDITABLE SET: \`backend/src/kloel/cash/**\`, \`backend/src/app.module.ts\` (additive).
`,
  },
];

const manifest = {
  runId,
  concurrency: 6,
  staggerMs: 8000,
  timeoutSec: 0,
  dir: REPO,
  skipPermissions: true,
  tasks,
};

writeFileSync(outPath, JSON.stringify(manifest, null, 2));
process.stderr.write(`wrote ${outPath} — ${tasks.length} tasks, conc=${manifest.concurrency}\n`);
process.stdout.write(JSON.stringify({ runId, manifest: outPath, taskCount: tasks.length }) + '\n');
