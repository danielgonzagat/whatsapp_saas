# PULSE REPORT — 2026-04-23T04:24:50.424Z

## Current State

- Certification: NOT_CERTIFIED
- Human replacement: NOT_READY
- Score: 52/100
- Blocking tier: 0
- Scope parity: PASS (high)
- Structural chains: 814/1839 complete
- Capabilities: real=240, partial=26, latent=31, phantom=0
- Capability maturity: foundational=15, connected=257, operational=0, productionReady=25
- Flows: real=152, partial=0, latent=0, phantom=0
- Structural parity gaps: total=58, critical=4, high=50
- Codacy HIGH issues: 1336
- External signals: total=8, runtime=0, change=1, dependency=0, high-impact=6

## External Reality

- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=2, mappedFlows=4, summary=22 HIGH Codacy issue(s) remain in docker/prometheus/alerting-rules.yml.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=24, mappedFlows=38, summary=20 HIGH Codacy issue(s) remain in worker/autopilot-alerts.yaml.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=4, mappedFlows=0, summary=1 HIGH Codacy issue(s) remain in backend/src/audit/audit.interceptor.ts.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=22, mappedFlows=44, summary=1 HIGH Codacy issue(s) remain in backend/src/auth/roles.decorator.ts.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=5, mappedFlows=5, summary=1 HIGH Codacy issue(s) remain in backend/src/flows/flow-optimizer.service.ts.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=20, mappedFlows=62, summary=1 HIGH Codacy issue(s) remain in frontend/src/app/(checkout)/components/CheckoutThemePage.tsx.
- codacy/static_hotspot: impact=55%, mode=human_required, mappedCapabilities=2, mappedFlows=0, summary=1 HIGH Codacy issue(s) remain in package.json.
- github/code-change: impact=40%, mode=ai_safe, mappedCapabilities=5, mappedFlows=9, summary=20 recent commits detected; latest: fix: trace backend service calls after method signature

## Product Identity

- Current checkpoint: The current product-facing system materializes 240 real capability(ies), 26 partial capability(ies), 2 latent capability(ies), and 0 product-facing phantom capability(ies). System-wide phantom capability count is 0.
- Inferred product: If the currently connected structures converge, the product resolves toward a unified operational platform centered on Autopilot, Campaigns, CIA/Agent, Followups, Inbox/Chat, Partnerships, Sales/Vendas, Billing.
- Projected checkpoint: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 266/268 capability(ies) and 152/152 flow(s) at least partially real, with readiness yellow.
- Distance: Distance to projected readiness is driven by 0 product-facing phantom capability(ies), 0 system-wide phantom capability(ies), 0 phantom flow(s), 58 structural parity gap(s), and 1336 HIGH Codacy issue(s).

## Product Surfaces

- Autopilot: status=real, completion=100%, capabilities=23, flows=40
- Campaigns: status=real, completion=100%, capabilities=1, flows=0
- CIA/Agent: status=real, completion=100%, capabilities=9, flows=43
- Followups: status=real, completion=100%, capabilities=2, flows=14
- Inbox/Chat: status=real, completion=100%, capabilities=2, flows=14
- Partnerships: status=real, completion=100%, capabilities=11, flows=13
- Sales/Vendas: status=real, completion=100%, capabilities=2, flows=0
- Billing: status=real, completion=99%, capabilities=11, flows=52, blocker=Missing structural roles: interface, side_effect.
- Checkout: status=real, completion=99%, capabilities=20, flows=67, blocker=Missing structural roles: interface, side_effect.
- Products: status=real, completion=98%, capabilities=9, flows=49, blocker=Missing structural roles: orchestration, persistence, side_effect.
- CRM: status=real, completion=97%, capabilities=46, flows=68, blocker=Missing structural roles: orchestration, persistence, side_effect.
- Video/Voice: status=real, completion=97%, capabilities=5, flows=7, blocker=Missing structural roles: orchestration, persistence, side_effect.

## Experience Projection

- Admin Settings Kyc Banking: status=real, completion=85%, routes=/billing, /settings, /wallet, blocker=Missing structural roles: interface, side_effect.
- Admin Whatsapp Session Control: status=real, completion=85%, routes=/settings, /whatsapp, blocker=Missing structural roles: interface, side_effect.
- System Payment Reconciliation: status=real, completion=85%, routes=/billing, /checkout, /wallet, blocker=Missing structural roles: interface, side_effect.
- Customer Auth Shell: status=partial, completion=84%, routes=/dashboard, blocker=Missing structural roles: interface, side_effect.
- Customer Product And Checkout: status=partial, completion=84%, routes=/billing, /checkout, /products, blocker=Missing structural roles: interface, side_effect.
- Customer Whatsapp And Inbox: status=partial, completion=84%, routes=/inbox, /marketing, /whatsapp, blocker=Missing structural roles: interface, side_effect.
- Operator Autopilot Run: status=partial, completion=84%, routes=/analytics, /autopilot, blocker=Missing structural roles: interface, side_effect.
- Operator Campaigns And Flows: status=partial, completion=84%, routes=/campaigns, /flow, /followups, blocker=Missing structural roles: interface, side_effect.

## Promise To Production Delta

