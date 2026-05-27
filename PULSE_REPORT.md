# PULSE REPORT — 2026-05-26T23:37:57.988Z

## PULSE VERDICT

- Produto pronto para producao? NAO
- IA pode trabalhar autonomamente ate producao? NAO
- Proximo passo seguro? SIM
- Self-trust: PASS
- No-overclaim: FAIL
- Principal blocker: github_actions/deploy_failure: Deploy Production failed in GitHub Actions.
- Proxima acao: UI without persistence: /autopilot

## PULSE Machine Readiness

- Machine readiness: NOT_READY
- Scope: pulse_machine_not_kloel_product
- Product certification excluded from machine verdict: SIM (NOT_CERTIFIED)
- Can run bounded autonomous cycle: SIM
- Can declare Kloel product certified: NAO
- bounded_run: PASS - Bounded next autonomous cycle exposes 8 ai_safe unit(s).
- artifact_consistency: PASS - Cross-artifact consistency passed.
- execution_matrix: PASS - Execution matrix classified 17867 path(s) with zero unknown and zero non-terminal paths.
- critical_path_terminal: FAIL - 5349 terminal critical path(s) have precise proof blueprints but still need observed pass/fail evidence: matrix:capability:capability:abi-ab, matrix:capability:capability:abi-builder, matrix:capability:capability:abi-snapshot, matrix:capability:capability:account, matrix:capability:capability:account-agent, matrix:capability:capability:ad-rules, matrix:capability:capability:admin-accounts, matrix:capability:capability:admin-audit. Next ai_safe action: run the listed validation command(s), attach runtime/flow/browser/external evidence, and refresh PULSE_EXECUTION_MATRIX.json plus PULSE_PATH_COVERAGE.json.
- breakpoint_precision: PASS - Every observed failure in the execution matrix has a breakpoint.
- external_reality: FAIL - 0 missing, 2 stale, and 0 invalid external adapter(s) remain.
- self_trust: PASS - All parsers loaded and no phantom capability/flow remains. 20 aspirational structure(s) remain explicitly marked as aspirational.
- multi_cycle: PASS - 3 non-regressing real autonomous cycle(s) observed (>= 3 required).

## Current State

- Certification: NOT_CERTIFIED
- Human replacement: NOT_READY
- Score: 52/100
- Blocking tier: 0
- Scope parity: FAIL (low)
- Structural chains: 796/2800 complete
- Capabilities: real=0, partial=442, latent=20, phantom=0
- Capability maturity: foundational=2, connected=460, operational=0, productionReady=0
- Flows: real=0, partial=86, latent=0, phantom=0
- Execution matrix: paths=17867, observedPass=0, observedFail=41, criticalUnobserved=0, unknown=0
- Structural parity gaps: total=39, critical=0, high=38
- Finding events: totalSignals=10, uniqueEvents=10, observed=0, confirmedStatic=10, weakSignals=0
- Codacy HIGH issues: 2225
- GitNexus Code Graph: not configured
- External signals: total=53, runtime=0, change=46, dependency=0, high-impact=3

## Dynamic Finding Events

- Operational finding names are derived from evidence text, source, location and truth mode. Internal parser labels are compatibility metadata, not final truth.
- GET /kloel/onboarding/:workspaceId/status is not called by frontend code: count=1, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%
- GET /marketing/ai-brain is not called by frontend code: count=1, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%
- GET /marketing/channel/:channel/stats is not called by frontend code: count=1, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%
- GET /marketing/connect/google-ads/campaigns is not called by frontend code: count=1, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%
- GET /marketing/connect/google-ads/customers is not called by frontend code: count=1, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%
- GET /marketing/connect/tiktok/campaigns is not called by frontend code: count=1, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%
- GET /marketing/connect/tiktok/profile is not called by frontend code: count=1, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%
- GET /marketing/live-feed is not called by frontend code: count=1, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%

## Coverage Truth

- Inventory Coverage: 100%
- Classification Coverage: 86%
- Structural Graph Coverage: 28% (1469/5264 connected)
  Reason: 1469/5264 structural files connected.
