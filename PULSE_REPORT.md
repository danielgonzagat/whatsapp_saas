# PULSE REPORT — 2026-04-23T01:29:09.703Z

## Current State

- Certification: NOT_CERTIFIED
- Human replacement: NOT_READY
- Score: 52/100
- Blocking tier: 0
- Scope parity: PASS (high)
- Structural chains: 248/1684 complete
- Capabilities: real=98, partial=205, latent=216, phantom=0
- Capability maturity: foundational=75, connected=425, operational=5, productionReady=14
- Flows: real=104, partial=1, latent=0, phantom=0
- Structural parity gaps: total=385, critical=39, high=344
- Codacy HIGH issues: 1683
- External signals: total=8, runtime=0, change=1, dependency=0, high-impact=5

## External Reality

- codacy/static_hotspot: impact=80%, mode=human_required, mappedCapabilities=3, mappedFlows=3, summary=28 HIGH Codacy issue(s) remain in backend/package.json.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=2, mappedFlows=6, summary=10 HIGH Codacy issue(s) remain in docker/prometheus/alerting-rules.yml.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=26, mappedFlows=9, summary=5 HIGH Codacy issue(s) remain in worker/autopilot-alerts.yaml.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=5, mappedFlows=3, summary=1 HIGH Codacy issue(s) remain in backend/src/audit/audit.interceptor.ts.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=27, mappedFlows=31, summary=1 HIGH Codacy issue(s) remain in frontend/src/app/(checkout)/components/CheckoutThemePage.tsx.
- codacy/static_hotspot: impact=55%, mode=human_required, mappedCapabilities=3, mappedFlows=3, summary=1 HIGH Codacy issue(s) remain in e2e/package.json.
- codacy/static_hotspot: impact=55%, mode=human_required, mappedCapabilities=3, mappedFlows=3, summary=1 HIGH Codacy issue(s) remain in package.json.
- github/code-change: impact=40%, mode=ai_safe, mappedCapabilities=10, mappedFlows=31, summary=20 recent commits detected; latest: feat(pulse): validate autonomous readiness verdict

## Product Identity

- Current checkpoint: The current product-facing system materializes 98 real capability(ies), 205 partial capability(ies), 85 latent capability(ies), and 0 product-facing phantom capability(ies). System-wide phantom capability count is 0.
- Inferred product: If the currently connected structures converge, the product resolves toward a unified operational platform centered on Billing, Inbox/Chat, Followups, Autopilot, Checkout, Anuncios/Ads, Products, Campaigns.
- Projected checkpoint: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 303/388 capability(ies) and 105/105 flow(s) at least partially real, with readiness yellow.
- Distance: Distance to projected readiness is driven by 0 product-facing phantom capability(ies), 0 system-wide phantom capability(ies), 0 phantom flow(s), 385 structural parity gap(s), and 1683 HIGH Codacy issue(s).

## Product Surfaces

- Billing: status=real, completion=94%, capabilities=13, flows=39, blocker=Missing structural roles: interface, side_effect.
- Inbox/Chat: status=real, completion=94%, capabilities=4, flows=14, blocker=Missing structural roles: interface, persistence.
- Followups: status=real, completion=93%, capabilities=4, flows=10, blocker=Missing structural roles: interface, orchestration, persistence.
- Autopilot: status=real, completion=91%, capabilities=21, flows=9, blocker=Missing structural roles: interface, persistence.
- Checkout: status=real, completion=89%, capabilities=28, flows=38, blocker=Missing structural roles: persistence, side_effect.
- Anuncios/Ads: status=real, completion=85%, capabilities=11, flows=14, blocker=Missing structural roles: interface, orchestration, side_effect.
- Products: status=real, completion=84%, capabilities=92, flows=86, blocker=Missing structural roles: orchestration, persistence, side_effect.
- Campaigns: status=real, completion=83%, capabilities=2, flows=0, blocker=Missing structural roles: orchestration, persistence, side_effect.
- Partnerships: status=real, completion=78%, capabilities=3, flows=0, blocker=Missing structural roles: interface, persistence, side_effect.
- Analytics: status=real, completion=73%, capabilities=11, flows=5, blocker=Missing structural roles: persistence, side_effect.
- Sales/Vendas: status=partial, completion=50%, capabilities=2, flows=0, blocker=Missing structural roles: interface, persistence, side_effect.
- Canvas: status=real, completion=96%, capabilities=1, flows=8, blocker=Missing structural roles: persistence, side_effect.

## Experience Projection

