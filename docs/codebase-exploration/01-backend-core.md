# Backend Core Infrastructure Exploration

> Generated: 2026-05-19 | Scope: `backend/src/{auth,workspaces,common,config,health,prisma,queue,logging,observability,metrics,lib,i18n}`
>
> 264 TypeScript files analyzed across 12 modules.

---

## Module Index

### 1. `auth/` — Authentication & Authorization (74 files)

**One-liner:** Complete auth system with email/password, social OAuth (Google, Apple, Facebook, TikTok), WhatsApp OTP, magic links, JWT issuance/refresh, rate limiting, and role-based guards.

**Key files:**
| File | Role |
|------|------|
| `auth.module.ts` (lines 1-43) | Module wiring — imports Prisma, Payments, JwtModule (async), registers all 7 services + 2 controllers |
| `auth.service.ts` (lines 1-80) | Facade orchestrator that composes 9 sub-service modules via `buildDeps()` pattern |
| `auth.controller.ts` (lines 1-80) | REST controller `/auth/*` — 15+ endpoints: register, login, check-email, refresh, forgot/reset password, magic link, WhatsApp OTP, OAuth (Google/Apple/Facebook/TikTok) |
| `auth.password.service.ts` (lines 1-50) | Password-based auth: register, login, bcrypt hashing (12 rounds), anonymous guest creation |
| `auth.token.service.ts` (lines 1-60) | JWT token issuance with jti for revocation, refresh token rotation, workspace metadata on login |
| `jwt-auth.guard.ts` (lines 1-50) | Global JWT guard — checks `Authorization: Bearer`, validates JWT, supports `@Public()` decorator, optional auth for non-prod (`AUTH_OPTIONAL`) |
| `auth-service.register-login.ts` (lines 1-50) | Stateless pure functions: `checkEmail`, `register`, `login`, `createAnonymous` — operates on `AuthPartsDeps` |
| `auth-service.tokens.ts` (lines 1-60) | `issueTokens` returns `{access_token, refresh_token, user, workspace}`; `issueTokensForAgentId`, `refreshToken` |
| `auth-service.oauth-entry.ts` | OAuth entry points: `oauthLogin`, `loginWithGoogleCredential`, `loginWithFacebookAccessToken`, `loginWithAppleCredential`, `loginWithTikTokAuthorizationCode` |
| `auth-service.magic-link.ts` | Magic link flow: `requestMagicLink` (generates code, stores in Redis with 10-min TTL, sends email), `verifyMagicLink` |
| `auth-service.whatsapp.ts` | WhatsApp OTP: `sendWhatsAppCode` (generates 6-digit code, stores in Redis, sends via WhatsApp), `verifyWhatsAppCode` |
| `auth-service.password-verification.ts` | `forgotPassword`, `resetPassword`, `sendVerificationEmail`, `verifyEmail`, `resendVerificationEmail` |
| `auth-service.social-account.ts` | Social account linking flow |
| `auth-service.partner-invite.ts` | Affiliate/partner invite code resolution and registration finalization |
| `auth-oauth.service.ts` / `auth-oauth-resolver.service.ts` | Legacy OAuth flow + OAuth provider resolution |
| `google-auth.service.ts` (lines 1-30) | Google ID token verification via Google OAuth2 API |
| `apple-auth.service.ts` + `apple-auth.support.ts` | Apple Sign In: client secret generation (ES256 JWT), ID token verification |
| `facebook-auth.service.ts` | Facebook access token verification and user profile fetch |
| `tiktok-auth.service.ts` | TikTok OAuth: authorization code exchange and access token verification |
| `email.service.ts` | Transactional email sending via configurable SMTP/Resend with HTML templates |
| `rate-limit.service.ts` | Redis-backed rate limiting for auth endpoints (login, register, magic link) |
| `auth.helpers.ts` | `normalizeEmail`, `assertAgentCanAuthenticate`, `buildAuthLogMessage`, `PATTERN_RE` |
| `workspace-access.ts` | `resolveWorkspaceId` — extracts workspace ID from JWT, params, query, headers |
| `roles.guard.ts` + `roles.decorator.ts` | Role-based access control guard |
| `public.decorator.ts` | `@Public()` decorator to skip JWT guard |
| `db-init-error.service.ts` | Detects database not-ready errors and returns 503 instead of 500 |
| `user-name-derivation.service.ts` | Derives display name from email/name for new users |
| `jwt-config.ts` | `getJwtSecret`, `getJwtExpiresIn`, `getJwtCookieMaxAgeMs` — resolved from env or defaults |
| `jwt-auth.helpers.ts` | `extractJwtToken`, `describeJwtVerifyError`, `isAuthOptionalInNonProd` |

