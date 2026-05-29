# PULSE REPORT — 2026-05-29T17:49:21.237Z

## PULSE VERDICT

- Produto pronto para producao? NAO
- IA pode trabalhar autonomamente ate producao? NAO
- Proximo passo seguro? SIM
- Self-trust: PASS
- No-overclaim: FAIL
- Principal blocker: codacy/static_hotspot: 7 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- Proxima acao: UI without persistence: /autopilot

## PULSE Machine Readiness

- Machine readiness: NOT_READY
- Scope: pulse_machine_not_kloel_product
- Product certification excluded from machine verdict: SIM (NOT_CERTIFIED)
- Can run bounded autonomous cycle: SIM
- Can declare Kloel product certified: NAO
- bounded_run: PASS - Bounded next autonomous cycle exposes 8 ai_safe unit(s).
- artifact_consistency: PASS - Cross-artifact consistency passed.
- execution_matrix: PASS - Execution matrix classified 19976 path(s) with zero unknown and zero non-terminal paths.
- critical_path_terminal: FAIL - 5710 terminal critical path(s) have precise proof blueprints but still need observed pass/fail evidence: matrix:capability:capability:abi-ab, matrix:capability:capability:abi-builder, matrix:capability:capability:abi-snapshot, matrix:capability:capability:account, matrix:capability:capability:account-agent, matrix:capability:capability:ad-rules, matrix:capability:capability:admin-accounts, matrix:capability:capability:admin-audit. Next ai_safe action: run the listed validation command(s), attach runtime/flow/browser/external evidence, and refresh PULSE_EXECUTION_MATRIX.json plus PULSE_PATH_COVERAGE.json.
- breakpoint_precision: PASS - Every observed failure in the execution matrix has a breakpoint.
- external_reality: FAIL - 0 missing, 2 stale, and 0 invalid external adapter(s) remain.
- self_trust: PASS - All parsers loaded and no phantom capability/flow remains. 24 aspirational structure(s) remain explicitly marked as aspirational.
- multi_cycle: PASS - 3 non-regressing real autonomous cycle(s) observed (>= 3 required).

## Current State

- Certification: NOT_CERTIFIED
- Human replacement: NOT_READY
- Score: 52/100
- Blocking tier: 0
- Scope parity: FAIL (low)
- Structural chains: 773/2749 complete
- Capabilities: real=0, partial=463, latent=24, phantom=0
- Capability maturity: foundational=2, connected=485, operational=0, productionReady=0
- Flows: real=0, partial=85, latent=0, phantom=0
- Execution matrix: paths=19976, observedPass=0, observedFail=40, criticalUnobserved=0, unknown=0
- Structural parity gaps: total=42, critical=0, high=41
- Finding events: totalSignals=36, uniqueEvents=36, observed=0, confirmedStatic=36, weakSignals=0
- Codacy HIGH issues: 2225
- GitNexus Code Graph: not configured
- External signals: total=50, runtime=0, change=43, dependency=0, high-impact=1

## Dynamic Finding Events

- Operational finding names are derived from evidence text, source, location and truth mode. Internal parser labels are compatibility metadata, not final truth.
- DELETE /whatsapp-api/session/disconnect is not called by frontend code: count=1, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%
- GET /billing/status is not called by frontend code: count=1, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%
- GET /kloel/onboarding/:workspaceId/status is not called by frontend code: count=1, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%
- GET /marketing/ai-brain is not called by frontend code: count=1, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%
- GET /marketing/channel/:channel/stats is not called by frontend code: count=1, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%
- GET /marketing/connect/google-ads/campaigns is not called by frontend code: count=1, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%
- GET /marketing/connect/google-ads/customers is not called by frontend code: count=1, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%
- GET /marketing/connect/tiktok/campaigns is not called by frontend code: count=1, truth=confirmed_static, action=needs_context, falsePositiveRisk=13%

## Coverage Truth

