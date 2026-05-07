# RAC Table Rename — Deployment Runbook

> **Status:** Pre-deployment — DO NOT deploy before this runbook is executed
> **Migration:** `20260425013841_rac_table_rename`
> **Owners:** KLOEL engineering on-call
> **Risk Class:** 3 (Critical) — catastrofic failure if deployed without maintenance window
> **References:**
> `docs/runbooks/hardening-rollout.md`,
> `docs/runbooks/hardening-rollback.md`,
> `docs/deployment/env-vars.md`,
> `CHECKLIST_DE_LANÇAMENTO.md`

## Problem Description

Migration `20260425013841_rac_table_rename` renames **113 production tables** from
unprefixed names (`Workspace`, `Contact`, `Message`, `Payment`, …) to `RAC_*`
prefixed names (`RAC_Workspace`, `RAC_Contact`, `RAC_Message`, `RAC_Payment`,
…). Simultaneously, every corresponding Prisma model in `schema.prisma` now
carries `@@map("RAC_ModelName")`.

This is a **chicken-and-egg deployment trap** — there is no safe incremental
deploy:

| Deploy order                         | What happens                                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Migration first, old code stays      | Old Prisma client queries `Workspace` → table was just renamed to `RAC_Workspace` → **💥 table not found** |
| New code first, migration stays      | New Prisma client queries `RAC_Workspace` → table not renamed yet → **💥 table not found**                 |
| Both land at the same time naturally | Impossible — migration runs on Railway backend boot, code changes land via Vercel/frontend separately      |

**Every single user-facing operation hits the database.** All 113 tables are
critical-path: contacts, messages, payments, conversations, wallets, checkout
orders, agents, flows, subscriptions, integrations, webhooks, API keys, admin
identities. A mismatch between Prisma client resolution and physical table names
is immediately fatal to the application.

### Scale

- **113 tables** renamed (verified: 113 `ALTER TABLE` statements in migration, 113 `@@map("RAC_*")` directives in schema)
- **3 services** affected: Railway backend, Railway worker, Vercel frontend (via Prisma)
- **100% user impact** if deployed without coordination — every route touches one of these tables

## Required: MAINTENANCE WINDOW

This deployment **MUST** be performed with all application instances **stopped**.
There is no zero-downtime path.

### Risk: automatic migration on boot

The Railway backend runs `prisma migrate deploy` at startup
(`CHECKLIST_DE_LANÇAMENTO.md`). If auto-deploy is enabled for this migration,
the backend could rename tables while old worker/frontend code is still live.
**Disable auto-deploy on Railway before proceeding.**

## Pre-deployment Checklist

- [ ] **Notify stakeholders** — send in ops channel at least 24h in advance:
  ```
  📢 MAINTENANCE WINDOW: RAC table rename
  Date: <date>
  Window: <start>–<end> UTC (estimated 15 minutes)
  Impact: Full app downtime — no WhatsApp, no checkout, no dashboard
  Runbook: docs/runbooks/rac-table-rename-deployment.md
  ```
- [ ] **Disable Railway auto-deploy** for the backend service.
- [ ] **Disable Vercel auto-deploy** for frontend and admin.
- [ ] Schedule the maintenance window during lowest traffic (historical: Sundays
      02:00–05:00 UTC).
- [ ] Verify database backup exists and is verified (within last 24h):
  ```bash
  # Check Railway backup snapshots
  railway backups list
  ```
- [ ] Verify migration SQL has been reviewed (all `ALTER TABLE … RENAME TO` are
      correct, `IF EXISTS` prevents duplicate-run crashes):
  ```bash
  cat backend/prisma/migrations/20260425013841_rac_table_rename/migration.sql
  ```
- [ ] Verify schema.prisma `@@map` directives match migration table names
      one-to-one:
  ```bash
  grep -c 'ALTER TABLE IF EXISTS' backend/prisma/migrations/20260425013841_rac_table_rename/migration.sql
  grep -c '@@map("RAC_' backend/prisma/schema.prisma
  # Both must print 113
  ```
- [ ] Verify Prisma client has been regenerated against the renamed schema:
  ```bash
  cd backend && npx prisma generate
  cd worker && npx prisma generate --schema=prisma/schema.prisma
  ```