**DTOs (12 files):** `register.dto.ts`, `login.dto.ts`, `check-email.dto.ts`, `refresh.dto.ts`, `forgot-password.dto.ts`, `reset-password.dto.ts`, `verify-email.dto.ts`, `request-magic-link.dto.ts`, `verify-magic-link.dto.ts`, `google-oauth.dto.ts`, `apple-oauth.dto.ts`, `facebook-oauth.dto.ts`, `tiktok-oauth.dto.ts`, `whatsapp-auth.dto.ts`

**Architecture pattern:** The `AuthService` uses a "stateless function composition" pattern — each lifecycle concern (register/login, OAuth, magic link, WhatsApp, tokens, password-verification) is a separate `.ts` file exporting pure functions that receive `AuthPartsDeps`. The main `AuthService` class is a thin DI-powered facade that builds the deps object and delegates.

---

### 2. `workspaces/` — Workspace Management (9 files)

**One-liner:** CRUD for workspace settings, provider configuration (WhatsApp provider, session status), caching, and multi-tenant isolation.

**Key files:**
| File | Role |
|------|------|
| `workspace.module.ts` (lines 1-11) | Lightweight module: controller + service, no imports |
| `workspace.service.ts` (lines 1-80) | Workspace CRUD with Redis caching (30s TTL), `patchSettings` (merge), WhatsApp provider normalization, default provider resolution |
| `workspace.controller.ts` (lines 1-80) | `GET /workspace/me` (resolves from JWT), `GET /:id`, `POST /settings`, `DELETE /:id`, provider status snapshot |
| `provider-status.util.ts` + `.spec.ts` | Normalizes WhatsApp provider connection status across provider types (meta-cloud, whatsapp-api) |
| `provider-status.types.ts` | TypeScript types for provider session state |
| `provider-status-lookup.util.ts` + `.spec.ts` | Provider status lookup helpers |
| `dto/set-settings.dto.ts` | Settings patch DTO |

---

### 3. `common/` — Shared Infrastructure (~100 files)

This module is a **catch-all for cross-cutting concerns**. Key sub-areas:

#### 3a. Cache (`common/cache/`)
- **`cache.service.ts`** (lines 1-80) — Redis-backed key-value cache with `get<T>`, `set`, `del`, and `wrap<T>` (cache-aside pattern). TTL defaults to 60s. Graceful degradation on Redis errors.

#### 3b. Storage (`common/storage/`)
- **`storage.service.ts`** (lines 1-60) — Multi-driver file storage (local/S3/R2). Supports signed URLs, upload, delete, public URL resolution. Uses HMAC-based signing secret.
- **`storage.controller.ts`** — Public file serving endpoint with signed URL validation
- **`storage-drivers.service.ts`** — Driver abstraction (S3 client factory)
- **`public-storage-url.util.ts`** — URL generation helpers

#### 3c. Idempotency (`common/idempotency/`)
- **`idempotency.service.ts`** (lines 1-50) — Redis-backed idempotency: caches response (status+body) by `idem:{method}:{path}:{key}`, TTL configurable. Used to prevent duplicate payment/webhook processing.
- **`idempotency.middleware.ts`** — Express middleware that intercepts requests with `Idempotency-Key` header
- **`idempotency.guard.ts`** / **`idempotency.interceptor.ts`** — NestJS guard/interceptor alternatives

#### 3d. Observability (`common/observability/`)
- **`correlation-id.middleware.ts`** — Extracts/injects `X-Correlation-ID` header
- **`correlation-store.ts`** — AsyncLocalStorage-based correlation ID store
- **`observability.module.ts`** — Registers correlation middleware

#### 3e. Feature Flags (`common/feature-flags/`)
- **`feature-flag.service.ts`** (lines 1-50) — Environment-variable based feature flags (`FF_<NAME>`). Used as "rollback levers" for hardening changes. Defaults to ON in production.

