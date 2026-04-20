# KLOEL Restore Runbook

## Prerequisites

### Tools Required

- `psql` (PostgreSQL client, v14+)
- `pg_dump` / `pg_restore`
- Railway CLI (`railway`)
- AWS CLI (`aws`) configured with S3 access
- Node.js 18+ and npm
- Git

### Access Required

- Railway project access (production + staging)
- AWS S3 bucket credentials (kloel-assets)
- GitHub repository access
- DNS management (Vercel dashboard)

### Environment Variables

Ensure you have access to all production env vars. They are stored in:

1. Railway project settings (backend + worker)
2. Vercel project settings (frontend)
3. `.env.pulse.local` (local diagnostics only, gitignored)

---

## PostgreSQL Restore

### Step 1: Identify the Backup

Railway provides daily automated backups. List available backups:

```bash
railway connect postgres
# In Railway dashboard: Settings > Backups
```

Or if using manual pg_dump backups stored in S3:

```bash
aws s3 ls s3://kloel-backups/postgres/ --recursive | sort | tail -5
```

### Step 2: Download the Backup

```bash
# From S3
aws s3 cp s3://kloel-backups/postgres/kloel-prod-YYYY-MM-DD.sql.gz ./restore/

# Decompress
gunzip kloel-prod-YYYY-MM-DD.sql.gz
```

### Step 3: Restore to Staging First

ALWAYS restore to staging before production.

```bash
# Get staging database URL from Railway
export STAGING_DB_URL=$(railway variables get DATABASE_URL -e staging)

# Drop and recreate staging database
psql "$STAGING_DB_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Restore
psql "$STAGING_DB_URL" < kloel-prod-YYYY-MM-DD.sql
```

### Step 4: Verify Staging Restore

```bash
# Check table count
psql "$STAGING_DB_URL" -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"

# Check critical tables have data
psql "$STAGING_DB_URL" -c "$(cat <<'SQL'
SELECT 'Workspace' as t, count(*) FROM "Workspace"
UNION ALL SELECT 'Agent', count(*) FROM "Agent"
UNION ALL SELECT 'Product', count(*) FROM "Product"
UNION ALL SELECT 'Payment', count(*) FROM "Payment";
SQL
)"

# Run Prisma validation
cd backend && DATABASE_URL="$STAGING_DB_URL" npx prisma validate
```

### Step 5: Restore to Production

Only after staging verification passes:

```bash
export PROD_DB_URL=$(railway variables get DATABASE_URL -e production)

# Put application in maintenance mode first
railway variables set MAINTENANCE_MODE=true -e production

# Restore
psql "$PROD_DB_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
psql "$PROD_DB_URL" < kloel-prod-YYYY-MM-DD.sql

# Run any pending migrations
cd backend && DATABASE_URL="$PROD_DB_URL" npx prisma migrate deploy
```

---

## Redis Restore

### Step 1: Assess Impact

Redis is used for:

- BullMQ job queues (WhatsApp messages, autopilot)
- Session cache
- Rate limiting counters
- SWR cache entries

Loss of Redis data is non-critical. The application operates in degraded mode.

### Step 2: Restore from RDB Snapshot

```bash
# Railway Redis provides point-in-time snapshots
# Access via Railway dashboard: Redis service > Backups

# If using external Redis with RDB backups:
aws s3 cp s3://kloel-backups/redis/dump-YYYY-MM-DD.rdb ./restore/
redis-cli -u "$REDIS_URL" --rdb ./restore/dump-YYYY-MM-DD.rdb
```

### Step 3: Verify Redis

```bash
redis-cli -u "$REDIS_URL" INFO keyspace
redis-cli -u "$REDIS_URL" DBSIZE
```

### Step 4: Warm Up Cache

After Redis restore, restart the application to re-populate caches:

```bash
railway service restart backend -e production
railway service restart worker -e production
```

---

## S3 Assets Restore

### Step 1: Check S3 Versioning

S3 versioning is enabled. Deleted or overwritten files can be recovered:

```bash
# List deleted objects
aws s3api list-object-versions --bucket kloel-assets --prefix uploads/ \
  --query 'DeleteMarkers[].{Key:Key,VersionId:VersionId}'

# Restore a specific file
aws s3api delete-object --bucket kloel-assets --key uploads/FILE_KEY \
  --version-id DELETE_MARKER_VERSION_ID
```

### Step 2: Full Bucket Restore (if needed)

```bash
# Cross-region replica is the fastest source
aws s3 sync s3://kloel-assets-replica/ s3://kloel-assets/ --source-region us-east-1
```

---

## Application Restart Procedure

### Step 1: Verify Database Connection

```bash
cd backend
DATABASE_URL="$PROD_DB_URL" npx prisma db pull --print | head -20
```

### Step 2: Deploy Fresh Build

```bash
# Backend (Railway)
railway up -e production

# Frontend (Vercel)
# Trigger redeploy from Vercel dashboard or:
vercel --prod
```

### Step 3: Disable Maintenance Mode

```bash
railway variables set MAINTENANCE_MODE=false -e production
```

### Step 4: Smoke Test

```bash
# Health check
curl -s https://api.kloel.com/health | jq .

# Auth flow
curl -s https://api.kloel.com/auth/me -H "Authorization: Bearer $TEST_TOKEN" | jq .status

# WebSocket connectivity
wscat -c wss://api.kloel.com/ws
```

---

## Verification Checklist

- [ ] Database tables exist (107 Prisma models)
- [ ] Row counts within expected range
- [ ] Auth login works (email + Google OAuth)
- [ ] WhatsApp sessions reconnect
- [ ] Checkout creates order and payment
- [ ] Wallet shows correct balance
- [ ] BullMQ jobs processing
- [ ] Frontend loads without errors
- [ ] WebSocket connections establish

---

## Rollback if Restore Fails

If the restore itself causes issues:

1. **Do not panic.** The backup file is still available.
2. Stop all application services to prevent further corruption.
3. Drop the schema again and restore from the previous known-good backup.
4. If no good backup exists, use Railway's point-in-time recovery (up to 7
   days).
5. Escalate to <daniel@kloel.com> with:
   - Timestamp of failure
   - Error messages
   - Which backup was used
   - Current state of the database
