# PULSE REPORT — 2026-05-09T18:42:26.737Z

## PULSE VERDICT

- Produto pronto para producao? NAO
- IA pode trabalhar autonomamente ate producao? NAO
- Proximo passo seguro? SIM
- Self-trust: FAIL
- No-overclaim: FAIL
- Principal blocker: codacy/static_hotspot: 37 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- Proxima acao: Close flow Crm Delete Team Invite Id

## PULSE Machine Readiness

- Machine readiness: NOT_READY
- Scope: pulse_machine_not_kloel_product
- Product certification excluded from machine verdict: SIM (NOT_CERTIFIED)
- Can run bounded autonomous cycle: NAO
- Can declare Kloel product certified: NAO
- bounded_run: PASS - Bounded next autonomous cycle exposes 8 ai_safe unit(s).
- artifact_consistency: FAIL - Cross-artifact consistency has not produced a passing check.
- execution_matrix: PASS - Execution matrix classified 5218 path(s) with zero unknown and zero non-terminal paths.
- critical_path_terminal: FAIL - 3958 terminal critical path(s) have precise proof blueprints but still need observed pass/fail evidence: matrix:capability:capability:ad-rules, matrix:capability:capability:admin-chat, matrix:capability:capability:admin-clients, matrix:capability:capability:admin-compliance, matrix:capability:capability:admin-config, matrix:capability:capability:admin-dashboard, matrix:capability:capability:admin-destructive, matrix:capability:capability:admin-login. Next ai_safe action: run the listed validation command(s), attach runtime/flow/browser/external evidence, and refresh PULSE_EXECUTION_MATRIX.json plus PULSE_PATH_COVERAGE.json.
- breakpoint_precision: PASS - Every observed failure in the execution matrix has a breakpoint.
- external_reality: FAIL - 2 missing, 0 stale, and 0 invalid external adapter(s) remain.
- self_trust: FAIL - PULSE still reconstructs 2 phantom capability(ies) and 15 phantom flow(s); self-trust stays degraded until illusion collapses into real chains.
- multi_cycle: FAIL - multiCycleConvergence: no autonomy iteration history found; production-autonomy verdict requires proven cycles. Cycle proof: 3/3 successful non-regressing real cycle(s).

## Current State

- Certification: NOT_CERTIFIED
- Human replacement: NOT_READY
- Score: 39/100
- Blocking tier: 0
- Scope parity: FAIL (low)
- Structural chains: 766/2761 complete
- Capabilities: real=0, partial=379, latent=14, phantom=2
- Capability maturity: foundational=8, connected=387, operational=0, productionReady=0
- Flows: real=0, partial=43, latent=0, phantom=15
- Execution matrix: paths=5218, observedPass=0, observedFail=222, criticalUnobserved=0, unknown=0
- Structural parity gaps: total=51, critical=12, high=37
- Finding events: totalSignals=323, uniqueEvents=279, observed=0, confirmedStatic=323, weakSignals=0
- Codacy HIGH issues: 1076
- GitNexus Code Graph: not configured
- External signals: total=4, runtime=0, change=0, dependency=0, high-impact=3

## Dynamic Finding Events

- Operational finding names are derived from evidence text, source, location and truth mode. Internal parser labels are compatibility metadata, not final truth.
- QUERY /autopilot/workspaceId is not called by frontend code: count=11, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%
- QUERY /billing/workspaceId is not called by frontend code: count=5, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%
- QUERY /crm/workspaceId is not called by frontend code: count=5, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%
- clickable "onSave" has dead handler: count=4, truth=confirmed_static, action=fix_now, falsePositiveRisk=13%
- QUERY /admin/carteira/skip is not called by frontend code: count=3, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%
- QUERY /admin/carteira/workspaceId is not called by frontend code: count=3, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%
- QUERY /meta/instagram/accessToken is not called by frontend code: count=3, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%
- QUERY /meta/instagram/igAccountId is not called by frontend code: count=3, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%

## Coverage Truth

- Inventory Coverage: 100%
- Classification Coverage: 93%
- Structural Graph Coverage: 33% (1057/3196 connected)
  Reason: 1057/3196 structural files connected.
- Test Coverage: 9%
  Reason: 234/2701 source modules have spec files.
- Scenario Coverage: 74% (declared=100%, executed=74%, passed=0%)
  Reason: 43/58 scenarios exercised, 0 passed.
- Runtime Evidence Coverage: 0% (fresh=0%, stale=0%)
  Reason: No runtime probes executed.
- Production Proof Coverage: 0%
  Reason: 0/395 capabilities real.
- Unknown Files: 269
- Orphan Files: 200
- Excluded Directories: 21
- Manifest role: semantic overlay, NOT scope boundary
- Scope source: repo_filesystem