#### 3f. Financial (`common/`)
- **`money.ts`** (lines 1-90) — **Branded `Cents` type** (integer cents only, no floats). Enforces invariant I7. `cents()`, `addCents()`, `mulCentsInt()`, `centsToFloat()`, `formatBRL()`. Prevents accidental float arithmetic on money.
- **`financial-alert.service.ts`** (lines 1-60) — Structured logging + Sentry forwarding for `paymentFailed`, `withdrawalFailed`, `webhookProcessingFailed`
- **`ledger-reconciliation.service.ts`** (lines 1-50) — Post-checkout consistency verification: order↔payment↔webhook idempotency. Read-only, reports drift to operators.
- **`payment-state-machine.ts`** (lines 1-50) — Validates payment status transitions (e.g., PENDING→CONFIRMED→REFUNDED)
- **`checkout-order-state-machine.ts`** — Checkout order status transitions

#### 3g. Guards & Decorators (`common/`)
- **`guards/workspace.guard.ts`** (lines 1-30) — Resolves workspaceId from JWT and attaches to `req.workspaceId`
- **`decorators/current-user.decorator.ts`** — `@CurrentUser()` parameter decorator
- **`decorators/internal-endpoint.decorator.ts`** — `@InternalEndpoint(reason)` marks endpoints for governance audit
- **`decorators/webhook-endpoint.decorator.ts`** — `@WebhookEndpoint(reason)` for webhook routes
- **`decorators/admin-global-operation.decorator.ts`** — Marks admin cross-workspace operations

#### 3h. Throttling (`common/throttler/`)
- **`throttler-config.ts`** — `THROTTLE_TIERS` configuration (auth, read, mutate tiers)
- **`route-class.guard.ts`** + **`route-class.decorator.ts`** — Route-class-based rate limiting on top of `@nestjs/throttler`

#### 3i. Utilities (`common/`)
- **`constants.ts`** — `BCRYPT_ROUNDS = 12`
- **`safe-path.ts`** — Null-byte hardened `safeJoin`, `safeResolve`
- **`money.ts`** — Branded `Cents` type (see 3f)
- **`async-sequence.ts`** — `forEachSequential` for ordered async iteration
- **`constants.ts`** — `BCRYPT_ROUNDS = 12`
- **`idempotency-fingerprint.ts`** — Request fingerprinting for idempotency
- **`http-tracing.interceptor.ts`** — HTTP tracing interceptor
- **`request-id.interceptor.ts`** — UUID request ID generation/injection
- **`request-logger.interceptor.ts`** — Request/response logging
- **`pagination-clamp.pipe.ts`** — Clamps pagination params to safe ranges
- **`sales-templates.ts`** — Sales message templates
- **`kloel-colors.ts`** — Brand color constants
- **`trace-headers.ts`** — Distributed tracing header helpers
- **`sanitize-payload.ts`** — Payload sanitization
- **`middleware/prompt-sanitizer.middleware.ts`** — AI prompt input sanitization

#### 3j. Redis (`common/redis/`)
- **`redis.util.ts`** — `createRedisClient`, `getRedisUrl`, `maskRedisUrl`, `isRedisConfigured`
- **`resolve-redis-url.ts`** + `.spec.ts` — Redis URL resolution from various env vars

#### 3k. Prisma Utilities (`common/prisma/`)
- **`prisma-json.util.ts`** — `toPrismaJsonValue` for JSON column handling
- **`prisma-json-scalar.util.ts`** — JSON scalar helpers

#### 3l. URL Safety (`common/utils/`)
- **`url-validator.ts`** + `.spec.ts` — Validates and blocks internal/private IP URLs (SSRF protection)
- **`url-ipv4-blocklist.ts`** — IPv4 blocklist for URL safety
- **`url-ipv4-literal.ts`** — IPv4 literal detection
- **`url-private-ranges.ts`** — Private IP range definitions
- **`url-safety.ts`** — URL safety validation
- **`crypto-compare.util.ts`** + `.spec.ts` — Timing-safe string comparison
- **`email-template-renderer.util.ts`** — Email template rendering
- **`html-escape.util.ts`** — HTML escape
- **`unsubscribe-footer.util.ts`** + `unsubscribe-token.util.ts` — Unsubscribe link generation
- **`webhook-challenge-response.util.ts`** — Webhook challenge response helpers

