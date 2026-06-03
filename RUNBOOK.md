# KLOEL Incident Runbook

> Canonical incident-response playbook for KLOEL production operations.
> Companion to `docs/RUNBOOK.md` (general ops), `docs/PRODUCTION_DEPLOY.md`
> (deploy procedure), and `docs/DISASTER_RECOVERY.md` (DR).

## Incident 1: DLQ Overflow

### Context

The worker uses BullMQ with lazy queue initialisation. Each of the 10
production queues has an auto-attached dead-letter queue (`<name>-dlq`).
When a job exhausts all retry attempts (default 3), it is automatically
moved into the DLQ by `worker/queue.ts:attachDlq()` and an OPS webhook
notification is dispatched via `worker/queue-dlq-notifier.ts`.

The DLQ monitor (`worker/dlq-monitor.ts`) runs every 5 minutes
(`DLQ_MONITOR_INTERVAL_MS`, default 300000) and attempts self-healing
for transient failures (ETIMEDOUT, ECONNRESET, 502/503/504, rate-limit,
deadlock). Jobs that fail self-healing accumulate in the DLQ.

### Symptoms

- `https://adm.kloel.com/operations/queue-health` shows `dlqWaiting > 0`
  or `dlqFailed > 0`.
- Backend health endpoint `/health/deep` reports queue status `DEGRADED`
  or `DOWN`.
- `worker/dlq-monitor.ts` sends alert to `OPS_WEBHOOK_URL` (Slack/Discord).
- Downstream feature gaps: messages not sent, campaigns stalled, webhooks
  not processed.

### Inspect

```bash
# From any machine with REDIS_URL access:
railway run --service worker -- node -e "
const { Queue } = require('bullmq');
(async () => {
  const dlq = new Queue('flow-jobs-dlq', { connection: { url: process.env.REDIS_URL } });
  const counts = await dlq.getJobCounts();
  console.log('DLQ counts:', JSON.stringify(counts));
  const jobs = await dlq.getJobs(['waiting', 'failed'], 0, 20);
  for (const j of jobs) {
    console.log(j.id, j.name, j.data?.failedReason?.slice(0, 120));
  }
  await dlq.close();
  process.exit(0);
})();
"
```

Replace `flow-jobs-dlq` with the target queue name. The 10 queues are:

| Queue | DLQ Name | Purpose |
| --- | --- | --- |
| `flow-jobs` | `flow-jobs-dlq` | Flow engine steps |
| `campaign-jobs` | `campaign-jobs-dlq` | Campaign sends |
| `scraper-jobs` | `scraper-jobs-dlq` | Web scraping |
| `media-jobs` | `media-jobs-dlq` | Media processing |
| `voice-jobs` | `voice-jobs-dlq` | Voice/TTS |
| `memory-jobs` | `memory-jobs-dlq` | Memory operations |
| `crm-jobs` | `crm-jobs-dlq` | CRM sync |
| `autopilot-jobs` | `autopilot-jobs-dlq` | Autopilot AI |
| `webhook-jobs` | `webhook-jobs-dlq` | Inbound webhooks |
| `silent-24h-resolver` | `silent-24h-resolver-dlq` | Outcome resolver |

### Purge

```bash
# Purge ALL jobs from a specific DLQ (irreversible):
railway run --service worker -- node -e "
const { Queue } = require('bullmq');
(async () => {
  const dlq = new Queue('flow-jobs-dlq', { connection: { url: process.env.REDIS_URL } });
  await dlq.obliterate({ force: true });
  console.log('DLQ obliterated');
  await dlq.close();
  process.exit(0);
})();
"
```

### Replay (Reprocess from DLQ)

The worker ships a canonical reprocess script at `worker/reprocess-dlq.ts`:

```bash
# Replay up to 50 jobs from flow-jobs DLQ back to main queue:
railway run --service worker -- \
  TARGET_QUEUE=flow-jobs \
  DLQ_REPROCESS_LIMIT=50 \
  DLQ_REPROCESS_ATTEMPTS=3 \
  DLQ_REPROCESS_BACKOFF_MS=5000 \
  npx ts-node --transpile-only worker/reprocess-dlq.ts
```