- [ ] Prepare rollback SQL script (see Rollback section below).
- [ ] Confirm ops channel is monitored during the window.
- [ ] Pre-build new Docker images / deployment artifacts for all three services.
- [ ] Identify on-call escalation path if something goes wrong.

## Step-by-Step Deployment Procedure

### Phase 1: Stop Everything (T+0)

```bash
# 1a. Stop Railway backend
railway service pause --service backend

# 1b. Stop Railway worker
railway service pause --service worker

# 1c. Stop Vercel frontend (via Vercel dashboard or CLI)
vercel env rm NEXT_PUBLIC_API_URL production
# Or toggle a maintenance-mode env var that returns 503 from middleware

# 1d. Verify all instances are down
curl -s https://api.kloel.com/health/live || echo "Backend down — expected"
curl -s https://app.kloel.com || echo "Frontend unreachable — expected"
```

**Expected downtime starts here.** All users see errors or maintenance page.

### Phase 2: Run Migration (T+1)

```bash
# 2a. Connect to production database via Railway
railway connect --service backend
# or use DATABASE_URL directly:
DATABASE_URL="<prod-db-url>" npx prisma migrate deploy \
  --schema=backend/prisma/schema.prisma
```

**Verify migration applied:**

```bash
# 2b. Confirm migration status shows the RAC rename as applied
DATABASE_URL="<prod-db-url>" npx prisma migrate status \
  --schema=backend/prisma/schema.prisma

# Expected output includes:
# 20260425013841_rac_table_rename — Applied

# 2c. Verify renamed tables exist with correct names
DATABASE_URL="<prod-db-url>" psql -c "
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name LIKE 'RAC_%'
  ORDER BY table_name;
"
# Should list exactly 113 tables starting with RAC_

# 2d. Verify NO unprefixed tables remain from the renamed set
DATABASE_URL="<prod-db-url>" psql -c "
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'Workspace', 'FlowTemplate', 'Agent', 'Contact', 'Tag', 'Variable',
      'Flow', 'FlowVersion', 'FlowExecution', 'Campaign', 'Conversation',
      'Message', 'ScrapingJob', 'ScrapedLead', 'KnowledgeBase',
      'KnowledgeSource', 'Vector', 'Integration', 'MonitoredGroup',
      'GroupMember', 'BannedKeyword', 'Subscription', 'Invoice',
      'ExternalPaymentLink', 'GroupLauncher', 'LaunchGroup', 'MediaJob',
      'Pipeline', 'Stage', 'Deal', 'VoiceProfile', 'VoiceJob',
      'RefreshToken', 'DeviceToken', 'PasswordResetToken', 'MagicLinkToken',
      'SocialAccount', 'DataDeletionRequest', 'RiscEvent', 'Invitation',
      'Queue', 'AuditLog', 'AutopilotEvent', 'AutonomyRun',
      'AutonomyExecution', 'AgentWorkItem', 'ApprovalRequest',
      'InputCollectionSession', 'AccountProofSnapshot',
      'ConversationProofSnapshot', 'WebhookSubscription', 'WebhookEvent',
      'ApiKey', 'Persona', 'KloelMessage', 'KloelMemory', 'Product',
      'KloelLead', 'KloelConversation', 'ChatThread', 'ChatMessage',
      'KloelSale', 'KloelWallet', 'KloelWalletTransaction',
      'KloelWalletLedger', 'Document', 'FollowUp', 'ProductPlan',
      'ProductCheckout', 'ProductCoupon', 'ProductReview',
      'ProductCommission', 'ProductUrl', 'ProductCampaign', 'ProductAIConfig',
      'MemberArea', 'MemberEnrollment', 'MemberModule', 'MemberLesson',
      'AffiliateProduct', 'AffiliateRequest', 'AffiliateLink', 'KloelSite',
      'KloelDesign', 'CustomerSubscription', 'AdRule', 'PhysicalOrder',
      'Payment', 'CollaboratorInvite', 'AffiliatePartner', 'PartnerMessage',
      'BankAccount', 'WalletAnticipation', 'CheckoutProductPlan',
      'CheckoutPlanLink', 'CheckoutConfig', 'OrderBump', 'Upsell',
      'CheckoutCoupon', 'CheckoutPixel', 'CheckoutOrder',
      'CheckoutSocialLead', 'CheckoutPayment', 'UpsellOrder', 'KycDocument',
      'FiscalData', 'OrderAlert', 'AdSpend', 'Webinar', 'MetaConnection'
    );
"
# Must return 0 rows. If any row is returned, that table was NOT renamed — ABORT.
```

