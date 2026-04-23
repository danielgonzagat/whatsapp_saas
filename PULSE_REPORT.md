# PULSE REPORT — 2026-04-23T05:04:20.551Z

## Current State

- Certification: NOT_CERTIFIED
- Human replacement: NOT_READY
- Score: 52/100
- Blocking tier: 0
- Scope parity: PASS (high)
- Structural chains: 645/1839 complete
- Capabilities: real=240, partial=18, latent=31, phantom=0
- Capability maturity: foundational=15, connected=249, operational=0, productionReady=25
- Flows: real=78, partial=0, latent=0, phantom=0
- Structural parity gaps: total=18, critical=3, high=5
- Codacy HIGH issues: 1336
- External signals: total=10, runtime=0, change=3, dependency=0, high-impact=7

## External Reality

- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=2, mappedFlows=4, summary=22 HIGH Codacy issue(s) remain in docker/prometheus/alerting-rules.yml.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=19, mappedFlows=13, summary=20 HIGH Codacy issue(s) remain in worker/autopilot-alerts.yaml.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=4, mappedFlows=0, summary=1 HIGH Codacy issue(s) remain in backend/src/audit/audit.interceptor.ts.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=22, mappedFlows=4, summary=1 HIGH Codacy issue(s) remain in backend/src/auth/roles.decorator.ts.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=4, mappedFlows=4, summary=1 HIGH Codacy issue(s) remain in backend/src/flows/flow-optimizer.service.ts.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=20, mappedFlows=37, summary=1 HIGH Codacy issue(s) remain in frontend/src/app/(checkout)/components/CheckoutThemePage.tsx.
- codacy/static_hotspot: impact=55%, mode=human_required, mappedCapabilities=2, mappedFlows=0, summary=1 HIGH Codacy issue(s) remain in package.json.
- github/code-change: impact=40%, mode=ai_safe, mappedCapabilities=7, mappedFlows=0, summary=20 recent commits detected; latest: fix: classify pulse external side effects

## Product Identity

- Current checkpoint: The current product-facing system materializes 240 real capability(ies), 18 partial capability(ies), 2 latent capability(ies), and 0 product-facing phantom capability(ies). System-wide phantom capability count is 0.
- Inferred product: If the currently connected structures converge, the product resolves toward a unified operational platform centered on Autopilot, Billing, Campaigns, CIA/Agent, Dashboard, Partnerships, Scrapers, Anuncios/Ads.
- Projected checkpoint: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 258/260 capability(ies) and 78/78 flow(s) at least partially real, with readiness yellow.
- Distance: Distance to projected readiness is driven by 0 product-facing phantom capability(ies), 0 system-wide phantom capability(ies), 0 phantom flow(s), 18 structural parity gap(s), and 1336 HIGH Codacy issue(s).

## Product Surfaces

- Autopilot: status=real, completion=100%, capabilities=16, flows=13
- Billing: status=real, completion=100%, capabilities=8, flows=5
- Campaigns: status=real, completion=100%, capabilities=1, flows=0
- CIA/Agent: status=real, completion=100%, capabilities=9, flows=15
- Dashboard: status=real, completion=100%, capabilities=3, flows=0
- Partnerships: status=real, completion=100%, capabilities=11, flows=5
- Scrapers: status=real, completion=100%, capabilities=1, flows=0
- Anuncios/Ads: status=real, completion=98%, capabilities=25, flows=22, blocker=Missing structural roles: persistence, side_effect.
- Checkout: status=real, completion=98%, capabilities=20, flows=41, blocker=Missing structural roles: interface, side_effect.
- CRM: status=real, completion=98%, capabilities=7, flows=16, blocker=Missing structural roles: orchestration, persistence, side_effect.
- Followups: status=real, completion=97%, capabilities=26, flows=13, blocker=Missing structural roles: interface, orchestration, side_effect.
- Onboarding: status=real, completion=97%, capabilities=2, flows=8, blocker=Missing structural roles: orchestration, persistence, side_effect.

## Experience Projection

- Admin Settings Kyc Banking: status=partial, completion=84%, routes=/billing, /settings, /wallet, blocker=Missing structural roles: persistence, side_effect.
- Admin Whatsapp Session Control: status=partial, completion=84%, routes=/settings, /whatsapp, blocker=Missing structural roles: persistence, side_effect.
- Customer Auth Shell: status=partial, completion=84%, routes=/dashboard, blocker=Missing structural roles: persistence, side_effect.
- Customer Whatsapp And Inbox: status=partial, completion=84%, routes=/inbox, /marketing, /whatsapp, blocker=Missing structural roles: persistence, side_effect.
- Operator Autopilot Run: status=partial, completion=84%, routes=/analytics, /autopilot, blocker=Missing structural roles: persistence, side_effect.
- Operator Campaigns And Flows: status=partial, completion=84%, routes=/campaigns, /flow, /followups, blocker=Missing structural roles: interface, side_effect.
- System Payment Reconciliation: status=partial, completion=84%, routes=/billing, /checkout, /wallet, blocker=Missing structural roles: persistence, side_effect.
- Customer Product And Checkout: status=partial, completion=83%, routes=/billing, /checkout, /products, blocker=Missing structural roles: interface, side_effect.