## What is Observed vs Inferred vs Aspirational

### Observed (direct evidence)
- Runtime probes executed: 0
- External signals: 4 total
- Self-trust: FAIL
- No-overclaim: FAIL

### Inferred (structural analysis)
- 2761 structural chains
- 0 real capabilities
- 0 real flows

### Aspirational (product vision projection)
- 38 projected surfaces
- Target: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 365/365 capability(ies) and 43/58 flow(s) at least partially real, with readiness yellow.

## External Reality

- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=5, mappedFlows=3, summary=37 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=87, mappedFlows=56, summary=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=106, mappedFlows=48, summary=1 HIGH Codacy issue(s) remain in backend/src/autopilot/autopilot.service.ts.
- codacy/static_hotspot: impact=55%, mode=observation_only, mappedCapabilities=4, mappedFlows=3, summary=1 HIGH Codacy issue(s) remain in package.json.

## Product Identity

- Current checkpoint: The current product-facing system materializes 365 partial capability(ies), 0 latent capability(ies), 0 phantom capability(ies). System-wide phantom capability count is 2.
- Inferred product: If the currently connected structures converge, the product resolves toward a unified operational platform centered on Scrapers, Video/Voice, Dashboard, Sales/Vendas, Followups, Anuncios/Ads, Autopilot, Inbox/Chat, Analytics, CIA/Agent, CRM, Campaigns, Checkout, Products, Auth, Partnerships, Onboarding, Billing, Marketing, Ferramentas, Launch, Sites, Webinarios.
- Projected checkpoint: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 365/365 capability(ies) and 43/58 flow(s) at least partially real, with readiness yellow.
- Distance: Distance to projected readiness is driven by 0 product-facing phantom capability(ies), 2 system-wide phantom capability(ies), 15 phantom flow(s), 51 structural parity gap(s), and 1076 HIGH Codacy issue(s).

## Product Surfaces

- Scrapers: status=partial, completion=100%, capabilities=1, flows=0
- Video/Voice: status=partial, completion=100%, capabilities=5, flows=4
- Dashboard: status=latent, completion=97%, capabilities=9, flows=20, blocker=The flow is currently backed by simulation or facade behavior instead of a durable effect.
- Sales/Vendas: status=latent, completion=96%, capabilities=7, flows=21, blocker=The flow is currently backed by simulation or facade behavior instead of a durable effect.
- Followups: status=latent, completion=93%, capabilities=144, flows=56, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- Anuncios/Ads: status=latent, completion=92%, capabilities=142, flows=56, blocker=Missing structural roles: interface, orchestration, side_effect.
- Autopilot: status=latent, completion=90%, capabilities=104, flows=48, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- Inbox/Chat: status=latent, completion=89%, capabilities=90, flows=43, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- Analytics: status=latent, completion=88%, capabilities=71, flows=54, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- CIA/Agent: status=latent, completion=88%, capabilities=84, flows=43, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- CRM: status=latent, completion=88%, capabilities=78, flows=54, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- Campaigns: status=latent, completion=87%, capabilities=59, flows=54, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.

## Experience Projection

- Admin Whatsapp Session Control: status=partial, completion=53%, routes=/settings, /whatsapp, blocker=Runtime probe backend-health is still missing from live evidence.
- Operator Autopilot Run: status=partial, completion=53%, routes=/analytics, /autopilot, blocker=Runtime probe backend-health is still missing from live evidence.
- Operator Campaigns And Flows: status=partial, completion=53%, routes=/campaigns, /flow, /followups, blocker=Runtime probe backend-health is still missing from live evidence.
- Admin Settings Kyc Banking: status=phantom, completion=40%, routes=/billing, /settings, /wallet, blocker=Runtime probe backend-health is still missing from live evidence.
- Customer Auth Shell: status=phantom, completion=40%, routes=/dashboard, blocker=Runtime probe auth-session is still missing from live evidence.
- Customer Product And Checkout: status=phantom, completion=40%, routes=/billing, /checkout, /products, blocker=Runtime probe backend-health is still missing from live evidence.
- Customer Whatsapp And Inbox: status=phantom, completion=40%, routes=/inbox, /marketing, /whatsapp, blocker=Runtime probe backend-health is still missing from live evidence.
- System Payment Reconciliation: status=phantom, completion=40%, routes=/billing, /checkout, /wallet, blocker=Runtime probe backend-health is still missing from live evidence.

## Promise To Production Delta

