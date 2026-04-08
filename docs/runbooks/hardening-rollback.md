# Hardening Rollback Playbook

> **Status:** Live for the Big Tech hardening plan landed in 2026-04-08
> **Owners:** KLOEL engineering on-call
> **Companion:** `docs/runbooks/hardening-rollout.md`
> **Trigger:** Any signal listed in the rollout runbook's "Rollback signals" section

## Decision

The on-call engineer decides whether to roll back. The decision must
be made within 5 minutes of the rollback signal firing. Communicate
the decision in the ops channel before taking any action.

## Rollback options, in order of preference

For every hardening change, prefer the cheapest reversible option:

1. **Feature flag** — flip an env var on the live service. Takes
   effect on next request, no redeploy needed. **Use this first
   when available.**
2. **Revert PR** — `git revert <sha>` and re-deploy through the
   normal pipeline. Takes ~10 minutes for the full deploy cycle.
3. **Roll back to last known good deploy** — Railway and Vercel
   both expose "previous deployment" promotion. Takes ~2 minutes.
4. **Hot-fix forward** — only if the bug is well-understood and
   the fix is small. Usually slower than rolling back.

## Per-change rollback steps

### P0-1 — Worker lock semantics (whatsapp.strictLock)

**Symptoms of regression:** worker logs flooded with `Failed to
acquire workspace action lock` errors; BullMQ jobs piling up in
DLQ; outbound WhatsApp messages stalled.

**Rollback:**

1. Set `FF_WHATSAPP__STRICTLOCK=false` on the Railway worker service.
2. Restart the worker.
3. Worker reverts to the old fall-through-after-deadline behavior.

**Caveat:** the old behavior allowed duplicate sends under contention.
Use this only as an emergency escape hatch. Investigate the lock
contention root cause within 24 hours.

### P0-2 — Webhook dedup atomic SET EX NX (webhook.atomicDedup, payment.failClosedUnknownState)

**Symptoms of regression:** Asaas/Stripe/Shopify webhooks reporting
high duplicate counts; `webhook:payment:*` keys in Redis growing
without TTL; payment state transitions rejected unexpectedly.

**Rollback:**

1. Set `FF_WEBHOOK__ATOMICDEDUP=false` and `FF_PAYMENT__FAILCLOSEDUNKNOWNSTATE=false`
   on the Railway backend service.
2. Restart the backend.
3. Behavior reverts to legacy SETNX+EXPIRE and fail-open state machine.

**Caveat:** The flags are documentation more than runtime
behavior — the legacy code paths were deleted in the same PRs that
added the new ones. Effective rollback for P0-2 requires a code
revert (option 2 above).

### P0-3 — Idempotency guard rewrite (idempotency.awaitWrite)

**Symptoms of regression:** clients reporting empty 200 responses
on retries; idempotency placeholder keys stuck in Redis without
TTL; duplicate processing under concurrent retries.

**Rollback:**

1. Set `FF_IDEMPOTENCY__AWAITWRITE=false`.
2. Restart the backend.

**Caveat:** Same as P0-2 — the flag is documentation. Effective
rollback requires code revert.

### P0-5 — Auth fail-closed rate limit (auth.failClosedRateLimit)

**Symptoms of regression:** legitimate users seeing 503 from
`/auth/login` and `/auth/register`; Sentry showing
`ServiceUnavailableException` in the auth path.

**Rollback:**

1. **First check Redis health.** The fail-closed mode is correct
   when Redis is unavailable. The bug is upstream — fix Redis
   first if it's down.
2. If Redis is healthy and the rate limiter is misbehaving, set
   `RATE_LIMIT_DISABLED=true` on the backend (existing escape
   hatch from P0-5). This bypasses rate limiting entirely.
3. Or set `FF_AUTH__FAILCLOSEDRATELIMIT=false` to revert to the
   old in-memory fallback (per-instance, not multi-instance safe).