- Admin Settings Kyc Banking: status=partial, completion=80%, routes=/billing, /settings, /wallet, blocker=Missing structural roles: interface, side_effect.
- Admin Whatsapp Session Control: status=partial, completion=80%, routes=/settings, /whatsapp, blocker=Missing structural roles: interface, side_effect.
- Customer Whatsapp And Inbox: status=partial, completion=80%, routes=/inbox, /marketing, /whatsapp, blocker=Missing structural roles: interface, side_effect.
- Operator Campaigns And Flows: status=partial, completion=80%, routes=/campaigns, /flow, /followups, blocker=Missing structural roles: interface, side_effect.
- System Payment Reconciliation: status=partial, completion=80%, routes=/billing, /checkout, /wallet, blocker=Missing structural roles: interface, side_effect.
- Customer Auth Shell: status=partial, completion=79%, routes=/dashboard, blocker=Missing structural roles: interface, side_effect.
- Customer Product And Checkout: status=partial, completion=79%, routes=/billing, /checkout, /products, blocker=Missing structural roles: interface, side_effect.
- Operator Autopilot Run: status=partial, completion=78%, routes=/analytics, /autopilot, blocker=Missing structural roles: interface, side_effect.

## Promise To Production Delta

- Declared surfaces: 31
- Real surfaces: 22
- Partial surfaces: 4
- Latent surfaces: 1
- Phantom surfaces: 4
- Critical gaps:
  - Sales/Vendas: Missing structural roles: interface, persistence, side_effect.
  - Pay: Missing structural roles: orchestration, persistence, side_effect.
  - Privacy: phantom surface with incomplete materialization.
  - Terms: phantom surface with incomplete materialization.
  - Tools: phantom surface with incomplete materialization.

## Structural Parity Gaps

- Integration without observability: Admin Sales: severity=critical, mode=ai_safe, route=/admin/sales/overview, summary=Capability Admin Sales depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Affiliate My: severity=critical, mode=ai_safe, route=/affiliate/my-links, summary=Capability Affiliate My depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Auth Check: severity=critical, mode=ai_safe, route=/api/auth/check-email, summary=Capability Auth Check depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Auth Facebook: severity=critical, mode=ai_safe, route=/api/auth/facebook, summary=Capability Auth Facebook depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Auth Google: severity=critical, mode=ai_safe, route=/api/auth/google, summary=Capability Auth Google depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Auth Logout: severity=critical, mode=ai_safe, route=/api/auth/logout, summary=Capability Auth Logout depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Auth Oauth: severity=critical, mode=ai_safe, route=/auth/oauth, summary=Capability Auth Oauth depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Auth Resend: severity=critical, mode=ai_safe, route=/auth/resend-verification, summary=Capability Auth Resend depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Auth Send: severity=critical, mode=ai_safe, route=/auth/send-verification, summary=Capability Auth Send depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Auth Whatsapp: severity=critical, mode=ai_safe, route=/api/auth/whatsapp/send-code, summary=Capability Auth Whatsapp depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).

## Capability Maturity

- Checkout Theme: stage=connected, score=14%, missing=api_surface, orchestration, persistence, side_effect
- Kyc Path: stage=foundational, score=20%, missing=interface, api_surface, orchestration, persistence
- Marketing Path: stage=foundational, score=20%, missing=interface, api_surface, orchestration, persistence
- Account Settings: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Agent Console: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Agent Desktop: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Agent Timeline: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Assistant Response: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Auth Modal: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Billing Settings: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect

## Top Blockers

- codacy/static_hotspot: 28 HIGH Codacy issue(s) remain in backend/package.json.
- codacy/static_hotspot: 10 HIGH Codacy issue(s) remain in docker/prometheus/alerting-rules.yml.
- codacy/static_hotspot: 5 HIGH Codacy issue(s) remain in worker/autopilot-alerts.yaml.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in backend/src/audit/audit.interceptor.ts.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in frontend/src/app/(checkout)/components/CheckoutThemePage.tsx.
- Sales/Vendas: Missing structural roles: interface, persistence, side_effect.
- Pay: Missing structural roles: orchestration, persistence, side_effect.
- Privacy: phantom surface with incomplete materialization.
- Terms: phantom surface with incomplete materialization.
- Tools: phantom surface with incomplete materialization.

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
- Removed legacy artifacts this run: 6

## Truth Model

- `observed`: backed by runtime, browser, declared flows, actors or explicit execution evidence.
- `inferred`: reconstructed from structure with no direct executed proof in this run.
- `projected`: future-consistent product shape implied by connected latent structures.

## Safety

- Governance-protected surfaces stay human-required.
- Missing evidence stays missing evidence; PULSE does not upgrade it to certainty.