- Inventory Coverage: 100%
- Classification Coverage: 80%
- Structural Graph Coverage: 28% (1646/5907 connected)
  Reason: 1646/5907 structural files connected.
- Test Coverage: 22%
  Reason: 931/4301 source modules have spec files.
- Scenario Coverage: 100% (declared=100%, executed=100%, passed=0%)
- Runtime Evidence Coverage: 0% (fresh=0%, stale=0%)
  Reason: No runtime probes executed.
- Production Proof Coverage: 0%
  Reason: 0/487 capabilities real.
- Unknown Files: 3725
- Orphan Files: 200
- Excluded Directories: 26
- Manifest role: semantic overlay, NOT scope boundary
- Scope source: repo_filesystem

## What is Observed vs Inferred vs Aspirational

### Observed (direct evidence)
- Runtime probes executed: 0
- External signals: 50 total
- Self-trust: PASS
- No-overclaim: FAIL

### Inferred (structural analysis)
- 2749 structural chains
- 0 real capabilities
- 0 real flows

### Aspirational (product vision projection)
- 40 projected surfaces
- Target: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 436/436 capability(ies) and 85/85 flow(s) at least partially real, with readiness yellow.

## External Reality

- codacy/static_hotspot: impact=80%, mode=ai_safe, mappedCapabilities=6, mappedFlows=32, summary=7 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- codacy/static_hotspot: impact=55%, mode=ai_safe, mappedCapabilities=5, mappedFlows=83, summary=17 HIGH Codacy issue(s) remain in scripts/__parts__/obsidian-mirror-daemon-content.mjs.
- codacy/static_hotspot: impact=55%, mode=ai_safe, mappedCapabilities=4, mappedFlows=5, summary=5 HIGH Codacy issue(s) remain in scripts/__parts__/obsidian-mirror-daemon-utils.mjs.
- codacy/static_hotspot: impact=55%, mode=ai_safe, mappedCapabilities=208, mappedFlows=84, summary=1 HIGH Codacy issue(s) remain in backend/src/meta/__parts__/meta-auth-helpers.ts.
- codacy/static_hotspot: impact=55%, mode=ai_safe, mappedCapabilities=194, mappedFlows=84, summary=1 HIGH Codacy issue(s) remain in backend/src/meta/__parts__/meta-oauth-url.helpers.ts.
- codacy/static_hotspot: impact=55%, mode=observation_only, mappedCapabilities=4, mappedFlows=5, summary=1 HIGH Codacy issue(s) remain in package.json.
- codacy/static_hotspot: impact=55%, mode=ai_safe, mappedCapabilities=2, mappedFlows=0, summary=2 HIGH Codacy issue(s) remain in scripts/__parts__/obsidian-mirror-daemon-indexes.mjs.
- github/pull_request_change: impact=68%, mode=observation_only, mappedCapabilities=0, mappedFlows=0, summary=fix(kloel): route text llm by configured provider

## Product Identity

- Current checkpoint: The current product-facing system materializes 436 partial capability(ies), 0 latent capability(ies). System-wide phantom capability count is 0.
- Inferred product: If the currently connected structures converge, the product resolves toward a unified operational platform centered on Analytics, Autopilot, Billing, Campaigns, Checkout, CIA/Agent, CRM, Dashboard, Inbox/Chat, Onboarding, Partnerships, Products, Sales/Vendas, Scrapers, Settings, Account, Admin, Canvas, Carteira, Cookies, Ferramentas, Launch, Media, Parcerias.
- Projected checkpoint: If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to 436/436 capability(ies) and 85/85 flow(s) at least partially real, with readiness yellow.
- Distance: Distance to projected readiness is driven by 0 product-facing phantom capability(ies), 0 system-wide phantom capability(ies), 0 phantom flow(s), 42 structural parity gap(s), and 2225 HIGH Codacy issue(s).

## Product Surfaces