Environment controls:

- `TARGET_QUEUE` — queue name without `-dlq` suffix (default: `flow-jobs`).
- `DLQ_REPROCESS_LIMIT` — max jobs to replay (default: 50).
- `DLQ_REPROCESS_ATTEMPTS` — fresh attempt budget (default: 3).
- `DLQ_REPROCESS_BACKOFF_MS` — exponential backoff base (default: 5000).

### Root Cause Categories

| Failure Pattern | Likely Cause | Fix |
| --- | --- | --- |
| `ETIMEDOUT`, `ECONNRESET`, `socket hang up` | Transient network | Self-healing covers this |
| `502`, `503`, `504` | Upstream provider down | Wait, replay when provider recovers |
| `rate limit`, `too many requests` | Provider throttling | Reduce concurrency, add jitter |
| `Deadlock found` | DB contention | Investigate long-running transactions |
| `Connection terminated` | Provider disconnect | Check provider status page |

---

## Incident 2: Stripe Webhook Deadletter

### Context

Stripe webhooks arrive at `POST /webhooks/stripe` and are processed by
`backend/src/webhooks/payment-webhook-stripe.controller.ts`. Each event is
validated via `stripe.webhooks.constructEvent()` with the live
`STRIPE_WEBHOOK_SECRET`. Valid events are persisted in the `WebhookEvent`
table with a Stripe idempotency key (`stripeExternalId`). Duplicate
events return 200 without side effects.

### Symptoms

- Stripe dashboard shows `webhook_endpoints` with rising pending deliveries.
- `WebhookEvent` table has rows with `status = 'failed'`.
- Ledger entries do not match Stripe balance (reconciliation drift).
- Payment confirmations not reaching sellers (split engine stalled).

### Idempotency Key Inspection

```sql
-- Find duplicated or stuck webhook events:
SELECT
  "stripeExternalId",
  "provider",
  "eventType",
  "status",
  "createdAt",
  COUNT(*) OVER (PARTITION BY "stripeExternalId") AS duplicates
FROM "WebhookEvent"
WHERE "createdAt" > NOW() - INTERVAL '24 hours'
ORDER BY "createdAt" DESC
LIMIT 50;
```

```sql
-- Find events that failed processing:
SELECT
  "stripeExternalId",
  "eventType",
  "status",
  "error",
  "createdAt"
FROM "WebhookEvent"
WHERE "status" = 'failed'
  AND "createdAt" > NOW() - INTERVAL '24 hours'
ORDER BY "createdAt" DESC;
```

### Rollback / Re-drive an Event

Stripe does not automatically retry webhooks that return 200 (our
idempotency gate returns 200 for duplicates, preventing re-delivery).
To re-process a failed event:

1. Identify the `stripeExternalId` (e.g. `evt_1QxXxx...`).
2. Check Stripe dashboard for the event payload.
3. If the event was processed with wrong outcome:
   - **Never** UPDATE ledger entries. Write a compensating entry with
     `kind: 'CORRECTION'` and audit metadata.
   - Delete the `WebhookEvent` row so Stripe can re-deliver:

     ```sql
     DELETE FROM "WebhookEvent" WHERE "stripeExternalId" = 'evt_xxx';
     ```

4. Trigger re-delivery from Stripe dashboard (Developers > Webhooks >
   select endpoint > "Resend" on the specific event).
5. Monitor that the new delivery succeeds.

### Webhook Secret Rotation

If the `STRIPE_WEBHOOK_SECRET` is compromised or you need to rotate it:

1. In Stripe dashboard, generate a new webhook signing secret (keep old
   active).
2. Update `STRIPE_WEBHOOK_SECRET` in Railway (backend service variables).
3. Redeploy backend (`railway up backend`).
4. After 5 minutes with zero signature failures, revoke the old secret
   in Stripe dashboard.

### Verifying Signature Validation

```bash
# Test that the backend correctly validates signatures:
curl -X POST https://api.kloel.com/webhooks/stripe \
  -H "Content-Type: application/json" \
  -d '{}'
# Expected: 400 (signature missing — normal)
# If 200: signature validation may be disabled — INVESTIGATE.
```

