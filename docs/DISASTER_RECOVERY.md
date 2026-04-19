# KLOEL Disaster Recovery Plan

## RPO / RTO Targets

| Store            | RPO (Recovery Point Objective) | RTO (Recovery Time Objective) |
| ---------------- | ------------------------------ | ----------------------------- |
| PostgreSQL       | 24 hours (daily backup)        | 4 hours                       |
| Redis            | 1 hour (hourly snapshot)       | 30 minutes                    |
| S3 Assets        | 0 (versioning, continuous)     | 1 hour                        |
| Application Code | 0 (Git, immutable deploys)     | 30 minutes                    |

---

## Incident Classification

### P1 -- Critical (Total Service Down)

- Production database inaccessible or corrupted
- Complete application outage
- Data breach or security compromise
- Payment processing failure affecting all users

**Response time:** Immediate (within 15 minutes)
**Resolution target:** 4 hours

### P2 -- Major (Significant Degradation)

- WhatsApp messaging down for all users
- Checkout/payment partial failure
- Authentication system down
- Redis completely unavailable

**Response time:** 30 minutes
**Resolution target:** 8 hours

### P3 -- Minor (Limited Impact)

- Single workspace affected
- Non-critical feature broken (analytics, reports)
- Performance degradation (>2x normal latency)
- Worker queue backlog growing

**Response time:** 2 hours
**Resolution target:** 24 hours

### P4 -- Low (Cosmetic / Non-Urgent)

- UI rendering issues
- Non-critical background job failures
- Logging/monitoring gaps

**Response time:** Next business day
**Resolution target:** 1 week

---

## Communication Plan

### Internal Notification Chain

1. Automated alert fires (Sentry / Railway health check)
2. On-call engineer acknowledges within response time
3. If P1/P2: notify daniel@kloel.com immediately
4. Status updates every 30 minutes during active incident

### External Communication

- P1: Status page updated within 30 minutes
- P2: Status page updated within 1 hour
- P3/P4: No external communication unless user-facing

### Communication Channels

- Primary: Email (daniel@kloel.com)
- Secondary: WhatsApp group (engineering team)
- Status page: Update at each milestone

---

## Recovery Procedures

### Scenario 1: Database Loss

**Symptoms:** Application returns 500 errors, Prisma connection timeouts,
"relation does not exist"
errors.

### Steps:

1. **Confirm the issue**

   ```bash
   railway logs backend -e production | tail -50
   psql "$DATABASE_URL" -c "SELECT 1" 2>&1
   ```

2. **Enable maintenance mode**

   ```bash
   railway variables set MAINTENANCE_MODE=true -e production
   ```

3. **Identify available backups**
   - Railway dashboard: PostgreSQL service > Backups
   - S3: `aws s3 ls s3://kloel-backups/postgres/`

4. **Restore from backup**
   Follow the PostgreSQL Restore procedure in [RESTORE.md](./RESTORE.md).

5. **Run pending migrations**

   ```bash
   cd backend && npx prisma migrate deploy
   ```

6. **Verify and resume**

   ```bash
   railway variables set MAINTENANCE_MODE=false -e production
   railway service restart backend -e production
   ```

7. **Monitor for 30 minutes** -- Watch error rates and latency.

---

### Scenario 2: Redis Loss

**Symptoms:** Slow responses, BullMQ jobs not processing, rate limiting not
working, stale cache
data.

### Steps:

1. **Confirm Redis is down**

   ```bash
   redis-cli -u "$REDIS_URL" PING
   ```

2. **Application auto-degrades** -- The backend handles Redis unavailability
   gracefully:
   - Rate limiting falls back to in-memory
   - BullMQ retries with exponential backoff
   - Cache misses serve from database

3. **Restore or provision new Redis**
   - Railway: Restart Redis service or provision new instance
   - Update `REDIS_URL` if instance changed

4. **Restart services to reconnect**

   ```bash
   railway service restart backend -e production
   railway service restart worker -e production
   ```

5. **Verify BullMQ queues are draining**
   ```bash
   # Check via Bull Board or API
   curl -s https://api.kloel.com/health | jq .redis
   ```

---

### Scenario 3: Application Crash (Backend)

**Symptoms:** 502/503 errors from Railway, health check failing, no logs being
produced.

### Steps:

1. **Check Railway deployment status**

   ```bash
   railway status -e production
   railway logs backend -e production | tail -100
   ```

