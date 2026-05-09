# PULSE REPORT — 2026-05-09T01:37:09.759Z

## PULSE VERDICT

- Produto pronto para producao? NAO
- IA pode trabalhar autonomamente ate producao? NAO
- Proximo passo seguro? SIM
- Self-trust: PASS
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
- artifact_consistency: FAIL - Cross-artifact consistency has not produced a passing check.
- execution_matrix: PASS - Execution matrix classified 6288 path(s) with zero unknown and zero non-terminal paths.
- critical_path_terminal: FAIL - 5150 terminal critical path(s) have precise proof blueprints but still need observed pass/fail evidence: matrix:capability:capability:account-agent, matrix:capability:capability:ad-rules, matrix:capability:capability:admin-chat, matrix:capability:capability:admin-clients, matrix:capability:capability:admin-compliance, matrix:capability:capability:admin-config, matrix:capability:capability:admin-dashboard, matrix:capability:capability:admin-destructive. Next ai_safe action: run the listed validation command(s), attach runtime/flow/browser/external evidence, and refresh PULSE_EXECUTION_MATRIX.json plus PULSE_PATH_COVERAGE.json.
- breakpoint_precision: PASS - Every observed failure in the execution matrix has a breakpoint.
- external_reality: FAIL - 2 missing, 0 stale, and 0 invalid external adapter(s) remain.
- self_trust: PASS - All parsers loaded and no phantom capability/flow remains. 12 aspirational structure(s) remain explicitly marked as aspirational.
- multi_cycle: FAIL - multiCycleConvergence: no autonomy iteration history found; production-autonomy verdict requires proven cycles. Cycle proof: 0/3 successful non-regressing real cycle(s).

## Current State

- Certification: NOT_CERTIFIED
- Human replacement: NOT_READY
- Score: 61/100
- Blocking tier: 0
- Scope parity: PASS (medium)
- Structural chains: 784/2546 complete
- Capabilities: real=0, partial=384, latent=12, phantom=0
- Capability maturity: foundational=1, connected=395, operational=0, productionReady=0
- Flows: real=0, partial=75, latent=0, phantom=0
- Execution matrix: paths=6288, observedPass=0, observedFail=248, criticalUnobserved=0, unknown=0
- Structural parity gaps: total=50, critical=12, high=36
- Finding events: totalSignals=306, uniqueEvents=248, observed=0, confirmedStatic=306, weakSignals=0
- Codacy HIGH issues: 1076
- GitNexus Code Graph: not configured
- External signals: total=4, runtime=0, change=0, dependency=0, high-impact=3

## Dynamic Finding Events

- Operational finding names are derived from evidence text, source, location and truth mode. Internal parser labels are compatibility metadata, not final truth.
- QUERY /autopilot/workspaceId is not called by frontend code: count=11, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%
- clickable "onSave" has dead handler: count=8, truth=confirmed_static, action=fix_now, falsePositiveRisk=13%
- QUERY /billing/workspaceId is not called by frontend code: count=5, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%
- QUERY /crm/workspaceId is not called by frontend code: count=5, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%
- clickable "(sem texto)" has dead handler: count=4, truth=confirmed_static, action=fix_now, falsePositiveRisk=13%
- QUERY /admin/carteira/skip is not called by frontend code: count=3, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%
- QUERY /admin/carteira/workspaceId is not called by frontend code: count=3, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%
- QUERY /admin/mind is not called by frontend code: count=3, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%

## Coverage Truth

- Inventory Coverage: 100%
- Classification Coverage: 99%
- Structural Graph Coverage: 32% (943/2953 connected)
  Reason: 943/2953 structural files connected.
- Test Coverage: 10%
  Reason: 247/2461 source modules have spec files.
- Scenario Coverage: 100% (declared=100%, executed=100%, passed=0%)
- Runtime Evidence Coverage: 0% (fresh=0%, stale=0%)
  Reason: No runtime probes executed.
- Production Proof Coverage: 0%
  Reason: 0/396 capabilities real.
