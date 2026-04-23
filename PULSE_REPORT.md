# PULSE REPORT — 2026-04-23T07:49:05.166Z

## Current State

- Certification: PARTIAL
- Human replacement: NOT_READY
- Score: 70/100
- Blocking tier: 1
- Scope parity: PASS (high)
- Structural chains: 770/2261 complete
- Capabilities: real=249, partial=24, latent=11, phantom=0
- Capability maturity: foundational=5, connected=87, operational=15, productionReady=177
- Flows: real=120, partial=0, latent=0, phantom=0
- Structural parity gaps: total=0, critical=0, high=0
- Codacy HIGH issues: 1218
- External signals: total=5, runtime=0, change=1, dependency=0, high-impact=3

## External Reality

- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=2, mappedFlows=79, summary=23 HIGH Codacy issue(s) remain in docker/prometheus/alerting-rules.yml.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=102, mappedFlows=117, summary=20 HIGH Codacy issue(s) remain in worker/autopilot-alerts.yaml.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=97, mappedFlows=117, summary=1 HIGH Codacy issue(s) remain in backend/src/autopilot/autopilot.service.ts.
- codacy/static_hotspot: impact=55%, mode=human_required, mappedCapabilities=12, mappedFlows=83, summary=1 HIGH Codacy issue(s) remain in package.json.
- github/code-change: impact=40%, mode=observation_only, mappedCapabilities=0, mappedFlows=0, summary=20 recent commits detected; latest: chore(deps): bump bullmq in /worker in the worker-prod-patch

## Product Identity

- Current checkpoint: The current product-facing system materializes 249 real capability(ies), 24 partial capability(ies), 0 latent capability(ies), and 0 product-facing phantom capability(ies). System-wide phantom capability count is 0.
- Inferred product: If the currently connected structures converge, the product resolves toward a unified operational platform centered on Billing, Checkout, Dashboard, Inbox/Chat, Onboarding, Partnerships, Sales/Vendas, Scrapers.
- Projected checkpoint: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 273/273 capability(ies) and 120/120 flow(s) at least partially real, with readiness yellow.
- Distance: Distance to projected readiness is driven by 0 product-facing phantom capability(ies), 0 system-wide phantom capability(ies), 0 phantom flow(s), 0 structural parity gap(s), and 1218 HIGH Codacy issue(s).

## Product Surfaces

- Billing: status=real, completion=100%, capabilities=20, flows=92
- Checkout: status=real, completion=100%, capabilities=76, flows=113, blocker=Maturity is still missing: runtime_evidence, codacy_hygiene.
- Dashboard: status=real, completion=100%, capabilities=29, flows=105, blocker=Maturity is still missing: runtime_evidence, codacy_hygiene.
- Inbox/Chat: status=real, completion=100%, capabilities=9, flows=85, blocker=Missing structural roles: persistence, side_effect.
- Onboarding: status=real, completion=100%, capabilities=13, flows=98, blocker=Missing structural roles: orchestration, persistence, side_effect.
- Partnerships: status=real, completion=100%, capabilities=24, flows=101
- Sales/Vendas: status=real, completion=100%, capabilities=27, flows=103, blocker=Maturity is still missing: runtime_evidence, codacy_hygiene.
- Scrapers: status=real, completion=100%, capabilities=1, flows=9
- Analytics: status=real, completion=99%, capabilities=46, flows=110, blocker=Maturity is still missing: runtime_evidence, codacy_hygiene.
- Campaigns: status=real, completion=99%, capabilities=37, flows=113, blocker=Maturity is still missing: runtime_evidence, codacy_hygiene.
- CRM: status=real, completion=99%, capabilities=13, flows=97, blocker=Maturity is still missing: runtime_evidence, codacy_hygiene.
- Followups: status=real, completion=99%, capabilities=63, flows=111, blocker=Maturity is still missing: runtime_evidence, codacy_hygiene.

## Experience Projection