**If verification fails at Step 2d:** some tables were not renamed. The migration
uses `IF EXISTS`, so this indicates a table didn't exist at all. Investigate
which tables are missing from the list. If the table is intentionally absent
(e.g., never created due to missing historical migration), the migration SQL
comment flags these. Proceed only after documenting which tables were skipped.

### Phase 3: Deploy New Code (T+5)

```bash
# 3a. Deploy backend with new Prisma client (includes @@map("RAC_*"))
# Use the pre-built artifact that includes regenerated @prisma/client
railway service deploy --service backend
# OR trigger the deploy-production workflow:
gh workflow run deploy-production.yml

# 3b. Deploy worker with new Prisma client
railway service deploy --service worker

# 3c. Deploy frontend (if it bundles Prisma)
vercel deploy --prod

# 3d. Deploy admin
vercel deploy --prod  # if admin is a separate Vercel project
```

### Phase 4: Start Services (T+10)

**Order matters:** Backend must come up first so it can run health checks before
the worker and frontend start routing traffic.

```bash
# 4a. Start backend
railway service resume --service backend

# 4b. Wait for backend health check to pass
for i in $(seq 1 30); do
  status=$(curl -s -o /dev/null -w '%{http_code}' https://api.kloel.com/health/live)
  if [ "$status" = "200" ]; then
    echo "Backend healthy"
    break
  fi
  echo "Waiting for backend... attempt $i"
  sleep 2
done

# 4c. Verify readiness (DB must be UP)
curl -s https://api.kloel.com/health/ready | python3 -m json.tool
# Expected: { "status": "UP", "database": "UP", "redis": "UP" }

# 4d. Start worker
railway service resume --service worker

# 4e. Verify worker health
sleep 5
railway service logs --service worker --since 1m | grep -i "started\|ready\|error"

# 4f. Start frontend (restore env vars or toggle off maintenance mode)
vercel env add NEXT_PUBLIC_API_URL production <api-url>
vercel redeploy --prod

# 4g. Start admin
vercel redeploy --prod
```

### Phase 5: Smoke Tests (T+12)

```bash
# 5a. Health checks
curl -s https://api.kloel.com/health/live
# Expected: 200 OK

curl -s https://api.kloel.com/health/ready
# Expected: 200 OK, status UP, database UP

curl -s https://api.kloel.com/health/system
# Expected: 200 OK, status UP or DEGRADED at worst

# 5b. Auth flow
curl -s -X POST https://api.kloel.com/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"qa-smoke@kloel.com","password":"<smoke-password>"}'
# Expected: 200 with accessToken

# 5c. Prisma operation — verify workspace query works
# (Any route that queries a workspace will exercise the renamed table)
curl -s https://api.kloel.com/workspaces \
  -H "Authorization: Bearer <token-from-5b>"
# Expected: 200, returns workspace list — proves RAC_Workspace is being queried

# 5d. Checkout flow — verify RAC_CheckoutOrder, RAC_CheckoutPayment
curl -s https://pay.kloel.com/oferta-teste
# Expected: 200, checkout page renders

# 5e. WhatsApp webhook — verify RAC_WebhookSubscription, RAC_WebhookEvent
curl -s "https://api.kloel.com/webhooks/meta?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=test"
# Expected: 200, returns "test"

# 5f. Worker processing
# Check BullMQ dashboard or logs for job processing
railway service logs --service worker --since 5m | grep -i "processing\|completed\|error"
# Expected: jobs being processed normally, no table-not-found errors

# 5g. PULSE certification gate
npm run pulse:staging
# Expected: PASS
```

### Phase 6: Watch (T+15–T+45)

Monitor for 30 minutes after deploy:

- [ ] Sentry error rate delta ≤ +0.1%
- [ ] No `PrismaClientKnownRequestError` with `relation "..." does not exist`
- [ ] No `PrismaClientValidationError` from table name mismatch
- [ ] Worker queue depth stable (not growing)
- [ ] WhatsApp message delivery rate normal
- [ ] Checkout orders processing normally
- [ ] Wallet balance reconciliation reports zero drift
- [ ] Admin dashboard loads all modules