---

## Incident 3: JWT Key Rotation

### Context

JWT tokens are signed with `JWT_SECRET` (32+ bytes). The secret is read
from `process.env.JWT_SECRET` in `backend/src/auth/jwt-config.ts:getJwtSecret()`.
In production, the secret is required and the app refuses to boot without it.
JWTs have a configurable expiry (`JWT_EXPIRES_IN`, default `30m`).

Admin tokens use a separate `ADMIN_JWT_SECRET` (`backend/src/admin/auth/admin-jwt-secret.ts`).

### When to Rotate

- Suspected key compromise.
- Employee offboarding (someone with secret access leaves).
- Scheduled rotation (quarterly or per security policy).
- After a security incident involving token leakage.

### Rotation Procedure (Zero-Downtime)

The backend does **not** support dual-key verification (no JWKS endpoint,
no `JWT_PREVIOUS_SECRET`). Rotation causes immediate invalidation of all
existing tokens. Plan for a brief service window.

#### Step 1: Notify

Notify `#kloel-deploys` Slack channel that a JWT rotation is scheduled.
Include the deployment window (5-10 minutes of degraded UX while all
users re-authenticate).

#### Step 2: Generate New Secret

```bash
# Generate 64 bytes of cryptographically random data, base64-encoded:
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

#### Step 3: Update Railway

```bash
# Set the new JWT_SECRET in Railway (backend service):
railway variables --service backend --set JWT_SECRET=<new-secret>
```

Do NOT log or echo the secret value. Use Railway's UI or a local
encrypted file.

#### Step 4: Rotate Admin Secret (If Applicable)

```bash
railway variables --service backend --set ADMIN_JWT_SECRET=<new-admin-secret>
```

#### Step 5: Redeploy Backend

```bash
railway up backend --service backend --environment production
```

This restarts the NestJS process. All in-flight JWTs become invalid.
All users (including admins) must re-authenticate.

#### Step 6: Verify

```bash
# Health check must return 200:
curl https://api.kloel.com/health/readiness

# Auth must accept new tokens:
curl -X POST https://api.kloel.com/api/auth/sign-in \
  -H "Content-Type: application/json" \
  -d '{"email":"test@kloel.com","password":"..."}'
# Expected: 200 with new access_token + refresh_token

# Old tokens must be rejected:
curl -H "Authorization: Bearer <old-token>" \
  https://api.kloel.com/api/auth/me
# Expected: 401 Unauthorized
```

#### Step 7: Notify Completion

Post in `#kloel-deploys`: rotation completed, all sessions invalidated,
re-auth required.

### Related: EMAIL_UNSUBSCRIBE_SECRET

Unsubscribe tokens use `EMAIL_UNSUBSCRIBE_SECRET` (falls back to
`JWT_SECRET` in dev). If rotating `JWT_SECRET` in production, verify
that `EMAIL_UNSUBSCRIBE_SECRET` is set independently — otherwise
unsubscribe links break.

---

## Incident 5: Redis Down

### Context

Redis is used by the backend for rate limiting (ThrottlerModule),
idempotency (IdempotencyMiddleware), session caching, and queue state.
The worker requires Redis to process BullMQ jobs and refuses to boot
without it (`worker/bootstrap.ts` exits with code 1 if `REDIS_URL`
resolution fails).

### Graceful Degrade Modes

The platform has **no global REDIS_MODE=disabled** flag in the backend.
Redis is mandatory for rate limiting and idempotency. When Redis is
unreachable:

#### Backend Behaviour

- `IdempotencyMiddleware` (`backend/src/common/idempotency/idempotency.middleware.ts`):
  if `idempotency.set()` fails, the error is caught and the request
  proceeds without idempotency caching (duplicate risk).
- Rate limiting (`@nestjs/throttler` with Redis storage): requests
  fail open (no rate limit enforced) when Redis is unreachable.
- Health endpoint `/health/readiness` reports `redis: DOWN`.

#### Worker Behaviour

