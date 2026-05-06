# PULSE REPORT — 2026-05-06T02:43:08.365Z

## Current State

- Certification: NOT_CERTIFIED
- Human replacement: NOT_READY
- Score: 48/100
- Blocking tier: 0
- Scope parity: PASS (medium)
- Structural chains: 647/1847 complete
- Capabilities: real=227, partial=34, latent=34, phantom=0
- Capability maturity: foundational=16, connected=254, operational=0, productionReady=25
- Flows: real=83, partial=0, latent=0, phantom=0
- Structural parity gaps: total=33, critical=17, high=5
- Codacy HIGH issues: 1076
- External signals: total=6, runtime=1, change=1, dependency=0, high-impact=3

## External Reality

- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=3, mappedFlows=0, summary=37 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=26, mappedFlows=8, summary=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=18, mappedFlows=13, summary=1 HIGH Codacy issue(s) remain in backend/src/autopilot/autopilot.service.ts.
- codacy/static_hotspot: impact=55%, mode=human_required, mappedCapabilities=2, mappedFlows=0, summary=1 HIGH Codacy issue(s) remain in package.json.
- github/code-change: impact=40%, mode=ai_safe, mappedCapabilities=5, mappedFlows=1, summary=20 recent commits detected; latest: chore: lock ai constitution and obsidian graph mirror (#235)
- datadog/performance-metric: impact=20%, mode=ai_safe, mappedCapabilities=5, mappedFlows=6, summary=System metrics checked; no critical anomalies detected in last hour

## Product Identity

- Current checkpoint: The current product-facing system materializes 227 real capability(ies), 34 partial capability(ies), 2 latent capability(ies), and 0 product-facing phantom capability(ies). System-wide phantom capability count is 0.
- Inferred product: If the currently connected structures converge, the product resolves toward a unified operational platform centered on Analytics, Billing, Campaigns, CIA/Agent, CRM, Dashboard, Partnerships, Scrapers.
- Projected checkpoint: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 261/263 capability(ies) and 83/83 flow(s) at least partially real, with readiness yellow.
- Distance: Distance to projected readiness is driven by 0 product-facing phantom capability(ies), 0 system-wide phantom capability(ies), 0 phantom flow(s), 33 structural parity gap(s), and 1076 HIGH Codacy issue(s).

## Product Surfaces

- Analytics: status=real, completion=100%, capabilities=3, flows=4
- Billing: status=real, completion=100%, capabilities=8, flows=5
- Campaigns: status=real, completion=100%, capabilities=1, flows=0
- CIA/Agent: status=real, completion=100%, capabilities=9, flows=16
- CRM: status=real, completion=100%, capabilities=6, flows=18
- Dashboard: status=real, completion=100%, capabilities=4, flows=0
- Partnerships: status=real, completion=100%, capabilities=11, flows=5
- Scrapers: status=real, completion=100%, capabilities=1, flows=0
- Anuncios/Ads: status=real, completion=98%, capabilities=25, flows=26, blocker=Missing structural roles: persistence, side_effect.
- Followups: status=real, completion=98%, capabilities=26, flows=14, blocker=Missing structural roles: interface, orchestration, side_effect.
- Checkout: status=real, completion=97%, capabilities=23, flows=43, blocker=Missing structural roles: orchestration, persistence, side_effect.
- Onboarding: status=real, completion=97%, capabilities=2, flows=8, blocker=Missing structural roles: orchestration, persistence, side_effect.

## Experience Projection

- Operator Campaigns And Flows: status=real, completion=85%, routes=/campaigns, /flow, /followups, blocker=Missing structural roles: interface, orchestration, side_effect.
- Admin Settings Kyc Banking: status=partial, completion=84%, routes=/billing, /settings, /wallet, blocker=Missing structural roles: persistence, side_effect.
- Admin Whatsapp Session Control: status=partial, completion=84%, routes=/settings, /whatsapp, blocker=Missing structural roles: persistence, side_effect.
- Customer Product And Checkout: status=partial, completion=84%, routes=/billing, /checkout, /products, blocker=Missing structural roles: orchestration, persistence, side_effect.
- Customer Whatsapp And Inbox: status=partial, completion=84%, routes=/inbox, /marketing, /whatsapp, blocker=Missing structural roles: persistence, side_effect.
- Operator Autopilot Run: status=partial, completion=84%, routes=/analytics, /autopilot, blocker=Missing structural roles: persistence, side_effect.
- System Payment Reconciliation: status=partial, completion=84%, routes=/billing, /checkout, /wallet, blocker=Missing structural roles: persistence, side_effect.
- Customer Auth Shell: status=partial, completion=83%, routes=/dashboard, blocker=Missing structural roles: persistence, side_effect.

## Promise To Production Delta

- Declared surfaces: 43
- Real surfaces: 32
- Partial surfaces: 1
- Latent surfaces: 0
- Phantom surfaces: 10
- Critical gaps:
  - Produtos: Missing structural roles: orchestration, persistence, side_effect.
  - Cookies: phantom surface with incomplete materialization.
  - Pay: phantom surface with incomplete materialization.
  - Privacy: phantom surface with incomplete materialization.
  - Terms: phantom surface with incomplete materialization.
  - Tools: phantom surface with incomplete materialization.

## Structural Parity Gaps

- Integration without observability: Autopilot: severity=critical, mode=ai_safe, route=/autopilot/test, summary=Capability Autopilot depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Autopilot Actions: severity=critical, mode=ai_safe, route=/autopilot/actions, summary=Capability Autopilot Actions depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Autopilot Ask: severity=critical, mode=ai_safe, route=/autopilot/ask, summary=Capability Autopilot Ask depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Autopilot Config: severity=critical, mode=ai_safe, route=/autopilot/config, summary=Capability Autopilot Config depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Autopilot Conversion: severity=critical, mode=ai_safe, route=/autopilot/conversion, summary=Capability Autopilot Conversion depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Autopilot Impact: severity=critical, mode=ai_safe, route=/autopilot/impact, summary=Capability Autopilot Impact depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Autopilot Money: severity=critical, mode=ai_safe, route=/autopilot/money-machine, summary=Capability Autopilot Money depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Autopilot Next: severity=critical, mode=ai_safe, route=/autopilot/next-best-action, summary=Capability Autopilot Next depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Autopilot Process: severity=critical, mode=ai_safe, route=/autopilot/process, summary=Capability Autopilot Process depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Autopilot Retry: severity=critical, mode=ai_safe, route=/autopilot/retry, summary=Capability Autopilot Retry depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).

