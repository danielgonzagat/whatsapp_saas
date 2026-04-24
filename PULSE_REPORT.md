# PULSE REPORT — 2026-04-24T12:56:31.227Z

## Current State

- Certification: PARTIAL
- Human replacement: NOT_READY
- Score: 57/100
- Blocking tier: 1
- Scope parity: PASS (high)
- Structural chains: 766/2332 complete
- Capabilities: real=275, partial=24, latent=10, phantom=0
- Capability maturity: foundational=3, connected=233, operational=2, productionReady=71
- Flows: real=121, partial=0, latent=0, phantom=0
- Structural parity gaps: total=0, critical=0, high=0
- Codacy HIGH issues: 1116
- External signals: total=6, runtime=1, change=1, dependency=0, high-impact=3

## External Reality

- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=3, mappedFlows=7, summary=37 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=64, mappedFlows=110, summary=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=51, mappedFlows=95, summary=1 HIGH Codacy issue(s) remain in backend/src/autopilot/autopilot.service.ts.
- codacy/static_hotspot: impact=55%, mode=human_required, mappedCapabilities=3, mappedFlows=7, summary=1 HIGH Codacy issue(s) remain in package.json.
- github/code-change: impact=40%, mode=observation_only, mappedCapabilities=0, mappedFlows=0, summary=20 recent commits detected; latest: chore(deps): bump the worker-prod-patches group (#204) Bump
- sentry/runtime-error: impact=40%, mode=observation_only, mappedCapabilities=1, mappedFlows=2, summary=[ERROR] TypeError: Object [object Object] has no method 'updateFrom' (1 occurrences)

## Product Identity

- Current checkpoint: The current product-facing system materializes 266 real capability(ies), 24 partial capability(ies), 0 latent capability(ies), and 0 product-facing phantom capability(ies). System-wide phantom capability count is 0.
- Inferred product: If the currently connected structures converge, the product resolves toward a unified operational platform centered on Anuncios/Ads, Billing, Checkout, CRM, Dashboard, Followups, Partnerships, Sales/Vendas.
- Projected checkpoint: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 290/290 capability(ies) and 121/121 flow(s) at least partially real, with readiness yellow.
- Distance: Distance to projected readiness is driven by 0 product-facing phantom capability(ies), 0 system-wide phantom capability(ies), 0 phantom flow(s), 0 structural parity gap(s), and 1116 HIGH Codacy issue(s).

## Product Surfaces

- Anuncios/Ads: status=real, completion=100%, capabilities=71, flows=104, blocker=Missing structural roles: persistence.
- Billing: status=real, completion=100%, capabilities=8, flows=7
- Checkout: status=real, completion=100%, capabilities=39, flows=108, blocker=Missing structural roles: interface, persistence.
- CRM: status=real, completion=100%, capabilities=28, flows=105, blocker=Missing structural roles: persistence.
- Dashboard: status=real, completion=100%, capabilities=6, flows=19
- Followups: status=real, completion=100%, capabilities=65, flows=106, blocker=Missing structural roles: orchestration, persistence, side_effect.
- Partnerships: status=real, completion=100%, capabilities=12, flows=62
- Sales/Vendas: status=real, completion=100%, capabilities=5, flows=23
- Scrapers: status=real, completion=100%, capabilities=1, flows=0
- Settings: status=real, completion=100%, capabilities=69, flows=112
- Analytics: status=real, completion=99%, capabilities=30, flows=95, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.
- Campaigns: status=real, completion=99%, capabilities=55, flows=112, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage, codacy_hygiene.

## Experience Projection

- Admin Settings Kyc Banking: status=real, completion=85%, routes=/billing, /settings, /wallet, blocker=Missing structural roles: persistence.
- Admin Whatsapp Session Control: status=real, completion=85%, routes=/settings, /whatsapp, blocker=Missing structural roles: persistence.
- Customer Auth Shell: status=real, completion=85%, routes=/dashboard, blocker=Missing structural roles: persistence.
- Customer Product And Checkout: status=real, completion=85%, routes=/billing, /checkout, /products, blocker=Missing structural roles: persistence.
- Customer Whatsapp And Inbox: status=real, completion=85%, routes=/inbox, /marketing, /whatsapp, blocker=Missing structural roles: persistence.
- Operator Autopilot Run: status=real, completion=85%, routes=/analytics, /autopilot, blocker=Missing structural roles: persistence.
- Operator Campaigns And Flows: status=real, completion=85%, routes=/campaigns, /flow, /followups, blocker=Missing structural roles: persistence.
- System Payment Reconciliation: status=real, completion=85%, routes=/billing, /checkout, /wallet, blocker=Missing structural roles: persistence.

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
- Pay: phantom surface with incomplete materialization.
- Privacy: phantom surface with incomplete materialization.
- Produtos: phantom surface with incomplete materialization.
- Terms: phantom surface with incomplete materialization.
- Tools: phantom surface with incomplete materialization.
- Autopilot Conversion: 1 HIGH Codacy issue(s).
- Autopilot Actions: 1 HIGH Codacy issue(s).

## Next Work

- [P0] Recover Customer Auth Shell | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in Customer Auth Shell and converts intended product behavior into executed proof.
- [P0] Recover Customer Product And Checkout | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in Customer Product And Checkout and converts intended product behavior into executed proof.
- [P0] Recover Customer Whatsapp And Inbox | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in Customer Whatsapp And Inbox and converts intended product behavior into executed proof.
- [P0] Recover System Payment Reconciliation | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in System Payment Reconciliation and converts intended product behavior into executed proof.
- [P1] Materialize capability Autopilot Actions | impact=material | mode=ai_safe | evidence=observed/high | risk=high | Moves capability Autopilot Actions from partial toward real operation by closing the missing structural roles and maturity gaps that still block product readiness.
- [P1] Materialize capability Whatsapp Session | impact=material | mode=ai_safe | evidence=observed/high | risk=high | Moves capability Whatsapp Session from partial toward real operation by closing the missing structural roles and maturity gaps that still block product readiness.
- [P1] Recover Admin Settings Kyc Banking | impact=material | mode=ai_safe | evidence=inferred/medium | risk=high | Restores operator/admin execution confidence for Admin Settings Kyc Banking so the product can be operated without hidden manual gaps.
- [P1] Recover Admin Whatsapp Session Control | impact=material | mode=ai_safe | evidence=inferred/medium | risk=high | Restores operator/admin execution confidence for Admin Whatsapp Session Control so the product can be operated without hidden manual gaps.

## Cleanup

- Canonical dir: /Users/danielpenin/whatsapp_saas/.pulse/current
- Mirrors: PULSE_HEALTH.json, PULSE_CERTIFICATE.json, PULSE_CLI_DIRECTIVE.json, PULSE_ARTIFACT_INDEX.json, PULSE_REPORT.md
- Removed legacy artifacts this run: 6

## Truth Model

- `observed`: backed by runtime, browser, declared flows, actors or explicit execution evidence.
- `inferred`: reconstructed from structure with no direct executed proof in this run.
- `projected`: future-consistent product shape implied by connected latent structures.

## Safety

- Governance-protected surfaces stay human-required.
- Missing evidence stays missing evidence; PULSE does not upgrade it to certainty.