### Phase 7: Mark Complete

- [ ] Post in ops channel: "✅ RAC table rename deployment complete. 30-minute
      watch window clean."
- [ ] Re-enable Railway auto-deploy
- [ ] Re-enable Vercel auto-deploy
- [ ] Update `CERTIFICATION_RUNBOOK.md` with deployment evidence

**Total expected downtime: 12–15 minutes.**

## Rollback Procedure

If the deployment must be rolled back, the migration must be **reversed**
manually (Prisma does not support `migrate rollback`).

### Rollback Decision Triggers

Roll back immediately if any of these occur:

- Verification Step 2d finds tables that were NOT renamed
- Health check (Step 4c) returns DOWN for database after 60 seconds
- Any Prisma table-not-found error in backend logs during smoke tests
- Worker logs show `relation "RAC_*" does not exist` (indicates migration didn't
  apply)
- Worker logs show `relation "Workspace" does not exist` (indicates old worker
  code still running)
- Wallet/checkout operations failing

### Rollback Steps

```bash
# 1. Stop all services (same as Phase 1)

# 2. Reverse the migration — rename RAC_* back to original names
DATABASE_URL="<prod-db-url>" psql <<'SQL'
ALTER TABLE IF EXISTS "RAC_Workspace" RENAME TO "Workspace";
ALTER TABLE IF EXISTS "RAC_FlowTemplate" RENAME TO "FlowTemplate";
ALTER TABLE IF EXISTS "RAC_Agent" RENAME TO "Agent";
ALTER TABLE IF EXISTS "RAC_CookieConsent" RENAME TO "CookieConsent";
ALTER TABLE IF EXISTS "RAC_Contact" RENAME TO "Contact";
ALTER TABLE IF EXISTS "RAC_ContactInsight" RENAME TO "ContactInsight";
ALTER TABLE IF EXISTS "RAC_SystemInsight" RENAME TO "SystemInsight";
ALTER TABLE IF EXISTS "RAC_Tag" RENAME TO "Tag";
ALTER TABLE IF EXISTS "RAC_Variable" RENAME TO "Variable";
ALTER TABLE IF EXISTS "RAC_Flow" RENAME TO "Flow";
ALTER TABLE IF EXISTS "RAC_FlowVersion" RENAME TO "FlowVersion";
ALTER TABLE IF EXISTS "RAC_FlowExecution" RENAME TO "FlowExecution";
ALTER TABLE IF EXISTS "RAC_Campaign" RENAME TO "Campaign";
ALTER TABLE IF EXISTS "RAC_Conversation" RENAME TO "Conversation";
ALTER TABLE IF EXISTS "RAC_Message" RENAME TO "Message";
ALTER TABLE IF EXISTS "RAC_ScrapingJob" RENAME TO "ScrapingJob";
ALTER TABLE IF EXISTS "RAC_ScrapedLead" RENAME TO "ScrapedLead";
ALTER TABLE IF EXISTS "RAC_KnowledgeBase" RENAME TO "KnowledgeBase";
ALTER TABLE IF EXISTS "RAC_KnowledgeSource" RENAME TO "KnowledgeSource";
ALTER TABLE IF EXISTS "RAC_Vector" RENAME TO "Vector";
ALTER TABLE IF EXISTS "RAC_Integration" RENAME TO "Integration";
ALTER TABLE IF EXISTS "RAC_MonitoredGroup" RENAME TO "MonitoredGroup";
ALTER TABLE IF EXISTS "RAC_GroupMember" RENAME TO "GroupMember";
ALTER TABLE IF EXISTS "RAC_BannedKeyword" RENAME TO "BannedKeyword";
ALTER TABLE IF EXISTS "RAC_Subscription" RENAME TO "Subscription";
ALTER TABLE IF EXISTS "RAC_Invoice" RENAME TO "Invoice";
ALTER TABLE IF EXISTS "RAC_ExternalPaymentLink" RENAME TO "ExternalPaymentLink";
ALTER TABLE IF EXISTS "RAC_GroupLauncher" RENAME TO "GroupLauncher";
ALTER TABLE IF EXISTS "RAC_LaunchGroup" RENAME TO "LaunchGroup";
ALTER TABLE IF EXISTS "RAC_MediaJob" RENAME TO "MediaJob";
ALTER TABLE IF EXISTS "RAC_Pipeline" RENAME TO "Pipeline";
ALTER TABLE IF EXISTS "RAC_Stage" RENAME TO "Stage";
ALTER TABLE IF EXISTS "RAC_Deal" RENAME TO "Deal";
ALTER TABLE IF EXISTS "RAC_VoiceProfile" RENAME TO "VoiceProfile";
ALTER TABLE IF EXISTS "RAC_VoiceJob" RENAME TO "VoiceJob";
ALTER TABLE IF EXISTS "RAC_RefreshToken" RENAME TO "RefreshToken";
ALTER TABLE IF EXISTS "RAC_DeviceToken" RENAME TO "DeviceToken";
ALTER TABLE IF EXISTS "RAC_PasswordResetToken" RENAME TO "PasswordResetToken";
ALTER TABLE IF EXISTS "RAC_MagicLinkToken" RENAME TO "MagicLinkToken";
ALTER TABLE IF EXISTS "RAC_SocialAccount" RENAME TO "SocialAccount";
ALTER TABLE IF EXISTS "RAC_DataDeletionRequest" RENAME TO "DataDeletionRequest";
ALTER TABLE IF EXISTS "RAC_RiscEvent" RENAME TO "RiscEvent";
ALTER TABLE IF EXISTS "RAC_Invitation" RENAME TO "Invitation";
ALTER TABLE IF EXISTS "RAC_Queue" RENAME TO "Queue";
ALTER TABLE IF EXISTS "RAC_AuditLog" RENAME TO "AuditLog";
ALTER TABLE IF EXISTS "RAC_AutopilotEvent" RENAME TO "AutopilotEvent";
ALTER TABLE IF EXISTS "RAC_AutonomyRun" RENAME TO "AutonomyRun";
ALTER TABLE IF EXISTS "RAC_AutonomyExecution" RENAME TO "AutonomyExecution";
ALTER TABLE IF EXISTS "RAC_AgentWorkItem" RENAME TO "AgentWorkItem";
ALTER TABLE IF EXISTS "RAC_ApprovalRequest" RENAME TO "ApprovalRequest";
ALTER TABLE IF EXISTS "RAC_InputCollectionSession" RENAME TO "InputCollectionSession";
ALTER TABLE IF EXISTS "RAC_AccountProofSnapshot" RENAME TO "AccountProofSnapshot";
ALTER TABLE IF EXISTS "RAC_ConversationProofSnapshot" RENAME TO "ConversationProofSnapshot";
ALTER TABLE IF EXISTS "RAC_WebhookSubscription" RENAME TO "WebhookSubscription";
ALTER TABLE IF EXISTS "RAC_WebhookEvent" RENAME TO "WebhookEvent";
ALTER TABLE IF EXISTS "RAC_ApiKey" RENAME TO "ApiKey";
ALTER TABLE IF EXISTS "RAC_Persona" RENAME TO "Persona";
ALTER TABLE IF EXISTS "RAC_KloelMessage" RENAME TO "KloelMessage";
ALTER TABLE IF EXISTS "RAC_KloelMemory" RENAME TO "KloelMemory";
ALTER TABLE IF EXISTS "RAC_Product" RENAME TO "Product";
ALTER TABLE IF EXISTS "RAC_KloelLead" RENAME TO "KloelLead";
ALTER TABLE IF EXISTS "RAC_KloelConversation" RENAME TO "KloelConversation";
ALTER TABLE IF EXISTS "RAC_ChatThread" RENAME TO "ChatThread";
ALTER TABLE IF EXISTS "RAC_ChatMessage" RENAME TO "ChatMessage";
ALTER TABLE IF EXISTS "RAC_KloelSale" RENAME TO "KloelSale";
ALTER TABLE IF EXISTS "RAC_KloelWallet" RENAME TO "KloelWallet";
ALTER TABLE IF EXISTS "RAC_KloelWalletTransaction" RENAME TO "KloelWalletTransaction";
ALTER TABLE IF EXISTS "RAC_KloelWalletLedger" RENAME TO "KloelWalletLedger";
ALTER TABLE IF EXISTS "RAC_Document" RENAME TO "Document";
ALTER TABLE IF EXISTS "RAC_FollowUp" RENAME TO "FollowUp";
ALTER TABLE IF EXISTS "RAC_ProductPlan" RENAME TO "ProductPlan";
ALTER TABLE IF EXISTS "RAC_ProductCheckout" RENAME TO "ProductCheckout";
ALTER TABLE IF EXISTS "RAC_ProductCoupon" RENAME TO "ProductCoupon";
ALTER TABLE IF EXISTS "RAC_ProductReview" RENAME TO "ProductReview";
ALTER TABLE IF EXISTS "RAC_ProductCommission" RENAME TO "ProductCommission";
ALTER TABLE IF EXISTS "RAC_ProductUrl" RENAME TO "ProductUrl";
ALTER TABLE IF EXISTS "RAC_ProductCampaign" RENAME TO "ProductCampaign";
ALTER TABLE IF EXISTS "RAC_ProductAIConfig" RENAME TO "ProductAIConfig";
ALTER TABLE IF EXISTS "RAC_MemberArea" RENAME TO "MemberArea";
ALTER TABLE IF EXISTS "RAC_MemberEnrollment" RENAME TO "MemberEnrollment";
ALTER TABLE IF EXISTS "RAC_MemberModule" RENAME TO "MemberModule";
ALTER TABLE IF EXISTS "RAC_MemberLesson" RENAME TO "MemberLesson";
ALTER TABLE IF EXISTS "RAC_AffiliateProduct" RENAME TO "AffiliateProduct";
ALTER TABLE IF EXISTS "RAC_AffiliateRequest" RENAME TO "AffiliateRequest";
ALTER TABLE IF EXISTS "RAC_AffiliateLink" RENAME TO "AffiliateLink";
ALTER TABLE IF EXISTS "RAC_KloelSite" RENAME TO "KloelSite";
ALTER TABLE IF EXISTS "RAC_KloelDesign" RENAME TO "KloelDesign";
ALTER TABLE IF EXISTS "RAC_CustomerSubscription" RENAME TO "CustomerSubscription";
ALTER TABLE IF EXISTS "RAC_AdRule" RENAME TO "AdRule";
ALTER TABLE IF EXISTS "RAC_PhysicalOrder" RENAME TO "PhysicalOrder";
ALTER TABLE IF EXISTS "RAC_Payment" RENAME TO "Payment";
ALTER TABLE IF EXISTS "RAC_CollaboratorInvite" RENAME TO "CollaboratorInvite";
ALTER TABLE IF EXISTS "RAC_AffiliatePartner" RENAME TO "AffiliatePartner";
ALTER TABLE IF EXISTS "RAC_PartnerMessage" RENAME TO "PartnerMessage";
ALTER TABLE IF EXISTS "RAC_BankAccount" RENAME TO "BankAccount";
ALTER TABLE IF EXISTS "RAC_WalletAnticipation" RENAME TO "WalletAnticipation";
ALTER TABLE IF EXISTS "RAC_CheckoutProductPlan" RENAME TO "CheckoutProductPlan";
ALTER TABLE IF EXISTS "RAC_CheckoutPlanLink" RENAME TO "CheckoutPlanLink";
ALTER TABLE IF EXISTS "RAC_CheckoutConfig" RENAME TO "CheckoutConfig";
ALTER TABLE IF EXISTS "RAC_OrderBump" RENAME TO "OrderBump";
ALTER TABLE IF EXISTS "RAC_Upsell" RENAME TO "Upsell";
ALTER TABLE IF EXISTS "RAC_CheckoutCoupon" RENAME TO "CheckoutCoupon";
ALTER TABLE IF EXISTS "RAC_CheckoutPixel" RENAME TO "CheckoutPixel";
ALTER TABLE IF EXISTS "RAC_CheckoutOrder" RENAME TO "CheckoutOrder";
ALTER TABLE IF EXISTS "RAC_CheckoutSocialLead" RENAME TO "CheckoutSocialLead";
ALTER TABLE IF EXISTS "RAC_CheckoutPayment" RENAME TO "CheckoutPayment";
ALTER TABLE IF EXISTS "RAC_UpsellOrder" RENAME TO "UpsellOrder";
ALTER TABLE IF EXISTS "RAC_KycDocument" RENAME TO "KycDocument";
ALTER TABLE IF EXISTS "RAC_FiscalData" RENAME TO "FiscalData";
ALTER TABLE IF EXISTS "RAC_OrderAlert" RENAME TO "OrderAlert";
ALTER TABLE IF EXISTS "RAC_AdSpend" RENAME TO "AdSpend";
ALTER TABLE IF EXISTS "RAC_Webinar" RENAME TO "Webinar";
ALTER TABLE IF EXISTS "RAC_MetaConnection" RENAME TO "MetaConnection";
SQL

# 3. Deploy old code (previous commit, before @@map was added)
# 4. Start services and verify health

# 5. Post rollback notification in ops channel (use template from hardening-rollback.md)
```