- Test Coverage: 18%
  Reason: 719/4016 source modules have spec files.
- Scenario Coverage: 100% (declared=100%, executed=100%, passed=0%)
- Runtime Evidence Coverage: 0% (fresh=0%, stale=0%)
  Reason: No runtime probes executed.
- Production Proof Coverage: 0%
  Reason: 0/462 capabilities real.
- Unknown Files: 2328
- Orphan Files: 200
- Excluded Directories: 25
- Manifest role: semantic overlay, NOT scope boundary
- Scope source: repo_filesystem

## What is Observed vs Inferred vs Aspirational

### Observed (direct evidence)
- Runtime probes executed: 0
- External signals: 53 total
- Self-trust: PASS
- No-overclaim: FAIL

### Inferred (structural analysis)
- 2800 structural chains
- 0 real capabilities
- 0 real flows

### Aspirational (product vision projection)
- 39 projected surfaces
- Target: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 421/421 capability(ies) and 86/86 flow(s) at least partially real, with readiness yellow.

## External Reality

- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=6, mappedFlows=33, summary=7 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- codacy/static_hotspot: impact=55%, mode=ai_safe, mappedCapabilities=5, mappedFlows=84, summary=17 HIGH Codacy issue(s) remain in scripts/__parts__/obsidian-mirror-daemon-content.mjs.
- codacy/static_hotspot: impact=55%, mode=ai_safe, mappedCapabilities=4, mappedFlows=6, summary=5 HIGH Codacy issue(s) remain in scripts/__parts__/obsidian-mirror-daemon-utils.mjs.
- codacy/static_hotspot: impact=55%, mode=ai_safe, mappedCapabilities=195, mappedFlows=85, summary=1 HIGH Codacy issue(s) remain in backend/src/meta/__parts__/meta-auth-helpers.ts.
- codacy/static_hotspot: impact=55%, mode=ai_safe, mappedCapabilities=180, mappedFlows=85, summary=1 HIGH Codacy issue(s) remain in backend/src/meta/__parts__/meta-oauth-url.helpers.ts.
- codacy/static_hotspot: impact=55%, mode=observation_only, mappedCapabilities=4, mappedFlows=6, summary=1 HIGH Codacy issue(s) remain in package.json.
- codacy/static_hotspot: impact=55%, mode=ai_safe, mappedCapabilities=2, mappedFlows=0, summary=2 HIGH Codacy issue(s) remain in scripts/__parts__/obsidian-mirror-daemon-indexes.mjs.
- github/pull_request_change: impact=68%, mode=observation_only, mappedCapabilities=0, mappedFlows=0, summary=chore: release 0.4.0

## Product Identity

- Current checkpoint: The current product-facing system materializes 421 partial capability(ies), 0 latent capability(ies). System-wide phantom capability count is 0.
- Inferred product: If the currently connected structures converge, the product resolves toward a unified operational platform centered on Analytics, Autopilot, Billing, Campaigns, Checkout, CIA/Agent, CRM, Dashboard, Followups, Inbox/Chat, Onboarding, Partnerships, Products, Sales/Vendas, Scrapers, Settings, Account, Canvas, Carteira, Cookies, Ferramentas, Launch, Media, Parcerias.
- Projected checkpoint: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 421/421 capability(ies) and 86/86 flow(s) at least partially real, with readiness yellow.
- Distance: Distance to projected readiness is driven by 0 product-facing phantom capability(ies), 0 system-wide phantom capability(ies), 0 phantom flow(s), 39 structural parity gap(s), and 2225 HIGH Codacy issue(s).

## Product Surfaces

- Analytics: status=partial, completion=100%, capabilities=159, flows=85
- Autopilot: status=partial, completion=100%, capabilities=195, flows=85
- Billing: status=partial, completion=100%, capabilities=10, flows=84
- Campaigns: status=partial, completion=100%, capabilities=162, flows=85
- Checkout: status=partial, completion=100%, capabilities=174, flows=85
- CIA/Agent: status=partial, completion=100%, capabilities=178, flows=85
- CRM: status=partial, completion=100%, capabilities=150, flows=85
- Dashboard: status=partial, completion=100%, capabilities=7, flows=84
- Followups: status=partial, completion=100%, capabilities=195, flows=85
- Inbox/Chat: status=partial, completion=100%, capabilities=8, flows=84
- Onboarding: status=partial, completion=100%, capabilities=151, flows=85
- Partnerships: status=partial, completion=100%, capabilities=151, flows=85

