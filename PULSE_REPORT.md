# PULSE REPORT — 2026-05-17T12:28:11.425Z

## PULSE VERDICT

- Produto pronto para producao? NAO
- IA pode trabalhar autonomamente ate producao? NAO
- Proximo passo seguro? SIM
- Self-trust: PASS
- No-overclaim: FAIL
- Principal blocker: codacy/static_hotspot: 7 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- Proxima acao: UI without persistence: /autopilot

## PULSE Machine Readiness

- Machine readiness: NOT_READY
- Scope: pulse_machine_not_kloel_product
- Product certification excluded from machine verdict: SIM (NOT_CERTIFIED)
- Can run bounded autonomous cycle: SIM
- Can declare Kloel product certified: NAO
- bounded_run: PASS - Bounded next autonomous cycle exposes 8 ai_safe unit(s).
- artifact_consistency: PASS - Cross-artifact consistency passed.
- execution_matrix: PASS - Execution matrix classified 6788 path(s) with zero unknown and zero non-terminal paths.
- critical_path_terminal: FAIL - 5008 terminal critical path(s) have precise proof blueprints but still need observed pass/fail evidence: matrix:capability:capability:abi-ab, matrix:capability:capability:abi-builder, matrix:capability:capability:account-agent, matrix:capability:capability:ad-rules, matrix:capability:capability:admin-accounts, matrix:capability:capability:admin-audit, matrix:capability:capability:admin-auth, matrix:capability:capability:admin-brain. Next ai_safe action: run the listed validation command(s), attach runtime/flow/browser/external evidence, and refresh PULSE_EXECUTION_MATRIX.json plus PULSE_PATH_COVERAGE.json.
- breakpoint_precision: PASS - Every observed failure in the execution matrix has a breakpoint.
- external_reality: FAIL - 2 missing, 0 stale, and 0 invalid external adapter(s) remain.
- self_trust: PASS - All parsers loaded and no phantom capability/flow remains. 18 aspirational structure(s) remain explicitly marked as aspirational.
- multi_cycle: FAIL - multiCycleConvergence: no autonomy iteration history found; production-autonomy verdict requires proven cycles. Cycle proof: 0/3 successful non-regressing real cycle(s).

## Current State

- Certification: NOT_CERTIFIED
- Human replacement: NOT_READY
- Score: 58/100
- Blocking tier: 0
- Scope parity: FAIL (low)
- Structural chains: 805/2732 complete
- Capabilities: real=0, partial=435, latent=18, phantom=0
- Capability maturity: foundational=2, connected=451, operational=0, productionReady=0
- Flows: real=0, partial=76, latent=0, phantom=0
- Execution matrix: paths=6788, observedPass=0, observedFail=41, criticalUnobserved=0, unknown=0
- Structural parity gaps: total=41, critical=0, high=40
- Finding events: totalSignals=0, uniqueEvents=0, observed=0, confirmedStatic=0, weakSignals=0
- Codacy HIGH issues: 2225
- GitNexus Code Graph: not configured
- External signals: total=7, runtime=0, change=0, dependency=0, high-impact=1

## Dynamic Finding Events

- Operational finding names are derived from evidence text, source, location and truth mode. Internal parser labels are compatibility metadata, not final truth.
- No finding events detected.

## Coverage Truth

- Inventory Coverage: 100%
- Classification Coverage: 99%
- Structural Graph Coverage: 29% (1421/4949 connected)
  Reason: 1421/4949 structural files connected.
- Test Coverage: 18%
  Reason: 681/3765 source modules have spec files.
- Scenario Coverage: 100% (declared=100%, executed=100%, passed=0%)
- Runtime Evidence Coverage: 0% (fresh=0%, stale=0%)
  Reason: No runtime probes executed.
- Production Proof Coverage: 0%
  Reason: 0/453 capabilities real.
- Unknown Files: 41
- Orphan Files: 200
- Excluded Directories: 12
- Manifest role: semantic overlay, NOT scope boundary
- Scope source: repo_filesystem

## What is Observed vs Inferred vs Aspirational

### Observed (direct evidence)
- Runtime probes executed: 0
- External signals: 7 total
- Self-trust: PASS
- No-overclaim: FAIL

### Inferred (structural analysis)
- 2732 structural chains
- 0 real capabilities
- 0 real flows

### Aspirational (product vision projection)
- 38 projected surfaces
- Target: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 421/421 capability(ies) and 76/76 flow(s) at least partially real, with readiness yellow.

## External Reality

- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=6, mappedFlows=33, summary=7 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- codacy/static_hotspot: impact=55%, mode=ai_safe, mappedCapabilities=5, mappedFlows=73, summary=17 HIGH Codacy issue(s) remain in scripts/__parts__/obsidian-mirror-daemon-content.mjs.
- codacy/static_hotspot: impact=55%, mode=ai_safe, mappedCapabilities=4, mappedFlows=6, summary=5 HIGH Codacy issue(s) remain in scripts/__parts__/obsidian-mirror-daemon-utils.mjs.
- codacy/static_hotspot: impact=55%, mode=ai_safe, mappedCapabilities=202, mappedFlows=73, summary=1 HIGH Codacy issue(s) remain in backend/src/meta/__parts__/meta-auth-helpers.ts.
- codacy/static_hotspot: impact=55%, mode=ai_safe, mappedCapabilities=187, mappedFlows=73, summary=1 HIGH Codacy issue(s) remain in backend/src/meta/__parts__/meta-oauth-url.helpers.ts.
- codacy/static_hotspot: impact=55%, mode=observation_only, mappedCapabilities=4, mappedFlows=6, summary=1 HIGH Codacy issue(s) remain in package.json.
- codacy/static_hotspot: impact=55%, mode=ai_safe, mappedCapabilities=2, mappedFlows=0, summary=2 HIGH Codacy issue(s) remain in scripts/__parts__/obsidian-mirror-daemon-indexes.mjs.

## Product Identity

- Current checkpoint: The current product-facing system materializes 421 partial capability(ies), 0 latent capability(ies). System-wide phantom capability count is 0.
- Inferred product: If the currently connected structures converge, the product resolves toward a unified operational platform centered on Analytics, Autopilot, Billing, Campaigns, Checkout, CIA/Agent, CRM, Dashboard, Followups, Inbox/Chat, Onboarding, Partnerships, Products, Sales/Vendas, Scrapers, Account, Canvas, Carteira, Cookies, Ferramentas, Launch, Media, Parcerias.
- Projected checkpoint: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 421/421 capability(ies) and 76/76 flow(s) at least partially real, with readiness yellow.
- Distance: Distance to projected readiness is driven by 0 product-facing phantom capability(ies), 0 system-wide phantom capability(ies), 0 phantom flow(s), 41 structural parity gap(s), and 2225 HIGH Codacy issue(s).

## Product Surfaces

- Analytics: status=partial, completion=100%, capabilities=167, flows=73
- Autopilot: status=partial, completion=100%, capabilities=188, flows=73
- Billing: status=partial, completion=100%, capabilities=10, flows=73
- Campaigns: status=partial, completion=100%, capabilities=170, flows=73
- Checkout: status=partial, completion=100%, capabilities=181, flows=73
- CIA/Agent: status=partial, completion=100%, capabilities=170, flows=73
- CRM: status=partial, completion=100%, capabilities=168, flows=73
- Dashboard: status=partial, completion=100%, capabilities=7, flows=73
- Followups: status=partial, completion=100%, capabilities=206, flows=73
- Inbox/Chat: status=partial, completion=100%, capabilities=8, flows=73
- Onboarding: status=partial, completion=100%, capabilities=159, flows=73
- Partnerships: status=partial, completion=100%, capabilities=159, flows=73

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

- Declared surfaces: 38
- Real surfaces: 26
- Partial surfaces: 12
- Latent surfaces: 12
- Phantom surfaces: 12
- Critical gaps:
  - Anuncios/Ads: Missing structural roles: interface, orchestration, side_effect.
  - Auth: Missing structural roles: interface, persistence.
  - Marketing: Missing structural roles: interface, persistence, side_effect.
  - Area: Missing structural roles: interface, persistence.
  - Pay: latent surface with incomplete materialization.
  - Privacy: latent surface with incomplete materialization.
  - Produtos: latent surface with incomplete materialization.
  - Terms: latent surface with incomplete materialization.
  - Tools: latent surface with incomplete materialization.

## Structural Parity Gaps

