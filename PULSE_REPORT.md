# PULSE REPORT — 2026-04-30T05:27:53.337Z

## PULSE VERDICT

- Produto pronto para producao? NAO
- IA pode trabalhar autonomamente ate producao? NAO
- Proximo passo seguro? SIM
- Self-trust: FAIL
- No-overclaim: FAIL
- Principal blocker: codacy/static_hotspot: 37 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- Proxima acao: Repair execution path matrix:capability:capability:admin-accounts

## PULSE Machine Readiness

- Machine readiness: NOT_READY
- Scope: pulse_machine_not_kloel_product
- Product certification excluded from machine verdict: SIM (NOT_CERTIFIED)
- Can run bounded autonomous cycle: NAO
- Can declare Kloel product certified: NAO
- bounded_run: PASS - Bounded next autonomous cycle exposes 8 ai_safe unit(s).
- artifact_consistency: FAIL - 1 divergence(s): generatedAt: 6 artifacts disagree
- execution_matrix: PASS - Execution matrix classified 5698 path(s) with zero unknown and zero non-terminal paths.
- critical_path_terminal: FAIL - 4626 terminal critical path(s) have precise proof blueprints but still need observed pass/fail evidence: matrix:capability:capability:ad-rules, matrix:capability:capability:admin-chat, matrix:capability:capability:admin-clients, matrix:capability:capability:admin-compliance, matrix:capability:capability:admin-dashboard, matrix:capability:capability:admin-destructive, matrix:capability:capability:admin-marketing, matrix:capability:capability:admin-permission. Next ai_safe action: run the listed validation command(s), attach runtime/flow/browser/external evidence, and refresh PULSE_EXECUTION_MATRIX.json plus PULSE_PATH_COVERAGE.json.
- breakpoint_precision: PASS - Every observed failure in the execution matrix has a breakpoint.
- external_reality: FAIL - 2 missing, 0 stale, and 0 invalid external adapter(s) remain.
- self_trust: FAIL - Parser self-trust failed for 5 current parser check(s): orphaned-file-checker [execution_failed]: parser=orphaned-file-checker | file=scripts/pulse/parsers/orphaned-file-checker.ts | kind=timeout | pid=29144 | elapsedMs=30003 | timeoutMs=30000 | command=/opt/homebrew/Cellar/node/25.8.2/bin/node -r /Users/danielpenin/whatsapp_saas/backend/node_modules/ts-node/register/transpile-only.js /Users/danielpenin/whatsapp_saas/scripts/pulse/parser-worker.ts orphaned-file-checker <encoded-config> | stdout=<empty> | stderr=<empty> | action=SIGKILL sent to isolated parser worker because the parser exceeded its budget. | security-injection [execution_failed]: breaks.map is not a function | security-rate-limit [execution_failed]: breaks.map is not a function | security-xss [execution_failed]: breaks.map is not a function | visual-design-checker [execution_failed]: parser=visual-design-checker | file=scripts/pulse/parsers/visual-design-checker.ts | kind=timeout | pid=31430 | elapsedMs=30002 | timeoutMs=30000 | command=/opt/homebrew/Cellar/node/25.8.2/bin/node -r /Users/danielpenin/whatsapp_saas/backend/node_modules/ts-node/register/transpile-only.js /Users/danielpenin/whatsapp_saas/scripts/pulse/parser-worker.ts visual-design-checker <encoded-config> | stdout=<empty> | stderr=<empty> | action=SIGKILL sent to isolated parser worker because the parser exceeded its budget.
- multi_cycle: PASS - 3 non-regressing real autonomous cycle(s) observed (>= 3 required).

## Current State