- Unknown Files: 30
- Orphan Files: 200
- Excluded Directories: 12
- Manifest role: semantic overlay, NOT scope boundary
- Scope source: repo_filesystem

## What is Observed vs Inferred vs Aspirational

### Observed (direct evidence)
- Runtime probes executed: 0
- External signals: 4 total
- Self-trust: PASS
- No-overclaim: FAIL

### Inferred (structural analysis)
- 2546 structural chains
- 0 real capabilities
- 0 real flows

### Aspirational (product vision projection)
- 37 projected surfaces
- Target: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 367/367 capability(ies) and 75/75 flow(s) at least partially real, with readiness yellow.

## External Reality

- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=5, mappedFlows=7, summary=37 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=96, mappedFlows=70, summary=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=114, mappedFlows=64, summary=1 HIGH Codacy issue(s) remain in backend/src/autopilot/autopilot.service.ts.
- codacy/static_hotspot: impact=55%, mode=observation_only, mappedCapabilities=4, mappedFlows=7, summary=1 HIGH Codacy issue(s) remain in package.json.

## Product Identity

- Current checkpoint: The current product-facing system materializes 367 partial capability(ies), 0 latent capability(ies). System-wide phantom capability count is 0.
- Inferred product: If the currently connected structures converge, the product resolves toward a unified operational platform centered on Analytics, Anuncios/Ads, Autopilot, Billing, Campaigns, Checkout, CIA/Agent, CRM, Dashboard, Followups, Inbox/Chat, Onboarding, Partnerships, Sales/Vendas, Scrapers, Video/Voice, Settings, Area, Canvas, Carteira, Ferramentas, Launch, Payments.
- Projected checkpoint: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 367/367 capability(ies) and 75/75 flow(s) at least partially real, with readiness yellow.
- Distance: Distance to projected readiness is driven by 0 product-facing phantom capability(ies), 0 system-wide phantom capability(ies), 0 phantom flow(s), 50 structural parity gap(s), and 1076 HIGH Codacy issue(s).

## Product Surfaces

- Analytics: status=partial, completion=100%, capabilities=70, flows=70, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- Anuncios/Ads: status=partial, completion=100%, capabilities=126, flows=70, blocker=Missing structural roles: persistence.
- Autopilot: status=partial, completion=100%, capabilities=112, flows=64, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- Billing: status=partial, completion=100%, capabilities=9, flows=16
- Campaigns: status=partial, completion=100%, capabilities=59, flows=70, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- Checkout: status=partial, completion=100%, capabilities=58, flows=70, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- CIA/Agent: status=partial, completion=100%, capabilities=93, flows=54, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- CRM: status=partial, completion=100%, capabilities=66, flows=70, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- Dashboard: status=partial, completion=100%, capabilities=9, flows=36
- Followups: status=partial, completion=100%, capabilities=130, flows=70, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- Inbox/Chat: status=partial, completion=100%, capabilities=96, flows=54, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- Onboarding: status=partial, completion=100%, capabilities=34, flows=52, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.

## Experience Projection

- Admin Whatsapp Session Control: status=partial, completion=67%, routes=/settings, /whatsapp, blocker=Runtime probe backend-health is still missing from live evidence.
- Operator Autopilot Run: status=partial, completion=67%, routes=/analytics, /autopilot, blocker=Runtime probe backend-health is still missing from live evidence.
- Operator Campaigns And Flows: status=partial, completion=67%, routes=/campaigns, /flow, /followups, blocker=Runtime probe backend-health is still missing from live evidence.
- Admin Settings Kyc Banking: status=partial, completion=50%, routes=/billing, /settings, /wallet, blocker=Runtime probe backend-health is still missing from live evidence.
- Customer Auth Shell: status=partial, completion=50%, routes=/dashboard, blocker=Runtime probe auth-session is still missing from live evidence.
- Customer Product And Checkout: status=partial, completion=50%, routes=/billing, /checkout, /products, blocker=Runtime probe backend-health is still missing from live evidence.
- Customer Whatsapp And Inbox: status=partial, completion=50%, routes=/inbox, /marketing, /whatsapp, blocker=Runtime probe backend-health is still missing from live evidence.
- System Payment Reconciliation: status=partial, completion=50%, routes=/billing, /checkout, /wallet, blocker=Runtime probe backend-health is still missing from live evidence.