- Admin Settings Kyc Banking: status=real, completion=85%, routes=/billing, /settings, /wallet, blocker=Maturity is still missing: runtime_evidence, codacy_hygiene.
- Admin Whatsapp Session Control: status=real, completion=85%, routes=/settings, /whatsapp, blocker=Maturity is still missing: runtime_evidence, codacy_hygiene.
- Customer Auth Shell: status=real, completion=85%, routes=/dashboard, blocker=Maturity is still missing: runtime_evidence, codacy_hygiene.
- Customer Product And Checkout: status=real, completion=85%, routes=/billing, /checkout, /products, blocker=Maturity is still missing: runtime_evidence, codacy_hygiene.
- Customer Whatsapp And Inbox: status=real, completion=85%, routes=/inbox, /marketing, /whatsapp, blocker=Maturity is still missing: runtime_evidence, codacy_hygiene.
- Operator Autopilot Run: status=real, completion=85%, routes=/analytics, /autopilot, blocker=Maturity is still missing: runtime_evidence, codacy_hygiene.
- Operator Campaigns And Flows: status=real, completion=85%, routes=/campaigns, /flow, /followups, blocker=Maturity is still missing: runtime_evidence, codacy_hygiene.
- System Payment Reconciliation: status=real, completion=85%, routes=/billing, /checkout, /wallet, blocker=Maturity is still missing: runtime_evidence, codacy_hygiene.

## Promise To Production Delta

- Declared surfaces: 41
- Real surfaces: 31
- Partial surfaces: 0
- Latent surfaces: 0
- Phantom surfaces: 10
- Critical gaps:
  - Pay: phantom surface with incomplete materialization.
  - Preview: phantom surface with incomplete materialization.
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
- Auth Logout: stage=connected, score=56%, missing=persistence, runtime_evidence, validation, scenario_coverage

## Top Blockers

- codacy/static_hotspot: 23 HIGH Codacy issue(s) remain in docker/prometheus/alerting-rules.yml.
- codacy/static_hotspot: 20 HIGH Codacy issue(s) remain in worker/autopilot-alerts.yaml.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in backend/src/autopilot/autopilot.service.ts.
- Pay: phantom surface with incomplete materialization.
- Preview: phantom surface with incomplete materialization.
- Privacy: phantom surface with incomplete materialization.
- Produtos: phantom surface with incomplete materialization.
- Terms: phantom surface with incomplete materialization.
- Tools: phantom surface with incomplete materialization.
- Auth Anonymous: 1 HIGH Codacy issue(s).

## Next Work

- [P0] Recover Customer Auth Shell | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in Customer Auth Shell and converts intended product behavior into executed proof.
- [P0] Recover Customer Product And Checkout | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in Customer Product And Checkout and converts intended product behavior into executed proof.
- [P0] Recover Customer Whatsapp And Inbox | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in Customer Whatsapp And Inbox and converts intended product behavior into executed proof.
- [P0] Recover System Payment Reconciliation | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in System Payment Reconciliation and converts intended product behavior into executed proof.
- [P1] Materialize capability Analytics Analytic | impact=material | mode=ai_safe | evidence=observed/high | risk=high | Moves capability Analytics Analytic from partial toward real operation by closing the missing structural roles and maturity gaps that still block product readiness.
- [P1] Materialize capability Analytics Analytic | impact=material | mode=ai_safe | evidence=observed/high | risk=high | Moves capability Analytics Analytic from partial toward real operation by closing the missing structural roles and maturity gaps that still block product readiness.
- [P1] Materialize capability Auth Anonymous | impact=material | mode=ai_safe | evidence=observed/high | risk=high | Moves capability Auth Anonymous from partial toward real operation by closing the missing structural roles and maturity gaps that still block product readiness.
- [P1] Materialize capability Auth Anonymous | impact=material | mode=ai_safe | evidence=observed/high | risk=high | Moves capability Auth Anonymous from partial toward real operation by closing the missing structural roles and maturity gaps that still block product readiness.

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