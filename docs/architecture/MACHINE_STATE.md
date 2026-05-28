# Kloel Machine State

> Measured ground-truth of the codebase, infrastructure, and runtime — produced
> by exercising every available MCP/LSP/CLI. Refresh by re-running the data
> generators in `scripts/cognitive/` and the verification recipes at the end of
> this document. This is the **canonical machine-state snapshot**; everything
> else either generates this or consumes it.

Snapshot timestamp: **2026-05-26**.
Source of truth: live measurements, not historical docs.

---

## 1. Size and Composition

| Metric                                |                        Value | Source                                    |
| ------------------------------------- | ---------------------------: | ----------------------------------------- |
| Total LOC (ts/tsx/js/mjs/jsx, source) |                  **831,412** | `find ... \| xargs awk 'END {print NR}'`  |
| Total source files                    |                    **5,023** | 4,121 TS + 902 TSX                        |
| Files tracked by git                  |                    **6,681** | `git ls-files`                            |
| Spec/test files                       |                    **1,094** | (≈ 22% of code files have a sibling spec) |
| Lines of markdown                     | **350,768** across 806 files | `find . -name '*.md' \| xargs wc -l`      |

LOC by workspace:

```
backend/src        455,553   55%
frontend/src       194,597   23%
scripts/           165,528   20%   ← scripts/pulse dominates here
worker/             38,025    5%
frontend-admin/src  15,105    2%
tools/               7,425    -    ← cognitive-hub + lsp-mesh + canonicalize
```