- Back without front: Audio Synthesize: severity=high, mode=ai_safe, route=/audio/synthesize, summary=Capability Audio Synthesize is structurally live on backend/runtime paths but still lacks an identified product surface.
- Back without front: Diag Db: severity=high, mode=ai_safe, route=/diag-db, summary=Capability Diag Db is structurally live on backend/runtime paths but still lacks an identified product surface.
- Flow without validation: (sem texto): severity=high, mode=ai_safe, route=/canvas/generate, summary=Flow (sem texto) is structurally present but still lacks executed validation evidence.
- Flow without validation: onDelete: severity=high, mode=ai_safe, route=/canvas/designs/:id, summary=Flow onDelete is structurally present but still lacks executed validation evidence.
- Front without back: Admin Change: severity=high, mode=ai_safe, summary=Capability Admin Change exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Autopilot Mission: severity=high, mode=ai_safe, summary=Capability Autopilot Mission exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Capabilities Capability: severity=high, mode=ai_safe, route=/capabilities, summary=Capability Capabilities Capability exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Ferramentas Ferramenta: severity=high, mode=ai_safe, summary=Capability Ferramentas Ferramenta exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Global Error: severity=high, mode=ai_safe, summary=Capability Global Error exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Help Section: severity=high, mode=ai_safe, summary=Capability Help Section exposes UI or interaction entry points without an orchestrated backend/materialized effect.

## Execution Matrix

- Coverage: 100% classified, unknown=0, criticalUnobserved=0
- matrix:capability:capability:abi-ab: status=untested, truth=inferred, mode=governed_validation, route=n/a, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:abi-builder: status=inferred_only, truth=inferred, mode=governed_validation, route=/brain/decide, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:account-agent: status=inferred_only, truth=inferred, mode=governed_validation, route=n/a, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:ad-rules: status=inferred_only, truth=inferred, mode=governed_validation, route=/ad-rules, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-accounts: status=inferred_only, truth=inferred, mode=governed_validation, route=/accounts/${encodeURIComponent(workspaceId)}, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-audit: status=inferred_only, truth=inferred, mode=governed_validation, route=/ad-rules, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-auth: status=inferred_only, truth=inferred, mode=governed_validation, route=/ad-rules, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-brain: status=inferred_only, truth=inferred, mode=governed_validation, route=/admin/brain/spine-audit, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-carteira: status=inferred_only, truth=inferred, mode=governed_validation, route=/ad-rules, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-change: status=inferred_only, truth=inferred, mode=governed_validation, route=n/a, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.

## Capability Maturity

- Admin Change: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Admin Mfa: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Ai Insights: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Ai Section: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Area Slug: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Autopilot History: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Autopilot Mission: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Autopilot Overview: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Billing Form: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Checkout Bundles: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect

## Top Blockers

