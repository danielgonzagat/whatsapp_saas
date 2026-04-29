# PULSE REPORT — 2026-04-29T19:50:02.926Z

## PULSE VERDICT

- Produto pronto para producao? NAO
- IA pode trabalhar autonomamente ate producao? NAO
- Proximo passo seguro? SIM
- Self-trust: PASS
- No-overclaim: PASS
- Principal blocker: codacy/static_hotspot: 37 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- Proxima acao: Recover Customer Auth Shell

## PULSE Machine Readiness

- Machine readiness: READY
- Scope: pulse_machine_not_kloel_product
- Product certification excluded from machine verdict: SIM (PARTIAL)
- Can run bounded autonomous cycle: SIM
- Can declare Kloel product certified: NAO
- bounded_run: PASS - Bounded next autonomous cycle exposes 8 ai_safe unit(s).
- artifact_consistency: PASS - Cross-artifact consistency passed.
- execution_matrix: PASS - Execution matrix classified 4020 path(s) with zero unknown and zero non-terminal paths.
- critical_path_terminal: PASS - All critical matrix paths are observed pass/fail, human-blocked, or carry a precise terminal reason.
- breakpoint_precision: PASS - Every observed failure in the execution matrix has a breakpoint.
- external_reality: PASS - Required external adapters are fresh and available for PULSE-machine decisions.
- self_trust: PASS - All parsers loaded and no phantom capability/flow remains. 9 aspirational structure(s) remain explicitly marked as aspirational.
- multi_cycle: PASS - 3 non-regressing real autonomous cycle(s) observed (>= 3 required).

## Current State

- Certification: PARTIAL
- Human replacement: NOT_READY
- Score: 75/100
- Blocking tier: 1
- Scope parity: PASS (high)
- Structural chains: 782/2376 complete
- Capabilities: real=112, partial=189, latent=11, phantom=0
- Capability maturity: foundational=4, connected=72, operational=183, productionReady=53
- Flows: real=23, partial=95, latent=0, phantom=0
- Execution matrix: paths=4020, observedPass=17, observedFail=229, criticalUnobserved=0, unknown=0
- Structural parity gaps: total=34, critical=32, high=0
- Codacy HIGH issues: 1116
- GitNexus Code Graph: GitNexus index is fresh for commit c74dae23.
- External signals: total=8, runtime=2, change=1, dependency=0, high-impact=3

## Coverage Truth

- Inventory Coverage: 100%
- Classification Coverage: 98%
- Structural Graph Coverage: 37% (813/2174 connected)
  Reason: 813/2174 structural files connected.
- Test Coverage: 11%
  Reason: 173/1610 source modules have spec files.
- Scenario Coverage: 100% (declared=100%, executed=100%, passed=19%)
- Runtime Evidence Coverage: 0% (fresh=0%, stale=0%)
  Reason: 0/2 probes fresh.
- Production Proof Coverage: 36%
  Reason: 112/312 capabilities real.
- Unknown Files: 54
- Orphan Files: 200
- Excluded Directories: 22
- Manifest role: semantic overlay, NOT scope boundary
- Scope source: repo_filesystem

## What is Observed vs Inferred vs Aspirational

### Observed (direct evidence)
- Runtime probes executed: 2
- External signals: 8 total
- Self-trust: PASS
- No-overclaim: PASS

### Inferred (structural analysis)
- 2376 structural chains
- 112 real capabilities
- 23 real flows

### Aspirational (product vision projection)
- 37 projected surfaces
- Target: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 291/291 capability(ies) and 118/118 flow(s) at least partially real, with readiness yellow.

## External Reality

- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=3, mappedFlows=7, summary=37 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=71, mappedFlows=112, summary=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=51, mappedFlows=94, summary=1 HIGH Codacy issue(s) remain in backend/src/autopilot/autopilot.service.ts.
- codacy/static_hotspot: impact=55%, mode=human_required, mappedCapabilities=3, mappedFlows=7, summary=1 HIGH Codacy issue(s) remain in package.json.
- github/code-change: impact=40%, mode=observation_only, mappedCapabilities=0, mappedFlows=0, summary=20 recent commits detected; latest: chore(deps): bump the worker-prod-patches group (#224) Bump
- sentry/performance-metric: impact=10%, mode=observation_only, mappedCapabilities=1, mappedFlows=0, summary=No unresolved Sentry issues — project is clean
- datadog/config-gap: impact=20%, mode=observation_only, mappedCapabilities=23, mappedFlows=106, summary=No Datadog monitors configured — add monitors for production visibility
- gitnexus/codegraph: impact=10%, mode=ai_safe, mappedCapabilities=11, mappedFlows=86, summary=GitNexus index is fresh for commit c74dae23.

## Product Identity

- Current checkpoint: The current product-facing system materializes 102 real capability(ies), 189 partial capability(ies), 0 latent capability(ies), and 0 product-facing phantom capability(ies). System-wide phantom capability count is 0.
- Inferred product: If the currently connected structures converge, the product resolves toward a unified operational platform centered on Scrapers, Onboarding, Inbox/Chat, Followups, Settings, Analytics, Autopilot, CIA/Agent.
- Projected checkpoint: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 291/291 capability(ies) and 118/118 flow(s) at least partially real, with readiness yellow.
- Distance: Distance to projected readiness is driven by 0 product-facing phantom capability(ies), 0 system-wide phantom capability(ies), 0 phantom flow(s), 34 structural parity gap(s), and 1116 HIGH Codacy issue(s).

## Product Surfaces

- Scrapers: status=real, completion=100%, capabilities=1, flows=0
- Onboarding: status=real, completion=85%, capabilities=3, flows=22, blocker=Ai Assistant remains partial.
- Inbox/Chat: status=real, completion=75%, capabilities=7, flows=56, blocker=Inbox Encode remains partial.
- Followups: status=real, completion=74%, capabilities=66, flows=112, blocker=Missing structural roles: side_effect.
- Settings: status=real, completion=73%, capabilities=64, flows=110, blocker=Ad Rules remains partial.
- Analytics: status=real, completion=72%, capabilities=13, flows=92, blocker=Analytics Analytic remains partial.
- Autopilot: status=real, completion=71%, capabilities=50, flows=94, blocker=Ai Assistant remains partial.
- CIA/Agent: status=real, completion=71%, capabilities=43, flows=94, blocker=Ai Assistant remains partial.
- Campaigns: status=real, completion=70%, capabilities=57, flows=110, blocker=Ad Rules remains partial.
- Checkout: status=real, completion=70%, capabilities=38, flows=106, blocker=Ad Rules remains partial.
- CRM: status=real, completion=70%, capabilities=4, flows=79, blocker=Campaigns Campaign remains partial.
- Marketing: status=real, completion=70%, capabilities=67, flows=112, blocker=Missing structural roles: side_effect.

## Experience Projection

- Admin Settings Kyc Banking: status=partial, completion=62%, routes=/billing, /settings, /wallet, blocker=Ai Assistant remains partial.
- Admin Whatsapp Session Control: status=partial, completion=62%, routes=/settings, /whatsapp, blocker=Ai Assistant remains partial.
- Customer Auth Shell: status=partial, completion=62%, routes=/dashboard, blocker=Ai Assistant remains partial.
- Customer Product And Checkout: status=partial, completion=62%, routes=/billing, /checkout, /products, blocker=Inbox Encode remains partial.
- Customer Whatsapp And Inbox: status=partial, completion=62%, routes=/inbox, /marketing, /whatsapp, blocker=Ai Assistant remains partial.
- Operator Autopilot Run: status=partial, completion=62%, routes=/analytics, /autopilot, blocker=Ai Assistant remains partial.
- Operator Campaigns And Flows: status=partial, completion=62%, routes=/campaigns, /flow, /followups, blocker=Ai Assistant remains partial.
- System Payment Reconciliation: status=partial, completion=62%, routes=/billing, /checkout, /wallet, blocker=Ai Assistant remains partial.

## Promise To Production Delta

- Declared surfaces: 37
- Real surfaces: 25
- Partial surfaces: 5
- Latent surfaces: 0
- Phantom surfaces: 7
- Critical gaps:
  - Billing: Billing Activate remains partial.
  - Dashboard: Missing structural roles: side_effect.
  - Ferramentas: Missing structural roles: orchestration, persistence, side_effect.
  - Produtos: onApprove remains partial.
  - Webinarios: (sem texto) remains partial.
  - Pay: phantom surface with incomplete materialization.
  - Privacy: phantom surface with incomplete materialization.
  - Terms: phantom surface with incomplete materialization.

## Structural Parity Gaps

- Integration without observability: Admin Accounts: severity=critical, mode=ai_safe, route=/admin/accounts, summary=Capability Admin Accounts depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Admin Carteira: severity=critical, mode=ai_safe, route=/admin/carteira/connect/accounts, summary=Capability Admin Carteira depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Ai Assistant: severity=critical, mode=ai_safe, route=/ai/assistant/analyze-sentiment, summary=Capability Ai Assistant depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Analytics Analytic: severity=critical, mode=ai_safe, route=/analytics/smart-time, summary=Capability Analytics Analytic depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Auth Anonymous: severity=critical, mode=ai_safe, route=/api/auth/anonymous, summary=Capability Auth Anonymous depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Auth Check: severity=critical, mode=ai_safe, route=/api/auth/check-email, summary=Capability Auth Check depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Auth Facebook: severity=critical, mode=ai_safe, route=/api/auth/facebook/data-deletion, summary=Capability Auth Facebook depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Autopilot Actions: severity=critical, mode=ai_safe, route=/autopilot/actions, summary=Capability Autopilot Actions depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Autopilot Ask: severity=critical, mode=ai_safe, route=/autopilot/ask, summary=Capability Autopilot Ask depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Autopilot Conversion: severity=critical, mode=ai_safe, route=/autopilot/conversion, summary=Capability Autopilot Conversion depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).