- Certification: NOT_CERTIFIED
- Human replacement: NOT_READY
- Score: 0/100
- Blocking tier: 1
- Scope parity: PASS (high)
- Structural chains: 751/2383 complete
- Capabilities: real=116, partial=196, latent=16, phantom=0
- Capability maturity: foundational=7, connected=110, operational=31, productionReady=180
- Flows: real=63, partial=23, latent=0, phantom=0
- Execution matrix: paths=5698, observedPass=17, observedFail=210, criticalUnobserved=0, unknown=0
- Structural parity gaps: total=13, critical=0, high=13
- Finding events: totalSignals=6484, uniqueEvents=3489, observed=0, confirmedStatic=715, weakSignals=950
- Codacy HIGH issues: 1116
- GitNexus Code Graph: not configured
- External signals: total=4, runtime=0, change=0, dependency=0, high-impact=3

## Dynamic Finding Events

- Operational finding names are derived from evidence text, source, location and truth mode. Internal parser labels are compatibility metadata, not final truth.
- Finding at undefined: count=339, truth=confirmed_static, action=needs_context, falsePositiveRisk=20%
- Finding at undefined: count=233, truth=inferred, action=needs_context, falsePositiveRisk=45%
- Static state-change signal lacks nearby current-state evidence: count=13, truth=weak_signal, action=needs_probe, falsePositiveRisk=80%
- Static state-change signal lacks nearby current-state evidence: count=13, truth=weak_signal, action=needs_probe, falsePositiveRisk=80%
- Static state-change signal lacks nearby current-state evidence: count=9, truth=weak_signal, action=needs_probe, falsePositiveRisk=80%
- Static state-change signal lacks nearby current-state evidence: count=9, truth=weak_signal, action=needs_probe, falsePositiveRisk=80%
- Static state-change signal lacks nearby current-state evidence: count=9, truth=weak_signal, action=needs_probe, falsePositiveRisk=80%
- Static state-change signal lacks nearby current-state evidence: count=9, truth=weak_signal, action=needs_probe, falsePositiveRisk=80%

## Coverage Truth

- Inventory Coverage: 100%
- Classification Coverage: 96%
- Structural Graph Coverage: 30% (818/2714 connected)
  Reason: 818/2714 structural files connected.
- Test Coverage: 8%
  Reason: 175/2136 source modules have spec files.
- Scenario Coverage: 100% (declared=100%, executed=100%, passed=73%)
- Runtime Evidence Coverage: 0% (fresh=0%, stale=0%)
  Reason: 0/2 probes fresh.
- Production Proof Coverage: 35%
  Reason: 116/328 capabilities real.
- Unknown Files: 131
- Orphan Files: 200
- Excluded Directories: 21
- Manifest role: semantic overlay, NOT scope boundary
- Scope source: repo_filesystem

## What is Observed vs Inferred vs Aspirational

### Observed (direct evidence)
- Runtime probes executed: 2
- External signals: 4 total
- Self-trust: FAIL
- No-overclaim: FAIL

### Inferred (structural analysis)
- 2383 structural chains
- 116 real capabilities
- 63 real flows

### Aspirational (product vision projection)
- 36 projected surfaces
- Target: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 301/301 capability(ies) and 86/86 flow(s) at least partially real, with readiness yellow.

## External Reality

- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=3, mappedFlows=7, summary=37 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=80, mappedFlows=81, summary=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=56, mappedFlows=64, summary=1 HIGH Codacy issue(s) remain in backend/src/autopilot/autopilot.service.ts.
- codacy/static_hotspot: impact=55%, mode=observation_only, mappedCapabilities=3, mappedFlows=7, summary=1 HIGH Codacy issue(s) remain in package.json.

## Product Identity

- Current checkpoint: The current product-facing system materializes 115 real capability(ies), 186 partial capability(ies), 0 latent capability(ies), and 0 product-facing phantom capability(ies). System-wide phantom capability count is 0.
- Inferred product: If the currently connected structures converge, the product resolves toward a unified operational platform centered on Scrapers, Onboarding, Video/Voice, Sales/Vendas, Inbox/Chat, Dashboard, Anuncios/Ads, Campaigns.
- Projected checkpoint: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 301/301 capability(ies) and 86/86 flow(s) at least partially real, with readiness yellow.
- Distance: Distance to projected readiness is driven by 0 product-facing phantom capability(ies), 0 system-wide phantom capability(ies), 0 phantom flow(s), 13 structural parity gap(s), and 1116 HIGH Codacy issue(s).

