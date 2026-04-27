# PULSE REPORT — 2026-04-27T01:46:50.673Z

## PULSE VERDICT

- Produto pronto para producao? NAO
- IA pode trabalhar autonomamente ate producao? NAO
- Proximo passo seguro? SIM
- Self-trust: PASS
- No-overclaim: PASS
- Principal blocker: codacy/static_hotspot: 37 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- Proxima acao: Recover Customer Auth Shell

## Current State

- Certification: PARTIAL
- Human replacement: NOT_READY
- Score: 56/100
- Blocking tier: 1
- Scope parity: PASS (medium)
- Structural chains: 772/2362 complete
- Capabilities: real=277, partial=24, latent=10, phantom=0
- Capability maturity: foundational=3, connected=155, operational=16, productionReady=137
- Flows: real=120, partial=0, latent=0, phantom=0
- Structural parity gaps: total=1, critical=0, high=1
- Codacy HIGH issues: 1116
- GitNexus Code Graph: GitNexus is not available (npx gitnexus@latest failed).
- External signals: total=8, runtime=1, change=2, dependency=0, high-impact=4

## Coverage Truth

- Inventory Coverage: 100%
- Classification Coverage: 100%
- Structural Graph Coverage: 38% (794/2094 connected)
  Reason: 794/2094 structural files connected.
- Test Coverage: 11%
  Reason: 167/1581 source modules have spec files.
- Scenario Coverage: 100% (declared=100%, executed=100%, passed=100%)
- Runtime Evidence Coverage: 0% (fresh=0%, stale=0%)
  Reason: 0/4 probes fresh.
- Production Proof Coverage: 89%
  Reason: 277/311 capabilities real.
- Unknown Files: 1
- Orphan Files: 200
- Excluded Directories: 20
- Manifest role: semantic overlay, NOT scope boundary
- Scope source: repo_filesystem

## What is Observed vs Inferred vs Aspirational

### Observed (direct evidence)
- Runtime probes executed: 4
- External signals: 8 total
- Self-trust: PASS
- No-overclaim: PASS

### Inferred (structural analysis)
- 2362 structural chains
- 277 real capabilities
- 120 real flows

### Aspirational (product vision projection)
- 41 projected surfaces
- Target: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 291/291 capability(ies) and 120/120 flow(s) at least partially real, with readiness yellow.

## External Reality

- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=3, mappedFlows=7, summary=37 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=71, mappedFlows=109, summary=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=51, mappedFlows=95, summary=1 HIGH Codacy issue(s) remain in backend/src/autopilot/autopilot.service.ts.
- codacy/static_hotspot: impact=55%, mode=human_required, mappedCapabilities=3, mappedFlows=7, summary=1 HIGH Codacy issue(s) remain in package.json.
- github/code-change: impact=40%, mode=observation_only, mappedCapabilities=0, mappedFlows=0, summary=20 recent commits detected; latest: chore(deps): bump the worker-prod-patches group (#204) Bump
- github_actions/ci-failure: impact=80%, mode=observation_only, mappedCapabilities=0, mappedFlows=0, summary=1 recent CI workflow failure(s): CI
- sentry/runtime-error: impact=40%, mode=observation_only, mappedCapabilities=1, mappedFlows=2, summary=[ERROR] TypeError: Object [object Object] has no method 'updateFrom' (1 occurrences)
- gitnexus/codegraph: impact=30%, mode=observation_only, mappedCapabilities=11, mappedFlows=70, summary=GitNexus is not available (npx gitnexus@latest failed).

## Product Identity

- Current checkpoint: The current product-facing system materializes 267 real capability(ies), 24 partial capability(ies), 0 latent capability(ies), and 0 product-facing phantom capability(ies). System-wide phantom capability count is 0.
- Inferred product: If the currently connected structures converge, the product resolves toward a unified operational platform centered on Billing, Checkout, CRM, Dashboard, Followups, Partnerships, Sales/Vendas, Scrapers.
- Projected checkpoint: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 291/291 capability(ies) and 120/120 flow(s) at least partially real, with readiness yellow.
- Distance: Distance to projected readiness is driven by 0 product-facing phantom capability(ies), 0 system-wide phantom capability(ies), 0 phantom flow(s), 1 structural parity gap(s), and 1116 HIGH Codacy issue(s).

## Product Surfaces

- Billing: status=real, completion=100%, capabilities=8, flows=7
- Checkout: status=real, completion=100%, capabilities=39, flows=107, blocker=Missing structural roles: interface, persistence.
- CRM: status=real, completion=100%, capabilities=4, flows=81
- Dashboard: status=real, completion=100%, capabilities=6, flows=19
- Followups: status=real, completion=100%, capabilities=67, flows=105, blocker=Missing structural roles: orchestration, persistence, side_effect.
- Partnerships: status=real, completion=100%, capabilities=14, flows=62
- Sales/Vendas: status=real, completion=100%, capabilities=5, flows=23
- Scrapers: status=real, completion=100%, capabilities=1, flows=0
- Settings: status=real, completion=100%, capabilities=64, flows=111
- Analytics: status=real, completion=99%, capabilities=13, flows=93, blocker=Maturity is still missing: runtime_evidence, codacy_hygiene.
- Anuncios/Ads: status=real, completion=99%, capabilities=78, flows=103, blocker=Missing structural roles: persistence.
- Campaigns: status=real, completion=99%, capabilities=57, flows=111, blocker=Maturity is still missing: runtime_evidence, codacy_hygiene.

## Experience Projection

- Admin Settings Kyc Banking: status=real, completion=85%, routes=/billing, /settings, /wallet, blocker=Missing structural roles: interface, persistence.
- Admin Whatsapp Session Control: status=real, completion=85%, routes=/settings, /whatsapp, blocker=Missing structural roles: interface, persistence.
- Customer Auth Shell: status=real, completion=85%, routes=/dashboard, blocker=Missing structural roles: interface, persistence.
- Customer Product And Checkout: status=real, completion=85%, routes=/billing, /checkout, /products, blocker=Missing structural roles: interface, persistence.
- Customer Whatsapp And Inbox: status=real, completion=85%, routes=/inbox, /marketing, /whatsapp, blocker=Missing structural roles: interface, persistence.
- Operator Autopilot Run: status=real, completion=85%, routes=/analytics, /autopilot, blocker=Missing structural roles: interface, persistence.
- Operator Campaigns And Flows: status=real, completion=85%, routes=/campaigns, /flow, /followups, blocker=Missing structural roles: interface, persistence.
- System Payment Reconciliation: status=real, completion=85%, routes=/billing, /checkout, /wallet, blocker=Missing structural roles: interface, persistence.

## Promise To Production Delta

- Declared surfaces: 41
- Real surfaces: 32
- Partial surfaces: 0
- Latent surfaces: 0
- Phantom surfaces: 9
- Critical gaps:
  - Pay: phantom surface with incomplete materialization.
  - Privacy: phantom surface with incomplete materialization.
  - Produtos: phantom surface with incomplete materialization.
  - Terms: phantom surface with incomplete materialization.
  - Tools: phantom surface with incomplete materialization.

## Structural Parity Gaps

- Runtime without product surface: Marketing Skill: severity=high, mode=ai_safe, summary=Capability Marketing Skill is runtime-critical or operationally important but still has no product-facing surface or routed chain attached to it.

## Capability Maturity

- Global Error: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Layout: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Ferramentas Ferramenta: stage=connected, score=40%, missing=api_surface, orchestration, persistence, side_effect
- Onboarding: stage=connected, score=40%, missing=api_surface, orchestration, persistence, side_effect
- Video: stage=connected, score=40%, missing=api_surface, orchestration, persistence, side_effect
- Diag: stage=connected, score=46%, missing=persistence, side_effect, runtime_evidence, validation
- Get: stage=connected, score=46%, missing=persistence, side_effect, runtime_evidence, validation
- Lifecycle On: stage=connected, score=46%, missing=persistence, side_effect, runtime_evidence, validation
- Audio Synthesize: stage=connected, score=56%, missing=persistence, runtime_evidence, validation, scenario_coverage
- Auth Anonymous: stage=connected, score=56%, missing=persistence, runtime_evidence, validation, scenario_coverage

## Top Blockers

- codacy/static_hotspot: 37 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- codacy/static_hotspot: 2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in backend/src/autopilot/autopilot.service.ts.
- github_actions/ci-failure: 1 recent CI workflow failure(s): CI
- Pay: phantom surface with incomplete materialization.
- Privacy: phantom surface with incomplete materialization.
- Produtos: phantom surface with incomplete materialization.
- Terms: phantom surface with incomplete materialization.
- Tools: phantom surface with incomplete materialization.
- Runtime without product surface: Marketing Skill: Capability Marketing Skill is runtime-critical or operationally important but still has no product-facing surface or routed chain attached to it.

## Next Work

- [P0] Recover Customer Auth Shell | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in Customer Auth Shell and converts intended product behavior into executed proof.
- [P0] Recover Customer Product And Checkout | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in Customer Product And Checkout and converts intended product behavior into executed proof.
- [P0] Recover Customer Whatsapp And Inbox | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in Customer Whatsapp And Inbox and converts intended product behavior into executed proof.
- [P0] Recover System Payment Reconciliation | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in System Payment Reconciliation and converts intended product behavior into executed proof.
- [P1] Materialize capability Ai Assistant | impact=material | mode=ai_safe | evidence=observed/high | risk=high | Moves capability Ai Assistant from partial toward real operation by closing the missing structural roles and maturity gaps that still block product readiness.
- [P1] Materialize capability Analytics Analytic | impact=material | mode=ai_safe | evidence=observed/high | risk=high | Moves capability Analytics Analytic from partial toward real operation by closing the missing structural roles and maturity gaps that still block product readiness.
- [P1] Materialize capability Autopilot Actions | impact=material | mode=ai_safe | evidence=observed/high | risk=high | Moves capability Autopilot Actions from partial toward real operation by closing the missing structural roles and maturity gaps that still block product readiness.
- [P1] Materialize capability Autopilot Actions | impact=material | mode=ai_safe | evidence=observed/high | risk=high | Moves capability Autopilot Actions from partial toward real operation by closing the missing structural roles and maturity gaps that still block product readiness.

## Cross-Artifact Consistency

- PASS: all loaded PULSE artifacts are mutually consistent on shared fields (status, verdicts, counters, generatedAt).

## Cleanup

- Canonical dir: /Users/danielpenin/whatsapp_saas/.pulse/current
- Mirrors: PULSE_HEALTH.json, PULSE_CERTIFICATE.json, PULSE_CLI_DIRECTIVE.json, PULSE_ARTIFACT_INDEX.json, PULSE_REPORT.md
- Removed legacy artifacts this run: 2

## Truth Model

- `observed`: backed by runtime, browser, declared flows, actors or explicit execution evidence.
- `inferred`: reconstructed from structure with no direct executed proof in this run.
- `projected`: future-consistent product shape implied by connected latent structures.

## Safety

- Governance-protected surfaces stay human-required.
- Missing evidence stays missing evidence; PULSE does not upgrade it to certainty.