- `worker/bootstrap.ts` exits the process with code 1 if Redis cannot
  be resolved. The worker will not start without Redis.
- If Redis goes down after the worker has booted, BullMQ queues will
  start failing jobs with `Connection is closed` errors. These jobs
  flow to DLQ as exhausted attempts.

### Diagnosis

```bash
# Check Redis connectivity from Railway:
railway run --service backend -- node -e "
const Redis = require('ioredis');
const r = new Redis(process.env.REDIS_URL);
r.ping().then(p => { console.log('Redis PING:', p); r.disconnect(); });
"

# Check health endpoint:
curl https://api.kloel.com/health/readiness | python3 -m json.tool | grep -A2 redis
```

### Recovery

1. Check Railway dashboard for Redis service status:
   `https://railway.app/project/<id>/service/<redis-service-id>`
2. If Redis crashed: restart from Railway dashboard.
3. If Redis is healthy but backend cannot connect: check network
   (Railway internal DNS `*.railway.internal`).
4. After Redis recovers, restart backend and worker:

   ```bash
   railway up backend --service backend
   railway up worker --service worker
   ```

5. Verify queue processing resumes:

   ```bash
   curl https://api.kloel.com/health/deep \
     -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -m json.tool | grep queues
   ```

### Worker: REDIS_MODE=disabled

The worker explicitly forbids `REDIS_MODE=disabled`. If Redis is
unavailable, do **not** deploy the worker. The worker bootstrap
(`worker/bootstrap.ts:126-132`) logs a fatal error and exits with
code 1 when Redis is required but unresolvable.

---

## Incident 6: WAHA Session Loss

### Context

WhatsApp sessions are managed via WAHA (WhatsApp HTTP API) running as a
separate Railway service. Each workspace has a WhatsApp session that
authenticates via QR code or existing session state. The health check
at `backend/src/health/system-health-infra-checks.ts:checkWhatsAppTransport()`
reports connected workspace count and transport readiness.

### Symptoms

- Customers report messages not sending/receiving.
- Admin panel `https://adm.kloel.com/operations/whatsapp-sessions` shows
  session status `disconnected` for > 5 minutes.
- Backend health `/health/deep` reports WhatsApp transport `DOWN`.
- Worker logs: `WhatsApp session not authenticated` or `session not found`.

### Step 1: Identify Scope

Determine if this is a single-workspace issue or platform-wide:

```bash
# Check all workspace sessions via admin:
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.kloel.com/admin/whatsapp/sessions | python3 -m json.tool
```

### Step 2: Check WAHA Service

```bash
# Is WAHA reachable?
curl https://<waha-service>.railway.internal:3000/api/sessions
# Or via Railway:
railway run --service waha -- curl http://localhost:3000/api/sessions
```

If WAHA is down: restart from Railway dashboard.

### Step 3: Reconnect Single Workspace

From admin panel (`adm.kloel.com` > Operations > WhatsApp Sessions):

1. Locate the affected workspace.
2. Click "Reconnect".
3. If QR code renders: have the workspace owner scan it from their
   WhatsApp mobile app (Settings > Linked Devices > Link a Device).
4. Wait for `status: connected` (typically 5-15 seconds).

### Step 4: Force Reconnect via API (If UI Unavailable)

```bash
# Trigger reconnect for a specific workspace:
curl -X POST https://api.kloel.com/api/whatsapp/session/reconnect \
  -H "Authorization: Bearer $WORKSPACE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"workspaceId": "ws_xxx", "force": true}'
```

### Step 5: QR Re-Render

If the QR code does not appear or is expired:

```bash
# Request fresh QR:
curl -X POST https://api.kloel.com/api/whatsapp/session/qr \
  -H "Authorization: Bearer $WORKSPACE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"workspaceId": "ws_xxx"}'
# Response includes qrCode (base64 PNG) and expiresAt.
```

QR codes expire after 60 seconds. If not scanned in time, request a
new one.

### Step 6: Full Session Restart (Last Resort)

If reconnect + QR re-render both fail:

