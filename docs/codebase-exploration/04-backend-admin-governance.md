# Backend Admin & Governance — Codebase Exploration

> Generated 2026-05-19 | Scope: `backend/src/admin/*` + `{compliance,kyc,audit,certification,pulse,api-keys,reports,public-api,webhooks,team,scrapers}`

---

## 1. Module Index

### 1.1 `backend/src/admin/` — Admin Panel (23 sub-modules)

| Sub-module | Files | Purpose |
|---|---|---|
| `accounts/` | 20 | CRUD workspaces, KYC queue, impersonation, password reset, state (suspend/block/freeze/refund) |
| `audit/` | 12 | Append-only admin-audit-log (I-ADMIN-1), interceptor auto-logs non-safe mutations |
| `auth/` | 28 | Admin login state machine (password → MFA setup → MFA verify → full session), JWT guards, role/permission decorators |
| `brain/` | 3 | Per-workspace audit trail for the Brain (conversation copilot decisions) |
| `carteira/` | 4 | Marketplace treasury ledger, Connect payout approval/reconciliation, fraud blacklist |
| `chat/` | 11 | Admin copilot chat: LLM-stubbed session-based tool execution with permission-gated `/tool` dispatch |
| `clients/` | 10 | Platform-wide client list with 30d GMV, product counts, last sale |
| `common/` | 5 | Shared admin utilities: API errors, crypto (sha256), sanitize |
| `compliance/` | 4 | Admin-view compliance overview per workspace |
| `config/` | 6 | Workspace config CRUD: customDomain, guestMode, autopilot, authMode |
| `contacts/` | 3 | Contact verification (admin-level) |
| `dashboard/` | 14 | Admin home dashboard: 20+ KPIs (GMV, revenue, approval rate, churn, MRR, response time), breakout charts |
| `destructive/` | 14 | SP-8 destructive ops: intent creation → challenge confirmation → execution → undo with 24h token |
| `marketing/` | 4 | Marketing overview: channel stats, top products by GMV, recent conversations feed |
| `mind/` | 5 | Per-workspace Mind (Bayesian belief/probability engine): beliefs, predictions, lift, concepts, health, briefing |
| `notifications/` | 4 | Admin notification center: chargebacks, KYC queue, support tickets, security, growth |
| `operations/` | 3 | Dead Letter Queue management: list, inspect, reprocess, discard, purge per queue |
| `permissions/` | 5 | RBAC: default matrix per role, allows() check, seedDefaults, replace, listFor |
| `pipeline/` | 4 | Per-workspace pipeline state (legacy→shadow→active), decision shadow recording, auto-fallback on 5% error rate |
| `products/` | 10 | Product moderation: approve/reject/pause/reactivate with audit trail |
| `reports/` | 4 | Admin reports module (wraps the user-facing reports) |
| `runtime-trace/` | 3 | Conversation runtime event trace lookup by workspace+contact+correlation |
| `sales/` | 4 | Sales overview: transaction list + dashboard KPIs |
| `seed/` | 3 | Admin seed data |
| `sessions/` | 4 | Admin session management: list own/all, revoke (OWNER can revoke others) |
| `support/` | 5 | Platform-wide support: conversation overview, detail with macros, status update, reply |
| `transactions/` | 10 | Order operations: refund/chargeback with wallet ledger adjustments, Stripe integration |
| `users/` | 6 | Admin user CRUD: create with role+permissions, update, set permissions |

---

### 1.2 `backend/src/compliance/` — Compliance Webhooks

| File | Purpose |
|---|---|
| `compliance.service.ts` | Facebook data deletion + deauthorize, Google RISC events (sessions-revoked, tokens-revoked, account-disabled, account-purged), unsubscribe |
| `compliance.controller.ts` | `POST auth/facebook/data-deletion`, `POST auth/facebook/deauthorize`, `POST auth/google/risc-events`, `GET/POST unsubscribe` |
| `utils/jwt-set.validator.ts` | Google RISC JWT validation |
| `utils/signed-request.validator.ts` | Facebook signed_request HMAC validation |

