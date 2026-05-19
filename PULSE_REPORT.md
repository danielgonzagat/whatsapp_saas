# PULSE REPORT — 2026-05-18T17:01:23.749Z

## PULSE VERDICT

- Produto pronto para producao? NAO
- IA pode trabalhar autonomamente ate producao? NAO
- Proximo passo seguro? SIM
- Self-trust: FAIL
- No-overclaim: FAIL
- Principal blocker: github_actions/deploy_failure: Deploy Production failed in GitHub Actions.
- Proxima acao: UI without persistence: /autopilot

## PULSE Machine Readiness

- Machine readiness: NOT_READY
- Scope: pulse_machine_not_kloel_product
- Product certification excluded from machine verdict: SIM (NOT_CERTIFIED)
- Can run bounded autonomous cycle: NAO
- Can declare Kloel product certified: NAO
- bounded_run: PASS - Bounded next autonomous cycle exposes 8 ai_safe unit(s).
- artifact_consistency: PASS - Cross-artifact consistency passed.
- execution_matrix: PASS - Execution matrix classified 11377 path(s) with zero unknown and zero non-terminal paths.
- critical_path_terminal: FAIL - 4884 terminal critical path(s) have precise proof blueprints but still need observed pass/fail evidence: matrix:capability:capability:abi-ab, matrix:capability:capability:abi-builder, matrix:capability:capability:account-agent, matrix:capability:capability:admin-brain, matrix:capability:capability:admin-clients, matrix:capability:capability:admin-compliance, matrix:capability:capability:admin-config, matrix:capability:capability:admin-contacts. Next ai_safe action: run the listed validation command(s), attach runtime/flow/browser/external evidence, and refresh PULSE_EXECUTION_MATRIX.json plus PULSE_PATH_COVERAGE.json.
- breakpoint_precision: PASS - Every observed failure in the execution matrix has a breakpoint.
- external_reality: FAIL - 0 missing, 2 stale, and 0 invalid external adapter(s) remain.
- self_trust: FAIL - PULSE still reconstructs 1 phantom capability(ies) and 0 phantom flow(s); self-trust stays degraded until illusion collapses into real chains.
- multi_cycle: PASS - 3 non-regressing real autonomous cycle(s) observed (>= 3 required).

## Current State

- Certification: NOT_CERTIFIED
- Human replacement: NOT_READY
- Score: 55/100
- Blocking tier: 0
- Scope parity: FAIL (low)
- Structural chains: 798/2854 complete
- Capabilities: real=0, partial=437, latent=17, phantom=1
- Capability maturity: foundational=4, connected=451, operational=0, productionReady=0
- Flows: real=0, partial=48, latent=0, phantom=0
- Execution matrix: paths=11377, observedPass=0, observedFail=248, criticalUnobserved=0, unknown=0
- Structural parity gaps: total=46, critical=0, high=45
- Finding events: totalSignals=17, uniqueEvents=17, observed=0, confirmedStatic=17, weakSignals=0
- Codacy HIGH issues: 2225
- GitNexus Code Graph: not configured
- External signals: total=53, runtime=0, change=46, dependency=0, high-impact=5

## Dynamic Finding Events

- Operational finding names are derived from evidence text, source, location and truth mode. Internal parser labels are compatibility metadata, not final truth.
- [hardcoded_data] Service method returns empty collection/object without guard evidence: count=1, truth=confirmed_static, action=fix_now, falsePositiveRisk=13%
- clickable "(sem texto)" has dead handler: count=1, truth=confirmed_static, action=fix_now, falsePositiveRisk=13%
- clickable "(sem texto)" has dead handler: count=1, truth=confirmed_static, action=fix_now, falsePositiveRisk=13%
- clickable "onAdded" has dead handler: count=1, truth=confirmed_static, action=fix_now, falsePositiveRisk=13%
- clickable "onCreated" has dead handler: count=1, truth=confirmed_static, action=fix_now, falsePositiveRisk=13%
- clickable "onTitle" has dead handler: count=1, truth=confirmed_static, action=fix_now, falsePositiveRisk=13%
- GET /admin/runtime/trace is not called by frontend code: count=1, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%
- GET /health/deep is not called by frontend code: count=1, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%

## Coverage Truth

- Inventory Coverage: 100%
- Classification Coverage: 72%
- Structural Graph Coverage: 29% (1424/4867 connected)
  Reason: 1424/4867 structural files connected.
- Test Coverage: 18%
  Reason: 679/3759 source modules have spec files.
- Scenario Coverage: 100% (declared=100%, executed=100%, passed=0%)
- Runtime Evidence Coverage: 0% (fresh=0%, stale=0%)
  Reason: No runtime probes executed.
- Production Proof Coverage: 0%
  Reason: 0/455 capabilities real.
- Unknown Files: 2831
- Orphan Files: 200
- Excluded Directories: 89
- Manifest role: semantic overlay, NOT scope boundary
- Scope source: repo_filesystem

## What is Observed vs Inferred vs Aspirational

### Observed (direct evidence)
- Runtime probes executed: 0
- External signals: 53 total
- Self-trust: FAIL
- No-overclaim: FAIL

