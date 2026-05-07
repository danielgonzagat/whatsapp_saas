# PULSE REPORT — 2026-05-04T05:35:10.189Z

## PULSE VERDICT

- Produto pronto para producao? NAO
- IA pode trabalhar autonomamente ate producao? NAO
- Proximo passo seguro? SIM
- Self-trust: FAIL
- No-overclaim: FAIL
- Principal blocker: codacy/static_hotspot: 37 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- Proxima acao: Recover Admin Whatsapp Session Control

## PULSE Machine Readiness

- Machine readiness: NOT_READY
- Scope: pulse_machine_not_kloel_product
- Product certification excluded from machine verdict: SIM (NOT_CERTIFIED)
- Can run bounded autonomous cycle: NAO
- Can declare Kloel product certified: NAO
- bounded_run: PASS - Bounded next autonomous cycle exposes 8 ai_safe unit(s).
- artifact_consistency: FAIL - 1 divergence(s): generatedAt: 4 artifacts disagree
- execution_matrix: PASS - Execution matrix classified 6109 path(s) with zero unknown and zero non-terminal paths.
- critical_path_terminal: FAIL - 5102 terminal critical path(s) have precise proof blueprints but still need observed pass/fail evidence: matrix:capability:capability:ad-rules, matrix:capability:capability:admin-chat, matrix:capability:capability:admin-clients, matrix:capability:capability:admin-compliance, matrix:capability:capability:admin-config, matrix:capability:capability:admin-dashboard, matrix:capability:capability:admin-destructive, matrix:capability:capability:admin-login. Next ai_safe action: run the listed validation command(s), attach runtime/flow/browser/external evidence, and refresh PULSE_EXECUTION_MATRIX.json plus PULSE_PATH_COVERAGE.json.
- breakpoint_precision: PASS - Every observed failure in the execution matrix has a breakpoint.
- external_reality: PASS - Required external adapters are fresh and available for PULSE-machine decisions.
- self_trust: FAIL - Parser self-trust failed for 1 current parser check(s): orphaned-file-checker [execution_failed]: parser=orphaned-file-checker | file=scripts/pulse/parsers/orphaned-file-checker.ts | kind=timeout | pid=35131 | elapsedMs=30003 | timeoutMs=30000 | command=/opt/homebrew/Cellar/node/25.8.2/bin/node -r /Users/danielpenin/whatsapp_saas-onda0/backend/node_modules/ts-node/register/transpile-only.js /Users/danielpenin/whatsapp_saas-onda0/scripts/pulse/parser-worker.ts orphaned-file-checker <encoded-config> | stdout=<empty> | stderr=<empty> | action=SIGKILL sent to isolated parser worker because the parser exceeded its budget.
- multi_cycle: FAIL - multiCycleConvergence: no autonomy iteration history found; production-autonomy verdict requires proven cycles. Cycle proof: 0/3 successful non-regressing real cycle(s).

## Current State

- Certification: NOT_CERTIFIED
- Human replacement: NOT_READY
- Score: 41/100
- Blocking tier: 0
- Scope parity: PASS (medium)
- Structural chains: 763/2493 complete
- Capabilities: real=102, partial=215, latent=14, phantom=3
- Capability maturity: foundational=7, connected=183, operational=16, productionReady=128
- Flows: real=32, partial=53, latent=0, phantom=0
- Execution matrix: paths=6109, observedPass=3, observedFail=235, criticalUnobserved=0, unknown=0
- Structural parity gaps: total=18, critical=0, high=16
- Finding events: totalSignals=6139, uniqueEvents=3640, observed=3654, confirmedStatic=396, weakSignals=1309
- Codacy HIGH issues: 1116
- GitNexus Code Graph: GitNexus index is fresh for commit 90889d1b.
- External signals: total=6, runtime=0, change=1, dependency=0, high-impact=3

## Dynamic Finding Events