#### 3m. Interfaces (`common/interfaces/`)
- **`authenticated-request.interface.ts`** — `AuthenticatedRequest` (user + workspaceId), `RawBodyRequest`
- **`jwt-payload.interface.ts`** — `JwtPayload`: sub, jti, email, workspaceId, role, name, iat, exp
- **`index.ts`** — Barrel exports

#### 3n. Products (`common/products/`)
- **`legacy-products.util.ts`** — Legacy product handling

#### 3o. File Utilities (`common/`)
- **`file-signature.util.ts`** / **`file-signature-bytes.util.ts`** — File type detection/magic bytes

---

### 4. `config/` — Configuration (4 files)

**One-liner:** Centralized env var validation via Joi, Redis production enforcement, and production secret startup checks.

**Key files:**
| File | Role |
|------|------|
| `app-config.module.ts` (lines 1-180) | `ConfigModule.forRoot` with exhaustive Joi schema covering 100+ env vars: DATABASE_URL (required), JWT_SECRET (required), Redis, Stripe, Meta, AI providers, webhook secrets, feature flags |
| `redis-env-validator.ts` | `redisInProductionValidator` — ensures Redis is configured in production (unless `REDIS_MODE=disabled`) |
| `production-startup-guard.ts` | `assertProductionStartupSecrets` — panics at boot if 9 critical secrets (META_APP_SECRET, webhook secrets, encryption keys) are missing in production |

**Notable:** Registers `RATE_LIMIT_DISABLED` escape hatch, `BILLING_MOCK_MODE`, `AUTH_OPTIONAL`, `FF_*` feature flag defaults.

---

### 5. `health/` — Health Checks (24 files)

**One-liner:** Kubernetes-style health probes (liveness/readiness/deep) with 9 external service health indicators via `@nestjs/terminus`.

**Key files:**
| File | Role |
|------|------|
| `health.module.ts` (lines 1-42) | Imports Prisma, Config, Whatsapp, Metrics, Terminus, Billing, AdminGuards; registers 2 controllers + 11 providers |
| `health.service.ts` (lines 1-60) | Worker health aggregation: Redis TTL-based checkpoint monitoring, queue snapshots (waiting/failed/DLQ), threshold alerts |
| `health.controller.ts` | `/health` endpoint — Prisma + Redis basic checks via Terminus |
| `system-health.service.ts` (lines 1-80) | Deep system health: `liveness()`, `readiness()` (DB+Redis), `check()` (all 11+ probes), including WhatsApp transport, worker, storage, backup, email, Stripe, OpenAI, Anthropic, Google Auth |
| `system-health.controller.ts` | `/system-health` endpoint with DIAG_TOKEN protection |
| `system-health-db-probe.ts` | `checkDatabase`, `checkRedis` probes |
| `system-health-infra-checks.ts` | `checkWhatsAppTransport`, `checkWorker`, `checkStorage`, `checkQueues`, `checkCriticalConfig` |
| `system-health-external-probes.ts` | `checkBackup`, `checkEmail`, `checkStripe`, `checkOpenAI`, `checkAnthropic`, `checkGoogleAuth` |

**Health Indicators (10 files):**
| Indicator | Checks |
|-----------|--------|
| `prisma.health-indicator.ts` | `SELECT 1` query |
| `redis.health-indicator.ts` | `PING` command |
| `bullmq.health-indicator.ts` | BullMQ queue connectivity |
| `database-backup.health-indicator.ts` | Backup service status |
| `email.health-indicator.ts` | Email service connectivity |
| `stripe.health-indicator.ts` | Stripe API reachable |
| `meta.health-indicator.ts` | Meta/WhatsApp API reachable |
| `openai.health-indicator.ts` | OpenAI API reachable |
| `anthropic.health-indicator.ts` | Anthropic API reachable |

---

### 6. `prisma/` — Database Access (16 files)

**One-liner:** Global PrismaClient wrapper with checkout-paid lifecycle hooks (member access, email, affiliate, wallet, social, WhatsApp CAPI).

