# PULSE REPORT — 2026-04-29T23:49:29.816Z

## PULSE VERDICT

- Produto pronto para producao? NAO
- IA pode trabalhar autonomamente ate producao? NAO
- Proximo passo seguro? SIM
- Self-trust: PASS
- No-overclaim: PASS
- Principal blocker: codacy/static_hotspot: 37 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- Proxima acao: Recover Admin Settings Kyc Banking

## PULSE Machine Readiness

- Machine readiness: NOT_READY
- Scope: pulse_machine_not_kloel_product
- Product certification excluded from machine verdict: SIM (NOT_CERTIFIED)
- Can run bounded autonomous cycle: SIM
- Can declare Kloel product certified: NAO
- bounded_run: PASS - Bounded next autonomous cycle exposes 8 ai_safe unit(s).
- artifact_consistency: PASS - Cross-artifact consistency passed.
- execution_matrix: PASS - Execution matrix classified 4078 path(s) with zero unknown and zero non-terminal paths.
- critical_path_terminal: PASS - All critical matrix paths are observed pass/fail or carry a precise terminal reason in PULSE_EXECUTION_MATRIX.json. 3146 terminal critical path(s) still need observed proof; next ai_safe action is to run the path validation command from PULSE_EXECUTION_MATRIX.json and refresh PULSE_PATH_COVERAGE.json.
- breakpoint_precision: PASS - Every observed failure in the execution matrix has a breakpoint.
- external_reality: FAIL - 2 missing, 0 stale, and 0 invalid external adapter(s) remain.
- self_trust: PASS - All parsers loaded and no phantom capability/flow remains. 12 aspirational structure(s) remain explicitly marked as aspirational.
- multi_cycle: PASS - 3 non-regressing real autonomous cycle(s) observed (>= 3 required).

## Current State

- Certification: NOT_CERTIFIED
- Human replacement: NOT_READY
- Score: 61/100
- Blocking tier: 0
- Scope parity: PASS (high)
- Structural chains: 784/2376 complete
- Capabilities: real=19, partial=284, latent=14, phantom=0
- Capability maturity: foundational=4, connected=73, operational=187, productionReady=53
- Flows: real=22, partial=96, latent=0, phantom=0
- Execution matrix: paths=4078, observedPass=17, observedFail=233, criticalUnobserved=0, unknown=0
- Structural parity gaps: total=53, critical=43, high=10
- Codacy HIGH issues: 1116
- GitNexus Code Graph: not configured
- External signals: total=4, runtime=0, change=0, dependency=0, high-impact=3

## Coverage Truth

- Inventory Coverage: 100%
- Classification Coverage: 97%
- Structural Graph Coverage: 32% (816/2570 connected)
  Reason: 816/2570 structural files connected.
- Test Coverage: 8%
  Reason: 175/2099 source modules have spec files.
- Scenario Coverage: 100% (declared=100%, executed=100%, passed=19%)
- Runtime Evidence Coverage: 0% (fresh=0%, stale=0%)
  Reason: 0/2 probes fresh.
- Production Proof Coverage: 6%
  Reason: 19/317 capabilities real.
- Unknown Files: 80
- Orphan Files: 200
- Excluded Directories: 21
- Manifest role: semantic overlay, NOT scope boundary
- Scope source: repo_filesystem

## What is Observed vs Inferred vs Aspirational

### Observed (direct evidence)
- Runtime probes executed: 2
- External signals: 4 total
- Self-trust: PASS
- No-overclaim: PASS

### Inferred (structural analysis)
- 2376 structural chains
- 19 real capabilities
- 22 real flows

### Aspirational (product vision projection)
- 37 projected surfaces
- Target: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 292/292 capability(ies) and 118/118 flow(s) at least partially real, with readiness yellow.

## External Reality

- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=3, mappedFlows=7, summary=37 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=78, mappedFlows=112, summary=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=51, mappedFlows=94, summary=1 HIGH Codacy issue(s) remain in backend/src/autopilot/autopilot.service.ts.
- codacy/static_hotspot: impact=55%, mode=observation_only, mappedCapabilities=3, mappedFlows=7, summary=1 HIGH Codacy issue(s) remain in package.json.

## Product Identity

- Current checkpoint: The current product-facing system materializes 18 real capability(ies), 274 partial capability(ies), 0 latent capability(ies), and 0 product-facing phantom capability(ies). System-wide phantom capability count is 0.
- Inferred product: If the currently connected structures converge, the product resolves toward a unified operational platform centered on Scrapers, Onboarding, Inbox/Chat, Analytics, Autopilot, CIA/Agent, Campaigns, Checkout.
- Projected checkpoint: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 292/292 capability(ies) and 118/118 flow(s) at least partially real, with readiness yellow.
- Distance: Distance to projected readiness is driven by 0 product-facing phantom capability(ies), 0 system-wide phantom capability(ies), 0 phantom flow(s), 53 structural parity gap(s), and 1116 HIGH Codacy issue(s).