**Key flows:**
- Facebook deletion → `DataDeletionRequest` model → soft-deletes agent + revokes tokens → returns status URL
- Google RISC → parses JWT → routes events → disables agents, revokes sessions, soft-deletes on account-purged
- `softDeleteAgent()`: one transaction that anonymizes agent, revokes all refresh tokens, social accounts, magic links

---

### 1.3 `backend/src/kyc/` — KYC Self-Service

| File | Purpose |
|---|---|
| `kyc.service.ts` | Profile CRUD, avatar upload, fiscal data, document upload/delete, bank account, password change, KYC submission + auto-approval |
| `kyc.controller.ts` | REST endpoints under `GET/PUT/POST/DELETE /kyc/*` with JWT + Workspace guards |
| `kyc.connect-onboarding.ts` | Stripe Connect onboarding sync (`syncSellerConnectOnboarding`, `doAutoApproveIfComplete`, `doAdminApprove`) |
| `kyc.helpers.ts` | Name normalization, date-of-birth parsing, Connect address builder |
| `kyc-approved.guard.ts` | Guard that requires `kycStatus === 'approved'` |
| `kyc.module.ts` | Module wiring (imports Storage, Audit, Connect, KycEventEmitter) |

**KYC completion engine:**
- 4 sections × 25% weight: profile, fiscal, documents, bank
- `submitKyc()` → syncs Stripe Connect → emits `documentSubmitted` → auto-approve if complete
- Auto-approval: scores completeness, checks document types per fiscal type (PF vs PJ)

---

### 1.4 `backend/src/audit/` — Workspace-Level Audit

| File | Purpose |
|---|---|
| `audit.service.ts` | `log()` and `logWithTx()` (transactional) for workspace-scoped audit entries with retry |
| `audit.controller.ts` | `GET /audit` with workspace-scoped pagination |
| `audit.interceptor.ts` | Interceptor for auto-logging workspace operations |
| `audit.module.ts` | Module wiring |

**Design:**
- Separate from admin-audit (admin panel audit log uses `AdminAuditLog` table)
- This is the original workspace-level `AuditLog` table
- Idempotent: logs are append-only, failure is logged but does not block the operation

---

### 1.5 `backend/src/certification/` — Certification E2E Scenarios

| File | Purpose |
|---|---|
| `certification-e2e-scenarios.spec.ts` | 20 mandatory E2E scenarios: simple sale, supplier split, affiliate split, affiliate+supplier, all 5 roles, upsell/downsell, multi-installment, subscription, refund, NPS, etc. |

**20 scenarios cover:**
- Sales: simple, supplier fixed, affiliate via link, affiliate+supplier, all roles
- Advanced: upsell, downsell, multi-installment, subscription, checkout abandonment
- Financial: refund, chargeback, split reversal
- Non-financial: NPS, two-factor auth, KYC flow, team invitation

---

### 1.6 `backend/src/pulse/` — PULSE Live Organism

| File | Purpose |
|---|---|
| `pulse.service.ts` | Core PULSE: periodic backend heartbeat, frontend heartbeat recording, internal heartbeat, stale node detection, incident emission, Redis-backed organism graph |
| `pulse.controller.ts` | `POST /pulse/live/heartbeat` (frontend), `POST /pulse/live/internal` (worker/backend), `GET /pulse/live/state` (organism state), `GET /pulse/live/snapshot` (production snapshot), `GET /pulse/live/*` (all artifacts) |
| `pulse-artifact.service.ts` | Reads PULSE JSON artifacts from filesystem: directive, certificate, product vision, parity gaps, scope state, codacy evidence, capability state, flow projection, execution matrix, external signals, autonomy state, orchestration state, convergence plan |
| `pulse.module.ts` | Module wiring (imports HealthModule) |
| `pulse.service.contract.ts` | Contract types: `PulseHeartbeatRecord`, `PulseIncident`, `PulseOrganismNode`, `PulseOrganismRole`, `PulseOrganismStatus`, Redis slot keys |
| `pulse.service.utils.ts` | Utilities: `buildOrganismAdvice`, `compactText`, `safeJsonParse`, `toOrganismStatus` |
| `pulse-webhook.helpers.ts` | Alert webhook dispatch, environment-based intervals |
| `pulse-artifact.types.ts` | `RuntimeMachineReadinessStatus` type |
| `pulse-artifact.helpers.ts` | Artifact reading helpers: `getBoolean`, `getJsonObject`, `getString`, `normalizeAuthorityMode`, `normalizeVerdict` |