## Risk Assessment

| Risk                                                       | Likelihood | Impact   | Mitigation                                                                       |
| ---------------------------------------------------------- | ---------- | -------- | -------------------------------------------------------------------------------- |
| Migration runs on auto-deploy while old services are live  | High       | Critical | Disable Railway auto-deploy before starting                                      |
| Worker processes queue jobs during migration rename        | Medium     | High     | Stop worker before migration; verifies queue is drained during window            |
| Prisma client mismatch (cached/old) between services       | Medium     | High     | Pre-build and verify all artifacts; validate checksums before Phase 3            |
| Partial rename — some tables skipped due to `IF EXISTS`    | Low        | High     | Verification Step 2d catches this; `IF EXISTS` prevents crash but defeats rename |
| Foreign key constraints block rename (sequence dependency) | Low        | High     | Pre-flight: run migration SQL in staging and verify it completes                 |
| Admin panel `admin_*` tables not renamed but still break   | Low        | Low      | Admin tables kept their `admin_*` naming; only RAC-prefixed models changed       |
| Checkout domain `pay.kloel.com` uses different DB          | Low        | High     | Verify checkout shares the same database as backend before proceeding            |
| Migrated but rollback needed and reverse SQL is wrong      | Low        | Critical | Pre-test rollback SQL in staging; have a DB snapshot ready                       |