## Experience Projection

- Admin Whatsapp Session Control: status=partial, completion=67%, routes=/settings, /whatsapp, blocker=Runtime probe backend-health is still missing from live evidence.
- Operator Autopilot Run: status=partial, completion=67%, routes=/analytics, /autopilot, blocker=Runtime probe backend-health is still missing from live evidence.
- Operator Campaigns And Flows: status=partial, completion=67%, routes=/campaigns, /flow, /followups, blocker=Runtime probe backend-health is still missing from live evidence.
- Admin Settings Kyc Banking: status=partial, completion=50%, routes=/billing, /settings, /wallet, blocker=Runtime probe backend-health is still missing from live evidence.
- Customer Auth Shell: status=partial, completion=50%, routes=/dashboard, blocker=Runtime probe auth-session is still missing from live evidence.
- Customer Product And Checkout: status=partial, completion=50%, routes=/billing, /checkout, /products, blocker=Runtime probe backend-health is still missing from live evidence.
- Customer Whatsapp And Inbox: status=partial, completion=50%, routes=/inbox, /marketing, /whatsapp, blocker=Runtime probe backend-health is still missing from live evidence.
- System Payment Reconciliation: status=partial, completion=50%, routes=/billing, /checkout, /wallet, blocker=Runtime probe backend-health is still missing from live evidence.

## Promise To Production Delta

- Declared surfaces: 39
- Real surfaces: 27
- Partial surfaces: 12
- Latent surfaces: 12
- Phantom surfaces: 12
- Critical gaps:
  - Anuncios/Ads: Missing structural roles: interface, orchestration, side_effect.
  - Auth: Missing structural roles: interface, persistence.
  - Marketing: Missing structural roles: interface, persistence, side_effect.
  - Area: Missing structural roles: interface, persistence.
  - Pay: latent surface with incomplete materialization.
  - Privacy: latent surface with incomplete materialization.
  - Produtos: latent surface with incomplete materialization.
  - Terms: latent surface with incomplete materialization.

## Structural Parity Gaps

- Back without front: Audio Synthesize: severity=high, mode=ai_safe, route=/audio/synthesize, summary=Capability Audio Synthesize is structurally live on backend/runtime paths but still lacks an identified product surface.
- Back without front: Diag Db: severity=high, mode=ai_safe, route=/diag-db, summary=Capability Diag Db is structurally live on backend/runtime paths but still lacks an identified product surface.
- Flow without validation: (sem texto): severity=high, mode=ai_safe, route=/canvas/generate, summary=Flow (sem texto) is structurally present but still lacks executed validation evidence.
- Flow without validation: onDelete: severity=high, mode=ai_safe, route=/canvas/designs/:id, summary=Flow onDelete is structurally present but still lacks executed validation evidence.
- Front without back: Admin Change: severity=high, mode=ai_safe, summary=Capability Admin Change exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Autopilot Mission: severity=high, mode=ai_safe, summary=Capability Autopilot Mission exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Ferramentas Ferramenta: severity=high, mode=ai_safe, summary=Capability Ferramentas Ferramenta exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Global Error: severity=high, mode=ai_safe, summary=Capability Global Error exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Help Section: severity=high, mode=ai_safe, summary=Capability Help Section exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Kyc Banks: severity=high, mode=ai_safe, route=/kyc/banks, summary=Capability Kyc Banks exposes UI or interaction entry points without an orchestrated backend/materialized effect.

## Execution Matrix

