# PULSE REPORT — 2026-04-27T19:13:05.900Z

## PULSE VERDICT

- Produto pronto para producao? NAO
- IA pode trabalhar autonomamente ate producao? NAO
- Proximo passo seguro? SIM
- Self-trust: PASS
- No-overclaim: PASS
- Principal blocker: github_actions/ci-failure: 2 recent CI workflow failure(s): Codacy Analysis, CI
- Proxima acao: Recover Customer Auth Shell

## Current State

- Certification: PARTIAL
- Human replacement: NOT_READY
- Score: 61/100
- Blocking tier: 0
- Scope parity: PASS (low)
- Structural chains: 772/2362 complete
- Capabilities: real=293, partial=8, latent=10, phantom=0
- Capability maturity: foundational=3, connected=235, operational=0, productionReady=73
- Flows: real=120, partial=0, latent=0, phantom=0
- Structural parity gaps: total=0, critical=0, high=0
- Codacy HIGH issues: 0
- GitNexus Code Graph: GitNexus is not available (npx gitnexus@latest failed).
- External signals: total=4, runtime=0, change=3, dependency=0, high-impact=1

## Coverage Truth

- Inventory Coverage: 100%
- Classification Coverage: 100%
- Structural Graph Coverage: 38% (795/2120 connected)
  Reason: 795/2120 structural files connected.
- Test Coverage: 11%
  Reason: 168/1583 source modules have spec files.
- Scenario Coverage: 100% (declared=100%, executed=100%, passed=100%)
- Runtime Evidence Coverage: 0% (fresh=0%, stale=0%)
  Reason: No runtime probes executed.
- Production Proof Coverage: 94%
  Reason: 293/311 capabilities real.
- Unknown Files: 1
- Orphan Files: 200
- Excluded Directories: 20
- Manifest role: semantic overlay, NOT scope boundary
- Scope source: repo_filesystem

## What is Observed vs Inferred vs Aspirational

### Observed (direct evidence)
- Runtime probes executed: 0
- External signals: 4 total
- Self-trust: PASS
- No-overclaim: PASS

### Inferred (structural analysis)
- 2362 structural chains
- 293 real capabilities
- 120 real flows

### Aspirational (product vision projection)
- 41 projected surfaces
- Target: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 291/291 capability(ies) and 120/120 flow(s) at least partially real, with readiness green.

## External Reality

- github/code-change: impact=40%, mode=observation_only, mappedCapabilities=0, mappedFlows=0, summary=20 recent commits detected; latest: chore(deps): bump nodemailer in /worker in the worker-prod-p
- github_actions/ci-failure: impact=80%, mode=observation_only, mappedCapabilities=0, mappedFlows=0, summary=2 recent CI workflow failure(s): Codacy Analysis, CI
- github_actions/ci-success: impact=20%, mode=observation_only, mappedCapabilities=0, mappedFlows=0, summary=4 recent CI workflow success(es)
- gitnexus/codegraph: impact=30%, mode=observation_only, mappedCapabilities=11, mappedFlows=70, summary=GitNexus is not available (npx gitnexus@latest failed).

## Product Identity

- Current checkpoint: The current product-facing system materializes 283 real capability(ies), 8 partial capability(ies), 0 latent capability(ies), and 0 product-facing phantom capability(ies). System-wide phantom capability count is 0.
- Inferred product: If the currently connected structures converge, the product resolves toward a unified operational platform centered on Analytics, Anuncios/Ads, Autopilot, Billing, Campaigns, Checkout, CIA/Agent, CRM.
- Projected checkpoint: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 291/291 capability(ies) and 120/120 flow(s) at least partially real, with readiness green.
- Distance: Distance to projected readiness is driven by 0 product-facing phantom capability(ies), 0 system-wide phantom capability(ies), 0 phantom flow(s), 0 structural parity gap(s), and 0 HIGH Codacy issue(s).

## Product Surfaces

- Analytics: status=real, completion=100%, capabilities=13, flows=93
- Anuncios/Ads: status=real, completion=100%, capabilities=78, flows=103
- Autopilot: status=real, completion=100%, capabilities=50, flows=95
- Billing: status=real, completion=100%, capabilities=8, flows=7
- Campaigns: status=real, completion=100%, capabilities=57, flows=111
- Checkout: status=real, completion=100%, capabilities=39, flows=107, blocker=Missing structural roles: interface, persistence.
- CIA/Agent: status=real, completion=100%, capabilities=43, flows=95
- CRM: status=real, completion=100%, capabilities=4, flows=81
- Dashboard: status=real, completion=100%, capabilities=6, flows=19
- Followups: status=real, completion=100%, capabilities=67, flows=105, blocker=Missing structural roles: orchestration, persistence, side_effect.
- Partnerships: status=real, completion=100%, capabilities=14, flows=62
- Products: status=real, completion=100%, capabilities=37, flows=107, blocker=Missing structural roles: interface, orchestration, side_effect.

