#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');
const runId = `cognitive-onda8-${new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')}`;
const outPath = join(REPO, 'scripts/orchestration/manifests/cognitive-organism', 'onda-8-ecosystem.json');
mkdirSync(dirname(outPath), { recursive: true });

const PRELUDE = `# COGNITIVE ORGANISM — Onda 8 subagent

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
    id: 'UTP-ECOSYS',
    title: 'Ecosystem Intelligence (Camada XXVII)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-ECOSYS-001..009
Oportunidades entre papéis com privacidade preservada.

## DELIVERABLE \`backend/src/kloel/ecosys/\`:
- types.ts: CrossRolePattern, RoleFitMatch, OpportunityRanking, EcosystemPrivacy, ConflictDetection, SuggestionDelivery.
- cross-role-pattern.detector.ts (ECOSYS-001).
- producer-affiliate.fit.ts (ECOSYS-002).
- affiliate-product.fit.ts (ECOSYS-003).
- creator-offer.fit.ts (ECOSYS-004).
- agency-seller.fit.ts (ECOSYS-005).
- opportunity.ranker.ts (ECOSYS-006).
- ecosystem-privacy.guard.ts (ECOSYS-007): no identifiable data crosses workspace.
- conflict.detector.ts (ECOSYS-008): conflict-of-interest detection.
- suggestion-delivery.service.ts (ECOSYS-009).
- ecosys.module.ts + ecosys.spec.ts (>= 14 tests).
EDITABLE SET: \`backend/src/kloel/ecosys/**\`, \`backend/src/app.module.ts\` (additive).
`,
  },
  {
    id: 'UTP-DEFENS',
    title: 'User Defensibility (Camada XXX)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-DEFENS-001..009
Cada operação tática emite sinal para ativos estratégicos defensáveis.

## DELIVERABLE \`backend/src/kloel/defens/\`:
- types.ts: DefensibleAsset, AssetGrowth, OwnedAudience, SocialProof, CaseLibrary, PositioningUniqueness, AuthorityBuilding, DefensibleVsTacticalTradeoff, DefensibilityNarrative.
- asset-registry.ts (DEFENS-001).
- growth-tracker.ts (DEFENS-002).
- owned-audience.builder.ts (DEFENS-003).
- social-proof.harvester.ts (DEFENS-004).
- case-library.builder.ts (DEFENS-005).
- positioning-uniqueness.detector.ts (DEFENS-006).
- authority.builder.ts (DEFENS-007).
- tactical-tradeoff.advisor.ts (DEFENS-008).
- defensibility-narrative.builder.ts (DEFENS-009).
- defens.module.ts + defens.spec.ts (>= 14 tests).
EDITABLE SET: \`backend/src/kloel/defens/**\`, \`backend/src/app.module.ts\` (additive).
`,
  },
  {
    id: 'UTP-MOVE',
    title: 'Real Movement (Camada XXXI)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-MOVE-001..007
Clareza vira ação efetiva. Decompor decisão em ação ≤15min.

## DELIVERABLE \`backend/src/kloel/move/\`:
- types.ts: ExecutionFriction, StepDecomposition, TinyAction, PartialExecutionOffer, AlternativeRoute, BlockingPattern, NoBlameTone.
- friction.detector.ts (MOVE-001).
- step.decomposer.ts (MOVE-002): decompose into ≤15min actions.
- tiny-action.suggester.ts (MOVE-003).
- partial-execution.offer.ts (MOVE-004).
- alternative-route.builder.ts (MOVE-005).
- pattern.learner.ts (MOVE-006): feeds Camada XVI owner-criterion.
- no-blame-tone.guard.ts (MOVE-007).
- move.module.ts + move.spec.ts (>= 12 tests).
EDITABLE SET: \`backend/src/kloel/move/**\`, \`backend/src/app.module.ts\` (additive).
`,
  },
  {
    id: 'UTP-LEGIT',
    title: 'Operational Legitimacy (Camada XXXIII)',
    prompt: `${PRELUDE}

## YOUR UTP: UTP-LEGIT-001..013
Delegar sem medo de risco legal/regulatório/reputacional.

## DELIVERABLE \`backend/src/kloel/legit/\`:
- types.ts: ConsentRecord, PolicyViolation, RegulatedContent, ImageRights, PolicyChange, RiskFlag, LegalConsult, BlockJustification.
- privacy-compliance.engine.ts (LEGIT-001): LGPD/GDPR/CCPA.
- consent.ledger.ts (LEGIT-002).
- whatsapp-policy.enforcer.ts (LEGIT-003).
- email-policy.enforcer.ts (LEGIT-004).
- ads-policy.enforcer.ts (LEGIT-005).
- affiliate-terms.enforcer.ts (LEGIT-006).
- commercial-promise.guard.ts (LEGIT-007).
- regulated-content.detector.ts (LEGIT-008).
- image-rights.checker.ts (LEGIT-009).
- policy-update.watcher.ts (LEGIT-010).
- risk-flag.elevator.ts (LEGIT-011).
- block-with-justification.service.ts (LEGIT-012).
- legal-consult.trigger.ts (LEGIT-013).
- legit.module.ts + legit.spec.ts (>= 18 tests).
EDITABLE SET: \`backend/src/kloel/legit/**\`, \`backend/src/app.module.ts\` (additive).
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