- Coverage: 100% classified, unknown=0, criticalUnobserved=0
- matrix:capability:capability:abi-ab: status=untested, truth=inferred, mode=governed_validation, route=n/a, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:abi-builder: status=inferred_only, truth=inferred, mode=governed_validation, route=/kloel/onboarding/:workspaceId/chat, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:abi-snapshot: status=untested, truth=inferred, mode=governed_validation, route=n/a, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:account: status=inferred_only, truth=inferred, mode=governed_validation, route=n/a, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:account-agent: status=inferred_only, truth=inferred, mode=governed_validation, route=n/a, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:ad-rules: status=inferred_only, truth=inferred, mode=governed_validation, route=/ad-rules, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-accounts: status=inferred_only, truth=inferred, mode=governed_validation, route=/accounts/${encodeURIComponent(workspaceId)}, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-audit: status=inferred_only, truth=inferred, mode=governed_validation, route=/ad-rules/:id, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-auth: status=inferred_only, truth=inferred, mode=governed_validation, route=/ad-rules/:id, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-brain: status=inferred_only, truth=inferred, mode=governed_validation, route=/admin/brain/spine-audit, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.

## Capability Maturity

- Admin Change: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Admin Mfa: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Ai Insights: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Ai Section: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Area Slug: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Autopilot History: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Autopilot Mission: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Autopilot Overview: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Billing Form: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Checkout Bundles: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect

## Top Blockers