## Product Surfaces

- Scrapers: status=real, completion=100%, capabilities=1, flows=0
- Onboarding: status=real, completion=85%, capabilities=3, flows=22, blocker=Ai Assistant remains partial.
- Inbox/Chat: status=real, completion=75%, capabilities=7, flows=56, blocker=Inbox Encode remains partial.
- Analytics: status=real, completion=72%, capabilities=13, flows=92, blocker=Analytics Analytic remains partial.
- Autopilot: status=real, completion=71%, capabilities=50, flows=94, blocker=Ai Assistant remains partial.
- CIA/Agent: status=real, completion=71%, capabilities=43, flows=94, blocker=Ai Assistant remains partial.
- Campaigns: status=real, completion=70%, capabilities=57, flows=110, blocker=Ad Rules remains partial.
- Checkout: status=real, completion=70%, capabilities=38, flows=106, blocker=Ad Rules remains partial.
- CRM: status=real, completion=70%, capabilities=4, flows=79, blocker=Campaigns Campaign remains partial.
- Followups: status=real, completion=70%, capabilities=66, flows=112, blocker=Admin Accounts remains partial.
- Products: status=real, completion=70%, capabilities=38, flows=106, blocker=Ad Rules remains partial.
- Settings: status=real, completion=70%, capabilities=64, flows=110, blocker=Ad Rules remains partial.

## Experience Projection

- Admin Settings Kyc Banking: status=partial, completion=62%, routes=/billing, /settings, /wallet, blocker=Ai Assistant remains partial.
- Admin Whatsapp Session Control: status=partial, completion=62%, routes=/settings, /whatsapp, blocker=Ai Assistant remains partial.
- Customer Auth Shell: status=partial, completion=62%, routes=/dashboard, blocker=Ai Assistant remains partial.
- Customer Whatsapp And Inbox: status=partial, completion=62%, routes=/inbox, /marketing, /whatsapp, blocker=Ai Assistant remains partial.
- Operator Autopilot Run: status=partial, completion=62%, routes=/analytics, /autopilot, blocker=Ai Assistant remains partial.
- Operator Campaigns And Flows: status=partial, completion=62%, routes=/campaigns, /flow, /followups, blocker=Ai Assistant remains partial.
- System Payment Reconciliation: status=partial, completion=62%, routes=/billing, /checkout, /wallet, blocker=Ai Assistant remains partial.
- Customer Product And Checkout: status=partial, completion=61%, routes=/billing, /checkout, /products, blocker=Inbox Encode remains partial.

## Promise To Production Delta

- Declared surfaces: 37
- Real surfaces: 22
- Partial surfaces: 8
- Latent surfaces: 0
- Phantom surfaces: 7
- Critical gaps:
  - Billing: Billing Activate remains partial.
  - Dashboard: Missing structural roles: side_effect.
  - Partnerships: Missing structural roles: side_effect.
  - Cookies: Governed ai_safe blocker for scenario_coverage: Required role scenario_coverage is below truth target observed. Expected validation: Run governed scenario or flow evidence for flow cookies-post-api-v1-cookie-...
  - Ferramentas: Missing structural roles: orchestration, persistence, side_effect.
  - Launch: Missing structural roles: orchestration, persistence, side_effect.
  - Produtos: onApprove remains partial.
  - Webinarios: (sem texto) remains partial.

## Structural Parity Gaps

- Integration without observability: Ad Rules: severity=critical, mode=ai_safe, route=/ad-rules, summary=Capability Ad Rules depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Admin Accounts: severity=critical, mode=ai_safe, route=/admin/accounts/:workspaceId, summary=Capability Admin Accounts depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Admin Carteira: severity=critical, mode=ai_safe, route=/admin/carteira/connect/accounts, summary=Capability Admin Carteira depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Admin Dashboard: severity=critical, mode=ai_safe, route=/admin/dashboard/home, summary=Capability Admin Dashboard depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Affiliate Ai: severity=critical, mode=ai_safe, route=/affiliate/ai-search, summary=Capability Affiliate Ai depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Affiliate My: severity=critical, mode=ai_safe, route=/affiliate/my-links, summary=Capability Affiliate My depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Affiliate Saved: severity=critical, mode=ai_safe, route=/affiliate/saved/${encodeURIComponent(productId)}, summary=Capability Affiliate Saved depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Affiliate Suggest: severity=critical, mode=ai_safe, route=/affiliate/suggest, summary=Capability Affiliate Suggest depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Ai Assistant: severity=critical, mode=ai_safe, route=/ai/assistant/analyze-sentiment, summary=Capability Ai Assistant depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Analytics Analytic: severity=critical, mode=ai_safe, route=/analytics/activity, summary=Capability Analytics Analytic depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).

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
- matrix:capability:capability:admin-config: status=observed_fail, truth=observed, mode=governed_validation, route=/admin/accounts/:workspaceId, breakpoint=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- matrix:capability:capability:admin-dashboard: status=untested, truth=inferred, mode=governed_validation, route=/admin/dashboard/home, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.