## Execution Matrix

- Coverage: 100% classified, unknown=0, criticalUnobserved=0
- matrix:capability:capability:ad-rules: status=untested, truth=inferred, mode=ai_safe, route=/ad-rules, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-accounts: status=observed_fail, truth=observed, mode=ai_safe, route=/admin/accounts, breakpoint=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- matrix:capability:capability:admin-audit: status=observed_fail, truth=observed, mode=ai_safe, route=/admin/accounts/:workspaceId, breakpoint=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- matrix:capability:capability:admin-auth: status=observed_fail, truth=observed, mode=ai_safe, route=/admin/accounts/:workspaceId, breakpoint=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- matrix:capability:capability:admin-carteira: status=observed_fail, truth=observed, mode=ai_safe, route=/admin/accounts/:workspaceId, breakpoint=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- matrix:capability:capability:admin-chat: status=inferred_only, truth=inferred, mode=ai_safe, route=/admin/chat/message, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-clients: status=inferred_only, truth=inferred, mode=ai_safe, route=/admin/clients, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-compliance: status=inferred_only, truth=inferred, mode=ai_safe, route=/admin/compliance/overview, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-config: status=observed_fail, truth=observed, mode=ai_safe, route=/admin/accounts/:workspaceId, breakpoint=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- matrix:capability:capability:admin-dashboard: status=untested, truth=inferred, mode=ai_safe, route=/admin/dashboard/home, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.

## Capability Maturity

- Global Error: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Layout: stage=connected, score=34%, missing=api_surface, orchestration, persistence, side_effect
- Diag: stage=connected, score=46%, missing=persistence, side_effect, runtime_evidence, validation
- Ferramentas Ferramenta: stage=connected, score=50%, missing=api_surface, orchestration, persistence, side_effect
- Onboarding: stage=connected, score=50%, missing=api_surface, orchestration, persistence, side_effect
- Video: stage=connected, score=50%, missing=api_surface, orchestration, persistence, side_effect
- Audio Synthesize: stage=connected, score=56%, missing=persistence, runtime_evidence, validation, scenario_coverage
- Campaign Start: stage=connected, score=56%, missing=persistence, runtime_evidence, validation, scenario_coverage
- Kloel Download: stage=connected, score=56%, missing=persistence, runtime_evidence, validation, scenario_coverage
- Kyc: stage=connected, score=56%, missing=persistence, runtime_evidence, validation, scenario_coverage

## Top Blockers

- codacy/static_hotspot: 37 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- codacy/static_hotspot: 2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in backend/src/autopilot/autopilot.service.ts.
- Billing: Billing Activate remains partial.
- Dashboard: Missing structural roles: side_effect.
- Ferramentas: Missing structural roles: orchestration, persistence, side_effect.
- Produtos: onApprove remains partial.
- Webinarios: (sem texto) remains partial.
- Pay: phantom surface with incomplete materialization.
- Privacy: phantom surface with incomplete materialization.

## Next Work

- [P0] Recover Customer Auth Shell | impact=transformational | mode=ai_safe | evidence=observed/high | risk=critical | Revalidates a customer-visible journey in Customer Auth Shell and converts intended product behavior into executed proof.
- [P0] Recover Customer Whatsapp And Inbox | impact=transformational | mode=ai_safe | evidence=observed/high | risk=critical | Revalidates a customer-visible journey in Customer Whatsapp And Inbox and converts intended product behavior into executed proof.
- [P0] Repair execution path matrix:capability:capability:admin-accounts | impact=transformational | mode=ai_safe | evidence=observed/high | risk=critical | Turns an observed broken path into a precise repair target.
- [P0] Repair execution path matrix:capability:capability:admin-audit | impact=transformational | mode=ai_safe | evidence=observed/high | risk=critical | Turns an observed broken path into a precise repair target.
- [P0] Repair execution path matrix:capability:capability:admin-auth | impact=transformational | mode=ai_safe | evidence=observed/high | risk=critical | Turns an observed broken path into a precise repair target.
- [P0] Repair execution path matrix:capability:capability:admin-carteira | impact=transformational | mode=ai_safe | evidence=observed/high | risk=critical | Turns an observed broken path into a precise repair target.
- [P0] Repair execution path matrix:capability:capability:admin-config | impact=transformational | mode=ai_safe | evidence=observed/high | risk=critical | Turns an observed broken path into a precise repair target.
- [P0] Recover Customer Product And Checkout | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in Customer Product And Checkout and converts intended product behavior into executed proof.

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

- Governance-protected surfaces stay human-required.
- Missing evidence stays missing evidence; PULSE does not upgrade it to certainty.