## Promise To Production Delta

- Declared surfaces: 37
- Real surfaces: 25
- Partial surfaces: 12
- Latent surfaces: 12
- Phantom surfaces: 12
- Critical gaps:
  - Auth: Missing structural roles: persistence.
  - Products: Missing structural roles: persistence.
  - Marketing: Missing structural roles: interface, persistence, side_effect.
  - Account: Missing structural roles: interface.
  - Pay: latent surface with incomplete materialization.
  - Privacy: latent surface with incomplete materialization.
  - Produtos: latent surface with incomplete materialization.
  - Terms: latent surface with incomplete materialization.
  - Tools: latent surface with incomplete materialization.

## Structural Parity Gaps

- Integration without observability: Ad Rules: severity=critical, mode=ai_safe, route=/ad-rules/:id, summary=Capability Ad Rules depends on runtime-critical effects but observability evidence is still weak (0 signal(s) detected).
- Integration without observability: Ai Assistant: severity=critical, mode=ai_safe, route=/ai/assistant/analyze-sentiment, summary=Capability Ai Assistant depends on runtime-critical effects but observability evidence is still weak (0 signal(s) detected).
- Integration without observability: Analytics Analytic: severity=critical, mode=ai_safe, route=/analytics/smart-time, summary=Capability Analytics Analytic depends on runtime-critical effects but observability evidence is still weak (0 signal(s) detected).
- Integration without observability: Auth Anonymous: severity=critical, mode=ai_safe, route=/api/auth/anonymous, summary=Capability Auth Anonymous depends on runtime-critical effects but observability evidence is still weak (0 signal(s) detected).
- Integration without observability: Autopilot Actions: severity=critical, mode=ai_safe, route=/autopilot/actions, summary=Capability Autopilot Actions depends on runtime-critical effects but observability evidence is still weak (0 signal(s) detected).
- Integration without observability: Autopilot Ask: severity=critical, mode=ai_safe, route=/autopilot/ask, summary=Capability Autopilot Ask depends on runtime-critical effects but observability evidence is still weak (0 signal(s) detected).
- Integration without observability: Autopilot Config: severity=critical, mode=ai_safe, route=/autopilot/config, summary=Capability Autopilot Config depends on runtime-critical effects but observability evidence is still weak (0 signal(s) detected).
- Integration without observability: Autopilot Conversion: severity=critical, mode=ai_safe, route=/autopilot/conversion, summary=Capability Autopilot Conversion depends on runtime-critical effects but observability evidence is still weak (0 signal(s) detected).
- Integration without observability: Autopilot Limit: severity=critical, mode=ai_safe, route=/autopilot/limit, summary=Capability Autopilot Limit depends on runtime-critical effects but observability evidence is still weak (0 signal(s) detected).
- Integration without observability: Autopilot Money: severity=critical, mode=ai_safe, route=/autopilot/money-machine, summary=Capability Autopilot Money depends on runtime-critical effects but observability evidence is still weak (0 signal(s) detected).

## Execution Matrix

- Coverage: 100% classified, unknown=0, criticalUnobserved=0
- matrix:capability:capability:account-agent: status=untested, truth=inferred, mode=governed_validation, route=n/a, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:ad-rules: status=inferred_only, truth=inferred, mode=governed_validation, route=/ad-rules, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-accounts: status=observed_fail, truth=observed, mode=governed_validation, route=/admin/accounts, breakpoint=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- matrix:capability:capability:admin-audit: status=observed_fail, truth=observed, mode=governed_validation, route=/admin/accounts/:workspaceId, breakpoint=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- matrix:capability:capability:admin-auth: status=observed_fail, truth=observed, mode=governed_validation, route=/admin/accounts/:workspaceId, breakpoint=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- matrix:capability:capability:admin-carteira: status=observed_fail, truth=observed, mode=governed_validation, route=/admin/accounts/:workspaceId, breakpoint=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- matrix:capability:capability:admin-chat: status=inferred_only, truth=inferred, mode=governed_validation, route=/admin/chat/message, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-clients: status=inferred_only, truth=inferred, mode=governed_validation, route=/admin/clients, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-compliance: status=inferred_only, truth=inferred, mode=governed_validation, route=/admin/compliance, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-config: status=inferred_only, truth=inferred, mode=governed_validation, route=/admin/config, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.

