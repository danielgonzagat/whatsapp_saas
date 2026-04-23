# PULSE REPORT — 2026-04-23T04:16:53.534Z

## Current State

- Certification: NOT_CERTIFIED
- Human replacement: NOT_READY
- Score: 52/100
- Blocking tier: 0
- Scope parity: PASS (high)
- Structural chains: 834/1839 complete
- Capabilities: real=179, partial=16, latent=98, phantom=0
- Capability maturity: foundational=15, connected=253, operational=5, productionReady=20
- Flows: real=159, partial=0, latent=0, phantom=0
- Structural parity gaps: total=63, critical=18, high=35
- Codacy HIGH issues: 1336
- External signals: total=9, runtime=0, change=3, dependency=0, high-impact=6

## External Reality

- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=2, mappedFlows=4, summary=23 HIGH Codacy issue(s) remain in docker/prometheus/alerting-rules.yml.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=24, mappedFlows=17, summary=20 HIGH Codacy issue(s) remain in worker/autopilot-alerts.yaml.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=4, mappedFlows=0, summary=1 HIGH Codacy issue(s) remain in backend/src/audit/audit.interceptor.ts.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=32, mappedFlows=122, summary=1 HIGH Codacy issue(s) remain in backend/src/auth/public.decorator.ts.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=21, mappedFlows=50, summary=1 HIGH Codacy issue(s) remain in frontend/src/app/(checkout)/components/CheckoutThemePage.tsx.
- codacy/static_hotspot: impact=55%, mode=human_required, mappedCapabilities=2, mappedFlows=0, summary=1 HIGH Codacy issue(s) remain in package.json.
- github/code-change: impact=40%, mode=ai_safe, mappedCapabilities=5, mappedFlows=18, summary=20 recent commits detected; latest: fix: trace backend service calls after method signature
- github_actions/ci-failure: impact=80%, mode=ai_safe, mappedCapabilities=2, mappedFlows=13, summary=1 recent CI workflow failure(s): CI

## Product Identity

- Current checkpoint: The current product-facing system materializes 179 real capability(ies), 16 partial capability(ies), 69 latent capability(ies), and 0 product-facing phantom capability(ies). System-wide phantom capability count is 0.
- Inferred product: If the currently connected structures converge, the product resolves toward a unified operational platform centered on Analytics, Campaigns, Followups, Inbox/Chat, Sales/Vendas, Products, Billing, Checkout.
- Projected checkpoint: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 195/264 capability(ies) and 159/159 flow(s) at least partially real, with readiness yellow.
- Distance: Distance to projected readiness is driven by 0 product-facing phantom capability(ies), 0 system-wide phantom capability(ies), 0 phantom flow(s), 63 structural parity gap(s), and 1336 HIGH Codacy issue(s).

## Product Surfaces

- Analytics: status=real, completion=100%, capabilities=3, flows=6
- Campaigns: status=real, completion=100%, capabilities=1, flows=0
- Followups: status=real, completion=100%, capabilities=2, flows=9
- Inbox/Chat: status=real, completion=100%, capabilities=2, flows=19
- Sales/Vendas: status=real, completion=100%, capabilities=2, flows=0
- Products: status=real, completion=99%, capabilities=7, flows=48, blocker=Missing structural roles: interface, orchestration, side_effect.
- Billing: status=real, completion=98%, capabilities=11, flows=85, blocker=Missing structural roles: interface, side_effect.
- Checkout: status=real, completion=96%, capabilities=29, flows=56, blocker=Missing structural roles: interface, side_effect.
- Auth: status=real, completion=94%, capabilities=53, flows=103, blocker=Missing structural roles: interface.
- Anuncios/Ads: status=real, completion=93%, capabilities=8, flows=16, blocker=Missing structural roles: persistence, side_effect.
- Video/Voice: status=real, completion=93%, capabilities=7, flows=8, blocker=Missing structural roles: orchestration, persistence, side_effect.
- CRM: status=real, completion=92%, capabilities=34, flows=60, blocker=Missing structural roles: interface.

## Experience Projection

- Customer Product And Checkout: status=partial, completion=84%, routes=/billing, /checkout, /products, blocker=Missing structural roles: interface, orchestration, side_effect.
- Operator Campaigns And Flows: status=partial, completion=84%, routes=/campaigns, /flow, /followups, blocker=Missing structural roles: interface, orchestration, side_effect.
- System Payment Reconciliation: status=partial, completion=84%, routes=/billing, /checkout, /wallet, blocker=Missing structural roles: interface, orchestration, side_effect.
- Admin Settings Kyc Banking: status=partial, completion=83%, routes=/billing, /settings, /wallet, blocker=Missing structural roles: interface, orchestration, side_effect.
- Admin Whatsapp Session Control: status=partial, completion=83%, routes=/settings, /whatsapp, blocker=Missing structural roles: interface, orchestration, side_effect.
- Customer Auth Shell: status=partial, completion=83%, routes=/dashboard, blocker=Missing structural roles: interface, orchestration, side_effect.
- Customer Whatsapp And Inbox: status=partial, completion=83%, routes=/inbox, /marketing, /whatsapp, blocker=Missing structural roles: interface, orchestration, side_effect.
- Operator Autopilot Run: status=partial, completion=83%, routes=/analytics, /autopilot, blocker=Missing structural roles: interface, side_effect.