- Declared surfaces: 38
- Real surfaces: 7
- Partial surfaces: 22
- Latent surfaces: 22
- Phantom surfaces: 9
- Critical gaps:
  - Dashboard: The flow is currently backed by simulation or facade behavior instead of a durable effect.
  - Sales/Vendas: The flow is currently backed by simulation or facade behavior instead of a durable effect.
  - Followups: Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
  - Anuncios/Ads: Missing structural roles: interface, orchestration, side_effect.
  - Autopilot: Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
  - Inbox/Chat: Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
  - Analytics: Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
  - CIA/Agent: Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
  - CRM: Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
  - Campaigns: Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
  - Checkout: Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
  - Products: Missing structural roles: persistence.
  - Auth: Missing structural roles: persistence.
  - Partnerships: Missing structural roles: persistence.
  - Onboarding: Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
  - Billing: The flow is currently backed by simulation or facade behavior instead of a durable effect.
  - Marketing: The flow is currently backed by simulation or facade behavior instead of a durable effect.
  - Canvas: Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
  - Account: The flow is currently backed by simulation or facade behavior instead of a durable effect.
  - Area: Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
  - Payments: Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
  - Carteira: The flow is currently backed by simulation or facade behavior instead of a durable effect.
  - Parcerias: phantom surface with incomplete materialization.
  - Pay: phantom surface with incomplete materialization.
  - Privacy: phantom surface with incomplete materialization.
  - Produtos: phantom surface with incomplete materialization.
  - Terms: phantom surface with incomplete materialization.
  - Tools: phantom surface with incomplete materialization.

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
- matrix:capability:capability:ad-rules: status=inferred_only, truth=inferred, mode=governed_validation, route=/ad-rules, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-accounts: status=observed_fail, truth=observed, mode=governed_validation, route=/admin/accounts, breakpoint=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- matrix:capability:capability:admin-audit: status=observed_fail, truth=observed, mode=governed_validation, route=/admin/accounts/:workspaceId, breakpoint=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- matrix:capability:capability:admin-auth: status=observed_fail, truth=observed, mode=governed_validation, route=/admin/accounts/:workspaceId, breakpoint=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- matrix:capability:capability:admin-carteira: status=observed_fail, truth=observed, mode=governed_validation, route=/admin/accounts/:workspaceId, breakpoint=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- matrix:capability:capability:admin-chat: status=inferred_only, truth=inferred, mode=governed_validation, route=/admin/chat/message, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-clients: status=inferred_only, truth=inferred, mode=governed_validation, route=/admin/clients, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-compliance: status=inferred_only, truth=inferred, mode=governed_validation, route=/admin/compliance, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-config: status=inferred_only, truth=inferred, mode=governed_validation, route=/admin/config, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-dashboard: status=inferred_only, truth=inferred, mode=governed_validation, route=/admin/dashboard, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.

## Capability Maturity

- Area Slug: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Billing Form: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Checkout Bundles: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Checkout Editor: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Ferramentas Ferramenta: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Flow: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Global Error: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Layout: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Onboarding: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Order Confirmation: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect

## Top Blockers