**Key files:**
| File | Role |
|------|------|
| `prisma.module.ts` (lines 1-9) | `@Global()` module — exports `PrismaService` everywhere |
| `prisma.service.ts` (lines 1-80) | Extends `PrismaClient`. `installCheckoutPaidMemberAccessHook()` — monkey-patches `checkoutPayment.updateMany` and `checkoutOrder.updateMany` to trigger post-payment effects: member access grant, wallet credit, affiliate commission, purchase confirmation email, Facebook CAPI, WhatsApp purchase notification |
| `checkout-paid-effects/index.ts` | Barrel exports 6 effect functions (affiliate, email, facebook, social, whatsapp, wallet) |
| `checkout-paid-effects/wallet.ts` | Credits the workspace wallet based on checkout products (affiliate/vendor splits) |

**Architecture note:** The PrismaService uses runtime monkey-patching on `updateMany` to achieve transactional post-payment hooks. This is tightly coupled to the checkout flow — every checkout payment update triggers these effects.

---

### 7. `queue/` — Job Queue (6 files)

**One-liner:** BullMQ-based job queue system with lazy initialization, per-queue DLQ (Dead Letter Queue), autopilot jobs, and Slack/Teams webhook notifications.

**Key files:**
| File | Role |
|------|------|
| `queue.ts` (lines 1-350) | Core queue infrastructure: lazy Redis connection, 10 named queues (`flow-jobs`, `campaign-jobs`, `scraper-jobs`, `media-jobs`, `voice-jobs`, `autopilot-jobs`, `memory-jobs`, `crm-jobs`, `webhook-jobs`, `google-ads-sync-jobs`, `ads-sync-meta`), DLQ auto-attachment, `shutdownQueueSystem()` for test teardown |
| `webhook-classifier.ts` | Classifies ops webhook URLs as `slack` / `teams` / `generic` for DLQ alert formatting |
| `job-id.util.ts` + `job-id-chars.util.ts` | Job ID generation/deduplication utilities |

**Queue design:**
- Lazy initialization: no Redis connection until first queue access
- Exponential backoff: `QUEUE_ATTEMPTS` (default 3), `QUEUE_BACKOFF_MS` (default 5000ms)
- DLQ: failed jobs with exhausted retries move to `{queue-name}-dlq`
- Ops notifications: DLQ events sent to `DLQ_WEBHOOK_URL` or `OPS_WEBHOOK_URL` (Slack/Teams formatted)
- `queueRegistry` for runtime introspection (used by HealthController and QueueHealthService)

---

### 8. `logging/` — Structured Logging (2 files)

**One-liner:** JSON-structured NestJS Logger wrapping with correlation ID injection and Pino-style argument convention support.

**Key files:**
| File | Role |
|------|------|
| `structured-logger.ts` (lines 1-80) | `StructuredLogger` extends NestJS `Logger`. All logs are JSON-serialized with `{level, context, message, timestamp, correlationId}`. Supports 4 calling conventions. Suppressed in test env. `StructuredLogger.from(name)` factory. |

---

### 9. `observability/` — Monitoring & Alerting (5 files)

**One-liner:** Datadog custom metrics, Sentry integration context, and critical error alerting service.

**Key files:**
| File | Role |
|------|------|
| `metrics.ts` (lines 1-60) | `dd-trace` DogStatsD wrapper: `increment`, `histogram`, `gauge` with `kloel.` prefix. Pre-built metric namespaces for checkout, payment, whatsapp, autopilot, flows, campaigns, webhooks, scraper, media, voice, agent, ai |
| `ops-alert.module.ts` (lines 1-8) | `@Global()` module exporting `OpsAlertService` |
| `ops-alert.service.ts` (lines 1-80) | `alert()` — structured log + Sentry forward + DB `OpsEvent` persistence for critical runtime errors. Designed for `@Optional()` injection into any service. |
| `sentry-context.ts` | Sentry transaction context helpers |

---

### 10. `metrics/` — Prometheus Metrics (9 files)

**One-liner:** Prometheus-compatible metrics collection (HTTP, queue, billing) via `prom-client`, with token-protected exposition endpoint and Datadog integration.