- Analytics: status=partial, completion=100%, capabilities=168, flows=84
- Autopilot: status=partial, completion=100%, capabilities=209, flows=84
- Billing: status=partial, completion=100%, capabilities=10, flows=83
- Campaigns: status=partial, completion=100%, capabilities=179, flows=84
- Checkout: status=partial, completion=100%, capabilities=188, flows=84
- CIA/Agent: status=partial, completion=100%, capabilities=190, flows=84
- CRM: status=partial, completion=100%, capabilities=159, flows=84
- Dashboard: status=partial, completion=100%, capabilities=7, flows=83
- Inbox/Chat: status=partial, completion=100%, capabilities=7, flows=83
- Onboarding: status=partial, completion=100%, capabilities=164, flows=84
- Partnerships: status=partial, completion=100%, capabilities=159, flows=84
- Products: status=partial, completion=100%, capabilities=168, flows=84

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

- Declared surfaces: 40
- Real surfaces: 27
- Partial surfaces: 13
- Latent surfaces: 13
- Phantom surfaces: 13
- Critical gaps:
  - Anuncios/Ads: Missing structural roles: interface, orchestration, side_effect.
  - Auth: Missing structural roles: interface, persistence.
  - Followups: Missing structural roles: interface, persistence.
  - Marketing: Missing structural roles: interface, persistence, side_effect.
  - Area: Missing structural roles: interface, persistence.
  - Pay: latent surface with incomplete materialization.
  - Privacy: latent surface with incomplete materialization.
  - Produtos: latent surface with incomplete materialization.
  - Terms: latent surface with incomplete materialization.

## Structural Parity Gaps

- Back without front: Audio Synthesize: severity=high, mode=ai_safe, route=/audio/synthesize, summary=Capability Audio Synthesize is structurally live on backend/runtime paths but still lacks an identified product surface.
- Flow without validation: (sem texto): severity=high, mode=ai_safe, route=/canvas/generate, summary=Flow (sem texto) is structurally present but still lacks executed validation evidence.
- Flow without validation: canvas-delete-canvas-designs-id: severity=high, mode=ai_safe, route=/canvas/designs/:id, summary=canvas-delete-canvas-designs-id -> /canvas/inicio still exists as a connected product flow candidate without declared validation/oracle coverage.
- Flow without validation: canvas-post-canvas-generate: severity=high, mode=ai_safe, route=/canvas/designs/:id, summary=canvas-post-canvas-generate -> /canvas/modelos still exists as a connected product flow candidate without declared validation/oracle coverage.
- Flow without validation: onDelete: severity=high, mode=ai_safe, route=/canvas/designs/:id, summary=Flow onDelete is structurally present but still lacks executed validation evidence.
- Front without back: /leads: severity=high, mode=ai_safe, route=/kloel/leads/:workspaceId, summary=/leads (api=1, backedData=0/0) still exposes a frontend-facing surface whose backend chain is incomplete or absent.
- Front without back: Admin Change: severity=high, mode=ai_safe, summary=Capability Admin Change exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Autopilot Mission: severity=high, mode=ai_safe, summary=Capability Autopilot Mission exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Ferramentas Ferramenta: severity=high, mode=ai_safe, summary=Capability Ferramentas Ferramenta exposes UI or interaction entry points without an orchestrated backend/materialized effect.
- Front without back: Global Error: severity=high, mode=ai_safe, summary=Capability Global Error exposes UI or interaction entry points without an orchestrated backend/materialized effect.

## Execution Matrix

- Coverage: 100% classified, unknown=0, criticalUnobserved=0
- matrix:capability:capability:abi-ab: status=untested, truth=inferred, mode=governed_validation, route=n/a, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
- matrix:capability:capability:abi-builder: status=inferred_only, truth=inferred, mode=governed_validation, route=/brain/decide, breakpoint=Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.
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