1. Delete the session from WAHA:

   ```bash
   curl -X DELETE https://<waha>/api/sessions/<session-name>
   ```

2. Delete the session record in the database:

   ```sql
   DELETE FROM "WhatsAppSession" WHERE "workspaceId" = 'ws_xxx';
   ```

3. Re-create the session via admin panel or API (step 3).
4. The workspace owner must re-scan the QR code.

### Prevention

- WAHA sessions persist on disk. Ensure the WAHA service has a
  persistent volume in Railway.
- Monitor session health via `/health/deep` every 5 minutes.
- Set up alerting for session disconnects > 2 minutes.

---

## Incident 7: Meta Cloud API Tokens Revoked

### Context

Each workspace connects to the Meta Cloud API via OAuth (workspace-scoped
tokens). Tokens are encrypted at rest using `META_TOKEN_ENCRYPTION_KEY`
(`backend/src/integrations/meta-token-crypto.ts`). When Meta revokes a
token (app review, permission change, manual revocation), the workspace
loses WhatsApp sending capability.

### Symptoms

- Admin panel shows workspace WhatsApp status: `TOKEN_REVOKED`.
- Worker logs: `Meta API error: OAuthException, message: The access token
  has been revoked`.
- Messages for that workspace fail and accumulate in `flow-jobs-dlq` or
  `campaign-jobs-dlq`.

### Step 1: Confirm Revocation

```sql
-- Check workspace meta connection state:
SELECT
  w.id AS workspace_id,
  w.name,
  mc."accessToken" IS NOT NULL AS has_token,
  mc."tokenExpiresAt",
  mc."createdAt",
  mc."updatedAt"
FROM "Workspace" w
LEFT JOIN "MetaConnection" mc ON mc."workspaceId" = w.id
WHERE w.id = 'ws_xxx';
```

### Step 2: Trigger Workspace Re-OAuth

From admin panel (`adm.kloel.com` > Workspaces > select workspace >
WhatsApp Integration):

1. Click "Reconnect Meta Account".
2. The workspace owner is redirected to Meta OAuth flow.
3. Owner grants permissions (`whatsapp_business_messaging`,
   `whatsapp_business_management`).
4. Meta redirects back to `https://api.kloel.com/api/meta/oauth/callback`.
5. New tokens are encrypted and stored in `MetaConnection`.

### Step 3: API-Driven Re-OAuth Flow

If admin panel is unavailable, generate the OAuth URL directly:

```bash
# The backend generates the OAuth URL with state parameter:
curl https://api.kloel.com/api/meta/oauth/url?workspaceId=ws_xxx \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Response: { "url": "https://www.facebook.com/v21.0/dialog/oauth?..." }
```

Send this URL to the workspace owner. After they complete the flow,
Meta redirects to the backend callback which stores the new token.

### Step 4: Verify Reconnection

```bash
# Verify token works by checking WhatsApp business account:
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.kloel.com/api/whatsapp/status?workspaceId=ws_xxx
# Expected: { "status": "connected", "phoneNumberId": "..." }
```

### Step 5: Replay Failed Messages

After reconnection, replay any messages that failed due to the revoked
token:

```bash
# Replay flow-jobs for the affected workspace:
railway run --service worker -- \
  TARGET_QUEUE=flow-jobs \
  DLQ_REPROCESS_LIMIT=100 \
  npx ts-node --transpile-only worker/reprocess-dlq.ts
```

### Root Cause Classification

| Cause | Detection | Prevention |
| --- | --- | --- |
| App review rejected permissions | Meta developer dashboard alert | Monitor app review status |
| User manually removed app | User reports disconnection | In-app reconnect button |
| Token expired naturally | `tokenExpiresAt` in DB | Auto-refresh via long-lived token |
| Meta security action | Email from Meta | Appeal via Meta support |

---

## Incident 8: Coverage Gate Failure in CI

### Context

CI runs `npm test` (Jest for backend, Vitest for worker and frontend)
with coverage collection. The coverage gate enforces minimum thresholds.
When coverage drops below the gate, the CI job fails and blocks merging.

### Symptoms