## Product Surfaces

- Scrapers: status=real, completion=100%, capabilities=1, flows=0
- Onboarding: status=real, completion=96%, capabilities=3, flows=21, blocker=Missing structural roles: orchestration, persistence, side_effect.
- Video/Voice: status=real, completion=96%, capabilities=5, flows=4, blocker=Missing structural roles: orchestration, persistence, side_effect.
- Sales/Vendas: status=real, completion=95%, capabilities=6, flows=14, blocker=Missing structural roles: orchestration, persistence, side_effect.
- Inbox/Chat: status=real, completion=94%, capabilities=20, flows=47, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage.
- Dashboard: status=real, completion=93%, capabilities=6, flows=13, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage.
- Anuncios/Ads: status=real, completion=92%, capabilities=79, flows=76, blocker=Maturity is still missing: codacy_hygiene.
- Campaigns: status=real, completion=92%, capabilities=57, flows=75, blocker=Maturity is still missing: codacy_hygiene.
- CIA/Agent: status=real, completion=92%, capabilities=43, flows=64, blocker=Maturity is still missing: codacy_hygiene.
- Products: status=real, completion=91%, capabilities=38, flows=70, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage.
- CRM: status=real, completion=90%, capabilities=5, flows=50, blocker=Missing structural roles: orchestration, persistence, side_effect.
- Checkout: status=real, completion=89%, capabilities=39, flows=70, blocker=Maturity is still missing: validation, scenario_coverage.

## Experience Projection

- Customer Auth Shell: status=partial, completion=77%, routes=/dashboard, blocker=Missing structural roles: orchestration, persistence, side_effect.
- Customer Whatsapp And Inbox: status=partial, completion=77%, routes=/inbox, /marketing, /whatsapp, blocker=Missing structural roles: orchestration, persistence, side_effect.
- Operator Autopilot Run: status=partial, completion=77%, routes=/analytics, /autopilot, blocker=Missing structural roles: orchestration, persistence, side_effect.
- Operator Campaigns And Flows: status=partial, completion=77%, routes=/campaigns, /flow, /followups, blocker=Missing structural roles: orchestration, persistence, side_effect.
- Admin Settings Kyc Banking: status=partial, completion=76%, routes=/billing, /settings, /wallet, blocker=Missing structural roles: orchestration, persistence, side_effect.
- Admin Whatsapp Session Control: status=partial, completion=76%, routes=/settings, /whatsapp, blocker=Missing structural roles: orchestration, persistence, side_effect.
- Customer Product And Checkout: status=partial, completion=76%, routes=/billing, /checkout, /products, blocker=Maturity is still missing: runtime_evidence, validation, scenario_coverage.
- System Payment Reconciliation: status=partial, completion=76%, routes=/billing, /checkout, /wallet, blocker=Missing structural roles: orchestration, persistence, side_effect.

## Promise To Production Delta

- Declared surfaces: 36
- Real surfaces: 27
- Partial surfaces: 1
- Latent surfaces: 0
- Phantom surfaces: 8
- Critical gaps:
  - Cookies: Governed ai_safe blocker for scenario_coverage: Required role scenario_coverage is below truth target observed. Expected validation: Run governed scenario or flow evidence for flow cookies-post-api-v1-cookie-...
  - Pay: phantom surface with incomplete materialization.
  - Privacy: phantom surface with incomplete materialization.
  - Produtos: phantom surface with incomplete materialization.
  - Terms: phantom surface with incomplete materialization.
  - Tools: phantom surface with incomplete materialization.

## Structural Parity Gaps