## Promise To Production Delta

- Declared surfaces: 41
- Real surfaces: 29
- Partial surfaces: 1
- Latent surfaces: 0
- Phantom surfaces: 11
- Critical gaps:
  - Produtos: Missing structural roles: orchestration, persistence, side_effect.
  - Cookies: phantom surface with incomplete materialization.
  - Pay: phantom surface with incomplete materialization.
  - Preview: phantom surface with incomplete materialization.
  - Privacy: phantom surface with incomplete materialization.
  - Terms: phantom surface with incomplete materialization.
  - Tools: phantom surface with incomplete materialization.

## Structural Parity Gaps

- Integration without observability: Flows Flow: severity=critical, mode=ai_safe, route=/flows, summary=Capability Flows Flow depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Health: severity=critical, mode=ai_safe, route=/health/:workspaceId, summary=Capability Health depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Meta Ads: severity=critical, mode=ai_safe, route=/meta/ads/campaigns, summary=Capability Meta Ads depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Flow without validation: flow-post-flow-templates-id-download: severity=high, mode=ai_safe, route=/flow, summary=flow-post-flow-templates-id-download -> /flow still exists as a connected product flow candidate without declared validation/oracle coverage.
- Flow without validation: flow-post-flows-ai-optimize-flow-id: severity=high, mode=ai_safe, route=/flow, summary=flow-post-flows-ai-optimize-flow-id -> /flow still exists as a connected product flow candidate without declared validation/oracle coverage.
- Flow without validation: flow-post-flows-execution-execution-id-retry: severity=high, mode=ai_safe, route=/flow, summary=flow-post-flows-execution-execution-id-retry -> /flow still exists as a connected product flow candidate without declared validation/oracle coverage.
- Flow without validation: meta-post-meta-auth-disconnect: severity=high, mode=ai_safe, route=/meta/auth/disconnect, summary=meta-post-meta-auth-disconnect -> /whatsapp still exists as a connected product flow candidate without declared validation/oracle coverage.
- Flow without validation: reset-post-auth-reset-password: severity=high, mode=ai_safe, route=/auth/reset-password, summary=reset-post-auth-reset-password -> /reset-password still exists as a connected product flow candidate without declared validation/oracle coverage.
- Back without front: Health: severity=medium, mode=ai_safe, route=/health/:workspaceId, summary=Capability Health is structurally live on backend/runtime paths but still lacks an identified product surface.
- Back without front: Internal (9 Routes): severity=medium, mode=ai_safe, summary=Internal (9 routes) exposes backend or runtime capability with no matching product surface detected in the UI.

## Capability Maturity

- Kyc Path: stage=foundational, score=20%, missing=interface, api_surface, orchestration, persistence
- Marketing Path: stage=foundational, score=20%, missing=interface, api_surface, orchestration, persistence
- Admin Contas: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Admin Produtos: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Checkout Plan: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Global Error: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Layout: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Leads Lead: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Produtos Produto: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Ferramentas Ferramenta: stage=connected, score=40%, missing=api_surface, orchestration, persistence, side_effect

## Top Blockers

- codacy/static_hotspot: 22 HIGH Codacy issue(s) remain in docker/prometheus/alerting-rules.yml.
- codacy/static_hotspot: 20 HIGH Codacy issue(s) remain in worker/autopilot-alerts.yaml.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in backend/src/audit/audit.interceptor.ts.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in backend/src/auth/roles.decorator.ts.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in backend/src/flows/flow-optimizer.service.ts.
- Produtos: Missing structural roles: orchestration, persistence, side_effect.
- Cookies: phantom surface with incomplete materialization.
- Pay: phantom surface with incomplete materialization.
- Preview: phantom surface with incomplete materialization.
- Privacy: phantom surface with incomplete materialization.

## Next Work

- [P0] Recover Customer Auth Shell | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in Customer Auth Shell and converts intended product behavior into executed proof.
- [P0] Recover Customer Product And Checkout | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in Customer Product And Checkout and converts intended product behavior into executed proof.
- [P0] Recover Customer Whatsapp And Inbox | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in Customer Whatsapp And Inbox and converts intended product behavior into executed proof.
- [P0] Recover System Payment Reconciliation | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in System Payment Reconciliation and converts intended product behavior into executed proof.
- [P1] Resolve Github Actions Ci Failure | impact=transformational | mode=ai_safe | evidence=observed/high | risk=high | Translates observed github_actions pressure into capability/flow convergence so the real product catches up with live runtime and change evidence.
- [P2] Front without back: Onboarding | impact=transformational | mode=ai_safe | evidence=observed/high | risk=medium | Converts a user-facing illusion into a real product chain for Front without back: Onboarding.
- [P2] Front without back: Checkout Plan | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=medium | Converts a user-facing illusion into a real product chain for Front without back: Checkout Plan.
- [P2] Front without back: Leads Lead | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=medium | Converts a user-facing illusion into a real product chain for Front without back: Leads Lead.

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