- Operational finding names are derived from evidence text, source, location and truth mode. Internal parser labels are compatibility metadata, not final truth.
- Static state-change signal lacks nearby current-state evidence: count=13, truth=weak_signal, action=needs_probe, falsePositiveRisk=17%
- Static state-change signal lacks nearby current-state evidence: count=12, truth=weak_signal, action=needs_probe, falsePositiveRisk=17%
- Static state-change signal lacks nearby current-state evidence: count=9, truth=weak_signal, action=needs_probe, falsePositiveRisk=17%
- Static state-change signal lacks nearby current-state evidence: count=9, truth=weak_signal, action=needs_probe, falsePositiveRisk=17%
- clickable "onSave" has dead handler: count=8, truth=confirmed_static, action=fix_now, falsePositiveRisk=13%
- Opaque secret-like literal observed in source: count=8, truth=inferred, action=needs_probe, falsePositiveRisk=14%
- Opaque secret-like literal observed in source: count=8, truth=inferred, action=needs_probe, falsePositiveRisk=14%
- Static state-change signal lacks nearby current-state evidence: count=8, truth=weak_signal, action=needs_probe, falsePositiveRisk=17%

## Coverage Truth

- Inventory Coverage: 100%
- Classification Coverage: 99%
- Structural Graph Coverage: 28% (871/3058 connected)
  Reason: 871/3058 structural files connected.
- Test Coverage: 9%
  Reason: 212/2456 source modules have spec files.
- Scenario Coverage: 100% (declared=100%, executed=100%, passed=38%)
- Runtime Evidence Coverage: 0% (fresh=0%, stale=0%)
  Reason: No runtime probes executed.
- Production Proof Coverage: 31%
  Reason: 102/334 capabilities real.
- Unknown Files: 31
- Orphan Files: 200
- Excluded Directories: 7
- Manifest role: semantic overlay, NOT scope boundary
- Scope source: repo_filesystem

## What is Observed vs Inferred vs Aspirational

### Observed (direct evidence)
- Runtime probes executed: 0
- External signals: 6 total
- Self-trust: FAIL
- No-overclaim: FAIL

### Inferred (structural analysis)
- 2493 structural chains
- 102 real capabilities
- 32 real flows

### Aspirational (product vision projection)
- 42 projected surfaces
- Target: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 306/306 capability(ies) and 32/85 flow(s) at least partially real, with readiness yellow.

## External Reality

- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=3, mappedFlows=7, summary=37 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=89, mappedFlows=80, summary=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=100, mappedFlows=74, summary=1 HIGH Codacy issue(s) remain in backend/src/autopilot/autopilot.service.ts.
- codacy/static_hotspot: impact=55%, mode=observation_only, mappedCapabilities=3, mappedFlows=7, summary=1 HIGH Codacy issue(s) remain in package.json.
- github/code-change: impact=40%, mode=observation_only, mappedCapabilities=0, mappedFlows=0, summary=20 recent commits detected; latest: chore: lock ai constitution and obsidian graph mirror (#235)
- gitnexus/codegraph: impact=10%, mode=ai_safe, mappedCapabilities=28, mappedFlows=80, summary=GitNexus index is fresh for commit 90889d1b.

## Product Identity

- Current checkpoint: The current product-facing system materializes 102 real capability(ies), 204 partial capability(ies), 0 latent capability(ies), 0 phantom capability(ies). System-wide phantom capability count is 3.
- Inferred product: If the currently connected structures converge, the product resolves toward a unified operational platform centered on Scrapers, Video/Voice, Anuncios/Ads, Followups, Settings, Autopilot, CIA/Agent, Inbox/Chat, Analytics, Campaigns, Partnerships, Products, Auth, Checkout, Onboarding, Dashboard, Sales/Vendas, CRM, Billing, Marketing, Webinarios, Ferramentas, Launch, Canvas, Account.
- Projected checkpoint: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 306/306 capability(ies) and 32/85 flow(s) at least partially real, with readiness yellow.
- Distance: Distance to projected readiness is driven by 0 product-facing phantom capability(ies), 3 system-wide phantom capability(ies), 0 phantom flow(s), 18 structural parity gap(s), and 1116 HIGH Codacy issue(s).

## Product Surfaces

- Scrapers: status=real, completion=100%, capabilities=1, flows=0
- Video/Voice: status=real, completion=96%, capabilities=5, flows=4, blocker=Missing structural roles: orchestration, persistence, side_effect.
- Anuncios/Ads: status=real, completion=69%, capabilities=128, flows=80, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage.
- Followups: status=real, completion=68%, capabilities=142, flows=80, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage.
- Settings: status=real, completion=66%, capabilities=102, flows=74, blocker=Maturity is still missing: codacy_hygiene.
- Autopilot: status=real, completion=64%, capabilities=99, flows=74, blocker=Maturity is still missing: codacy_hygiene.
- CIA/Agent: status=real, completion=64%, capabilities=81, flows=74, blocker=Maturity is still missing: codacy_hygiene.
- Inbox/Chat: status=real, completion=64%, capabilities=85, flows=74, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage.
- Analytics: status=real, completion=62%, capabilities=69, flows=74, blocker=Maturity is still missing: codacy_hygiene.
- Campaigns: status=real, completion=59%, capabilities=57, flows=74, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- Partnerships: status=real, completion=55%, capabilities=49, flows=83, blocker=Maturity is still missing: validation, scenario_coverage.
- Products: status=real, completion=55%, capabilities=55, flows=80, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage.

## Experience Projection

- Operator Autopilot Run: status=partial, completion=31%, routes=/analytics, /autopilot, blocker=Runtime probe backend-health is still missing from live evidence.
- Operator Campaigns And Flows: status=partial, completion=31%, routes=/campaigns, /flow, /followups, blocker=Runtime probe backend-health is still missing from live evidence.
- Admin Whatsapp Session Control: status=partial, completion=30%, routes=/settings, /whatsapp, blocker=Runtime probe backend-health is still missing from live evidence.
- Admin Settings Kyc Banking: status=partial, completion=23%, routes=/billing, /settings, /wallet, blocker=Runtime probe backend-health is still missing from live evidence.
- Customer Auth Shell: status=partial, completion=23%, routes=/dashboard, blocker=Runtime probe auth-session is still missing from live evidence.
- Customer Product And Checkout: status=partial, completion=23%, routes=/billing, /checkout, /products, blocker=Runtime probe backend-health is still missing from live evidence.
- Customer Whatsapp And Inbox: status=partial, completion=23%, routes=/inbox, /marketing, /whatsapp, blocker=Runtime probe backend-health is still missing from live evidence.
- System Payment Reconciliation: status=partial, completion=23%, routes=/billing, /checkout, /wallet, blocker=Runtime probe backend-health is still missing from live evidence.

## Promise To Production Delta

- Declared surfaces: 42
- Real surfaces: 27
- Partial surfaces: 4
- Latent surfaces: 0
- Phantom surfaces: 11
- Critical gaps:
  - CRM: Maturity is still missing: codacy_hygiene.
  - Billing: Maturity is still missing: runtime_evidence, validation, scenario_coverage.
  - Pay: phantom surface with incomplete materialization.
  - Preview: phantom surface with incomplete materialization.
  - Privacy: phantom surface with incomplete materialization.
  - Produtos: phantom surface with incomplete materialization.
  - Terms: phantom surface with incomplete materialization.
  - Tools: phantom surface with incomplete materialization.
  - Ops: Missing structural roles: interface.
  - V1: Governed ai_safe blocker for scenario_coverage: Required role scenario_coverage is below truth target observed. Expected validation: Run governed scenario or flow evidence for flow v1-post-v1-cookie-consent.

## Structural Parity Gaps

- Back without front: Audio Synthesize: severity=high, mode=ai_safe, route=/audio/synthesize, summary=Capability Audio Synthesize is structurally live on backend/runtime paths but still lacks an identified product surface.
- Back without front: Diag Db: severity=high, mode=ai_safe, route=/diag-db, summary=Capability Diag Db is structurally live on backend/runtime paths but still lacks an identified product surface.
- Back without front: Gdpr Export: severity=high, mode=ai_safe, route=/gdpr/export, summary=Capability Gdpr Export is structurally live on backend/runtime paths but still lacks an identified product surface.
- Back without front: Health Readiness: severity=high, mode=ai_safe, route=/health/readiness, summary=Capability Health Readiness is structurally live on backend/runtime paths but still lacks an identified product surface.
- Front without back: Ferramentas Ferramenta: severity=high, mode=ai_safe, summary=Capability Ferramentas Ferramenta exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Global Error: severity=high, mode=ai_safe, summary=Capability Global Error exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Onboarding: severity=high, mode=ai_safe, summary=Capability Onboarding exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- UI without persistence: /ferramentas: severity=high, mode=ai_safe, route=/launch/launcher, summary=/ferramentas (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /ferramentas/fale: severity=high, mode=ai_safe, route=/launch/launcher, summary=/ferramentas/fale (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /ferramentas/gerencie: severity=high, mode=ai_safe, route=/launch/launcher, summary=/ferramentas/gerencie (rich shell) still behaves like a shell or façade without durable persistence or real side effects.

## Execution Matrix

- Coverage: 100% classified, unknown=0, criticalUnobserved=0
- matrix:capability:capability:ad-rules: status=untested, truth=inferred, mode=governed_validation, route=/ad-rules, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-accounts: status=observed_fail, truth=observed, mode=governed_validation, route=/admin/accounts, breakpoint=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- matrix:capability:capability:admin-audit: status=observed_fail, truth=observed, mode=governed_validation, route=/admin/accounts/:workspaceId, breakpoint=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- matrix:capability:capability:admin-auth: status=observed_fail, truth=observed, mode=governed_validation, route=/admin/accounts/:workspaceId, breakpoint=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- matrix:capability:capability:admin-carteira: status=observed_fail, truth=observed, mode=governed_validation, route=/admin/accounts/:workspaceId, breakpoint=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- matrix:capability:capability:admin-chat: status=inferred_only, truth=inferred, mode=governed_validation, route=/admin/chat/message, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-clients: status=inferred_only, truth=inferred, mode=governed_validation, route=/admin/clients, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-compliance: status=inferred_only, truth=inferred, mode=governed_validation, route=/admin/compliance/overview, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-config: status=inferred_only, truth=inferred, mode=governed_validation, route=/admin/config/overview, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-dashboard: status=untested, truth=inferred, mode=governed_validation, route=/admin/dashboard/home, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.

## Capability Maturity

- Checkout Plan: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Global Error: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Endpoint: stage=connected, score=40%, missing=orchestration, persistence, side_effect, runtime_evidence
- Layout: stage=connected, score=40%, missing=api_surface, orchestration, persistence, side_effect
- Parser: stage=connected, score=40%, missing=orchestration, persistence, side_effect, runtime_evidence
- Admin Accounts: stage=connected, score=60%, missing=persistence, runtime_evidence, validation, scenario_coverage
- Admin Accounts: stage=connected, score=60%, missing=persistence, runtime_evidence, validation, scenario_coverage
- Analytics Analytic: stage=connected, score=60%, missing=runtime_evidence, validation, scenario_coverage, codacy_hygiene
- Analytics Analytic: stage=connected, score=60%, missing=runtime_evidence, validation, scenario_coverage, codacy_hygiene
- Audio Synthesize: stage=connected, score=60%, missing=persistence, runtime_evidence, validation, scenario_coverage

## Top Blockers

- codacy/static_hotspot: 37 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- codacy/static_hotspot: 2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in backend/src/autopilot/autopilot.service.ts.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in package.json.
- github/code-change: 20 recent commits detected; latest: chore: lock ai constitution and obsidian graph mirror (#235)
- gitnexus/codegraph: GitNexus index is fresh for commit 90889d1b.
- CRM: Maturity is still missing: codacy_hygiene.
- Billing: Maturity is still missing: runtime_evidence, validation, scenario_coverage.
- Pay: phantom surface with incomplete materialization.
- Preview: phantom surface with incomplete materialization.
- Privacy: phantom surface with incomplete materialization.
- Produtos: phantom surface with incomplete materialization.
- Terms: phantom surface with incomplete materialization.
- Tools: phantom surface with incomplete materialization.
- Ops: Missing structural roles: interface.
- V1: Governed ai_safe blocker for scenario_coverage: Required role scenario_coverage is below truth target observed. Expected validation: Run governed scenario or flow evidence for flow v1-post-v1-cookie-consent.
- Back without front: Audio Synthesize: Capability Audio Synthesize is structurally live on backend/runtime paths but still lacks an identified product surface.
- Back without front: Diag Db: Capability Diag Db is structurally live on backend/runtime paths but still lacks an identified product surface.
- Back without front: Gdpr Export: Capability Gdpr Export is structurally live on backend/runtime paths but still lacks an identified product surface.
- Back without front: Health Readiness: Capability Health Readiness is structurally live on backend/runtime paths but still lacks an identified product surface.
- Front without back: Ferramentas Ferramenta: Capability Ferramentas Ferramenta exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Global Error: Capability Global Error exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Onboarding: Capability Onboarding exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- UI without persistence: /ferramentas: /ferramentas (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /ferramentas/fale: /ferramentas/fale (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /ferramentas/gerencie: /ferramentas/gerencie (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /ferramentas/impulsione: /ferramentas/impulsione (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /ferramentas/recupere: /ferramentas/recupere (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /ferramentas/ver-todas: /ferramentas/ver-todas (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: Ferramentas Ferramenta: Capability Ferramentas Ferramenta has interface presence but still lacks persistence or any durable external effect.
- UI without persistence: Global Error: Capability Global Error has interface presence but still lacks persistence or any durable external effect.
- UI without persistence: Onboarding: Capability Onboarding has interface presence but still lacks persistence or any durable external effect.
- Front without back: /cookies: /cookies (api=6, backedData=0/0) still exposes a frontend-facing surface whose backend chain is incomplete or absent.
- UI without persistence: /cookies: /cookies (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- Operator Autopilot Run: Runtime probe backend-health is still missing from live evidence.
- Operator Campaigns And Flows: Runtime probe backend-health is still missing from live evidence.
- Admin Whatsapp Session Control: Runtime probe backend-health is still missing from live evidence.
- Admin Settings Kyc Banking: Runtime probe backend-health is still missing from live evidence.
- Customer Auth Shell: Runtime probe auth-session is still missing from live evidence.
- Customer Product And Checkout: Runtime probe backend-health is still missing from live evidence.

## Next Work

- [P0] Recover Admin Whatsapp Session Control | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Admin Whatsapp Session Control so convergence is based on settled world-state proof.
- [P0] Recover Customer Whatsapp And Inbox | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Customer Whatsapp And Inbox so convergence is based on settled world-state proof.
- [P0] Recover Operator Autopilot Run | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Operator Autopilot Run so convergence is based on settled world-state proof.
- [P0] Recover Operator Campaigns And Flows | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Operator Campaigns And Flows so convergence is based on settled world-state proof.
- [P0] Recover Admin Settings Kyc Banking | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Admin Settings Kyc Banking so convergence is based on settled world-state proof.
- [P0] Recover System Payment Reconciliation | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for System Payment Reconciliation so convergence is based on settled world-state proof.
- [P1] Repair execution path matrix:capability:capability:auth-register | impact=transformational | mode=ai_safe | evidence=observed/medium | risk=critical | Turns an observed broken path into a precise repair target.
- [P1] Repair execution path matrix:capability:capability:autopilot-cycle | impact=transformational | mode=ai_safe | evidence=observed/medium | risk=critical | Turns an observed broken path into a precise repair target.

## Cross-Artifact Consistency

- FAIL: 1 divergence(s): generatedAt: 4 artifacts disagree.
- Self-trust is degraded until divergent artifacts are reconciled. The pulseSelfTrustPass gate is failing.

## Cleanup

- Canonical dir: /Users/danielpenin/whatsapp_saas-onda0/.pulse/current
- Mirrors: PULSE_AGENT_ORCHESTRATION_STATE.json, PULSE_ARTIFACT_INDEX.json, PULSE_AUTONOMY_STATE.json, PULSE_CAPABILITY_STATE.json, PULSE_CERTIFICATE.json, PULSE_CLI_DIRECTIVE.json, PULSE_CODACY_EVIDENCE.json, PULSE_CONVERGENCE_PLAN.json, PULSE_EXECUTION_MATRIX.json, PULSE_EXECUTION_TRACE.json, PULSE_EXTERNAL_SIGNAL_STATE.json, PULSE_FLOW_PROJECTION.json, PULSE_HEALTH.json, PULSE_PARITY_GAPS.json, PULSE_PRODUCT_GRAPH.json, PULSE_PRODUCT_VISION.json, PULSE_REPORT.md, PULSE_RUNTIME_EVIDENCE.json, PULSE_SCOPE_STATE.json, PULSE_STRUCTURAL_GRAPH.json, PULSE_WORLD_STATE.json
- Removed legacy artifacts this run: 3

## Truth Model

- `observed`: backed by runtime, browser, declared flows, actors or explicit execution evidence.
- `inferred`: reconstructed from structure with no direct executed proof in this run.
- `projected`: future-consistent product shape implied by connected latent structures.

## Safety

- Governance-protected surfaces stay governed by sandboxed validation.
- Missing evidence stays missing evidence; PULSE does not upgrade it to certainty.