- CI job `deploy-production` or `ci-cd` fails at test step.
- Console output: `ERROR: Coverage for lines (XX%) does not meet
  global threshold (YY%)`.
- The failing package (backend, worker, or frontend) is identified in
  the CI log.

### Step 1: Generate Coverage Locally

```bash
cd /Users/danielpenin/whatsapp_saas

# Backend:
cd backend && npm run test:cov
# Output: coverage/lcov.info + coverage/lcov-report/index.html

# Worker:
cd worker && npm run test:coverage
# Output: coverage/lcov.info

# Frontend:
cd frontend && npm run test:coverage
# Output: coverage/lcov.info
```

### Step 2: Identify Files Below Threshold

```bash
# Backend — open the HTML report:
open backend/coverage/lcov-report/index.html

# Or parse lcov.info for files with low coverage:
cd backend
node -e "
const fs = require('fs');
const lcov = fs.readFileSync('coverage/lcov.info', 'utf8');
const files = lcov.split('end_of_record').filter(Boolean);
const results = [];
for (const f of files) {
  const sf = f.match(/SF:(.+)/)?.[1];
  const lf = Number(f.match(/LF:(\d+)/)?.[1] || 0);
  const lh = Number(f.match(/LH:(\d+)/)?.[1] || 0);
  if (sf && lf > 0) {
    const pct = ((lh / lf) * 100).toFixed(1);
    results.push({ file: sf, lines: lf, covered: lh, pct: Number(pct) });
  }
}
results.sort((a, b) => a.pct - b.pct);
for (const r of results.slice(0, 20)) {
  console.log(\`\${r.pct}%  \${r.file}  (\${r.covered}/\${r.lines})\`);
}
"
```

### Step 3: Prioritise by Risk

1. **New code without tests**: the most common cause. Any new
   module/service/controller merged without corresponding test file.
2. **Deleted test files**: `scripts/ops/check-test-file-deletions.mjs`
   guards against this in pre-push, but check anyway.
3. **Refactored code**: existing tests that no longer cover refactored
   paths.
4. **Configuration drift**: vitest.config.ts or jest config changed.

### Step 4: Add Missing Tests

For each file below threshold, add tests following the existing patterns:

- **Backend controller**: `*.controller.spec.ts` using NestJS
  `Test.createTestingModule()`.
- **Backend service**: `*.service.spec.ts` with mocked dependencies.
- **Worker handler**: `*.spec.ts` using Vitest with BullMQ job mocks.
- **Frontend component**: `*.spec.tsx` using `@testing-library/react`.

### Step 5: Verify Coverage Gate Passes

```bash
# Backend:
cd backend && npm run test:cov
# Check exit code: must be 0.

# Worker:
cd worker && npm run test:coverage
# Check exit code: must be 0.

# Frontend:
cd frontend && npm run test:coverage
# Check exit code: must be 0.
```

### Step 6: Commit and Push

```bash
git add <test-files>
git commit -m "test: add coverage for <module>"
git push
```

Verify CI passes on the PR.

## Quick-Reference: Incident Severity Matrix

| Incident | Criticality | Rollback? | RTO |
| --- | --- | --- | --- |
| DLQ overflow (blocking) | High | No | 30 min |
| DLQ overflow (non-blocking) | Medium | No | 2 hours |
| Stripe webhook deadletter | Critical | May need rollback | 15 min |
| JWT key rotation | Low (planned) | No | 10 min |
| JWT key rotation (emergency) | Critical | No | 5 min |
| Redis down | Critical | Rollback if recent deploy | 15 min |
| WAHA session loss | Medium | No | 10 min |
| Meta tokens revoked | High | No | 15 min |
| Coverage gate failure | Medium | Block merge, not deploy | 1-4 hours |

## Contacts

- Project owner: Daniel Gonzaga
- Hosting: Railway (backend, worker, Redis, Postgres), Vercel (frontend, frontend-admin)
- Payment processor: Stripe (Connect Custom Accounts)
- WhatsApp: WAHA + Meta Cloud API (workspace-scoped OAuth)
- Monitoring: Sentry + Datadog APM + Prometheus metrics