- codacy/static_hotspot: 7 HIGH Codacy issue(s) remain in backend/prisma/migrations/20251209150035_init_baseline/migration.sql.
- github_actions/build_failure: Codacy Analysis failed in GitHub Actions.
- github_actions/build_failure: CI failed in GitHub Actions.
- github_actions/build_failure: CodeQL failed in GitHub Actions.
- github_actions/build_failure: Dependabot Auto Merge failed in GitHub Actions.
- github/pull_request_change: fix(kloel): route text llm by configured provider
- github/pull_request_change: chore(backlog): publish accumulated codebase work
- github/pull_request_change: chore(deps): bump @opencode-ai/sdk from 1.15.10 to 1.15.11 in the root-prod-patches group
- github/pull_request_change: chore(deps-dev): bump tmp from 0.2.5 to 0.2.6 in /backend in the npm_and_yarn group across 1 directory
- github/pull_request_change: chore(deps-dev): bump typescript-eslint from 8.59.4 to 8.60.0 in /backend in the backend-dev-patches group
- github/pull_request_change: chore(deps): bump the backend-prod-patches group in /backend with 6 updates
- github/pull_request_change: chore(deps): bump the frontend-prod-patches group in /frontend with 2 updates
- github/pull_request_change: chore(deps): bump the worker-prod-patches group in /worker with 4 updates
- github/pull_request_change: fix(marketing): center channel selector in app rail
- github/pull_request_change: fix(marketing): simplify sidebar chrome
- github/pull_request_change: chore(deps): bump the backend-prod-patches group in /backend with 2 updates
- github/pull_request_change: chore(deps): bump dompurify from 3.4.6 to 3.4.7 in /frontend in the frontend-prod-patches group
- github/pull_request_change: chore(deps): bump stripe from 22.1.1 to 22.2.0 in /worker in the worker-prod-patches group
- github/pull_request_change: feat(kloel): motor observability stack — Wave-K1+K2 on top of #462
- codacy/static_hotspot: 17 HIGH Codacy issue(s) remain in scripts/__parts__/obsidian-mirror-daemon-content.mjs.
- codacy/static_hotspot: 5 HIGH Codacy issue(s) remain in scripts/__parts__/obsidian-mirror-daemon-utils.mjs.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in backend/src/meta/__parts__/meta-auth-helpers.ts.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in backend/src/meta/__parts__/meta-oauth-url.helpers.ts.
- codacy/static_hotspot: 1 HIGH Codacy issue(s) remain in package.json.
- codacy/static_hotspot: 2 HIGH Codacy issue(s) remain in scripts/__parts__/obsidian-mirror-daemon-indexes.mjs.
- github/recent_change: fix(ci): sync worker prisma schema Keep worker/prisma/schema.prisma aligned with backend/prisma/schema.prisma after the accumulated Site schema changes so the CI single-source Prisma gate passes on PR 448. Constraint: no governance or wo...
- github/recent_change: fix(ci): remove product json double casts The full local gate run surfaced remaining unsafe JSON casts in product sub-resource tools. The values are already structured JSON payloads, so the narrow Prisma.InputJsonValue assertion is enoug...
- github/recent_change: chore(deps): bump the backend-prod-patches group (#459) Bumps the backend-prod-patches group in /backend with 2 updates: [@aws-sdk/client-s3](https://github.com/aws/aws-sdk-js-v3/tree/HEAD/clients/client-s3) and [stripe](https://github.c...
- github/recent_change: fix(ci): expose tenant filters in list queries Make workspaceId filters explicit in product and site list Prisma calls so the invariant I4 static scanner can verify the tenant boundary instead of relying on aliased where objects. Constra...
- github/recent_change: chore(deps): bump stripe in /worker in the worker-prod-patches group (#461) Bumps the worker-prod-patches group in /worker with 1 update: [stripe](https://github.com/stripe/stripe-node). Updates `stripe` from 22.1.1 to 22.2.0 - [Release ...
- github/recent_change: test(wallet): stabilize workspace id mock The full frontend suite was leaking the default workspace id because the no-workspace tests used nested vi.mock calls that Vitest hoists. The hook already handles the missing workspace id, so the...
- github/recent_change: fix(kloel): expose self awareness intents Kloel already had self-health, self-gaps, and capability registry tools. The chat action detector did not route natural P1 questions to those tools. This adds deterministic self-awareness intents...
- github/recent_change: chore(pr448): stabilize consolidation gates Reconcile oversized Kloel files back to the base tree so the backlog PR carries the accumulated work without tripping changed-file architecture budgets. Also fixes the atomic-only hook guidance...
- github/recent_change: chore(deps): bump dompurify (#460) Bumps the frontend-prod-patches group in /frontend with 1 update: [dompurify](https://github.com/cure53/DOMPurify). Updates `dompurify` from 3.4.6 to 3.4.7 - [Release notes](https://github.com/cure53/DO...
- github/recent_change: Merge pull request #448 from danielgonzagat/codex/backlog-consolidation-production-v2 chore(backlog): publish accumulated codebase work
- github/recent_change: fix(ci): stabilize PR 448 consolidation gates Consolidate the accumulated PR #448 fixes behind the live gates: worker BullMQ connection options, backend Redis test mocks, Kloel canonical receipts, deterministic chat actions, ABI state ha...
- github/recent_change: fix(ci): satisfy architecture diff guard GitHub CI was rejecting PR #448 because several oversized files were touched for small routing and receipt changes. This keeps the material dotted-alias receipt behavior in the extracted helper, r...
- github/recent_change: docs(architecture): normalize backlog report whitespace Remove trailing Markdown whitespace from accumulated architecture reports so final PR diffs stay clean under git diff checks. Constraint: documentation-only cleanup; no governance o...
- github/recent_change: fix(ci): scope self-awareness runtime cache key Mark the SESSION_STATE runtime error cache as an explicit CIA global key so the invariant I4 Redis key scanner does not treat the in-memory cache entry as an unscoped tenant key. Constraint...
- github/recent_change: Merge branch 'main' into codex/backlog-consolidation-production-v2
- github/recent_change: Merge remote-tracking branch 'origin/codex/backlog-consolidation-production-v2' into codex/pr448-consolidator-20260527
- github/recent_change: test(onboarding): align cta focus ring coverage The consolidated onboarding CTA now applies the canonical ember focus ring, so the coverage assertion needs to match the published component behavior instead of the older no-shadow expectat...
- github/recent_change: fix(ci): clear PR 448 eslint seatbelt regressions Remove the remaining PR 448 ESLint seatbelt regressions by avoiding React Hooks 7.1 ref/set-state patterns in the dashboard send path and by cleaning worker formatting plus unused mock pa...
- github/recent_change: fix(kloel): stabilize dispatcher and backend boot The backlog PR carried product dispatcher wiring and cognitive tool services that compiled but failed focused routing specs and Nest boot smoke. This narrows the dispatcher surface throug...
- github/pull_request: fix(frontend): align channel onboarding diamond
- github/pull_request: chore: release 0.9.0
- github/pull_request: fix(backend): restore main typecheck
- github/pull_request: fix(backend): use BullMQ Redis connection options
- github/pull_request: fix(frontend): preserve channel onboarding trace states
- github/pull_request: chore: canonicalization mission + helper extraction waves (Claude/PI w95-w122)
- Anuncios/Ads: Missing structural roles: interface, orchestration, side_effect.
- Auth: Missing structural roles: interface, persistence.
- Followups: Missing structural roles: interface, persistence.
- Marketing: Missing structural roles: interface, persistence, side_effect.
- Area: Missing structural roles: interface, persistence.
- Pay: latent surface with incomplete materialization.
- Privacy: latent surface with incomplete materialization.
- Produtos: latent surface with incomplete materialization.
- Terms: latent surface with incomplete materialization.

## Next Work

- [P0] UI without persistence: /autopilot | impact=transformational | mode=ai_safe | evidence=observed/high | risk=high | Converts a user-facing illusion into a real product chain for /.
- [P0] UI without persistence: /checkout/:planId | impact=transformational | mode=ai_safe | evidence=observed/high | risk=high | Converts a user-facing illusion into a real product chain for /.
- [P0] Recover Customer Whatsapp And Inbox | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Customer Whatsapp And Inbox so convergence is based on settled world-state proof.
- [P0] Recover Operator Autopilot Run | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Operator Autopilot Run so convergence is based on settled world-state proof.
- [P0] Recover Admin Whatsapp Session Control | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Admin Whatsapp Session Control so convergence is based on settled world-state proof.
- [P0] Recover Operator Campaigns And Flows | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=critical | Closes pending asynchronous evidence for Operator Campaigns And Flows so convergence is based on settled world-state proof.
- [P0] UI without persistence: /cia | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=high | Converts a user-facing illusion into a real product chain for /.
- [P0] UI without persistence: /marketing/email | impact=transformational | mode=ai_safe | evidence=inferred/medium | risk=high | Converts a user-facing illusion into a real product chain for /.

## Cross-Artifact Consistency

- Not evaluated this run.

## Cleanup

- Canonical dir: /Users/danielpenin/whatsapp_saas/.pulse/current
- Mirrors: PULSE_ADMIN_EVIDENCE.json, PULSE_AGENT_ORCHESTRATION_STATE.json, PULSE_ARTIFACT_INDEX.json, PULSE_AUTONOMY_MEMORY.json, PULSE_AUTONOMY_STATE.json, PULSE_BEADS_STATE.json, PULSE_BROWSER_EVIDENCE.json, PULSE_CAPABILITY_STATE.json, PULSE_CERTIFICATE.json, PULSE_CLI_DIRECTIVE.json, PULSE_CODACY_EVIDENCE.json, PULSE_CODEBASE_TRUTH.json, PULSE_CONTEXT_BROADCAST.json, PULSE_CONTEXT_DELTA.json, PULSE_CONVERGENCE_PLAN.json, PULSE_CUSTOMER_EVIDENCE.json, PULSE_EXECUTION_MATRIX.json, PULSE_EXECUTION_TRACE.json, PULSE_EXTERNAL_SIGNAL_STATE.json, PULSE_FLOW_EVIDENCE.json, PULSE_FLOW_PROJECTION.json, PULSE_GITNEXUS_STATE.json, PULSE_HEALTH.json, PULSE_INVARIANT_EVIDENCE.json, PULSE_MACHINE_READINESS.json, PULSE_OBSERVABILITY_EVIDENCE.json, PULSE_OPERATOR_EVIDENCE.json, PULSE_PARITY_GAPS.json, PULSE_PATH_COVERAGE.json, PULSE_PRODUCT_GRAPH.json, PULSE_PRODUCT_VISION.json, PULSE_RECOVERY_EVIDENCE.json, PULSE_REPORT.md, PULSE_RESOLVED_MANIFEST.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json, PULSE_SCENARIO_COVERAGE.json, PULSE_SCOPE_STATE.json, PULSE_SOAK_EVIDENCE.json, PULSE_STRUCTURAL_GRAPH.json, PULSE_WORKER_LEASES.json, PULSE_WORLD_STATE.json
- Removed legacy artifacts this run: 23

## Truth Model

- `observed`: backed by runtime, browser, declared flows, actors or explicit execution evidence.
- `inferred`: reconstructed from structure with no direct executed proof in this run.
- `projected`: future-consistent product shape implied by connected latent structures.

## Safety

- Governance-protected surfaces stay governed by sandboxed validation.
- Missing evidence stays missing evidence; PULSE does not upgrade it to certainty.