- codacy/static_hotspot: 37 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- codacy/static_hotspot: 2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in backend/src/autopilot/autopilot.service.ts.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in package.json.
- Dashboard: The flow is currently backed by simulation or facade behavior instead of a durable effect.
- Sales/Vendas: The flow is currently backed by simulation or facade behavior instead of a durable effect.
- Followups: Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- Anuncios/Ads: Missing structural roles: interface, orchestration, side_effect.
- Autopilot: Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- Inbox/Chat: Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- Analytics: Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- CIA/Agent: Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- CRM: Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- Campaigns: Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- Checkout: Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- Products: Missing structural roles: persistence.
- Auth: Missing structural roles: persistence.
- Partnerships: Missing structural roles: persistence.
- Onboarding: Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- Billing: The flow is currently backed by simulation or facade behavior instead of a durable effect.
- Marketing: The flow is currently backed by simulation or facade behavior instead of a durable effect.
- Canvas: Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- Account: The flow is currently backed by simulation or facade behavior instead of a durable effect.
- Area: Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- Payments: Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- Carteira: The flow is currently backed by simulation or facade behavior instead of a durable effect.
- Parcerias: phantom surface with incomplete materialization.
- Pay: phantom surface with incomplete materialization.
- Privacy: phantom surface with incomplete materialization.
- Produtos: phantom surface with incomplete materialization.
- Terms: phantom surface with incomplete materialization.
- Tools: phantom surface with incomplete materialization.
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
- Back without front: Token: Capability Token is structurally live on backend/runtime paths but still lacks an identified product surface.
- Flow without validation: (sem texto): Flow (sem texto) is structurally present but still lacks executed validation evidence.
- Flow without validation: canvas-post-canvas-generate: canvas-post-canvas-generate -> /canvas/modelos still exists as a connected product flow candidate without declared validation/oracle coverage.
- Flow without validation: form: Flow form is structurally present but still lacks executed validation evidence.
- Flow without validation: launch-post-launch-launcher: launch-post-launch-launcher -> /ferramentas/launchpad still exists as a connected product flow candidate without declared validation/oracle coverage.
- Front without back: Ferramentas Ferramenta: Capability Ferramentas Ferramenta exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Global Error: Capability Global Error exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Layout: Capability Layout exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Onboarding: Capability Onboarding exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- UI without persistence: /canvas/editor: /canvas/editor (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /canvas/inicio: /canvas/inicio (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /canvas/modelos: /canvas/modelos (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /checkout/:planId: /checkout/:planId (rich shell) still behaves like a shell or façade without durable persistence or real side effects.

## Next Work

- [P0] Close flow Crm Delete Team Invite Id | impact=transformational | mode=ai_safe | evidence=observed/medium | risk=critical | Moves flow Crm Delete Team Invite Id from phantom toward a complete interface-to-effect path instead of a partial or projected experience.
- [P0] Close flow Crm Post Autopilot Toggle | impact=transformational | mode=ai_safe | evidence=observed/medium | risk=critical | Moves flow Crm Post Autopilot Toggle from phantom toward a complete interface-to-effect path instead of a partial or projected experience.
- [P0] Close flow Crm Post Ai Kb Create | impact=transformational | mode=ai_safe | evidence=observed/medium | risk=critical | Moves flow Crm Post Ai Kb Create from phantom toward a complete interface-to-effect path instead of a partial or projected experience.
- [P0] Close flow Crm Post Ai Kb Source | impact=transformational | mode=ai_safe | evidence=observed/medium | risk=critical | Moves flow Crm Post Ai Kb Source from phantom toward a complete interface-to-effect path instead of a partial or projected experience.
- [P0] Recover Admin Whatsapp Session Control | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Admin Whatsapp Session Control so convergence is based on settled world-state proof.
- [P0] Recover Customer Whatsapp And Inbox | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Customer Whatsapp And Inbox so convergence is based on settled world-state proof.
- [P0] Recover Operator Autopilot Run | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Operator Autopilot Run so convergence is based on settled world-state proof.
- [P0] Recover Operator Campaigns And Flows | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Operator Campaigns And Flows so convergence is based on settled world-state proof.

## Cross-Artifact Consistency

- Not evaluated this run.

## Cleanup

- Canonical dir: /Users/danielpenin/whatsapp_saas/.pulse/current
- Mirrors: PULSE_ADMIN_EVIDENCE.json, PULSE_AGENT_ORCHESTRATION_STATE.json, PULSE_ARTIFACT_INDEX.json, PULSE_AUTONOMY_STATE.json, PULSE_BEADS_STATE.json, PULSE_BROWSER_EVIDENCE.json, PULSE_CAPABILITY_STATE.json, PULSE_CERTIFICATE.json, PULSE_CLI_DIRECTIVE.json, PULSE_CODACY_EVIDENCE.json, PULSE_CODEBASE_TRUTH.json, PULSE_CONTEXT_BROADCAST.json, PULSE_CONTEXT_DELTA.json, PULSE_CONVERGENCE_PLAN.json, PULSE_CUSTOMER_EVIDENCE.json, PULSE_EXECUTION_MATRIX.json, PULSE_EXECUTION_TRACE.json, PULSE_EXTERNAL_SIGNAL_STATE.json, PULSE_FLOW_EVIDENCE.json, PULSE_FLOW_PROJECTION.json, PULSE_GITNEXUS_STATE.json, PULSE_HEALTH.json, PULSE_INVARIANT_EVIDENCE.json, PULSE_MACHINE_READINESS.json, PULSE_OBSERVABILITY_EVIDENCE.json, PULSE_OPERATOR_EVIDENCE.json, PULSE_PARITY_GAPS.json, PULSE_PRODUCT_GRAPH.json, PULSE_PRODUCT_VISION.json, PULSE_RECOVERY_EVIDENCE.json, PULSE_REPORT.md, PULSE_RESOLVED_MANIFEST.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json, PULSE_SCENARIO_COVERAGE.json, PULSE_SCOPE_STATE.json, PULSE_SOAK_EVIDENCE.json, PULSE_STRUCTURAL_GRAPH.json, PULSE_WORKER_LEASES.json, PULSE_WORLD_STATE.json
- Removed legacy artifacts this run: 2

## Truth Model

- `observed`: backed by runtime, browser, declared flows, actors or explicit execution evidence.
- `inferred`: reconstructed from structure with no direct executed proof in this run.
- `projected`: future-consistent product shape implied by connected latent structures.

## Safety

- Governance-protected surfaces stay governed by sandboxed validation.
- Missing evidence stays missing evidence; PULSE does not upgrade it to certainty.