- codacy/static_hotspot: 7 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- codacy/static_hotspot: 17 HIGH Codacy issue(s) remain in scripts/__parts__/obsidian-mirror-daemon-content.mjs.
- codacy/static_hotspot: 5 HIGH Codacy issue(s) remain in scripts/__parts__/obsidian-mirror-daemon-utils.mjs.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in backend/src/meta/__parts__/meta-auth-helpers.ts.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in backend/src/meta/__parts__/meta-oauth-url.helpers.ts.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in package.json.
- codacy/static_hotspot: 2 HIGH Codacy issue(s) remain in scripts/__parts__/obsidian-mirror-daemon-indexes.mjs.
- Anuncios/Ads: Missing structural roles: interface, orchestration, side_effect.
- Auth: Missing structural roles: interface, persistence.
- Marketing: Missing structural roles: interface, persistence, side_effect.
- Area: Missing structural roles: interface, persistence.
- Pay: latent surface with incomplete materialization.
- Privacy: latent surface with incomplete materialization.
- Produtos: latent surface with incomplete materialization.
- Terms: latent surface with incomplete materialization.
- Tools: latent surface with incomplete materialization.
- Back without front: Audio Synthesize: Capability Audio Synthesize is structurally live on backend/runtime paths but still lacks an identified product surface.
- Back without front: Diag Db: Capability Diag Db is structurally live on backend/runtime paths but still lacks an identified product surface.
- Flow without validation: (sem texto): Flow (sem texto) is structurally present but still lacks executed validation evidence.
- Flow without validation: onDelete: Flow onDelete is structurally present but still lacks executed validation evidence.
- Front without back: Admin Change: Capability Admin Change exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Autopilot Mission: Capability Autopilot Mission exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Capabilities Capability: Capability Capabilities Capability exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Ferramentas Ferramenta: Capability Ferramentas Ferramenta exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Global Error: Capability Global Error exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Help Section: Capability Help Section exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Kyc Banks: Capability Kyc Banks exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Landing Sales: Capability Landing Sales exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Layout: Capability Layout exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Leads Lead: Capability Leads Lead exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Onboarding Form: Capability Onboarding Form exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Pricing Plans: Capability Pricing Plans exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- UI without persistence: /autopilot: /autopilot (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /checkout/:planId: /checkout/:planId (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /cia: /cia (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /ferramentas/ver-todas: /ferramentas/ver-todas (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /inbox: /inbox (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /onboarding: /onboarding (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /parcerias: /parcerias (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /parcerias/afiliados: /parcerias/afiliados (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /parcerias/chat: /parcerias/chat (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /parcerias/colaboradores: /parcerias/colaboradores (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /preview/:planId: /preview/:planId (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /webinarios: /webinarios (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: Admin Change: Capability Admin Change has interface presence but still lacks persistence or any durable external effect.
- UI without persistence: Autopilot Mission: Capability Autopilot Mission has interface presence but still lacks persistence or any durable external effect.
- UI without persistence: Capabilities Capability: Capability Capabilities Capability has interface presence but still lacks persistence or any durable external effect.
- UI without persistence: Ferramentas Ferramenta: Capability Ferramentas Ferramenta has interface presence but still lacks persistence or any durable external effect.
- UI without persistence: Global Error: Capability Global Error has interface presence but still lacks persistence or any durable external effect.
- UI without persistence: Help Section: Capability Help Section has interface presence but still lacks persistence or any durable external effect.
- UI without persistence: Kyc Banks: Capability Kyc Banks has interface presence but still lacks persistence or any durable external effect.
- UI without persistence: Landing Sales: Capability Landing Sales has interface presence but still lacks persistence or any durable external effect.
- UI without persistence: Layout: Capability Layout has interface presence but still lacks persistence or any durable external effect.
- UI without persistence: Leads Lead: Capability Leads Lead has interface presence but still lacks persistence or any durable external effect.

## Next Work

- [P0] UI without persistence: /autopilot | impact=transformational | mode=ai_safe | evidence=observed/high | risk=high | Converts a user-facing illusion into a real product chain for /.
- [P0] UI without persistence: /checkout/:planId | impact=transformational | mode=ai_safe | evidence=observed/high | risk=high | Converts a user-facing illusion into a real product chain for /.
- [P0] UI without persistence: /onboarding | impact=transformational | mode=ai_safe | evidence=observed/high | risk=high | Converts a user-facing illusion into a real product chain for /.
- [P0] Recover Customer Whatsapp And Inbox | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Customer Whatsapp And Inbox so convergence is based on settled world-state proof.
- [P0] Recover Operator Autopilot Run | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Operator Autopilot Run so convergence is based on settled world-state proof.
- [P0] Recover Admin Whatsapp Session Control | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Admin Whatsapp Session Control so convergence is based on settled world-state proof.
- [P0] Recover Operator Campaigns And Flows | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Operator Campaigns And Flows so convergence is based on settled world-state proof.
- [P0] Recover System Payment Reconciliation | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for System Payment Reconciliation so convergence is based on settled world-state proof.

## Cross-Artifact Consistency

- Not evaluated this run.

## Cleanup

- Canonical dir: /Users/danielpenin/whatsapp_saas-pr314-conflicts/.pulse/current
- Mirrors: PULSE_AGENT_ORCHESTRATION_STATE.json, PULSE_ARTIFACT_INDEX.json, PULSE_AUTONOMY_STATE.json, PULSE_CAPABILITY_STATE.json, PULSE_CERTIFICATE.json, PULSE_CLI_DIRECTIVE.json, PULSE_CODACY_EVIDENCE.json, PULSE_CONVERGENCE_PLAN.json, PULSE_EXECUTION_MATRIX.json, PULSE_EXECUTION_TRACE.json, PULSE_EXTERNAL_SIGNAL_STATE.json, PULSE_FLOW_PROJECTION.json, PULSE_HEALTH.json, PULSE_MACHINE_READINESS.json, PULSE_PARITY_GAPS.json, PULSE_PATH_COVERAGE.json, PULSE_PRODUCT_VISION.json, PULSE_REPORT.md, PULSE_RUNTIME_EVIDENCE.json, PULSE_SCOPE_STATE.json, PULSE_WORLD_STATE.json
- Removed legacy artifacts this run: 5

## Truth Model

- `observed`: backed by runtime, browser, declared flows, actors or explicit execution evidence.
- `inferred`: reconstructed from structure with no direct executed proof in this run.
- `projected`: future-consistent product shape implied by connected latent structures.

## Safety

- Governance-protected surfaces stay governed by sandboxed validation.
- Missing evidence stays missing evidence; PULSE does not upgrade it to certainty.