- github_actions/deploy_failure: Deploy Production failed in GitHub Actions.
- github_actions/deploy_failure: Deploy Staging failed in GitHub Actions.
- codacy/static_hotspot: 7 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- github_actions/build_failure: CI failed in GitHub Actions.
- github_actions/build_failure: Dependabot Auto Merge failed in GitHub Actions.
- github_actions/build_failure: CodeQL failed in GitHub Actions.
- github_actions/build_failure: Codacy Analysis failed in GitHub Actions.
- github/pull_request_change: chore: release 0.4.0
- github/pull_request_change: fix(meta): use backend callback for OAuth
- github/pull_request_change: chore: release 0.4.1
- github/pull_request_change: fix: restore Thanos, streaming chat, recents pagination, and admin MFA bypass
- github/pull_request_change: chore: release 0.4.2
- github/pull_request_change: fix: recover regressions after PR 289 merge
- github/pull_request_change: chore(deps-dev): bump the root-dev-patches group with 3 updates
- github/pull_request_change: chore(deps-dev): bump the backend-dev-patches group in /backend with 3 updates
- github/pull_request_change: chore(deps): bump the backend-prod-patches group in /backend with 3 updates
- github/pull_request_change: chore(deps-dev): bump the frontend-dev-patches group in /frontend with 3 updates
- github/pull_request_change: chore(deps): bump the frontend-prod-patches group in /frontend with 2 updates
- github/pull_request_change: chore(deps-dev): bump the worker-dev-patches group in /worker with 3 updates
- github/pull_request_change: chore(deps): bump the worker-prod-patches group in /worker with 3 updates
- github/pull_request_change: chore(deps-dev): bump @playwright/test from 1.59.1 to 1.60.0 in /e2e in the e2e-patches group
- github/pull_request_change: test: keep Kloel regression tests under static limits
- github/pull_request_change: feat(meta): make Marketing > WhatsApp/Facebook/Instagram OAuth robust + diagnose-able
- github/pull_request_change: chore(deps): bump next from 16.2.3 to 16.2.6 in /frontend-admin in the npm_and_yarn group across 1 directory
- github/pull_request_change: chore: release 0.5.0
- github/pull_request_change: chore(deps): bump protobufjs from 7.5.5 to 7.5.8 in /backend in the npm_and_yarn group across 1 directory
- codacy/static_hotspot: 17 HIGH Codacy issue(s) remain in scripts/__parts__/obsidian-mirror-daemon-content.mjs.
- codacy/static_hotspot: 5 HIGH Codacy issue(s) remain in scripts/__parts__/obsidian-mirror-daemon-utils.mjs.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in backend/src/meta/__parts__/meta-auth-helpers.ts.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in backend/src/meta/__parts__/meta-oauth-url.helpers.ts.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in package.json.
- codacy/static_hotspot: 2 HIGH Codacy issue(s) remain in scripts/__parts__/obsidian-mirror-daemon-indexes.mjs.
- github/recent_change: Merge pull request #301 from danielgonzagat/fix/meta-marketing-oauth-domains feat(meta): make Marketing > WhatsApp/Facebook/Instagram OAuth robust + diagnose-able
- github/recent_change: Merge pull request #300 from danielgonzagat/fix/recover-pr289-regressions test: keep Kloel regression tests under static limits
- github/recent_change: chore(deps): bump protobufjs (#304) Bumps the npm_and_yarn group with 1 update in the /backend directory: [protobufjs](https://github.com/protobufjs/protobuf.js). Updates `protobufjs` from 7.5.5 to 7.5.8 - [Release notes](https://github....
- github/recent_change: chore(ops): add scripts/ops/check-meta-oauth-prod.sh smoke test One-shot validation: hits /meta/auth/diagnostics, prints the JSON, and asserts isFallback=false + appCredentialsPresent + verifyTokenSet + https redirect. Run it after deplo...
- github/recent_change: chore(meta): move helpers from __companions__/ to __parts__/ The workspace governance gate now bans new paths under __companions__/ (scripts/decomp/lib/gate-rules.mjs). Move every helper and spec that this PR touches to __parts__/ to sat...
- github/recent_change: fix(meta): satisfy architecture guardrails (no_new_any token + size <600 LOC) - Drop the literal 'any business' phrase from humanizeMetaError match — the guardrail regex /\bany\b/ flags it as a new explicit `any` (false positive on prose...
- github/recent_change: Merge pull request #303 from danielgonzagat/release-please--branches--main chore: release 0.5.0
- github/recent_change: feat(meta): /meta/auth/diagnostics + hardened sanitizeReturnTo + richer error mapping - New authed endpoint GET /meta/auth/diagnostics returns the resolved redirect_uri (with the source env var that won), masked appId, whether app secret...
- github/recent_change: refactor(meta): extract sanitize/humanize/diagnostics to pure helpers Move sanitizeReturnTo, humanizeMetaError and the diagnostics payload builder out of the controller into meta-auth-helpers.ts. The controller keeps the route definition...
- github/recent_change: test(kloel): keep settings kyc mocks aligned
- github/recent_change: chore: release 0.5.0
- github/recent_change: chore(meta): address Kilo + CodeRabbit review findings - meta-startup-check: import Logger as type only (no runtime drag-in of @nestjs/common just to declare a Pick<Logger, ...> param). - meta-startup-check: non-https redirect in product...
- github/recent_change: Merge pull request #290 from danielgonzagat/release-please--branches--main chore: release 0.4.2
- github/recent_change: Merge branch 'main' into fix/recover-pr289-regressions
- github/recent_change: docs(runbook): Meta OAuth setup checklist + diagnostics workflow Step-by-step for Marketing > Conversas > (WhatsApp/Facebook/Instagram): - Required Railway/Vercel env vars per role. - Resolution order of redirect_uri. - How to call GET /...
- github/recent_change: test(kloel): stabilize settings visual data
- github/recent_change: chore(deps): bump next (#302) Bumps the npm_and_yarn group with 1 update in the /frontend-admin directory: [next](https://github.com/vercel/next.js). Updates `next` from 16.2.3 to 16.2.6 - [Release notes](https://github.com/vercel/next.j...
- github/recent_change: feat(meta): startup validation + diagnostics scopes for MetaWhatsAppService - onModuleInit() invokes runMetaStartupCheck, which logs ERROR in production when META_APP_ID / META_APP_SECRET / FRONTEND_URL are missing or when the resolved r...
- github/recent_change: feat(meta): pin OAuth redirect via META_OAUTH_REDIRECT_URI override Make the URL Meta sees for `redirect_uri` independent of BACKEND_URL heuristics. Resolution order is now: 1. META_OAUTH_REDIRECT_URI (full URL — recommended in prod) 2. ...
- github/recent_change: feat(frontend): allow NEXT_PUBLIC_PROD_ROOT_DOMAIN to override kloel.com The prod root domain was hardcoded, blocking white-label / staging clones and forcing the Meta panel of every install to whitelist kloel.com. Read from NEXT_PUBLIC_...
- github/pull_request: fix(meta): use backend callback for OAuth
- Anuncios/Ads: Missing structural roles: interface, orchestration, side_effect.
- Auth: Missing structural roles: interface, persistence.
- Marketing: Missing structural roles: interface, persistence, side_effect.
- Area: Missing structural roles: interface, persistence.

## Next Work

- [P0] UI without persistence: /autopilot | impact=transformational | mode=ai_safe | evidence=observed/high | risk=high | Converts a user-facing illusion into a real product chain for /.
- [P0] UI without persistence: /checkout/:planId | impact=transformational | mode=ai_safe | evidence=observed/high | risk=high | Converts a user-facing illusion into a real product chain for /.
- [P0] Recover Operator Autopilot Run | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Operator Autopilot Run so convergence is based on settled world-state proof.
- [P0] Recover Customer Whatsapp And Inbox | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Customer Whatsapp And Inbox so convergence is based on settled world-state proof.
- [P0] Recover Operator Campaigns And Flows | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Operator Campaigns And Flows so convergence is based on settled world-state proof.
- [P0] Recover Admin Whatsapp Session Control | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Admin Whatsapp Session Control so convergence is based on settled world-state proof.
- [P0] UI without persistence: /cia | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=high | Converts a user-facing illusion into a real product chain for /.
- [P0] UI without persistence: /marketing/facebook | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=high | Converts a user-facing illusion into a real product chain for /.

## Cross-Artifact Consistency

- Not evaluated this run.

## Cleanup

- Canonical dir: /Users/danielpenin/whatsapp_saas/.pulse/current
- Mirrors: PULSE_ADMIN_EVIDENCE.json, PULSE_AGENT_ORCHESTRATION_STATE.json, PULSE_ARTIFACT_INDEX.json, PULSE_AUTONOMY_STATE.json, PULSE_BEADS_STATE.json, PULSE_BROWSER_EVIDENCE.json, PULSE_CAPABILITY_STATE.json, PULSE_CERTIFICATE.json, PULSE_CLI_DIRECTIVE.json, PULSE_CODACY_EVIDENCE.json, PULSE_CODEBASE_TRUTH.json, PULSE_CONTEXT_BROADCAST.json, PULSE_CONTEXT_DELTA.json, PULSE_CONVERGENCE_PLAN.json, PULSE_CUSTOMER_EVIDENCE.json, PULSE_EXECUTION_MATRIX.json, PULSE_EXECUTION_TRACE.json, PULSE_EXTERNAL_SIGNAL_STATE.json, PULSE_FLOW_EVIDENCE.json, PULSE_FLOW_PROJECTION.json, PULSE_GITNEXUS_STATE.json, PULSE_HEALTH.json, PULSE_INVARIANT_EVIDENCE.json, PULSE_MACHINE_READINESS.json, PULSE_OBSERVABILITY_EVIDENCE.json, PULSE_OPERATOR_EVIDENCE.json, PULSE_PARITY_GAPS.json, PULSE_PATH_COVERAGE.json, PULSE_PRODUCT_GRAPH.json, PULSE_PRODUCT_VISION.json, PULSE_RECOVERY_EVIDENCE.json, PULSE_REPORT.md, PULSE_RESOLVED_MANIFEST.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json, PULSE_SCENARIO_COVERAGE.json, PULSE_SCOPE_STATE.json, PULSE_SOAK_EVIDENCE.json, PULSE_STRUCTURAL_GRAPH.json, PULSE_WORKER_LEASES.json, PULSE_WORLD_STATE.json
- Removed legacy artifacts this run: 23

## Truth Model

- `observed`: backed by runtime, browser, declared flows, actors or explicit execution evidence.
- `inferred`: reconstructed from structure with no direct executed proof in this run.
- `projected`: future-consistent product shape implied by connected latent structures.

## Safety

- Governance-protected surfaces stay governed by sandboxed validation.
- Missing evidence stays missing evidence; PULSE does not upgrade it to certainty.