### Inferred (structural analysis)
- 2854 structural chains
- 0 real capabilities
- 0 real flows

### Aspirational (product vision projection)
- 38 projected surfaces
- Target: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 423/423 capability(ies) and 48/48 flow(s) at least partially real, with readiness yellow.

## External Reality

- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=5, mappedFlows=20, summary=7 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=202, mappedFlows=46, summary=1 HIGH Codacy issue(s) remain in backend/src/meta/__parts__/meta-auth-helpers.ts.
- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=187, mappedFlows=46, summary=1 HIGH Codacy issue(s) remain in backend/src/meta/__parts__/meta-oauth-url.helpers.ts.
- codacy/static_hotspot: impact=55%, mode=ai_safe, mappedCapabilities=5, mappedFlows=46, summary=17 HIGH Codacy issue(s) remain in scripts/__parts__/obsidian-mirror-daemon-content.mjs.
- codacy/static_hotspot: impact=55%, mode=ai_safe, mappedCapabilities=4, mappedFlows=4, summary=5 HIGH Codacy issue(s) remain in scripts/__parts__/obsidian-mirror-daemon-utils.mjs.
- codacy/static_hotspot: impact=55%, mode=observation_only, mappedCapabilities=4, mappedFlows=4, summary=1 HIGH Codacy issue(s) remain in package.json.
- codacy/static_hotspot: impact=55%, mode=ai_safe, mappedCapabilities=2, mappedFlows=0, summary=2 HIGH Codacy issue(s) remain in scripts/__parts__/obsidian-mirror-daemon-indexes.mjs.
- github/pull_request_change: impact=68%, mode=observation_only, mappedCapabilities=0, mappedFlows=0, summary=chore: release 0.4.0

## Product Identity

- Current checkpoint: The current product-facing system materializes 423 partial capability(ies), 0 latent capability(ies), 0 phantom capability(ies). System-wide phantom capability count is 1.
- Inferred product: If the currently connected structures converge, the product resolves toward a unified operational platform centered on Analytics, Anuncios/Ads, Auth, Autopilot, Billing, Campaigns, Checkout, CIA/Agent, CRM, Dashboard, Followups, Inbox/Chat, Onboarding, Partnerships, Products, Sales/Vendas, Scrapers, Video/Voice, Marketing, Account, Area, Canvas, Carteira.
- Projected checkpoint: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 423/423 capability(ies) and 48/48 flow(s) at least partially real, with readiness yellow.
- Distance: Distance to projected readiness is driven by 0 product-facing phantom capability(ies), 1 system-wide phantom capability(ies), 0 phantom flow(s), 46 structural parity gap(s), and 2225 HIGH Codacy issue(s).

## Product Surfaces

- Analytics: status=partial, completion=100%, capabilities=167, flows=46
- Anuncios/Ads: status=partial, completion=100%, capabilities=206, flows=46, blocker=Missing structural roles: interface, orchestration, side_effect.
- Auth: status=partial, completion=100%, capabilities=172, flows=46, blocker=Missing structural roles: interface, persistence.
- Autopilot: status=partial, completion=100%, capabilities=195, flows=46
- Billing: status=partial, completion=100%, capabilities=10, flows=46
- Campaigns: status=partial, completion=100%, capabilities=170, flows=46
- Checkout: status=partial, completion=100%, capabilities=177, flows=46
- CIA/Agent: status=partial, completion=100%, capabilities=177, flows=46
- CRM: status=partial, completion=100%, capabilities=169, flows=46
- Dashboard: status=partial, completion=100%, capabilities=7, flows=46
- Followups: status=partial, completion=100%, capabilities=225, flows=46
- Inbox/Chat: status=partial, completion=100%, capabilities=8, flows=46

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

- Declared surfaces: 38
- Real surfaces: 28
- Partial surfaces: 0
- Latent surfaces: 0
- Phantom surfaces: 10
- Critical gaps:
  - Cookies: phantom surface with incomplete materialization.
  - Parcerias: phantom surface with incomplete materialization.
  - Pay: phantom surface with incomplete materialization.
  - Privacy: phantom surface with incomplete materialization.
  - Produtos: phantom surface with incomplete materialization.
  - Terms: phantom surface with incomplete materialization.
  - Tools: phantom surface with incomplete materialization.

## Structural Parity Gaps