**Architecture:**
- Backend heartbeat every X ms (env-configurable) → `captureBackendHeartbeat()` checks system health
- Frontend heartbeat from browser → `recordFrontendHeartbeat()` with session/route/viewport
- Internal heartbeat from worker nodes → `recordInternalHeartbeat()`
- Redis hash `pulse:registry` stores all live nodes
- Stale detection sweeps critical nodes, emits incidents
- Frontend nodes pruned after retention window
- `getOrganismState()` builds aggregated status (UP/DOWN/DEGRADED/STALE) with advice
- `getProductionSnapshot()` compiles all artifacts into a single snapshot with machine readiness assessment

**Security:**
- All `/pulse/live/*` endpoints require `PULSE_RUNTIME_TOKEN` (via `x-internal-key` or Bearer)
- Frontend heartbeat is JWT-authenticated
- Path traversal blocked in artifact reader

---

### 1.7 `backend/src/api-keys/` — API Key Management

| File | Purpose |
|---|---|
| `api-keys.service.ts` | Create (PBKDF2 hash), list, rotate, delete, validate |
| `api-keys.controller.ts` | `GET/POST/PATCH/:id/rotate/DELETE /settings/api-keys` |
| `api-keys.module.ts` | Module wiring |
| `dto/create-api-key.dto.ts` | Name validation |

**Security:**
- Keys use `sk_live_` prefix + 48 hex chars
- Stored as PBKDF2 (salt:derived) with 210,000 iterations, SHA-256
- Validation: loads all keys (max 1000), finds via `timingSafeEqual`
- Async `lastUsedAt` update (fire-and-forget)

---

### 1.8 `backend/src/reports/` — Workspace Reports

| File | Purpose |
|---|---|
| `reports.service.ts` | Unified report service: vendas, churn, assinaturas, ad spend, métricas (ROAS) — delegates to orders and affiliate sub-services |
| `reports.controller.ts` | `GET /reports/*` with 15+ endpoints: vendas, afterpay, churn, abandonos, afiliados, indicadores, assinaturas, recusa, origem, ad-spend, metricas, estornos, chargeback, send-email, NPS |
| `reports-orders.service.ts` | CheckoutOrder queries: vendas, afterpay, abandonos, recusa, origem, estornos, chargeback |
| `reports-affiliate.service.ts` | Affiliate report queries: afiliados, indicadores, indicadores-produto |
| `reports-orders.helpers.ts` | Shared: dateRange, paginate, applyCommonOrderFilters, validatedPaidOrderStatus |
| `reports.module.ts` | Module wiring |
| `dto/report-filters.dto.ts` | Filter DTO |

**NPS:** Stored as `auditLog` entries with action `nps_response`. Computed on read (promoters ≥9, detractors ≤6).

---

### 1.9 `backend/src/public-api/` — Public API v1

| File | Purpose |
|---|---|
| `public-api.controller.ts` | `POST /api/v1/messages` — send outbound message via API key |
| `api-key.guard.ts` | Auth guard: validates `x-api-key` header, sets `req.user.workspaceId` |
| `public-api.module.ts` | Module wiring |

**Currently single endpoint:** persists message to inbox (OUTBOUND direction). Actual WhatsApp delivery requires separate trigger.

---

### 1.10 `backend/src/webhooks/` — Inbound Webhooks