- Back without front: Audio Synthesize: severity=high, mode=ai_safe, route=/audio/synthesize, summary=Capability Audio Synthesize is structurally live on backend/runtime paths but still lacks an identified product surface.
- Back without front: Diag Db: severity=high, mode=ai_safe, route=/diag-db, summary=Capability Diag Db is structurally live on backend/runtime paths but still lacks an identified product surface.
- Back without front: Gdpr Export: severity=high, mode=ai_safe, route=/gdpr/export, summary=Capability Gdpr Export is structurally live on backend/runtime paths but still lacks an identified product surface.
- Front without back: Checkout Plan: severity=high, mode=ai_safe, summary=Capability Checkout Plan exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Ferramentas Ferramenta: severity=high, mode=ai_safe, summary=Capability Ferramentas Ferramenta exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- UI without persistence: /ferramentas: severity=high, mode=ai_safe, route=/launch/launcher, summary=/ferramentas (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /ferramentas/fale: severity=high, mode=ai_safe, route=/launch/launcher, summary=/ferramentas/fale (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /ferramentas/gerencie: severity=high, mode=ai_safe, route=/launch/launcher, summary=/ferramentas/gerencie (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /ferramentas/impulsione: severity=high, mode=ai_safe, route=/launch/launcher, summary=/ferramentas/impulsione (rich shell) still behaves like a shell or façade without durable persistence or real side effects.
- UI without persistence: /ferramentas/recupere: severity=high, mode=ai_safe, route=/launch/launcher, summary=/ferramentas/recupere (rich shell) still behaves like a shell or façade without durable persistence or real side effects.

## Execution Matrix

- Coverage: 100% classified, unknown=0, criticalUnobserved=0
- matrix:capability:capability:ad-rules: status=untested, truth=inferred, mode=governed_validation, route=/ad-rules, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-accounts: status=observed_fail, truth=observed, mode=governed_validation, route=/admin/accounts, breakpoint=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- matrix:capability:capability:admin-audit: status=observed_fail, truth=observed, mode=governed_validation, route=/admin/accounts/:workspaceId, breakpoint=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- matrix:capability:capability:admin-auth: status=observed_fail, truth=observed, mode=governed_validation, route=/admin/accounts/:workspaceId, breakpoint=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- matrix:capability:capability:admin-carteira: status=observed_fail, truth=observed, mode=governed_validation, route=/admin/accounts/:workspaceId, breakpoint=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- matrix:capability:capability:admin-chat: status=inferred_only, truth=inferred, mode=governed_validation, route=/admin/chat/message, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-clients: status=inferred_only, truth=inferred, mode=governed_validation, route=/admin/clients, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-compliance: status=inferred_only, truth=inferred, mode=governed_validation, route=/admin/compliance/overview, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-config: status=observed_fail, truth=observed, mode=governed_validation, route=/admin/accounts/:workspaceId, breakpoint=2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- matrix:capability:capability:admin-dashboard: status=untested, truth=inferred, mode=governed_validation, route=/admin/dashboard/home, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.

## Capability Maturity

- Checkout Plan: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Global Error: stage=connected, score=24%, missing=api_surface, orchestration, persistence, side_effect
- Endpoint: stage=connected, score=32%, missing=orchestration, persistence, side_effect, runtime_evidence
- Parser: stage=connected, score=32%, missing=orchestration, persistence, side_effect, runtime_evidence
- Layout: stage=connected, score=34%, missing=api_surface, orchestration, persistence, side_effect
- Auth Callback: stage=connected, score=46%, missing=persistence, runtime_evidence, validation, scenario_coverage
- Ferramentas Ferramenta: stage=connected, score=50%, missing=api_surface, orchestration, persistence, side_effect
- Onboarding: stage=connected, score=50%, missing=api_surface, orchestration, persistence, side_effect
- Vendas Venda: stage=connected, score=50%, missing=api_surface, orchestration, persistence, side_effect
- Video: stage=connected, score=50%, missing=api_surface, orchestration, persistence, side_effect

## Top Blockers

- codacy/static_hotspot: 37 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- codacy/static_hotspot: 2 HIGH Codacy issue(s) remain in backend/src/auth/email.service.ts.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in backend/src/autopilot/autopilot.service.ts.
- Cookies: Governed ai_safe blocker for scenario_coverage: Required role scenario_coverage is below truth target observed. Expected validation: Run governed scenario or flow evidence for flow cookies-post-api-v1-cookie-consent.
- Pay: phantom surface with incomplete materialization.
- Privacy: phantom surface with incomplete materialization.
- Produtos: phantom surface with incomplete materialization.
- Terms: phantom surface with incomplete materialization.
- Tools: phantom surface with incomplete materialization.
- Back without front: Audio Synthesize: Capability Audio Synthesize is structurally live on backend/runtime paths but still lacks an identified product surface.

## Next Work

- [P0] Repair execution path matrix:capability:capability:admin-accounts | impact=transformational | mode=ai_safe | evidence=observed/high | risk=critical | Turns an observed broken path into a precise repair target.
- [P0] Repair execution path matrix:capability:capability:admin-audit | impact=transformational | mode=ai_safe | evidence=observed/high | risk=critical | Turns an observed broken path into a precise repair target.
- [P0] Repair execution path matrix:capability:capability:admin-auth | impact=transformational | mode=ai_safe | evidence=observed/high | risk=critical | Turns an observed broken path into a precise repair target.
- [P0] Repair execution path matrix:capability:capability:admin-carteira | impact=transformational | mode=ai_safe | evidence=observed/high | risk=critical | Turns an observed broken path into a precise repair target.
- [P0] Repair execution path matrix:capability:capability:admin-config | impact=transformational | mode=ai_safe | evidence=observed/high | risk=critical | Turns an observed broken path into a precise repair target.
- [P0] Recover Admin Settings Kyc Banking | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Admin Settings Kyc Banking so convergence is based on settled world-state proof.
- [P0] Recover Customer Whatsapp And Inbox | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Customer Whatsapp And Inbox so convergence is based on settled world-state proof.
- [P0] Recover System Payment Reconciliation | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for System Payment Reconciliation so convergence is based on settled world-state proof.

## Cross-Artifact Consistency

- FAIL: 1 divergence(s): generatedAt: 6 artifacts disagree.
- Self-trust is degraded until divergent artifacts are reconciled. The pulseSelfTrustPass gate is failing.

## Cleanup

- Canonical dir: /Users/danielpenin/whatsapp_saas/.pulse/current
- Mirrors: PULSE_HEALTH.json, PULSE_CERTIFICATE.json, PULSE_CLI_DIRECTIVE.json, PULSE_MACHINE_READINESS.json, PULSE_ARTIFACT_INDEX.json, PULSE_GITNEXUS_STATE.json, PULSE_BEADS_STATE.json, PULSE_CONTEXT_BROADCAST.json, PULSE_WORKER_LEASES.json, PULSE_CONTEXT_DELTA.json, PULSE_REPORT.md, PULSE_WORLD_STATE.json
- Removed legacy artifacts this run: 5

## Truth Model

- `observed`: backed by runtime, browser, declared flows, actors or explicit execution evidence.
- `inferred`: reconstructed from structure with no direct executed proof in this run.
- `projected`: future-consistent product shape implied by connected latent structures.

## Safety

- Governance-protected surfaces stay governed by sandboxed validation.
- Missing evidence stays missing evidence; PULSE does not upgrade it to certainty.
---

## PULSE Auditor Immutability

`scripts/pulse/no-hardcoded-reality-audit.ts` is a locked PULSE governance surface.

No AI CLI may edit, weaken, bypass, rename, delete, chmod, unflag, move, or replace this auditor. This prohibition applies to Codex, Claude, OpenCode, and any autonomous or assisted AI agent.

The auditor must keep scanning every source file inside `scripts/pulse/**` and must preserve hardcode debt when hardcode is deleted without a dynamic production replacement, including accumulated Git history debt.

If the auditor itself needs to change, stop. The human owner must perform that change outside autonomous AI execution.