2. **If bad deploy -- rollback**

   ```bash
   # Railway supports instant rollback to previous deployment
   railway rollback -e production
   ```

3. **If crash loop -- check environment**

   ```bash
   railway variables -e production
   # Verify DATABASE_URL, REDIS_URL, JWT_SECRET are set
   ```

4. **If dependency issue -- redeploy from known-good commit**

   ```bash
   git log --oneline -10
   git checkout <known-good-commit>
   railway up -e production
   ```

5. **If OOM -- increase resources**
   - Railway dashboard: Backend service > Settings > Resources
   - Increase memory limit (default: 512MB, recommended: 1GB)

---

### Scenario 4: DNS Failure

**Symptoms:** Domain not resolving, SSL certificate errors, "site can't be
reached".

### Steps:

1. **Check DNS resolution**

   ```bash
   dig kloel.com
   dig api.kloel.com
   nslookup kloel.com
   ```

2. **Check Vercel DNS settings**
   - Vercel dashboard > Domains
   - Verify A/CNAME records point to Vercel

3. **Check SSL certificate**

   ```bash
   openssl s_client -connect kloel.com:443 -servername kloel.com 2>/dev/null \
     | openssl x509 -noout -dates
   ```

4. **If Vercel DNS issue:**
   - Re-add domain in Vercel dashboard
   - Wait for DNS propagation (up to 48h, usually 5-30 min)

5. **If registrar issue:**
   - Log into domain registrar
   - Verify nameservers are correct
   - Check domain hasn't expired

---

### Scenario 5: Provider Outage (Railway / Vercel / AWS)

**Symptoms:** Multiple services down simultaneously, provider status page shows
incident.

### Steps:

1. **Check provider status pages**
   - Railway: https://status.railway.app
   - Vercel: https://www.vercel-status.com
   - AWS: https://health.aws.amazon.com

2. **If Railway is down (backend + DB):**
   - Enable Vercel maintenance page
   - Monitor Railway status for resolution
   - If prolonged (>4h): Consider emergency migration to alternate provider

3. **If Vercel is down (frontend):**
   - Backend/API continues working
   - Direct API consumers unaffected
   - Monitor Vercel status for resolution

4. **If AWS is down (S3):**
   - Application continues but file uploads/downloads fail
   - Existing cached assets may still serve from CDN
   - Monitor AWS status for resolution

5. **Post-resolution:**
   - Verify all services are healthy
   - Check for data consistency (especially if database was affected)
   - Clear caches if needed

---

## Post-Incident Review Template

Complete this for every P1 and P2 incident:

```
## Incident Report

**Date:** YYYY-MM-DD
**Duration:** HH:MM
**Severity:** P1/P2
**On-call:** [name]

### Timeline
- HH:MM - Incident detected by [source]
- HH:MM - Engineer acknowledged
- HH:MM - Root cause identified
- HH:MM - Fix applied
- HH:MM - Service restored
- HH:MM - Monitoring confirmed stable

### Root Cause
[Description of what caused the incident]

### Impact
- Users affected: [number/percentage]
- Revenue impact: [estimated]
- Data loss: [yes/no, details]

### Resolution
[What was done to fix the issue]

### Action Items
- [ ] [Preventive measure 1]
- [ ] [Preventive measure 2]
- [ ] [Monitoring improvement]

### Lessons Learned
[What we learned and how to prevent recurrence]
```

---

## Emergency Contacts

| Role             | Contact             | Method            |
| ---------------- | ------------------- | ----------------- |
| Engineering Lead | daniel@kloel.com    | Email / WhatsApp  |
| Railway Support  | support@railway.app | Email / Dashboard |
| Vercel Support   | support@vercel.com  | Email / Dashboard |
| AWS Support      | AWS Console         | Support ticket    |

---

## Regular DR Testing Schedule

| Test                        | Frequency     | Last Run   | Next Run   |
| --------------------------- | ------------- | ---------- | ---------- |
| Database restore to staging | Monthly       | 2026-04-01 | 2026-05-01 |
| Redis failover simulation   | Quarterly     | 2026-04-01 | 2026-07-01 |
| Full rebuild from scratch   | Quarterly     | 2026-04-01 | 2026-07-01 |
| Tabletop exercise           | Semi-annually | 2026-04-01 | 2026-10-01 |