| File | Purpose |
|---|---|
| `webhooks.service.ts` | Process webhook (flow dispatch), finance events, message status updates, Instagram message processing |
| `webhooks.controller.ts` | `POST /hooks/catch/:workspaceId/:flowId`, `POST /hooks/finance/:workspaceId`, `POST /hooks/message-status`, `POST /hooks/email-status`, `POST /hooks/instagram/:workspaceId` |
| `webhook-settings.controller.ts` | CRUD outbound webhook subscriptions |
| `webhook-dispatcher.service.ts` | Outbound delivery via BullMQ (5 retries, exponential backoff) |
| `payment-webhook.controller.ts` | Entry point (re-exports Stripe + generic controllers) |
| `payment-webhook-stripe.controller.ts` | Stripe webhook receiver |
| `payment-webhook-generic.controller.ts` | Generic payment webhook (Shopify, PagHiper, WooCommerce) |
| `whatsapp-api-webhook.controller.ts` | WhatsApp API webhook |
| `tiktok-webhook.controller.ts` | TikTok webhook |
| `webhooks.module.ts` | Module wiring |

**Security:**
- HMAC-SHA256 signature verification via `HOOKS_WEBHOOK_SECRET`
- Idempotency via Redis SETNX (5-min window) + `WebhookEvent` unique constraint
- Meta signature verification for Instagram
- Suspended workspace rejection

---

### 1.11 `backend/src/team/` — Team Management

| File | Purpose |
|---|---|
| `team.service.ts` | List members, invite (7-day expiry), accept invite (creates agent), revoke invite, remove member, update role |
| `team.controller.ts` | `GET /team`, `POST /team/invite`, `DELETE /team/invite/:id`, `DELETE /team/member/:id`, `PATCH /team/member/:id/role`, `POST /team/accept-invite` |
| `team.module.ts` | Module wiring |
| `dto/invite-member.dto.ts` | DTOs: InviteMember, AcceptInvite, UpdateRole |

**Guardrails:**
- Cannot remove self
- Cannot change own role
- `ensureLastAdmin()` — prevents removing the last ADMIN
- All mutations are audit-logged

---

### 1.12 `backend/src/scrapers/` — Lead Scrapers

| File | Purpose |
|---|---|
| `scrapers.service.ts` | Create scraping job, list jobs, import leads → contacts |
| `scrapers.controller.ts` | `POST/GET /scrapers/jobs`, `GET /scrapers/jobs/:id`, `POST /scrapers/jobs/:id/import` |
| `scrapers.module.ts` | Module wiring |
| `omni-scraper.service.ts` | Omni-scraper (multi-source) |
| `strategies.ts` | Scraping strategies (MAPS, INSTAGRAM, GROUP) |

**Flow:** Job → BullMQ worker → scraped leads → import to Contact table (upsert by workspaceId+phone)

---

## 2. Governance Architecture

### 2.1 Audit Trail Layers

```
┌─────────────────────────────────────────┐
│   Admin Panel (AdminAuditLog table)      │
│   - AdminAuditInterceptor: auto-logs     │
│     every non-safe admin mutation        │
│   - Append-only (I-ADMIN-1)             │
│   - PostgreSQL trigger blocks UPDATE/     │
│     DELETE on admin_audit_logs           │
├─────────────────────────────────────────┤
│   Workspace Level (AuditLog table)       │
│   - audit.service.ts: log() + logWithTx()│
│   - Used by KYC, webhooks, team, etc.    │
│   - Retry on failure, fire ops alert     │
├─────────────────────────────────────────┤
│   Webhook Events (WebhookEvent table)   │
│   - Idempotency via externalId unique    │
│   - Status tracking: received→processed  │
└─────────────────────────────────────────┘
```

### 2.2 PULSE Organism

```
┌────────────────────────────────────────────────────┐
│  PULSE Live Organism (Redis-backed)                │
│                                                    │
│  pulse:registry         → all nodes (hash)          │
│  pulse:critical         → critical nodes only       │
│  pulse:frontend         → frontend nodes only       │
│  pulse:live:{nodeId}    → live heartbeat (TTL)      │
│  pulse:incidents        → incident list (capped)    │
│  pulse:stale:{nodeId}   → stale alert dedup         │
│                                                    │
│  Artifacts (filesystem → .pulse/current/):          │
│  - PULSE_CLI_DIRECTIVE.json                        │
│  - PULSE_CERTIFICATE.json                          │
│  - PULSE_PRODUCT_VISION.json                       │
│  - PULSE_PARITY_GAPS.json                          │
│  - PULSE_SCOPE_STATE.json                          │
│  - PULSE_CODACY_EVIDENCE.json                      │
│  - PULSE_CAPABILITY_STATE.json                     │
│  - PULSE_FLOW_PROJECTION.json                      │
│  - PULSE_EXECUTION_MATRIX.json                     │
│  - PULSE_CONVERGENCE_PLAN.json                     │
│  - PULSE_EXTERNAL_SIGNAL_STATE.json                │
│  - PULSE_AUTONOMY_STATE.json                       │
│  - PULSE_AGENT_ORCHESTRATION_STATE.json            │
│  - PULSE_ARTIFACT_INDEX.json                       │
└────────────────────────────────────────────────────┘
```