**Key files:**
| File | Role |
|------|------|
| `metrics.module.ts` (lines 1-12) | Registers `MetricsService`, `QueueHealthService`, `ObservabilityQueriesService` |
| `metrics.service.ts` (lines 1-60) | `prom-client` registry with 4 metrics: `http_requests_total` (counter), `http_request_duration_seconds` (histogram), `queue_jobs` (gauge by queue/pipe/state), `billing_workspaces_status` (gauge) |
| `metrics.controller.ts` (lines 1-40) | `GET /metrics` — Prometheus exposition format, protected by `METRICS_TOKEN` (header-based token auth). Also exposes queue status + billing suspension counts. |
| `metrics.interceptor.ts` | HTTP metrics interceptor that pushes to `MetricsService.observeHttp` |
| `queue-health.service.ts` (lines 1-40) | Aggregates queue job counts across all 10 queues + DLQs |
| `observability-queries.service.ts` (lines 1-60) | **Governance boundary:** Platform-wide aggregates (Meta connections, message counts, autopilot events) — used only by token-protected routes. Each method is documented as `@PublicMetric`. |

---

### 11. `lib/` — Low-Level Libraries (5 files)

**One-liner:** Crypto utilities (AES-256-GCM), LLM provider resolution, and AI model configuration.

**Key files:**
| File | Role |
|------|------|
| `crypto.ts` (lines 1-80) | `encryptString` / `decryptString` — AES-256-GCM with random IV per encryption. Supports hex-encoded, base64, or derived keys. Returns base64(IV+ciphertext+authTag). |
| `ai-models.ts` (lines 1-50) | `resolveKloelCapabilityModel` — resolves AI model IDs for 5 capabilities: search_web (GPT-5.4), create_image (DALL-E), create_site (Claude Opus 4), site generation (GPT-4o-mini / Claude Haiku) |
| `llm-provider.ts` (lines 1-60) | `createTextLlmClient` — OpenAI-compatible client factory. Resolves API key via chain: DEEPSEEK_API_KEY → LLM_API_KEY → OPENAI_API_KEY. Defaults to DeepSeek base URL. |
| `openai-models.ts` (lines 1-40) | `resolveBackendOpenAIModel` — resolves AI model IDs for 9 roles (brain, writer, audio, image generation) with fallback chains. Canonical model ID constants. |

---

### 12. `i18n/` — Internationalization (3 files)

**One-liner:** AI-powered translation service with static Portuguese dictionary and OpenAI-backed dynamic translation for ~100 message templates.

**Key files:**
| File | Role |
|------|------|
| `i18n.module.ts` (lines 1-12) | `@Global()` module, imports BillingModule (for plan limits), exports `I18nService` |
| `i18n.service.ts` (lines 1-60) | `translate()` — static `pt-BR` dictionary for greetings, onboarding, payments, sales, support, errors, confirmations + dynamic OpenAI translation for missing keys. `planLimits` integration for AI quota. |

---

## Architecture Observations

### Strengths

1. **Stateless function composition in Auth:** The `AuthService` decomposes auth lifecycle into pure functions (`auth-service.*.ts`) that receive explicit `AuthPartsDeps`. This is highly testable and avoids the "god class" anti-pattern.

2. **Branded `Cents` type:** `common/money.ts` enforces integer-only money at compile time — prevents float arithmetic accidents in payment code.

3. **Defense-in-depth security:** Multiple layers: `safe-path.ts` (null-byte), `url-validator.ts` (SSRF), `crypto-compare.util.ts` (timing-safe), `production-startup-guard.ts` (missing secret detection at boot).

4. **Governance boundary for observability:** `observability-queries.service.ts` is an explicitly scoped file for cross-tenant aggregates — prevents accidental PII/financial data leakage through metrics endpoints.

5. **Lazy initialization in Queue:** Redis connection is only established on first queue access, with graceful fallback and comprehensive teardown (`shutdownQueueSystem`) for tests.

6. **Global error alerting:** `OpsAlertService` as `@Optional()` injectable — any service can add alerting without breaking tests or requiring module rewiring.

7. **Exhaustive env validation:** `AppConfigModule` validates 100+ env vars with Joi — catches misconfiguration at boot, not runtime.

### Concerns

1. **PrismaService monkey-patching:** `installCheckoutPaidMemberAccessHook()` overwrites `updateMany` on checkout models at runtime via `Object.defineProperty`. This is fragile, hard to debug, and breaks if Prisma changes internal APIs. Consider using Prisma middleware or explicit service layer hooks.