## Promise To Production Delta

- Declared surfaces: 34
- Real surfaces: 26
- Partial surfaces: 0
- Latent surfaces: 0
- Phantom surfaces: 8
- Critical gaps:
  - Pay: phantom surface with incomplete materialization.
  - Privacy: phantom surface with incomplete materialization.
  - Terms: phantom surface with incomplete materialization.
  - Tools: phantom surface with incomplete materialization.

## Structural Parity Gaps

- Integration without observability: Auth Callback: severity=critical, mode=ai_safe, route=/api/auth/callback/apple, summary=Capability Auth Callback depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Auth Check: severity=critical, mode=ai_safe, route=/api/auth/check-email, summary=Capability Auth Check depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Auth Logout: severity=critical, mode=ai_safe, route=/api/auth/logout, summary=Capability Auth Logout depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Auth Oauth: severity=critical, mode=ai_safe, route=/auth/oauth, summary=Capability Auth Oauth depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Auth Resend: severity=critical, mode=ai_safe, route=/auth/resend-verification, summary=Capability Auth Resend depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Auth Send: severity=critical, mode=ai_safe, route=/auth/send-verification, summary=Capability Auth Send depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Auth Whatsapp: severity=critical, mode=ai_safe, route=/api/auth/whatsapp/send-code, summary=Capability Auth Whatsapp depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Cia Autopilot: severity=critical, mode=ai_safe, route=/cia/autopilot-total/:workspaceId, summary=Capability Cia Autopilot depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Cia Conversations: severity=critical, mode=ai_safe, route=/cia/conversations/:workspaceId/:conversationId/resume, summary=Capability Cia Conversations depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Health: severity=critical, mode=ai_safe, route=/health/:workspaceId, summary=Capability Health depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).

## Capability Maturity

- Kyc Path: stage=foundational, score=20%, missing=interface, api_surface, orchestration, persistence
- Marketing Path: stage=foundational, score=20%, missing=interface, api_surface, orchestration, persistence
- Checkout Plan: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Funnels Funnel: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Global Error: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Layout: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Leads Lead: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Audio Synthesize: stage=connected, score=32%, missing=interface, persistence, side_effect, runtime_evidence
- Auth Tiktok: stage=connected, score=32%, missing=interface, persistence, side_effect, runtime_evidence
- Compliance Deletion: stage=connected, score=32%, missing=interface, persistence, side_effect, runtime_evidence

## Top Blockers

- codacy/static_hotspot: 23 HIGH Codacy issue(s) remain in docker/prometheus/alerting-rules.yml.
- codacy/static_hotspot: 20 HIGH Codacy issue(s) remain in worker/autopilot-alerts.yaml.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in backend/src/audit/audit.interceptor.ts.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in backend/src/auth/public.decorator.ts.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in frontend/src/app/(checkout)/components/CheckoutThemePage.tsx.
- Pay: phantom surface with incomplete materialization.
- Privacy: phantom surface with incomplete materialization.
- Terms: phantom surface with incomplete materialization.
- Tools: phantom surface with incomplete materialization.
- Integration without observability: Auth Callback: Capability Auth Callback depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).

## Next Work

- [P0] Recover Customer Auth Shell | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in Customer Auth Shell and converts intended product behavior into executed proof.
- [P0] Recover Customer Product And Checkout | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in Customer Product And Checkout and converts intended product behavior into executed proof.
- [P0] Recover Customer Whatsapp And Inbox | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in Customer Whatsapp And Inbox and converts intended product behavior into executed proof.
- [P0] Recover System Payment Reconciliation | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in System Payment Reconciliation and converts intended product behavior into executed proof.
- [P1] Resolve Github Actions Ci Failure | impact=transformational | mode=ai_safe | evidence=observed/high | risk=high | Translates observed github_actions pressure into capability/flow convergence so the real product catches up with live runtime and change evidence.
- [P1] Materialize capability Auth Logout | impact=material | mode=ai_safe | evidence=observed/high | risk=medium | Moves capability Auth Logout from partial toward real operation by closing the missing structural roles and maturity gaps that still block product readiness.
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