### 2.3 Admin Auth Flow

```
Login(email, password)
  ↓
  ├─ Rate limited? → 429
  ├─ Unknown email? → audit + throw
  ├─ Locked? → throw
  ├─ Bad password? → increment failedLoginCount + throw
  ├─ Suspended/Deactivated? → throw
  └─ Success →
      ├─ passwordChangeRequired → scoped JWT (password_change)
      ├─ MFA bypass env set? → full session
      ├─ mfaPendingSetup | !mfaEnabled → scoped JWT (mfa_setup)
      └─ has MFA → scoped JWT (mfa_verify)
          ↓
          verifyMfa(code) → full session (access + refresh tokens)
```

**Session refresh:** rotates — creates new session, revokes old one.  
**Logout:** revokes the specific session.  
**Role/Permission changes:** auto-revoke all active sessions.

### 2.4 Destructive Ops (SP-8)

```
Create Intent (admin, kind, target, reason)
  → PENDING with challenge code
  → TTL: 30s–900s (default 300s)
  ↓
Confirm (challenge match)
  → CONFIRMED → EXECUTING → EXECUTED
  → If reversible: generates undoToken (24h expiry)
  → resultSnapshot stored
  ↓
Undo (undoToken match, within 24h)
  → UNDONE with undo snapshot
```

**Invariants:**
- D1: Append-only audit trail
- D2: 5-min default TTL
- D3: Challenge confirmation before execution
- D4: Idempotency (replayed confirm returns cached snapshot)
- D5: Undo token valid for 24h
- D6: OWNER can create OWNER users only

### 2.5 Pipeline State Machine

```
legacy ──→ shadow ──→ active
  ↑                    │
  └── auto-fallback ───┘  (if fallbackRate1h ≥ 5%)
```

- `legacy`: old code path only
- `shadow`: new code runs in parallel, results compared but not used
- `active`: new code drives decisions, old code is fallback
- Auto-fallback: when `active` and error rate hits 5%

### 2.6 Compliance Webhook Flow

```
External Provider
  ↓
Facebook signed_request → ComplianceController
  ├─ data-deletion → create DataDeletionRequest → softDeleteByProviderSubject
  └─ deauthorize → revoke social account tokens → revoke sessions on deauthorize

Google RISC JWT → ComplianceController
  ├─ sessions-revoked → revokeAgentSessionsByProviderSubject
  ├─ tokens-revoked → revoke social account tokens + revoke sessions
  ├─ account-disabled → set agent.disabledAt + revoke refresh tokens
  └─ account-purged → softDeleteByProviderSubject (full agent soft-delete)
```

---

## 3. Key Observations & Improvement Suggestions

### 3.1 Strengths

- **Dual audit trail** (workspace + admin) with append-only enforcement
- **PULSE organism** provides live system health with artifact-driven machine readiness assessment
- **Admin auth** has proper state machine: password change → MFA setup → MFA verify → full session
- **Destructive ops** with challenge-confirm-undo pattern prevents accidental execution
- **Pipeline** with auto-fallback ensures safety during AI-driven migration
- **Compliance** covers Facebook + Google with proper soft-delete cascade
- **RBAC** with OWNER bypass and per-module/per-action granularity
- **Webhook idempotency** via Redis SETNX + database unique constraint (dual layer)

### 3.2 Areas for Improvement