## Non-Renamed Tables

The following tables are intentionally **NOT** renamed and remain with their
current names:

- `admin_users`, `admin_permissions`, `admin_sessions`, `admin_audit_logs`,
  `admin_login_attempts` — admin identity system
- `destructive_intents` — admin destruction safety layer
- `marketplace_treasuries`, `marketplace_treasury_ledger`, `marketplace_fees` —
  marketplace treasury (may not exist in production yet)
- `connect_account_balances`, `connect_ledger_entries`, `connect_maturation_rules` —
  Stripe Connect balances
- `prepaid_wallets`, `prepaid_wallet_transactions` — prepaid wallet system
- `usage_prices` — usage-based pricing
- `fraud_blacklist` — fraud detection
- `admin_chat_sessions`, `admin_chat_messages` — admin chat

These tables either already have a domain prefix or are part of separate logical
subsystems that predate the RAC naming convention.

## Post-Deployment Verification

After the 30-minute watch window passes, run these invariant checks:

| Check                         | Command / Query                                                                                          | Expected       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- | -------------- |
| All 113 RAC tables exist      | `SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'RAC_%'` | 113            |
| No unprefixed tables remain   | Query any of the old table names in Step 2d                                                              | 0 rows         |
| Health endpoint               | `curl https://api.kloel.com/health/ready`                                                                | `status: UP`   |
| Prisma client version matches | `railway run --service backend npx prisma version`                                                       | Matches schema |
| Worker processing             | BullMQ dashboard shows active workers                                                                    | Count > 0      |
| Ledger reconciliation         | Inspect `LedgerReconciliationService` logs                                                               | Zero drift     |
| WhatsApp message flow         | Send test message → verify delivery in dashboard                                                         | Delivered      |
| Checkout flow                 | Create test order via `pay.kloel.com` → verify in admin dashboard                                        | Created        |
| Admin dashboard               | All modules load: PRODUTOS, MARKETING, VENDAS, CARTEIRA, CLIENTES, CONFIGURACOES                         | All render     |
| PULSE certification           | `npm run pulse:prod`                                                                                     | PASS           |