## Capability Maturity

- Kyc Path: stage=foundational, score=20%, missing=interface, api_surface, orchestration, persistence
- Marketing Path: stage=foundational, score=20%, missing=interface, api_surface, orchestration, persistence
- Admin Contas: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Admin Produtos: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Area Slug: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Checkout Plan: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Global Error: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Layout: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Leads Lead: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Produtos Produto: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect

## Top Blockers

- codacy/static_hotspot: 37 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- codacy/static_hotspot: 2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in backend/src/autopilot/autopilot.service.ts.
- Produtos: Missing structural roles: orchestration, persistence, side_effect.
- Cookies: phantom surface with incomplete materialization.
- Pay: phantom surface with incomplete materialization.
- Privacy: phantom surface with incomplete materialization.
- Terms: phantom surface with incomplete materialization.
- Tools: phantom surface with incomplete materialization.
- Integration without observability: Autopilot: Capability Autopilot depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).

## Next Work

- [P0] Recover Customer Auth Shell | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in Customer Auth Shell and converts intended product behavior into executed proof.
- [P0] Recover Customer Product And Checkout | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in Customer Product And Checkout and converts intended product behavior into executed proof.
- [P0] Recover Customer Whatsapp And Inbox | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in Customer Whatsapp And Inbox and converts intended product behavior into executed proof.
- [P0] Recover System Payment Reconciliation | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in System Payment Reconciliation and converts intended product behavior into executed proof.
- [P1] Recover Admin Settings Kyc Banking | impact=material | mode=ai_safe | evidence=inferred/medium | risk=high | Restores operator/admin execution confidence for Admin Settings Kyc Banking so the product can be operated without hidden manual gaps.
- [P1] Recover Admin Whatsapp Session Control | impact=material | mode=ai_safe | evidence=inferred/medium | risk=high | Restores operator/admin execution confidence for Admin Whatsapp Session Control so the product can be operated without hidden manual gaps.
- [P1] Recover Operator Autopilot Run | impact=material | mode=ai_safe | evidence=inferred/medium | risk=high | Restores operator/admin execution confidence for Operator Autopilot Run so the product can be operated without hidden manual gaps.
- [P1] Recover Operator Campaigns And Flows | impact=material | mode=ai_safe | evidence=inferred/medium | risk=high | Restores operator/admin execution confidence for Operator Campaigns And Flows so the product can be operated without hidden manual gaps.

## Cleanup

- Canonical dir: /Users/danielpenin/whatsapp_saas/.pulse/current
- Mirrors: PULSE_HEALTH.json, PULSE_CERTIFICATE.json, PULSE_CLI_DIRECTIVE.json, PULSE_ARTIFACT_INDEX.json, PULSE_REPORT.md
- Removed legacy artifacts this run: 7

## Truth Model

- `observed`: backed by runtime, browser, declared flows, actors or explicit execution evidence.
- `inferred`: reconstructed from structure with no direct executed proof in this run.
- `projected`: future-consistent product shape implied by connected latent structures.

## Safety

- Governance-protected surfaces stay human-required.
- Missing evidence stays missing evidence; PULSE does not upgrade it to certainty.