1. **Admin chat is LLM-stubbed** — The `AdminChatService` currently uses regex-based intent detection and tool dispatch. The code documents intent for full LLM integration: "When the full LLM orchestration lands, the natural-language path expands." Consider prioritizing this.

2. **API key validation scans all keys** — `validateKey()` loads up to 1000 keys and iterates to find a match via `timingSafeEqual`. This is O(n) per request. Consider indexing by a key prefix hash.

3. **PULSE artifacts are filesystem-only** — The `PulseArtifactService` reads from disk. In a multi-instance deployment (multiple Railway replicas), artifacts may be stale on some nodes. Consider S3/Redis-based artifact storage.

4. **No admin rate-limiting beyond login** — The admin `@RouteClass` decorator tags endpoints but the actual rate limiting implementation needs verification. Admin endpoints should have stricter rate limits than user-facing ones.

5. **Missing module tests** — Several admin modules have no `.spec.ts` files: `carteira`, `config`, `contacts`, `dashboard`, `marketing`, `notifications`, `operations`, `pipeline`, `runtime-trace`, `sales`, `seed`, `sessions`, `support`, `users`. (Note: some may use indirect testing via controllers.)

6. **Compliance `DataDeletionRequest` is system-level** — Deletion requests span all workspaces. There's no admin UI exposed for tracking deletion status across the platform. The `GET compliance/deletion-status/:code` endpoint exists but is public, not admin-only.

7. **Reports module duplicates admin reports** — `backend/src/admin/reports/` is a thin wrapper re-exporting from `backend/src/reports/`. The admin reports module could be consolidated.

8. **Certification tests are definition-only** — `certification-e2e-scenarios.spec.ts` defines 20 scenarios but reads like a documentation/manifest rather than executable tests. Verify whether these scenarios have corresponding Playwright/E2E implementations.

9. **PULSE heartbeat intervals are env-configurable but not validated** — `getBackendHeartbeatEveryMs()` and similar functions read env vars without validation. Invalid values could cause too-frequent or too-infrequent heartbeats.

10. **Admin session refresh creates new session per call** — Each refresh token use creates a new session. This means an admin can accumulate many session rows. Consider implementing a max-active-sessions limit or TTL-based cleanup job.

### 3.3 Risk Classification

| Module | Risk Level |
|---|---|
| `admin/auth` | **2 — High** (auth state machine, session management) |
| `admin/transactions` | **3 — Critical** (refund/chargeback with wallet adjustments) |
| `admin/carteira` | **3 — Critical** (marketplace treasury, payout approval) |
| `admin/destructive` | **3 — Critical** (irreversible platform mutations) |
| `admin/users` | **3 — Critical** (admin user lifecycle) |
| `compliance` | **2 — High** (data deletion, provider deauthorization) |
| `kyc` | **2 — High** (identity verification, Stripe Connect) |
| `webhooks` | **2 — High** (payment processing, external integrations) |
| `pulse` | **1 — Normal** (monitoring, no business data) |
| `reports` | **0 — Safe** (read-only analytics) |
| `team` | **1 — Normal** (workspace membership) |
| `scrapers` | **1 — Normal** (lead generation) |

### 3.4 Total File Count

| Module | .ts Files |
|---|---|
| `admin/` (all sub-modules) | ~179 |
| `compliance/` | 10 |
| `kyc/` | 15 |
| `audit/` | 6 |
| `certification/` | 1 |
| `pulse/` | 27 |
| `api-keys/` | 6 |
| `reports/` | 10 |
| `public-api/` | 6 |
| `webhooks/` | 34 |
| `team/` | 7 |
| `scrapers/` | 9 |
| **Total** | **~310** |

---

## 4. Start Here

For another agent to begin work, open:

```
backend/src/admin/admin.module.ts
```

This is the root module that imports all 23 admin sub-modules and wires the `AdminAuditInterceptor` as a global interceptor. From there, navigate to the sub-module relevant to the task.

For governance-specific work, start with:
- `backend/src/admin/audit/admin-audit.service.ts` — admin audit trail
- `backend/src/admin/permissions/admin-permissions.service.ts` — RBAC
- `backend/src/admin/auth/admin-auth.service.ts` — auth state machine
