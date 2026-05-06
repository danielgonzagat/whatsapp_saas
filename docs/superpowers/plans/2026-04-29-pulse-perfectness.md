# PULSE Perfectness — Complete Implementation Plan

> **Goal:** Transform PULSE from autonomous-execution (77/100) into certified-autonomous "perfect machine" — dynamic universal scope, AST-resolved graph, runtime evidence, property testing, chaos, Bayesian risk, incremental compute, signed audit trail, and full production autonomy.

**Architecture:** Each technology is a self-contained module in `scripts/pulse/` with its own types file, integrating via the existing daemon.ts pipeline. New modules register through `parser-registry.ts` or are imported directly by `daemon.ts`. All output artifacts follow the existing `.pulse/current/` convention.

**Tech Stack:** ts-morph (AST), OpenTelemetry, Playwright, fast-check (property testing), Stryker (mutation), Toxiproxy (chaos), Pact (contract), Merkle hashing, Ed25519 signing

---

## Wave 1 — Foundation (AST + Scope + Behavior Graph)

### Module 1.1: `ast-graph.ts` — AST-Resolved Call Graph

- Replaces regex-based parsers with ts-morph TypeScript Compiler API
- Builds type-resolved call graph with import chains, generics, decorators
- Detects indirect calls (interface dispatch, factories, re-exports)
- Output: `PULSE_AST_GRAPH.json`

### Module 1.2: `scope-engine.ts` — Dynamic Universal Scope Engine

- Real-time file detection → classification → graph connection
- Zero unknown files, zero critical orphans
- 30s detection of new files
- Output: updated `PULSE_SCOPE_STATE.json`

### Module 1.3: `behavior-graph.ts` — Universal Code Behavior Graph

- Per-function analysis: inputs, outputs, state reads/writes, side effects
- Maps every handler, route, job, webhook to behavior nodes
- Detects execution mode (ai_safe, human_required, observation_only) per function
- Output: `PULSE_BEHAVIOR_GRAPH.json`

## Wave 2 — Incremental + Runtime

### Module 2.1: `merkle-cache.ts` — Merkle DAG Incremental Computation

- Content hashing per file/capability/flow
- Recompute only changed nodes following dependency edges
- Cache at `.pulse/cache/` indexed by hash
- Output: `PULSE_MERKLE_CACHE.json`

### Module 2.2: `otel-runtime.ts` — OpenTelemetry Runtime Call Graph

- Auto-instruments NestJS, Prisma, BullMQ, Axios, HTTP, Redis
- Captures real trace trees during scenario execution
- Compares observed traces vs static graph
- Output: `PULSE_RUNTIME_TRACES.json`

### Module 2.3: `runtime-fusion.ts` — Runtime Reality Fusion Engine

- Sentry/Datadog/Prometheus/GitHub Actions as authority
- Real errors override lint warnings in priority
- Runtime signals map to capabilities/flows automatically
- Output: `PULSE_RUNTIME_FUSION.json`

## Wave 3 — Execution + Testing

### Module 3.1: `property-tester.ts` — Property-Based + Fuzz Testing

- fast-check for pure services (1000+ inputs per function)
- Schemathesis/RESTler for API fuzz against OpenAPI spec
- Stryker.js for mutation testing
- Output: `PULSE_PROPERTY_EVIDENCE.json`

### Module 3.2: `execution-harness.ts` — Universal Execution Harness

- Execute functions, services, controllers, endpoints, workers, webhooks
- Test env bootstrap with real dependencies
- Fixture generation for queues, webhooks, DB states
- Output: `PULSE_HARNESS_EVIDENCE.json`

### Module 3.3: `ui-crawler.ts` — Intelligent UI Interaction Crawler

- Discovers pages, buttons, forms, modals across auth roles
- Clicks every interactive element, observes network/DOM/DB effects
- Maps UI elements to backend handlers
- Output: `PULSE_CRAWLER_EVIDENCE.json`

### Module 3.4: `api-fuzzer.ts` — API Contract & Fuzz Probe Engine

- Generates valid/invalid payloads per endpoint
- Tests auth, tenant isolation, idempotency, rate limits
- Validates response schemas against OpenAPI
- Output: `PULSE_API_FUZZ_EVIDENCE.json`

## Wave 4 — Data + State

### Module 4.1: `dataflow-engine.ts` — Dataflow & State Mutation Engine

- Maps entity lifecycle (create/read/update/delete) for every Prisma model
- Infers from services, routes, UI usage without hardcoding
- Detects missing audit trails for financial entities
- Output: `PULSE_DATAFLOW_STATE.json`

### Module 4.2: `contract-tester.ts` — Contract Testing & Schema Diff

- Pact/Spectral contracts for external providers (Meta, Asaas, OpenAI, Resend)
- OpenAPI diff (`oasdiff`) for backend API breaking changes
- Prisma schema migration safety check
- Output: `PULSE_CONTRACT_EVIDENCE.json`

### Module 4.3: `dod-engine.ts` — Capability Definition-of-Done Engine