2. **`common/` is a catch-all:** ~100 files in `common/` with no clear sub-module organization. `money.ts`, `payment-state-machine.ts`, `ledger-reconciliation.service.ts`, and `financial-alert.service.ts` form a de facto "financial domain" that deserves its own module.

3. **Multiple metric systems:** `metrics/` (prom-client), `observability/` (dd-trace DogStatsD), and `logging/structured-logger.ts` (JSON logs) — three observability pipelines with overlapping concerns but no unified abstraction.

4. **Auth module file count:** 74 files for auth is high. The stateless function pattern is good, but the mix of `auth-service.*.ts` (pure functions) and `auth.*.service.ts` (class-based services with overlapping concerns) creates confusion. Consider consolidating into a single pattern.

5. **Queue module exports lazy proxies:** `flowQueue`, `campaignQueue`, etc. are Proxy objects — callers don't realize they trigger lazy initialization. This is clever but obscures initialization order.

6. **Workspace module is thin:** Only 9 files, mostly settings CRUD. "Workspace" is the central tenant concept, yet its module is simpler than health checks. Core multi-tenancy logic (workspace isolation, cross-workspace access prevention) is scattered across guards and middleware.

7. **I18n service hard-codes Portuguese:** The static dictionary only has `pt-BR`. Expansion to other languages requires code changes, not just data.

### Data Flow Summary

```
Request → CorrelationIdMiddleware → JwtAuthGuard → WorkspaceGuard → RouteClassGuard
    → Controller → Service → PrismaService → PostgreSQL
                → CacheService  → Redis
                → Queue (BullMQ) → Worker processes
    → MetricsInterceptor → prom-client
    → StructuredLogger → JSON stdout / Datadog
    → OpsAlertService  → Sentry + DB OpsEvent
```

### Module Dependency Graph (Simplified)

```
AppConfigModule (global)
├── PrismaModule (@Global) ← used by everything
├── RedisModule (@Global) ← cache, rate limit, idempotency, queues
├── I18nModule (@Global)
├── OpsAlertModule (@Global)
├── AuthModule → Prisma, Payments, JwtModule
├── WorkspaceModule → (implicit Prisma, Cache via DI)
├── HealthModule → Prisma, Config, Whatsapp, Metrics, Terminus, Billing
├── MetricsModule → (standalone + Prisma)
├── Queue (lazy, not a NestJS module)
└── StorageModule → Config, StorageDrivers
```

---

## Improvement Suggestions

| Priority | Area | Suggestion |
|----------|------|------------|
| **High** | `common/` organization | Extract `money.ts`, `payment-state-machine.ts`, `checkout-order-state-machine.ts`, `ledger-reconciliation.service.ts`, `financial-alert.service.ts`, `financial-alert.module.ts` into a `financial/` domain module |
| **High** | Prisma hooks | Replace monkey-patched `updateMany` hooks with Prisma middleware or explicit service-layer post-payment effect dispatcher |
| **Medium** | Auth module consolidation | Choose one pattern: either pure functions (`auth-service.*.ts`) or DI services (`auth.*.service.ts`). Remove the duplicate `AuthPasswordService` / `AuthTokenService` split that overlaps with `auth-service.register-login.ts` / `auth-service.tokens.ts` |
| **Medium** | Observability unification | Create a single `TelemetryService` facade that wraps both prom-client and DogStatsD, with structured logging as a third output |
| **Medium** | Workspace isolation | Move cross-workspace access prevention logic into a dedicated guard/service in `workspaces/` rather than scattered across `common/guards/workspace.guard.ts` and `auth/workspace-access.ts` |
| **Low** | I18n extensibility | Move static translations to JSON files (`i18n/pt-BR.json`, `i18n/en.json`) for runtime loading and easier contribution |
| **Low** | Queue initialization | Document the lazy Proxy pattern in `queue.ts` JSDoc — callers should know they're triggering Redis connections |

---

## Start Here

For a developer new to this codebase, start with:

1. **`backend/src/app.module.ts`** — See how everything wires together (90+ modules, global guards, interceptors, Redis configuration)
2. **`backend/src/prisma/prisma.service.ts`** — Understand the core data access layer and its checkout-paid hooks
3. **`backend/src/auth/auth.service.ts`** — Understand the facade pattern and `buildDeps()` dependency injection
4. **`backend/src/common/money.ts`** — Understand the `Cents` branded type used across all financial code