- Back without front: Audio Synthesize: severity=high, mode=ai_safe, route=/audio/synthesize, summary=Capability Audio Synthesize is structurally live on backend/runtime paths but still lacks an identified product surface.
- Back without front: Diag Db: severity=high, mode=ai_safe, route=/diag-db, summary=Capability Diag Db is structurally live on backend/runtime paths but still lacks an identified product surface.
- Flow without validation: (sem texto): severity=high, mode=ai_safe, route=/canvas/generate, summary=Flow (sem texto) is structurally present but still lacks executed validation evidence.
- Flow without validation: canvas-post-canvas-generate: severity=high, mode=ai_safe, route=/canvas/generate, summary=canvas-post-canvas-generate -> /canvas/modelos still exists as a connected product flow candidate without declared validation/oracle coverage.
- Front without back: /chat: severity=high, mode=ai_safe, route=/, summary=/chat (api=1, backedData=0/0) still exposes a frontend-facing surface whose backend chain is incomplete or absent.
- Front without back: Autopilot Mission: severity=high, mode=ai_safe, summary=Capability Autopilot Mission exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Capabilities Capability: severity=high, mode=ai_safe, route=/capabilities, summary=Capability Capabilities Capability exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Ferramentas Ferramenta: severity=high, mode=ai_safe, summary=Capability Ferramentas Ferramenta exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Global Error: severity=high, mode=ai_safe, summary=Capability Global Error exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Health System: severity=high, mode=ai_safe, route=/health/system, summary=Capability Health System exposes UI or interaction entry points without an orchestrated backend/materialized effect.

## Execution Matrix

- Coverage: 100% classified, unknown=0, criticalUnobserved=0
- matrix:capability:capability:abi-ab: status=untested, truth=inferred, mode=governed_validation, route=n/a, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:abi-builder: status=inferred_only, truth=inferred, mode=governed_validation, route=/brain/decide, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:account-agent: status=inferred_only, truth=inferred, mode=governed_validation, route=n/a, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:ad-rules: status=observed_fail, truth=observed, mode=governed_validation, route=/ad-rules, breakpoint=1 HIGH Codacy issue(s) remain in backend/src/meta/__parts__/meta-auth-helpers.ts.
- matrix:capability:capability:admin-accounts: status=observed_fail, truth=observed, mode=governed_validation, route=/accounts/${encodeURIComponent(workspaceId)}, breakpoint=1 HIGH Codacy issue(s) remain in backend/src/meta/__parts__/meta-auth-helpers.ts.
- matrix:capability:capability:admin-audit: status=observed_fail, truth=observed, mode=governed_validation, route=/ad-rules, breakpoint=1 HIGH Codacy issue(s) remain in backend/src/meta/__parts__/meta-auth-helpers.ts.
- matrix:capability:capability:admin-auth: status=observed_fail, truth=observed, mode=governed_validation, route=/ad-rules, breakpoint=1 HIGH Codacy issue(s) remain in backend/src/meta/__parts__/meta-auth-helpers.ts.
- matrix:capability:capability:admin-brain: status=inferred_only, truth=inferred, mode=governed_validation, route=/admin/brain/spine-audit, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:admin-carteira: status=observed_fail, truth=observed, mode=governed_validation, route=/ad-rules, breakpoint=1 HIGH Codacy issue(s) remain in backend/src/meta/__parts__/meta-auth-helpers.ts.
- matrix:capability:capability:admin-chat: status=observed_fail, truth=observed, mode=governed_validation, route=/ad-rules, breakpoint=1 HIGH Codacy issue(s) remain in backend/src/meta/__parts__/meta-auth-helpers.ts.

## Capability Maturity

- Ai Insights: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Ai Section: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Area Slug: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Autopilot History: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Autopilot Mission: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Autopilot Overview: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Billing Form: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Checkout Bundles: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Checkout Editor: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect
- Cognitive Section: stage=connected, score=30%, missing=api_surface, orchestration, persistence, side_effect

## Top Blockers

- github_actions/deploy_failure: Deploy Production failed in GitHub Actions.
- github_actions/deploy_failure: Deploy Staging failed in GitHub Actions.
- codacy/static_hotspot: 7 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in backend/src/meta/__parts__/meta-auth-helpers.ts.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in backend/src/meta/__parts__/meta-oauth-url.helpers.ts.
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
- Cookies: phantom surface with incomplete materialization.
- Parcerias: phantom surface with incomplete materialization.
- Pay: phantom surface with incomplete materialization.
- Privacy: phantom surface with incomplete materialization.
- Produtos: phantom surface with incomplete materialization.

## Next Work

- [P0] UI without persistence: /autopilot | impact=transformational | mode=ai_safe | evidence=observed/high | risk=high | Converts a user-facing illusion into a real product chain for /.
- [P0] UI without persistence: /checkout/:planId | impact=transformational | mode=ai_safe | evidence=observed/high | risk=high | Converts a user-facing illusion into a real product chain for /.
- [P0] Front without back: /chat | impact=transformational | mode=ai_safe | evidence=observed/high | risk=high | Converts a user-facing illusion into a real product chain for /.
- [P0] UI without persistence: /chat | impact=transformational | mode=ai_safe | evidence=observed/high | risk=high | Converts a user-facing illusion into a real product chain for /.
- [P0] Recover Customer Whatsapp And Inbox | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Customer Whatsapp And Inbox so convergence is based on settled world-state proof.
- [P0] Recover Operator Autopilot Run | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Operator Autopilot Run so convergence is based on settled world-state proof.
- [P0] Recover Admin Whatsapp Session Control | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Admin Whatsapp Session Control so convergence is based on settled world-state proof.
- [P0] Recover Operator Campaigns And Flows | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Operator Campaigns And Flows so convergence is based on settled world-state proof.

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