## Capability Maturity

- Global Error: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Layout: stage=connected, score=34%, missing=api_surface, orchestration, persistence, side_effect
- Ferramentas Ferramenta: stage=connected, score=50%, missing=api_surface, orchestration, persistence, side_effect
- Onboarding: stage=connected, score=50%, missing=api_surface, orchestration, persistence, side_effect
- Video: stage=connected, score=50%, missing=api_surface, orchestration, persistence, side_effect
- Audio Synthesize: stage=connected, score=56%, missing=persistence, runtime_evidence, validation, scenario_coverage
- Campaign Start: stage=connected, score=56%, missing=persistence, runtime_evidence, validation, scenario_coverage
- Diag: stage=connected, score=56%, missing=persistence, runtime_evidence, validation, scenario_coverage
- Kloel Download: stage=connected, score=56%, missing=persistence, runtime_evidence, validation, scenario_coverage
- Kyc: stage=connected, score=56%, missing=persistence, runtime_evidence, validation, scenario_coverage

## Top Blockers

- codacy/static_hotspot: 37 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- codacy/static_hotspot: 2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in backend/src/autopilot/autopilot.service.ts.
- Billing: Billing Activate remains partial.
- Dashboard: Missing structural roles: side_effect.
- Partnerships: Missing structural roles: side_effect.
- Cookies: Governed ai_safe blocker for scenario_coverage: Required role scenario_coverage is below truth target observed. Expected validation: Run governed scenario or flow evidence for flow cookies-post-api-v1-cookie-consent.
- Ferramentas: Missing structural roles: orchestration, persistence, side_effect.
- Launch: Missing structural roles: orchestration, persistence, side_effect.
- Produtos: onApprove remains partial.

## Next Work

- [P0] Recover Admin Settings Kyc Banking | impact=transformational | mode=ai_safe | evidence=observed/high | risk=critical | Closes pending asynchronous evidence for Admin Settings Kyc Banking so convergence is based on settled world-state proof.
- [P0] Recover Customer Auth Shell | impact=transformational | mode=ai_safe | evidence=observed/high | risk=critical | Turns the observed failure in Customer Auth Shell into an executed repair target with fresh proof.
- [P0] Recover Customer Whatsapp And Inbox | impact=transformational | mode=ai_safe | evidence=observed/high | risk=critical | Turns the observed failure in Customer Whatsapp And Inbox into an executed repair target with fresh proof.
- [P0] Repair execution path matrix:capability:capability:admin-accounts | impact=transformational | mode=ai_safe | evidence=observed/high | risk=critical | Turns an observed broken path into a precise repair target.
- [P0] Repair execution path matrix:capability:capability:admin-audit | impact=transformational | mode=ai_safe | evidence=observed/high | risk=critical | Turns an observed broken path into a precise repair target.
- [P0] Repair execution path matrix:capability:capability:admin-auth | impact=transformational | mode=ai_safe | evidence=observed/high | risk=critical | Turns an observed broken path into a precise repair target.
- [P0] Repair execution path matrix:capability:capability:admin-carteira | impact=transformational | mode=ai_safe | evidence=observed/high | risk=critical | Turns an observed broken path into a precise repair target.
- [P0] Repair execution path matrix:capability:capability:admin-config | impact=transformational | mode=ai_safe | evidence=observed/high | risk=critical | Turns an observed broken path into a precise repair target.

## Cross-Artifact Consistency

- PASS: all loaded PULSE artifacts are mutually consistent on shared fields (status, verdicts, counters, generatedAt).

## Cleanup

- Canonical dir: /Users/danielpenin/whatsapp_saas/.pulse/current
- Mirrors: PULSE_HEALTH.json, PULSE_CERTIFICATE.json, PULSE_CLI_DIRECTIVE.json, PULSE_MACHINE_READINESS.json, PULSE_ARTIFACT_INDEX.json, PULSE_GITNEXUS_STATE.json, PULSE_BEADS_STATE.json, PULSE_CONTEXT_BROADCAST.json, PULSE_WORKER_LEASES.json, PULSE_CONTEXT_DELTA.json, PULSE_REPORT.md, PULSE_WORLD_STATE.json
- Removed legacy artifacts this run: 5

## Truth Model

- `observed`: backed by runtime, browser, declared flows, actors or explicit execution evidence.
- `inferred`: reconstructed from structure with no direct executed proof in this run.
- `projected`: future-consistent product shape implied by connected latent structures.

## Safety

- Governance-protected surfaces stay governed by sandboxed validation.
- Missing evidence stays missing evidence; PULSE does not upgrade it to certainty.