**Caveat:** RATE_LIMIT_DISABLED bypasses ALL rate limiting and is
a security risk during active brute-force attempts. Use for short
windows only.

### P0-6 — Liveness/readiness split + hard-fail DB boot

**Symptoms of regression:** Railway killing the container in a
restart loop because `/health/system` (the deep check) is reporting
DOWN; or DB connection failures crashing the boot.

**Rollback:**

1. **First**: update Railway's health check probe URL from
   `/health/ready` back to `/health/system` (or vice versa,
   depending on which broke). This is a Railway service setting,
   not a code change.
2. **Second** (if needed): revert the boot hard-fail by setting
   `NODE_ENV=development` temporarily. This restores the old
   "log and continue" behavior. **Production-grade only as an
   emergency** — it lets the app boot with no DB.

### P2-1 — Prisma schema unification via worker symlink

**Symptoms of regression:** worker fails to import @prisma/client;
TypeScript errors in the worker about missing models.

**Rollback:**

1. SSH into the worker container (or rebuild locally).
2. Remove the symlink: `rm worker/prisma/schema.prisma`
3. Recreate as a copy: `cp backend/prisma/schema.prisma worker/prisma/schema.prisma`
4. Run `cd worker && npm run prisma:generate`
5. Redeploy.

**Note:** This breaks the CI guard `check-prisma-schema-single-source.mjs`
until the symlink is restored. It's an emergency rollback only.

### P2-3 — Redis resolver unification

**Symptoms of regression:** backend/worker can't connect to Redis
even though `REDIS_URL` is set; production logs showing
`RedisConfigurationError`.

**Rollback:**

1. Verify the env var actually has a value: `railway variables list`
   (or check the Railway dashboard).
2. If the value is correct but the resolver still fails, check
   `REDIS_MODE` — it should be unset or `required` in production.
   `REDIS_MODE=disabled` makes the resolver return null which is
   the documented "I really don't want Redis" mode.
3. If the resolver is genuinely broken, revert PR P2-3 via git:
   ```bash
   git revert 21bf5fcc
   git push origin main
   ```
   Wait for the deploy pipeline.

### P2-4 — Lazy queue init + worker provider routing

**Symptoms of regression:** worker stuck not processing jobs;
BullMQ queues showing 0 workers in metrics; or autopilot sending
via the wrong WhatsApp provider.

**Rollback:**

1. For provider routing: ensure `WHATSAPP_PROVIDER_DEFAULT` env var
   is set on BOTH backend and worker Railway services to the same
   value (the bug here is split-brain between the two services).
2. For lazy init: revert PR P2-4 via git revert. The lazy init
   pattern is hard to roll back partially.

## Communication template

After any rollback, post in the ops channel within 10 minutes:

```
🛑 ROLLBACK: <PR number / SHA>
Reason: <one-line description>
Affected: <which services>
Method: <feature flag flip | git revert | Railway redeploy>
Customer impact: <yes/no, rough numbers>
Investigation: <link to the incident doc>
Status: <rolled back, monitoring, fixed>
```

Then open an incident doc and run a 5-whys within 24 hours.

## Why most flags are documentation, not runtime behavior

The P0/P2/P3 hardening PRs are **class-elimination changes**. They
remove whole patterns from the codebase (e.g. the SETNX+EXPIRE
non-atomic pattern, the lock fall-through, the in-memory rate
limit fallback). The legacy code paths are gone — the feature
flags can't bring them back without a code revert.

The flags exist anyway because:

1. They document which changes are reversible by env-var flip vs
   require a code revert (the per-section comments above)
2. Some flags (like `RATE_LIMIT_DISABLED`) ARE runtime escape
   hatches and need to be discoverable by the on-call engineer
3. The `snapshot()` method on FeatureFlagService surfaces flag
   state in the startup banner so operators can see what's flipped

For genuinely reversible changes that need a runtime gate, build
the gate INSIDE the call site at the same time you build the
hardening — see PR P0-5's `RATE_LIMIT_DISABLED` for the canonical
example.