The codebase is **backend-heavy**, and **scripts/** is the third-largest workspace because `scripts/pulse/` (governance scanner) is itself a substantial program.

---

## 2. Backend (NestJS) shape

| Surface                      |   Count | Notes                                     |
| ---------------------------- | ------: | ----------------------------------------- |
| Controllers (.controller.ts) | **163** | not 111 as older docs claim               |
| Services (.service.ts)       | **428** | not 150 — much higher                     |
| Modules (.module.ts)         | **157** |                                           |
| DTOs (.dto.ts)               | **111** |                                           |
| Guards                       |  **21** | jwt/workspace/admin/api-key/etc.          |
| Interceptors                 |   **7** | logging/audit/idempotency                 |
| Pipes                        |   **1** | `PaginationLimitPipe` (canonical, common) |

OpenAPI extraction (static AST scan, no backend boot):

- **580 paths / 663 operations / 60 tags**
- Top tags by endpoint count:

```
48  kloel              ← AI agent surface — largest single domain
47  checkout           ← motor comercial
46  products
44  marketing
43  whatsapp-api
24  auth
22  autopilot
21  member-areas
20  sales
20  meta
20  reports
18  CIA
16  kyc
16  partnerships
15  api (uncategorized)
```

The 7 top domains cover 220/663 ops (33% of HTTP surface).

Authentication tiering (real `@UseGuards` + `@RouteClass` counts):

```
184  @UseGuards applied total
 76  mutate routes
 37  read routes
 18  AI routes
 12  webhook routes
  3  auth routes
```

---

## 3. Frontend (Next.js 15 App Router)

| Surface                     |   Count |
| --------------------------- | ------: |
| Pages (page.tsx)            | **110** |
| Components (.tsx)           | **557** |
| API proxy routes (route.ts) |  **71** |
| Hooks (`use*.{ts,tsx}`)     |  **89** |

Note: older docs claimed 194 components; real is 557 (≈ 2.9×).

---

## 4. Worker (BullMQ)

| Surface                |      Count |
| ---------------------- | ---------: |
| Lazy-queue definitions |     **11** |
| Real processors        |     **10** |
| Source LOC             | **38,025** |

Processors in `worker/processors/`:

- `autopilot/` (sub-dir + autopilot-processor.ts)
- `cia/` (sub-dir)
- `crm-processor.ts`
- `checkout-social-lead-enrichment.ts`
- `decision-outcome-resolver.ts`
- `fact-extractor.ts`
- `memory-processor.ts`
- `memory-text-splitter.ts`
- `mind-lift-report.processor.ts`
- `prepaid-wallet-errors.ts` + `prepaid-wallet-settlement.ts`
- `silent-24h-resolver.processor.ts`
- `webhook-processor.ts`

Older docs claimed "81 worker processors" — that was wrong by 8×.

---

## 5. Data layer

### Prisma schema (`backend/prisma/schema.prisma`)

- **173 models** (older docs said 131 — off by +32%)
- **39 enums**
- **4,586 schema lines**
- **63 migrations** in `backend/prisma/migrations/`

Top tables by field count (god-tables — concentration risk):

```
103  Workspace          ← multi-tenant root; absorbs cross-domain config
 93  CheckoutConfig
 61  Product
 49  Agent              ← User entity (RAC_Agent in DB)
 43  CheckoutOrder
 43  CheckoutSocialLead
 31  ProductPlan
 30  MemberArea
 30  PhysicalOrder
 29  Contact
```

### Live Postgres tables (queried via `mcp__postgres__pg_tables`)

- **159 RAC\_\* tables** in `public` schema (matches the in-flight Prisma models; not every model has shipped a migration yet)
- Separate non-prefixed tables for admin governance: `admin_audit_logs`, `admin_chat_messages`, `admin_chat_sessions`, `admin_login_attempts`, `admin_permissions`, `admin_sessions`, `admin_users`
- Stripe Connect tables: `connect_account_balances`, `connect_ledger_entries`, `connect_maturation_rules`
- Marketplace: `marketplace_fees`, `marketplace_treasuries`, `marketplace_treasury_ledger`
- Prepaid wallet: `prepaid_wallet_transactions`, `prepaid_wallets`
- Fraud + destructive intents: `fraud_blacklist`, `destructive_intents`
- Usage pricing: `usage_prices`

---

## 6. Event spine (AsyncAPI)

Real spec: `tools/asyncapi/asyncapi-spec.json` (regen with `node scripts/cognitive/asyncapi-extract.mjs`).

- **73 channels** across **7 namespaces**
- Distribution (commerce dominates):

```
54  commerce.*         ← 74% of all events
 6  cognition.*
 6  lineage.*
 3  pulse.*
 2  test.*
 1  auth.*
 1  workspace.*
```

The event spine is **commerce-heavy** — sales, checkout, recovery, ad-platform integrations.

---

## 7. External integrations (by import surface)

```
184 files import @sentry/node    ← saturated error tracking (≈ 26% of backend files)
 69 files import ioredis         ← heavy Redis dependence
 64 files import openai          ← LLM-first product
 41 files import bullmq
  8 files import @datadog
  4 files import stripe          ← surprisingly light (most Stripe via webhooks)
  1 file imports google-auth
```

Notably absent in direct imports: `@anthropic-ai/sdk`, `mercadopago` SDK (MP uses raw HTTP).

---

## 8. Live runtime / production health

### Sentry top issues (24h window, `mcp__sentry-bridge__sentry_top_issues`)

| Events | Culprit                                                                                                                                                                        | Severity |
| -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
|  1,026 | `GET /billing/payment-methods` — TypeError reading `'create'` (Stripe customer creation)                                                                                       | error    |
|    458 | `ConnectLedgerMaturationService.matureDueEntries` Prisma error                                                                                                                 | error    |
|    445 | `MarketplaceTreasuryMaturationService.matureDueCredits` Prisma error                                                                                                           | error    |
|    224 | `AgentRuntimeSchedulerService.listDueJobs` Prisma error                                                                                                                        | error    |
|    224 | `AgentRuntimeJobRunnerService.runAllPendingAgentJobs` Prisma error                                                                                                             | error    |
|    154 | AWS SDK `ProtocolLib.getErrorSchemaOrThrowBaseException` UnknownError                                                                                                          | error    |
|    101 | STARTUP: missing prod secrets (`TIKTOK_CLIENT_SECRET`, `EMAIL_INBOUND_SECRET`, `GOOGLE_ADS_TOKEN_ENCRYPTION_KEY`, `TIKTOK_TOKEN_ENCRYPTION_KEY`, `EMAIL_TOKEN_ENCRYPTION_KEY`) | error    |
|     92 | `AdRulesEngineService.evaluateRulesWithObservability` Prisma error                                                                                                             | error    |
|     50 | `CheckoutSocialRecoveryService.recoverAbandonedLeads` Prisma error                                                                                                             | error    |

Pattern: 5 of the top 10 errors are `PrismaClientKnownRequestError` from background maturation/scheduler/runner services. Likely missing migrations or stale schema mismatch in the deployed environment.

### Hot clusters (graphify-plus, composite priority over enriched graph)

```
43  runtime-overlay   /auth/refresh          ← top-priority node (errors+10, error-rate+33)
30  prisma.service.ts                        (high-inbound)
30  PrismaService injectable                  (high-inbound)
30  GET /:param          admin-accounts.controller.ts
30  DELETE /:param       admin-sessions.controller.ts
30  PUT /:param/:param   flows.controller.ts
30  GET /:param/:param   flows.controller.ts
30  PUT /:param          ad-rules.controller.ts
30  DELETE /:param/:param memory.controller.ts
22  api-endpoint GET /auth/refresh           (runtime-cascade+22)
```

`/auth/refresh` is the hottest endpoint in the graph by composite priority.

---

## 9. Build health

`tsc --noEmit` per workspace:

```
backend          26 errors     ← all pre-existing, in calendar/dashboard/capability-registry-v2/guest-chat
frontend          0 errors
frontend-admin    0 errors
worker            0 errors
```

Only backend has compile errors, and they are contained in a known set of files.

---

## 10. Code quality / latent debt

```
TODO              93
FIXME              3
HACK               0
@ts-expect-error  110
@ts-ignore        139
: any (rough)      5
this.prismaAny.    0   ← FULLY migrated; older docs ("133 usos") were stale
```

249 TS escape hatches across 4,121 backend TS files (≈ 6%) — moderate.

---

## 11. Dependencies (top-level)

```
.                 8 prod /  13 dev
backend          49 prod /  30 dev
frontend         32 prod /  20 dev
frontend-admin   17 prod /  15 dev
worker           15 prod /  14 dev
```

SBOM (`tools/sbom/sbom-worker.json`, CycloneDX 1.5):

- **worker**: 443 components / 485 dependencies
- Other workspaces: SBOM not yet generated. Run `node scripts/cognitive/sbom-generate.mjs` to populate.

---

## 12. Velocity / git state

```
branch          feat/kloel-cognitive-organism
ahead of main   219 commits  (not yet promoted)
uncommitted     small (auto-staged by lint-staged)
worktrees       48 attached  ← multi-agent territory
commits 24h     214
commits 7d      465
authors 30d     5
last tag        v0.7.0  (pre-1.0)
backup branch   backup/feat-kloel-cognitive-organism-pre-cleanup
open PRs        2 (codex backlog consolidation + release-please 0.8.0)
```

Almost all work merges directly into the feature branch; few formal PRs. Multi-agent autonomous environment.

### Where the heat is (last 30d, directory-level)

```
1,699  backend/src/kloel          ← 4× the next dir; centre of mass
  397  backend/src/whatsapp
  349  scripts/pulse
  215  worker/processors/autopilot
  205  frontend/src/components/kloel/marketing
  198  backend/src/auth
  192  frontend/src/components/kloel
  170  backend/src/marketing
  167  worker
  162  backend/src/checkout
  158  scripts/pulse/parsers
  128  frontend/src/components/kloel/produtos
```

### Most-modified single files (90d)

```
103×  backend/src/kloel/unified-agent.service.ts
 90×  frontend/src/components/kloel/products/ProductNerveCenter.tsx
 80×  backend/src/kloel/kloel.module.ts        ← DI churn = god-module split signal
 79×  worker/processors/autopilot-processor.ts
 78×  frontend/src/components/kloel/chat-container.tsx
 77×  frontend/src/components/kloel/AppShell.tsx
 76×  frontend/src/components/kloel/marketing/MarketingView.tsx
 75×  frontend/src/components/kloel/dashboard/KloelDashboard.tsx
 71×  backend/src/whatsapp/whatsapp.service.ts
 71×  backend/src/kloel/kloel.service.ts
```

### Largest services (decomposition targets, > 530 LOC)

```
879  kloel-tool-dispatcher.service.ts          ← over the 800-LOC cap
706  intent-router.service.ts
571  mind-policy.service.ts
569  cia.service.ts
564  ledger.service.ts
564  autopilot/segmentation.service.ts
557  meta-whatsapp.service.ts
548  unified-agent-actions-crm.service.ts
547  pulse.service.ts
546  checkout-payment.service.ts
545  kloel.service.ts
543  kloel-thinker.service.ts
540  unified-agent-actions-sales.service.ts
539  whatsapp/account-agent.service.ts
535  kloel-business-config-tools.service.ts
```

---

## 13. Code-knowledge graph

`mcp__codegraph__codegraph_status`:

- **63,597 nodes / 137,282 edges**
- **5,241 files indexed**
- **180 MB SQLite database** at `.codegraph/codegraph.db`
- Node composition:

```
22,426  import
12,552  function
 7,396  method
 7,207  constant
 5,241  file
 3,559  interface
 2,255  variable
 1,793  type_alias
 1,158  class
   10  enum
```

Languages indexed:

```
4,045  typescript
  897  tsx
  286  javascript
   13  python
```

---

## 14. PULSE (governance scanner)

`mcp__pulse__pulse_status`:

- Runner active, locked auditor present (governance enforcement)
- **303 artifact files** in `.pulse/` + `scripts/pulse/artifacts/`
- Auditor: `scripts/pulse/no-hardcoded-reality-audit.ts` — never modified by any AI

---

## 15. Webhook surface (entry points)

Duplications and ambiguities found via grep:

- **MercadoPago receivers ×2** (canonicalization target):
  - `backend/src/payments/mercadopago/mercadopago-webhook.controller.ts`
  - `backend/src/checkout/mercado-pago-webhook.controller.ts`
- **Meta webhook receivers ×2**:
  - `backend/src/meta/webhooks/meta-webhook.controller.ts`
  - `backend/src/meta/meta-webhook.controller.ts`
- **Stripe**: `backend/src/webhooks/payment-webhook-stripe.controller.ts`
- **Generic**: `backend/src/webhooks/payment-webhook-generic.controller.ts`
- **Email inbound**: `backend/src/marketing/email-inbound.controller.ts`

---

## 16. Environment surface

`.env.example` has **325 keys** — extremely broad provider/feature-flag surface.
Active local `.env` has **18** keys — most are optional/runtime-derived.

Production startup fails on missing secrets: `TIKTOK_CLIENT_SECRET`, `EMAIL_INBOUND_SECRET`, `GOOGLE_ADS_TOKEN_ENCRYPTION_KEY`, `TIKTOK_TOKEN_ENCRYPTION_KEY`, `EMAIL_TOKEN_ENCRYPTION_KEY` (per Sentry top issue #16, 101 events).

---

## 17. Synthesis — what the machine is, factually

1. **AI-native commerce platform**, ≈ 831k LOC. `backend/src/kloel` is the operational god-module (1,699 commits in 30 days, 4× next dir).
2. **Multi-tenant by design**: `Workspace` is the root entity (103 fields). 184 `@UseGuards` decorations. Every query workspace-scoped.
3. **Commerce-spine event-driven**: 73 channels, 74% in `commerce.*` namespace. Sales/checkout/recovery is the nervous system.
4. **LLM-saturated**: 64 files import `openai` directly. Kloel intelligence stack: kloel-tool-dispatcher + intent-router + mind-policy + cia + unified-agent + kloel-thinker = ≈ 6,000 LOC.
5. **Observability maxed**: 184/4,121 backend files import Sentry directly (26%). 5 of the top 10 production errors are from background services (maturation, scheduler, job-runner) hitting Prisma errors.
6. **Pre-1.0**: `v0.7.0` tag, branch represada (219 commits ahead of main), tsc broken in 26 backend spots. Not deployed.
7. **Multi-agent chaotic but productive**: 214 commits/24h, 48 worktrees, 5 authors. Daniel + Codex + Claude + concurrent agents + dependabot.
8. **Maturity uneven**: prismaAny zeroed (excellent), TODOs 93 (manageable), 249 TS-escape-hatches (high but contained), 12+ services oversized (refactor opportunity), 2 webhook receivers duplicated (canonicalization debt).

---

## 18. Verification recipes

To regenerate this state, run from repo root:

```sh
# OpenAPI (no backend boot required — static AST)
node scripts/cognitive/openapi-extract.mjs static

# AsyncAPI (scans EventEmitter2 + BullMQ + @OnEvent)
node scripts/cognitive/asyncapi-extract.mjs

# SBOM per workspace (CycloneDX)
node scripts/cognitive/sbom-generate.mjs

# SARIF per workspace (ESLint → SARIF 2.1)
node scripts/cognitive/sarif-aggregate.mjs

# Hub status (10 protocols)
( printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n'
  printf '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"protocol_hub_status","arguments":{}}}\n'
  sleep 1
) | bash scripts/mcp/cognitive-hub-mcp-launcher.sh

# Real-world LSP health (TypeScript across 5 workspaces)
( printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n'
  printf '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"lsp_health","arguments":{"language":"typescript"}}}\n'
  sleep 12
  printf '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"lsp_shutdown","arguments":{}}}\n'
  sleep 1
) | bash scripts/mcp/lsp-mesh-mcp-launcher.sh

# Build health
npm run typecheck

# Canonicalization gates
npm run canonical:check

# Production-style debt scan
ls .pulse/ scripts/pulse/artifacts/ | wc -l
```

Combined with [TOOL_ARSENAL.md](TOOL_ARSENAL.md) (the full MCP/LSP/script reference) and [COGNITIVE_INTERFACE_LAYER.md](COGNITIVE_INTERFACE_LAYER.md) (the protocol-hub spec), this document is the canonical machine-state snapshot.