## Experience Projection

- Admin Settings Kyc Banking: status=partial, completion=80%, routes=/billing, /settings, /wallet, blocker=Runtime probe backend-health is still missing from live evidence.
- Admin Whatsapp Session Control: status=partial, completion=80%, routes=/settings, /whatsapp, blocker=Runtime probe backend-health is still missing from live evidence.
- Customer Auth Shell: status=partial, completion=80%, routes=/dashboard, blocker=Runtime probe auth-session is still missing from live evidence.
- Customer Product And Checkout: status=partial, completion=80%, routes=/billing, /checkout, /products, blocker=Runtime probe backend-health is still missing from live evidence.
- Customer Whatsapp And Inbox: status=partial, completion=80%, routes=/inbox, /marketing, /whatsapp, blocker=Runtime probe backend-health is still missing from live evidence.
- Operator Autopilot Run: status=partial, completion=80%, routes=/analytics, /autopilot, blocker=Runtime probe backend-health is still missing from live evidence.
- Operator Campaigns And Flows: status=partial, completion=80%, routes=/campaigns, /flow, /followups, blocker=Runtime probe backend-health is still missing from live evidence.
- System Payment Reconciliation: status=partial, completion=80%, routes=/billing, /checkout, /wallet, blocker=Runtime probe backend-health is still missing from live evidence.

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

- github_actions/ci-failure: 2 recent CI workflow failure(s): Codacy Analysis, CI
- Pay: phantom surface with incomplete materialization.
- Privacy: phantom surface with incomplete materialization.
- Produtos: phantom surface with incomplete materialization.
- Terms: phantom surface with incomplete materialization.
- Tools: phantom surface with incomplete materialization.
- Admin Settings Kyc Banking: Runtime probe backend-health is still missing from live evidence.
- Admin Whatsapp Session Control: Runtime probe backend-health is still missing from live evidence.
- Customer Auth Shell: Runtime probe auth-session is still missing from live evidence.
- Customer Product And Checkout: Runtime probe backend-health is still missing from live evidence.

## Next Work

- [P0] Recover Customer Auth Shell | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in Customer Auth Shell and converts intended product behavior into executed proof.
- [P0] Recover Customer Product And Checkout | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in Customer Product And Checkout and converts intended product behavior into executed proof.
- [P0] Recover Customer Whatsapp And Inbox | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in Customer Whatsapp And Inbox and converts intended product behavior into executed proof.
- [P0] Recover System Payment Reconciliation | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Revalidates a customer-visible journey in System Payment Reconciliation and converts intended product behavior into executed proof.
- [P0] Clear Runtime Pass | impact=material | mode=ai_safe | evidence=observed/medium | risk=critical | Turns Runtime Pass from a certification blocker into live executed evidence for customer-facing product behavior.
- [P1] Materialize capability Ferramentas Ferramenta | impact=material | mode=ai_safe | evidence=observed/medium | risk=medium | Moves capability Ferramentas Ferramenta from partial toward real operation by closing the missing structural roles and maturity gaps that still block product readiness.
- [P1] Materialize capability Layout | impact=material | mode=ai_safe | evidence=observed/medium | risk=medium | Moves capability Layout from partial toward real operation by closing the missing structural roles and maturity gaps that still block product readiness.
- [P1] Recover Admin Settings Kyc Banking | impact=material | mode=ai_safe | evidence=inferred/medium | risk=high | Restores operator/admin execution confidence for Admin Settings Kyc Banking so the product can be operated without hidden manual gaps.

## Cross-Artifact Consistency

- PASS: all loaded PULSE artifacts are mutually consistent on shared fields (status, verdicts, counters, generatedAt).

## Cleanup

- Canonical dir: /Users/danielpenin/whatsapp_saas/.pulse/current
- Mirrors: PULSE_HEALTH.json, PULSE_CERTIFICATE.json, PULSE_CLI_DIRECTIVE.json, PULSE_ARTIFACT_INDEX.json, PULSE_REPORT.md
- Removed legacy artifacts this run: 4

## Truth Model

- `observed`: backed by runtime, browser, declared flows, actors or explicit execution evidence.
- `inferred`: reconstructed from structure with no direct executed proof in this run.
- `projected`: future-consistent product shape implied by connected latent structures.

## Safety

- Governance-protected surfaces stay human-required.
- Missing evidence stays missing evidence; PULSE does not upgrade it to certainty.