- Declared surfaces: 35
- Real surfaces: 27
- Partial surfaces: 0
- Latent surfaces: 0
- Phantom surfaces: 8
- Critical gaps:
  - Pay: phantom surface with incomplete materialization.
  - Privacy: phantom surface with incomplete materialization.
  - Terms: phantom surface with incomplete materialization.
  - Tools: phantom surface with incomplete materialization.

## Structural Parity Gaps

- Integration without observability: Flows Flow: severity=critical, mode=ai_safe, route=/flows, summary=Capability Flows Flow depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Health: severity=critical, mode=ai_safe, route=/health/:workspaceId, summary=Capability Health depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Kloel Health: severity=critical, mode=ai_safe, route=/kloel/health, summary=Capability Kloel Health depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Integration without observability: Meta Ads: severity=critical, mode=ai_safe, route=/meta/ads/campaigns, summary=Capability Meta Ads depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).
- Back without front: Audio Synthesize: severity=high, mode=ai_safe, route=/audio/synthesize, summary=Capability Audio Synthesize is structurally live on backend/runtime paths but still lacks an identified product surface.
- Flow without validation: cia-delete-crm-deals-id: severity=high, mode=ai_safe, route=/cia, summary=cia-delete-crm-deals-id -> /cia still exists as a connected product flow candidate without declared validation/oracle coverage.
- Flow without validation: cia-post-cia-account-approvals-workspace-id-approval-id-approve: severity=high, mode=ai_safe, route=/cia, summary=cia-post-cia-account-approvals-workspace-id-approval-id-approve -> /cia still exists as a connected product flow candidate without declared validation/oracle coverage.
- Flow without validation: cia-post-cia-account-approvals-workspace-id-approval-id-reject: severity=high, mode=ai_safe, route=/cia, summary=cia-post-cia-account-approvals-workspace-id-approval-id-reject -> /cia still exists as a connected product flow candidate without declared validation/oracle coverage.
- Flow without validation: cia-post-cia-account-input-sessions-workspace-id-session-id-respond: severity=high, mode=ai_safe, route=/cia, summary=cia-post-cia-account-input-sessions-workspace-id-session-id-respond -> /cia still exists as a connected product flow candidate without declared validation/oracle coverage.
- Flow without validation: cia-post-cia-autopilot-total-workspace-id: severity=high, mode=ai_safe, route=/cia, summary=cia-post-cia-autopilot-total-workspace-id -> /cia still exists as a connected product flow candidate without declared validation/oracle coverage.

## Capability Maturity

- Kyc Path: stage=foundational, score=20%, missing=interface, api_surface, orchestration, persistence
- Marketing Path: stage=foundational, score=20%, missing=interface, api_surface, orchestration, persistence
- Admin Contas: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Admin Produtos: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Checkout Plan: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Flow: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Funnels Funnel: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Global Error: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Layout: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Leads Lead: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect

## Top Blockers

- codacy/static_hotspot: 22 HIGH Codacy issue(s) remain in docker/prometheus/alerting-rules.yml.
- codacy/static_hotspot: 20 HIGH Codacy issue(s) remain in worker/autopilot-alerts.yaml.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in backend/src/audit/audit.interceptor.ts.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in backend/src/auth/roles.decorator.ts.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in backend/src/flows/flow-optimizer.service.ts.
- Pay: phantom surface with incomplete materialization.
- Privacy: phantom surface with incomplete materialization.
- Terms: phantom surface with incomplete materialization.
- Tools: phantom surface with incomplete materialization.
- Integration without observability: Flows Flow: Capability Flows Flow depends on runtime-critical effects but observability evidence is still weak (7 signal(s) detected).

## Next Work

- [P0] Recover Customer Auth Shell | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in Customer Auth Shell and converts intended product behavior into executed proof.
- [P0] Recover Customer Product And Checkout | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in Customer Product And Checkout and converts intended product behavior into executed proof.
- [P0] Recover Customer Whatsapp And Inbox | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in Customer Whatsapp And Inbox and converts intended product behavior into executed proof.
- [P0] Recover System Payment Reconciliation | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in System Payment Reconciliation and converts intended product behavior into executed proof.
- [P1] Flow without validation: cia-delete-crm-deals-id | impact=material | mode=ai_safe | evidence=observed/high | risk=high | Adds missing proof that Flow without validation: cia-delete-crm-deals-id can complete without silent failure.
- [P1] Flow without validation: cia-post-cia-account-approvals-workspace-id-approval-id-approve | impact=material | mode=ai_safe | evidence=observed/high | risk=high | Adds missing proof that Flow without validation: cia-post-cia-account-approvals-workspace-id-approval-id-approve can complete without silent failure.
- [P1] Flow without validation: cia-post-cia-account-approvals-workspace-id-approval-id-reject | impact=material | mode=ai_safe | evidence=observed/high | risk=high | Adds missing proof that Flow without validation: cia-post-cia-account-approvals-workspace-id-approval-id-reject can complete without silent failure.
- [P1] Flow without validation: cia-post-cia-account-input-sessions-workspace-id-session-id-respond | impact=material | mode=ai_safe | evidence=observed/high | risk=high | Adds missing proof that Flow without validation: cia-post-cia-account-input-sessions-workspace-id-session-id-respond can complete without silent failure.

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