- Per-capability objective criteria: UI, API, service, persistence, side effects
- Unit/integration/E2E test requirements, runtime observation, observability
- DoD gates block Real classification
- Output: updated capability states with DoD fields

## Wave 5 — Production + Observability

### Module 5.1: `observability-coverage.ts` — Observability Coverage Engine

- Maps logs, traces, metrics, alerts, dashboards per capability
- Detects gaps: missing structured logging, no tracing, no alerting
- Output: `PULSE_OBSERVABILITY_COVERAGE.json`

### Module 5.2: `scenario-engine.ts` — Scenario Evidence Engine

- Generates executable scenarios from flow projections
- Links UI/API/DB/runtime evidence per scenario
- Runs in staging with verification
- Output: `PULSE_SCENARIO_EVIDENCE.json`

### Module 5.3: `replay-adapter.ts` — Production Replay → Scenarios

- Consumes Sentry/Datadog session replays
- Generates Playwright specs from real user sessions
- Classifies sessions for permanent test inclusion
- Output: `PULSE_REPLAY_SCENARIOS.json`

### Module 5.4: `production-proof.ts` — Production Proof Engine

- Deploys to staging, runs scenarios, observes logs/traces/metrics
- Verifies no Sentry regression, DB side effects correct
- Proves rollback possible
- Output: `PULSE_PRODUCTION_PROOF.json`

## Wave 6 — Chaos + Coverage

### Module 6.1: `chaos-engine.ts` — Real Chaos Engineering

- Toxiproxy between backend and Postgres/Redis in staging
- Injects latency, drops, slow-close, partition scenarios
- Measures graceful degradation, circuit breaker triggers
- Creates blast radius map
- Output: `PULSE_CHAOS_EVIDENCE.json`

### Module 6.2: `path-coverage-engine.ts` — Full Path Coverage Engine

- Classifies every execution matrix path
- Generates test/probe per critical path
- Executes if safe, marks observed/inferred/not_executable
- Output: updated execution matrix with reduced inferred_only

## Wave 7 — Intelligence + Memory

### Module 7.1: `probabilistic-risk.ts` — Bayesian Product Reliability

- Beta distribution per capability updated with each observation
- Temporal decay on old evidence
- Prioritizes by expected impact = reliability × traffic_share
- Output: `PULSE_PROBABILISTIC_RISK.json`

### Module 7.2: `structural-memory.ts` — Structural Memory Engine

- Records every unit attempt, strategy, result
- Detects repeated failures (3x → needs_human_review)
- Learns false positives
- Output: `PULSE_STRUCTURAL_MEMORY.json`

### Module 7.3: `false-positive-adjudicator.ts` — False Positive Adjudication

- Lifecycle: open → confirmed → fixed → false_positive → accepted_risk
- Each false positive requires proof
- Suppressions expire on file change
- Output: `PULSE_FP_ADJUDICATION.json`

## Wave 8 — Authority + Loop

### Module 8.1: `continuous-daemon.ts` — Autonomous Continuous Loop Daemon

- Runs forever until product certified
- Picks highest-value ai_safe unit
- Leases files, spawns agent, validates, commits/rollbacks
- 72h autonomous test target
- Output: continuous autonomy state updates

### Module 8.2: `authority-engine.ts` — Definition of Authority Engine

- Formal authority levels with transition gates
- advisory_only → operator_gated → bounded_autonomous → certified_autonomous → production_authority
- Self-trust, external reality, runtime evidence, multi-cycle required per level
- Output: `PULSE_AUTHORITY_STATE.json`

### Module 8.3: `audit-chain.ts` — Signed Execution Trail (Merkle Audit Chain)

- Each autonomy iteration generates signed block
- Hash chain: prevHash + treeHash + decisionHash + signature
- Append-only `PULSE_AUDIT_CHAIN.jsonl`
- Verifiable by `verify-trail.ts`
- Output: `PULSE_AUDIT_CHAIN.jsonl`

## Wave 9 — Architecture + Test

### Module 9.1: `gitnexus-freshness.ts` — GitNexus Freshness Engine

- Auto-reindex on commit changes
- Graph freshness gate
- Stale graph blocks parallel agents
- Output: `PULSE_GITNEXUS_FRESHNESS.json`

### Module 9.2: `plugin-system.ts` — Universal Plugin Architecture

- `PulsePlugin` interface: discover(), link(), evidence(), gates()
- Plugin registry with discovery
- Parser plugins, adapter plugins, evidence plugins, gate plugins
- Output: `PULSE_PLUGIN_REGISTRY.json`

### Module 9.3: `safety-sandbox.ts` — Safety Sandbox & Destructive Action Control

- Cloned workspace per autonomous cycle
- Patch validation before application
- Destructive action classification (migrations, payments, auth, infra, secrets)
- Human-required gate for destructive operations
- Output: `PULSE_SANDBOX_STATE.json`

### Module 9.4: `perfectness-test.ts` — Perfectness Test Harness

- Formal 72h autonomous test
- Fresh branch, fresh AI session, single prompt
- No human intervention
- Gates: PULSE core green, product core green, E2E pass, runtime stable, no regression
- Output: `PULSE_PERFECTNESS_RESULT.json`