## Capability Maturity

- Area Slug: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Checkout Plan: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Ferramentas Ferramenta: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Global Error: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Layout: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Onboarding: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Vendas Venda: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Video: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Endpoint: stage=connected, score=40%, missing=orchestration, persistence, side_effect, runtime_evidence
- Parser: stage=connected, score=40%, missing=orchestration, persistence, side_effect, runtime_evidence

## Top Blockers

- codacy/static_hotspot: 37 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- codacy/static_hotspot: 2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in backend/src/autopilot/autopilot.service.ts.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in package.json.
- Auth: Missing structural roles: persistence.
- Products: Missing structural roles: persistence.
- Marketing: Missing structural roles: interface, persistence, side_effect.
- Account: Missing structural roles: interface.
- Pay: latent surface with incomplete materialization.
- Privacy: latent surface with incomplete materialization.
- Produtos: latent surface with incomplete materialization.
- Terms: latent surface with incomplete materialization.
- Tools: latent surface with incomplete materialization.
- Integration without observability: Ad Rules: Capability Ad Rules depends on runtime-critical effects but observability evidence is still weak (0 signal(s) detected).
- Integration without observability: Ai Assistant: Capability Ai Assistant depends on runtime-critical effects but observability evidence is still weak (0 signal(s) detected).
- Integration without observability: Analytics Analytic: Capability Analytics Analytic depends on runtime-critical effects but observability evidence is still weak (0 signal(s) detected).
- Integration without observability: Auth Anonymous: Capability Auth Anonymous depends on runtime-critical effects but observability evidence is still weak (0 signal(s) detected).
- Integration without observability: Autopilot Actions: Capability Autopilot Actions depends on runtime-critical effects but observability evidence is still weak (0 signal(s) detected).
- Integration without observability: Autopilot Ask: Capability Autopilot Ask depends on runtime-critical effects but observability evidence is still weak (0 signal(s) detected).
- Integration without observability: Autopilot Config: Capability Autopilot Config depends on runtime-critical effects but observability evidence is still weak (0 signal(s) detected).
- Integration without observability: Autopilot Conversion: Capability Autopilot Conversion depends on runtime-critical effects but observability evidence is still weak (0 signal(s) detected).
- Integration without observability: Autopilot Limit: Capability Autopilot Limit depends on runtime-critical effects but observability evidence is still weak (0 signal(s) detected).
- Integration without observability: Autopilot Money: Capability Autopilot Money depends on runtime-critical effects but observability evidence is still weak (0 signal(s) detected).
- Integration without observability: Autopilot Revenue: Capability Autopilot Revenue depends on runtime-critical effects but observability evidence is still weak (0 signal(s) detected).
- Integration without observability: Checkout Social: Capability Checkout Social depends on runtime-critical effects but observability evidence is still weak (0 signal(s) detected).
- Back without front: Audio Synthesize: Capability Audio Synthesize is structurally live on backend/runtime paths but still lacks an identified product surface.
- Back without front: Diag Db: Capability Diag Db is structurally live on backend/runtime paths but still lacks an identified product surface.
- Back without front: Gdpr Export: Capability Gdpr Export is structurally live on backend/runtime paths but still lacks an identified product surface.
- Back without front: Health Readiness: Capability Health Readiness is structurally live on backend/runtime paths but still lacks an identified product surface.
- Back without front: Token: Capability Token is structurally live on backend/runtime paths but still lacks an identified product surface.
- Flow without validation: (sem texto): Flow (sem texto) is structurally present but still lacks executed validation evidence.
- Flow without validation: canvas-post-canvas-generate: canvas-post-canvas-generate -> /canvas/modelos still exists as a connected product flow candidate without declared validation/oracle coverage.
- Flow without validation: launch-post-launch-launcher: launch-post-launch-launcher -> /ferramentas/launchpad still exists as a connected product flow candidate without declared validation/oracle coverage.
- Front without back: Ferramentas Ferramenta: Capability Ferramentas Ferramenta exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Global Error: Capability Global Error exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Layout: Capability Layout exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Onboarding: Capability Onboarding exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- UI without persistence: /canvas/editor: /canvas/editor (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /canvas/inicio: /canvas/inicio (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /canvas/modelos: /canvas/modelos (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /canvas/projetos: /canvas/projetos (medium shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /e2e/whatsapp-console: /e2e/whatsapp-console (medium shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /e2e/whatsapp-session: /e2e/whatsapp-session (medium shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /ferramentas: /ferramentas (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /ferramentas/fale: /ferramentas/fale (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /ferramentas/gerencie: /ferramentas/gerencie (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /ferramentas/impulsione: /ferramentas/impulsione (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /ferramentas/recupere: /ferramentas/recupere (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /ferramentas/ver-todas: /ferramentas/ver-todas (rich shell) still behaves like a shell or façade without durable persistence or real side effects.

## Next Work

- [P0] Recover Admin Whatsapp Session Control | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Admin Whatsapp Session Control so convergence is based on settled world-state proof.
- [P0] Recover Customer Whatsapp And Inbox | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Customer Whatsapp And Inbox so convergence is based on settled world-state proof.
- [P0] Recover Operator Autopilot Run | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Operator Autopilot Run so convergence is based on settled world-state proof.
- [P0] Recover Operator Campaigns And Flows | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Operator Campaigns And Flows so convergence is based on settled world-state proof.
- [P0] Recover System Payment Reconciliation | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for System Payment Reconciliation so convergence is based on settled world-state proof.
- [P1] Repair execution path matrix:capability:capability:analytics-analytic | impact=transformational | mode=ai_safe | evidence=observed/medium | risk=critical | Turns an observed broken path into a precise repair target.
- [P1] Repair execution path matrix:capability:capability:ai-assistant | impact=transformational | mode=ai_safe | evidence=observed/medium | risk=critical | Turns an observed broken path into a precise repair target.
- [P1] Recover Admin Settings Kyc Banking | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Admin Settings Kyc Banking so convergence is based on settled world-state proof.

## Cross-Artifact Consistency

- Not evaluated this run.

## Cleanup

- Canonical dir: /private/tmp/kloel-pr266-current/.pulse/current
- Mirrors: PULSE_AGENT_ORCHESTRATION_STATE.json, PULSE_ARTIFACT_INDEX.json, PULSE_AUTONOMY_STATE.json, PULSE_CAPABILITY_STATE.json, PULSE_CERTIFICATE.json, PULSE_CLI_DIRECTIVE.json, PULSE_CODACY_EVIDENCE.json, PULSE_CONVERGENCE_PLAN.json, PULSE_EXECUTION_MATRIX.json, PULSE_EXECUTION_TRACE.json, PULSE_EXTERNAL_SIGNAL_STATE.json, PULSE_FLOW_PROJECTION.json, PULSE_HEALTH.json, PULSE_PARITY_GAPS.json, PULSE_PRODUCT_GRAPH.json, PULSE_PRODUCT_VISION.json, PULSE_REPORT.md, PULSE_RUNTIME_EVIDENCE.json, PULSE_SCOPE_STATE.json, PULSE_STRUCTURAL_GRAPH.json, PULSE_WORLD_STATE.json
- Removed legacy artifacts this run: 2

## Truth Model

- `observed`: backed by runtime, browser, declared flows, actors or explicit execution evidence.
- `inferred`: reconstructed from structure with no direct executed proof in this run.
- `projected`: future-consistent product shape implied by connected latent structures.

## Safety

- Governance-protected surfaces stay governed by sandboxed validation.
- Missing evidence stays missing evidence; PULSE does not upgrade it to certainty.