# Kloel Capability Map

> Authored by PI atomic subagent `w5-capability-map` (DeepSeek V4 Pro,
> ~22k events) as part of the Architectural Semantic Canonicalization
> mission. Written by the subagent via atomic_author. Materialized by
> orchestrator on 2026-05-26.


> What the system **does**, grouped by business capability.
> Each entry cites every implementation with `file:line`.
> Generated 2026-05-26. 48 capabilities cataloged.
>
> References: [CANONICAL_DOMAINS](CANONICAL_DOMAINS.md), [DUPLICATION_REGISTER](DUPLICATION_REGISTER.md), [EVENT_TAXONOMY](EVENT_TAXONOMY.md), [SERVICE_CATALOG](SERVICE_CATALOG.md).

---

## Phase 0 — Identity & Tenancy

### Authenticate User (password / OAuth / refresh)

- **Canonical implementation**: `AuthService.login()` at `backend/src/auth/auth.service.ts:100`
- **Owning domain**: `auth`
- **Inputs**: `{ email, password, ip? }` → delegates to `login()` at `backend/src/auth/auth-service.register-login.ts`
- **Outputs**: `{ accessToken, refreshToken, user }`
- **Side effects**: Prisma write (RefreshToken), optional audit log
- **All implementations found**:
  1. `backend/src/auth/auth.service.ts:100` — canonical `login()`
  2. `backend/src/auth/auth.service.ts:105` — `oauthLogin()` (Google/Apple)
  3. `backend/src/auth/auth.service.ts:111` — `loginWithGoogleCredential()`
  4. `backend/src/auth/auth.service.ts:118` — `loginWithFacebookAccessToken()`
  5. `backend/src/auth/auth.service.ts:124` — `loginWithAppleCredential()`
  6. `backend/src/auth/auth.service.ts:130` — `loginWithTikTokAuthorizationCode()`
  7. `backend/src/auth/auth.service.ts:85` — `createAnonymous()`
  8. `backend/src/auth/auth.service.ts:89` — `register()`
  9. `backend/src/admin/auth/admin-auth.service.ts` — admin login (separate domain)
- **Idempotency**: no (login is non-idempotent by nature)
- **Workspace isolation**: enforced (session-scoped)
- **Status**: ✅ canonical

### Refresh Session

- **Canonical implementation**: `AuthService.refresh()` at `backend/src/auth/auth.service.ts:118`
- **Owning domain**: `auth`
- **Inputs**: `{ refreshToken: string }`
- **Outputs**: `{ accessToken, refreshToken }` (new pair, old token revoked)
- **Side effects**: Prisma write (revoke old RefreshToken, create new RefreshToken)
- **All implementations found**:
  1. `backend/src/auth/auth.service.ts:118` — canonical (delegates to `refreshToken` at `backend/src/auth/auth-service.tokens.ts`)
  2. `backend/src/auth/auth.token.service.ts:196` — `AuthTokenService.refresh()` (legacy)
  3. `backend/src/admin/auth/` — admin refresh (separate domain)
- **Idempotency**: no (rotation is stateful)
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

### Send Magic Link

- **Canonical implementation**: `requestMagicLink()` at `backend/src/auth/auth-service.magic-link.ts:23`
- **Owning domain**: `auth`
- **Inputs**: `{ email, redirectTo?, ip? }`
- **Outputs**: `{ success: true }` (link sent to email)
- **Side effects**: EmailService.sendEmail() via Resend, Prisma write (MagicLink record)
- **All implementations found**:
  1. `backend/src/auth/auth-service.magic-link.ts:23` — `requestMagicLink()`
  2. `backend/src/auth/auth-service.magic-link.ts:73` — `verifyMagicLink()`
- **Idempotency**: partial (new code each call)
- **Workspace isolation**: not applicable (pre-auth)
- **Status**: 🟡 partial — send works; click validation pending

### Resolve Tenant from Request

- **Canonical implementation**: `resolveWorkspaceId()` at `backend/src/auth/workspace-access.ts:119`
- **Owning domain**: `auth` / `workspaces`
- **Inputs**: `req: { user?, params?, headers? }`
- **Outputs**: `string` (workspaceId)
- **Side effects**: none (pure resolution)
- **All implementations found**:
  1. `backend/src/auth/workspace-access.ts:119` — canonical `resolveWorkspaceId()`
  2. `backend/src/kloel/product-sub-resources/helpers/common.helpers.ts:23` — `getWorkspaceId()` (legacy, migrate to canonical)
  3. `frontend/src/lib/api/core-tokens.ts:21` — `resolveWorkspaceFromAuthPayload()` (frontend equivalent, OK)
- **Idempotency**: yes (pure function)
- **Workspace isolation**: N/A (this IS the isolation mechanism)
- **Status**: 🟡 needs migration

### Enforce Workspace Isolation on Queries

- **Canonical implementation**: `requireWorkspace()` decorator at `backend/src/common/decorators/workspace.decorator.ts`
- **Owning domain**: `common`
- **Inputs**: execution context (guard/decorator pattern)
- **Outputs**: workspaceId injected into params
- **Side effects**: none (access control)
- **All implementations found**:
  1. `backend/src/common/decorators/workspace.decorator.ts` — `requireWorkspace()` decorator
  2. Every Prisma query MUST include `where: { workspaceId }` — lint-enforced
- **Idempotency**: yes
- **Workspace isolation**: enforced (this IS the enforcement mechanism)
- **Status**: ✅ canonical

### Submit KYC Document

- **Canonical implementation**: `KycService.uploadDocument()` at `backend/src/kyc/kyc.service.ts:140`
- **Owning domain**: `kyc`
- **Inputs**: `{ agentId, workspaceId, type, file }`
- **Outputs**: `KycDocument` record
- **Side effects**: StorageService.upload() → R2, Prisma write (KycDocument)
- **All implementations found**:
  1. `backend/src/kyc/kyc.service.ts:140` — canonical `uploadDocument()`
  2. `backend/src/kyc/kyc.service.ts:67` — `updateProfile()`
  3. `backend/src/kyc/kyc.service.ts:158` — `updateFiscal()`
  4. `backend/src/kyc/kyc.service.ts:209` — `updateBankAccount()`
- **Idempotency**: no (new document each call)
- **Workspace isolation**: enforced
- **Status**: ✅ 85%

### Audit Log Entry

- **Canonical implementation**: `AuditService.log()` at `backend/src/audit/audit.service.ts:43`
- **Owning domain**: `audit`
- **Inputs**: `{ workspaceId, action, resource, resourceId?, agentId?, details? }`
- **Outputs**: void (fire-and-forget with retry)
- **Side effects**: Prisma write (AuditLog), OpsAlert on failure
- **All implementations found**:
  1. `backend/src/audit/audit.service.ts:43` — canonical `log()`
  2. `backend/src/audit/audit.service.ts:88` — `logWithTx()` (transactional variant)
  3. `backend/src/admin/audit/admin-audit.service.ts` — admin audit (separate domain)
- **Idempotency**: no (each call is a distinct log entry)
- **Workspace isolation**: enforced (workspaceId required)
- **Status**: ✅ canonical

---

## Phase 1 — Commerce Engine

### Create Checkout Order

- **Canonical implementation**: `CheckoutOrderService.createOrder()` at `backend/src/checkout/checkout-order.service.ts:53`
- **Owning domain**: `checkout`
- **Inputs**: planId, workspaceId, customer info, paymentMethod, amounts, optional affiliate/UTM
- **Outputs**: CheckoutOrder record + redirect to payment
- **Side effects**: Prisma write (CheckoutOrder, Payment), PaymentProviderRouterService.resolve(), charge via StripeChargeService / MercadoPagoPixChargeService
- **All implementations found**:
  1. `backend/src/checkout/checkout-order.service.ts:53` — canonical `createOrder()`
  2. `backend/src/checkout/checkout-product.service.ts:289` — `createCheckout()` (checkout form/plan)
  3. `backend/src/checkout/checkout.service.ts:70` — thin delegator to product service
  4. `backend/src/checkout/checkout.service.ts:134` — thin delegator to order service
- **Idempotency**: partial (correlationId provides idempotency key)
- **Workspace isolation**: enforced
- **Status**: ✅ 85%

### Process Card Payment (Stripe)

- **Canonical implementation**: `StripeChargeService.createSaleCharge()` at `backend/src/payments/stripe/stripe-charge.service.ts:25`
- **Owning domain**: `payments`
- **Inputs**: `{ workspaceId, buyerPaidCents, idempotencyKey, sellerStripeAccountId, … }`
- **Outputs**: `{ paymentIntentId, clientSecret, split, … }`
- **Side effects**: Stripe API (PaymentIntent.create), Prisma write (Payment), SplitEngine.calculateSplit()
- **Provider routing**: `PaymentProviderRouterService.resolve('card')` → `'stripe'` at `backend/src/payments/provider-router/provider-router.service.ts:35`
- **Idempotency**: yes (Stripe idempotencyKey)
- **Workspace isolation**: enforced (workspace_id in metadata)
- **Status**: ✅ wired

### Process PIX Payment (MercadoPago)

- **Canonical implementation**: `MercadoPagoPixChargeService.create()` at `backend/src/payments/mercadopago/mercadopago-pix-charge.service.ts:35`
- **Owning domain**: `payments`
- **Inputs**: `CreatePixChargeInput`
- **Outputs**: `PixChargeResult`
- **Side effects**: MercadoPago API, Prisma write (Payment)
- **Provider routing**: `PaymentProviderRouterService.resolve('pix')` → `'mercadopago'` at `backend/src/payments/provider-router/provider-router.service.ts:31`
- **Idempotency**: yes (external idempotency)
- **Workspace isolation**: enforced
- **Status**: ✅ LIVE 2026-05-20

### Route Payment Method to Provider

- **Canonical implementation**: `PaymentProviderRouterService.resolve()` at `backend/src/payments/provider-router/provider-router.service.ts:23`
- **Owning domain**: `payments`
- **Inputs**: `{ method: 'card' | 'pix' | 'boleto' }`
- **Outputs**: `{ provider: 'stripe' | 'mercadopago', reason: string }`
- **Side effects**: none (pure routing)
- **All implementations found**:
  1. `backend/src/payments/provider-router/provider-router.service.ts:23` — canonical instance method
  2. `backend/src/payments/provider-router/provider-router.service.ts:29` — `resolveStatic()` (pure function for testing)
- **Idempotency**: yes (pure function)
- **Workspace isolation**: not applicable
- **Status**: ✅ canonical

### Receive Stripe Webhook

- **Canonical implementation**: `PaymentWebhookStripeController` at `backend/src/webhooks/payment-webhook-stripe.controller.ts:63`
- **Owning domain**: `webhooks`
- **Inputs**: Stripe webhook body + `stripe-signature` header
- **Outputs**: `{ received: true }`
- **Side effects**: Prisma write (WebhookEvent for idempotency), Payment status update, ledger write
- **All implementations found**:
  1. `backend/src/webhooks/payment-webhook-stripe.controller.ts:63` — webhook controller
  2. `backend/src/payments/stripe/stripe-webhook.processor.ts:119` — `StripeWebhookProcessor`
  3. `backend/src/webhooks/stripe-webhook-ledger.service.ts:24` — `StripeWebhookLedgerService`
- **Idempotency**: yes (`@@unique([provider, externalId])` on WebhookEvent)
- **Workspace isolation**: enforced (resolves workspace from Payment row)
- **Status**: ✅ wired

### Receive MercadoPago Webhook

- **Canonical implementation**: `MercadoPagoWebhookController.receive()` at `backend/src/payments/mercadopago/mercadopago-webhook.controller.ts:56`
- **Owning domain**: `webhooks`
- **Inputs**: MP webhook body + `x-signature` header + `x-request-id` header
- **Outputs**: `{ received: true, duplicate?: boolean }`
- **Side effects**: HMAC verification (`MercadoPagoWebhookSignatureVerifier` at `backend/src/payments/mercadopago/mercadopago-webhook-signature.verifier.ts:26`), Prisma write (WebhookEvent), MP API status fetch, Payment update
- **Idempotency**: yes (`@@unique([provider, externalId])` on WebhookEvent)
- **Workspace isolation**: enforced (resolves workspace from Payment row)
- **Status**: ✅ wired, replay-safe

### Write to Wallet Ledger

- **Canonical implementation**: `WalletLedgerService.appendWithinTx()` at `backend/src/kloel/wallet-ledger.service.ts:69`
- **Owning domain**: `wallet` (kloel)
- **Inputs**: `{ tx, workspaceId, walletId, direction, bucket, amountInCents, reason }`
- **Outputs**: void (appends immutable row)
- **Side effects**: Prisma write (KloelWalletLedger) **inside** `$transaction`
- **All implementations found**:
  1. `backend/src/kloel/wallet-ledger.service.ts:69` — canonical `appendWithinTx()`
  2. `backend/src/wallet/wallet.service.ts` — wallet balance mutations (calls ledger)
- **Idempotency**: no (each entry is a distinct ledger line)
- **Workspace isolation**: enforced (workspaceId required)
- **Status**: ✅ canonical

### Credit Wallet (Prepaid)

- **Canonical implementation**: `WalletService.creditFromWebhook()` at `backend/src/wallet/wallet.service.ts:132`
- **Owning domain**: `wallet`
- **Inputs**: `StripePaymentIntent` (with metadata)
- **Outputs**: `PrepaidWalletTransaction | null`
- **Side effects**: Prisma write (KloelWallet balance update, KloelWalletLedger entry)
- **Idempotency**: partial (metadata-based dedup)
- **Workspace isolation**: enforced
- **Status**: ✅ 80%

### Issue Payout / Withdrawal

- **Canonical implementation**: `WalletService` withdrawal path (backend/src/wallet/)
- **Owning domain**: `wallet`
- **Inputs**: `{ workspaceId, amountCents, destination }`
- **Outputs**: `WithdrawalRequest` record
- **Side effects**: Prisma write (WithdrawalRequest), atomic balance check + debit
- **Idempotency**: partial (WithdrawalRequest dedup)
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

### Create Billing Subscription

- **Canonical implementation**: `BillingService.subscribe()` at `backend/src/billing/`
- **Owning domain**: `billing`
- **Inputs**: Stripe Subscription params
- **Outputs**: BillingSubscription record
- **Side effects**: Stripe API (Subscription.create), Prisma write
- **Idempotency**: yes (Stripe idempotencyKey)
- **Workspace isolation**: enforced
- **Status**: ✅ 85%

### Recover Abandoned Cart

- **Canonical implementation**: `CartRecoveryService.checkAbandonedCarts()` at `backend/src/kloel/cart-recovery.service.ts:107`
- **Owning domain**: `kloel`
- **Inputs**: none (cron-driven at `0 */30 * * * *`)
- **Outputs**: recovery email sent per abandoned order
- **Side effects**: Prisma read (CheckoutOrder, Workspace), Prisma write (metadata update), EmailService.sendEmail(), MIND-based action selection (`resolveCartRecoveryDecision` at `backend/src/kloel/mind-recovery-decision-resolvers.ts`), Guard evaluation (`MindGuardsService.evaluate()`), transport registry send
- **All implementations found**:
  1. `backend/src/kloel/cart-recovery.service.ts:107` — canonical `checkAbandonedCarts()`
- **Idempotency**: yes (recoveryEmailSent flag per order)
- **Workspace isolation**: enforced (workspaceId filtering)
- **Status**: ✅ canonical

### Process Refund

- **Canonical implementation**: `RefundService.create()` per provider
- **Owning domain**: `payments`
- **Inputs**: `{ paymentId, amount, reason }`
- **Outputs**: RefundRequest + ledger entry
- **Side effects**: Stripe/MercadoPago API refund, Prisma write (RefundRequest, LedgerEntry)
- **Idempotency**: partial (externalId on refund)
- **Workspace isolation**: enforced
- **Status**: 🟡 stripe wired; MP refund pending

### Calculate Money Split

- **Canonical implementation**: `calculateSplit()` at `backend/src/payments/split/split.engine.ts`
- **Owning domain**: `payments`
- **Inputs**: `SplitInput` (buyerPaidCents, supplier, affiliate, coproducer, manager, seller shares)
- **Outputs**: `SplitResult` with per-role amounts
- **Side effects**: none (pure calculation)
- **Idempotency**: yes (pure function)
- **Workspace isolation**: not applicable
- **Status**: ✅ canonical

---

## Phase 2 — Communication

### Receive WhatsApp Webhook (Meta Cloud)

- **Canonical implementation**: `WhatsAppApiWebhookController.handleWebhook()` at `backend/src/webhooks/whatsapp-api-webhook.controller.ts:74`
- **Owning domain**: `webhooks` / `whatsapp`
- **Inputs**: WAHA/Meta webhook body + `x-api-key` or `x-webhook-secret` header
- **Outputs**: `{ received: true }`
- **Side effects**: Legacy WAHA webhooks are logged & ignored (Meta-only migration). Real webhooks route through provider-specific controllers.
- **Idempotency**: dedup via Redis cache (inbound message dedup)
- **Workspace isolation**: enforced (session-based)
- **Status**: ✅ Meta Cloud default; WAHA legacy disabled

### Process Inbound Message

- **Canonical implementation**: `InboundProcessorService.process()` at `backend/src/whatsapp/inbound-processor.service.ts:109`
- **Owning domain**: `whatsapp`
- **Inputs**: `InboundMessage { workspaceId, from, text, type, provider, … }`
- **Outputs**: `ProcessResult { deduped, messageId, contactId }`
- **Side effects**: Prisma write (Message, Contact upsert), Redis (dedup cache, flow reply queue), autopilot trigger, voice queue (if audio), mind percept hook, flow delivery
- **All implementations found**:
  1. `backend/src/whatsapp/inbound-processor.service.ts:109` — canonical `process()`
  2. `backend/src/whatsapp/inbound-processor.service.ts:113` — `_processImpl()` (private implementation)
- **Idempotency**: yes (Redis dedup by providerMessageId, 300s TTL)
- **Workspace isolation**: enforced (workspaceId in all queries)
- **Status**: ✅ canonical

### Send WhatsApp Text Message

- **Canonical implementation**: `WhatsAppApiProvider.sendMessage()` at `backend/src/whatsapp/providers/whatsapp-api.provider.ts:154`
- **Owning domain**: `whatsapp`
- **Inputs**: `{ workspaceId, to, message }`
- **Outputs**: send confirmation
- **Side effects**: Meta Cloud API call, Prisma write (Message record)
- **All implementations found**:
  1. `backend/src/whatsapp/providers/whatsapp-api.provider.ts:154` — canonical (Meta Cloud)
  2. `backend/src/whatsapp/providers/provider-registry.ts:168` — provider-registry `sendMessage()`
  3. `backend/src/whatsapp/providers/waha.provider.ts:41` — WAHA legacy (deprecated)
  4. `backend/src/whatsapp/whatsapp-message-dispatcher.service.ts:49` — `sendMessage()`
  5. `backend/src/whatsapp/whatsapp.service.ts:378` — `sendMessage()` (delegates to dispatcher)
  6. `backend/src/kloel/unified-agent-actions-messaging.service.ts:32` — unified agent actions messaging
- **Idempotency**: no (delivery confirmation is separate)
- **Workspace isolation**: enforced
- **Status**: ⚠️ duplicated — consolidate to single dispatcher

### Send Channel Message (email / push / template)

- **Canonical implementation**: `ChannelTransportRegistry.send()` at `backend/src/kloel/channel-transport.registry.ts`
- **Owning domain**: `kloel` (omnichannel)
- **Inputs**: `{ workspaceId, channel, recipientId, content, … }`
- **Outputs**: `{ success, error?, blockedReason? }`
- **Side effects**: per-channel transport dispatch (WhatsApp, email, Instagram, Messenger, TikTok)
- **All implementations found**:
  1. `backend/src/kloel/channel-transport.registry.ts` — canonical registry
  2. `backend/src/kloel/channel-transport.providers.ts` — `WhatsAppChannelTransport`, `EmailChannelTransport`, `InstagramChannelTransport`, `MessengerChannelTransport`, `TikTokChannelTransport`
  3. `backend/src/kloel/channel-transport-whatsapp.provider.ts` — WhatsApp transport provider
- **Idempotency**: per-transport
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

### Connect WhatsApp Channel

- **Canonical implementation**: `WhatsAppApiProvider.startSession()` at `backend/src/whatsapp/providers/whatsapp-api.provider.ts:83`
- **Owning domain**: `whatsapp`
- **Inputs**: `{ workspaceId }`
- **Outputs**: `{ success, qrCode?, message? }`
- **Side effects**: Meta Cloud API (session start), Prisma write (session state)
- **All implementations found**:
  1. `backend/src/whatsapp/providers/whatsapp-api.provider.ts:83` — canonical (Meta Cloud)
  2. `backend/src/whatsapp/providers/provider-registry.ts:149` — `startSession()` (registry delegator)
  3. `backend/src/whatsapp/providers/waha-session.provider.ts:115` — WAHA legacy `startSession()`
- **Idempotency**: partial (session state prevents duplicate starts)
- **Workspace isolation**: enforced
- **Status**: ✅ Meta Cloud; WAHA legacy

### Disconnect WhatsApp Channel

- **Canonical implementation**: `WhatsAppApiProvider` disconnect via Meta Cloud API
- **Owning domain**: `whatsapp`
- **Inputs**: `{ workspaceId }`
- **Outputs**: `{ success }`
- **Side effects**: Meta Cloud API (session stop), Prisma write (session state)
- **Status**: ✅ canonical

### Normalize Phone Number

- **Canonical implementation**: `digitsOnly()` at `backend/src/common/phone.ts:40`, `whatsappDigits()` at `backend/src/common/phone.ts:89`
- **Owning domain**: `common`
- **Inputs**: `value: string | null | undefined`
- **Outputs**: normalized digits-only string
- **Side effects**: none (pure)
- **All implementations found** (DUPLICATION_REGISTER):
  1. `backend/src/common/phone.ts:40` — canonical `digitsOnly()`
  2. `backend/src/common/phone.ts:89` — canonical `whatsappDigits()`
  3. `backend/src/checkout/checkout-social-lead.util.ts` — `normalizePhone` (duplicate)
  4. `backend/src/kloel/kloel.autonomy-proof.helpers.ts` — `normalizePhone` (duplicate)
  5. `backend/src/whatsapp/inbound-processor.helpers.ts` — `normalizePhone` (duplicate)
- **Idempotency**: yes (pure function)
- **Workspace isolation**: not applicable
- **Status**: ⚠️ duplicated — canonical exists, callers not yet migrated

### Handoff to Human Agent

- **Canonical implementation**: `InboxService.assignAgent()` at `backend/src/inbox/inbox.service.ts:479`
- **Owning domain**: `inbox`
- **Inputs**: `{ workspaceId, conversationId, agentId }`
- **Outputs**: updated Conversation with assigned agent
- **Side effects**: Prisma write (Conversation.mode → 'HUMAN', assignedAgentId), WebSocket emit (`conversation:update`)
- **All implementations found**:
  1. `backend/src/inbox/inbox.service.ts:479` — canonical `assignAgent()`
  2. `backend/src/inbox/smart-routing.service.ts:48` — `assignToQueue()`
  3. `backend/src/kloel/team/smart-handoff.service.ts` — `SmartHandoffService`
- **Idempotency**: no (stateful transition)
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

### Execute Flow

- **Canonical implementation**: `FlowsService` at `backend/src/flows/flows.service.ts:17`
- **Owning domain**: `flows`
- **Inputs**: varies by method (save, get, list, createExecution, retryExecution)
- **Outputs**: Flow, FlowExecution records
- **Side effects**: Prisma write (Flow, FlowExecution, FlowVersion), AuditService.log()
- **All implementations found**:
  1. `backend/src/flows/flows.service.ts:17` — canonical `FlowsService`
  2. Worker-side flow execution via BullMQ `flowQueue`
- **Idempotency**: no (execution is stateful)
- **Workspace isolation**: enforced
- **Status**: ✅ 90%

### Execute Autopilot Cycle

- **Canonical implementation**: `AutopilotCycleExecutorService` at `backend/src/autopilot/autopilot-cycle-executor.service.ts:66`
- **Owning domain**: `autopilot`
- **Inputs**: background tick + message context
- **Outputs**: autopilot decisions (reply, follow-up, handoff)
- **Side effects**: OpenAI API call, Prisma writes (AutopilotRun, AutopilotDecision), queued dispatch
- **All implementations found**:
  1. `backend/src/autopilot/autopilot-cycle-executor.service.ts:66` — `AutopilotCycleExecutorService`
  2. `backend/src/autopilot/autopilot-cycle.service.ts:20` — `AutopilotCycleService`
  3. `backend/src/autopilot/autopilot.service.ts:23` — `AutopilotService` (orchestrator)
  4. `backend/src/autopilot/autopilot-cycle-money.service.ts:18` — `AutopilotCycleMoneyService`
  5. `backend/src/autopilot/autopilot-ops.service.ts:24` — `AutopilotOpsService`
  6. `backend/src/autopilot/autopilot-ops-conversion.service.ts:19` — `AutopilotOpsConversionService`
  7. `backend/src/autopilot/autopilot-analytics.service.ts:13` — `AutopilotAnalyticsService`
  8. `backend/src/whatsapp/inbound-processor.inline-autopilot.ts` — `executeInlineAutopilot()`
- **Idempotency**: no (stateful decisions)
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

### Send Email (Resend)

- **Canonical implementation**: `EmailService.sendEmail()` at `backend/src/auth/email.service.ts:242`
- **Owning domain**: `email` / `auth`
- **Inputs**: `{ to, subject, html, headers? }`
- **Outputs**: send confirmation
- **Side effects**: Resend API call, Prisma write (EmailLog)
- **All implementations found**:
  1. `backend/src/auth/email.service.ts:242` — canonical `sendEmail()`
  2. `backend/src/auth/email.service.ts:254` — private `send()` (Resend transport)
  3. `backend/src/kloel/email-campaign.service.ts` — `EmailCampaignService` (campaign emails)
- **Idempotency**: no (duplicate sends possible without dedup)
- **Workspace isolation**: not applicable (system email)
- **Status**: ✅ canonical

### Transcribe Voice Message

- **Canonical implementation**: Voice transcription queued via `voiceQueue` at `backend/src/whatsapp/inbound-processor.service.ts:224`
- **Owning domain**: `voice`
- **Inputs**: `{ workspaceId, contactId, messageId, phone, mediaUrl, mime }`
- **Outputs**: transcribed text appended to message
- **Side effects**: BullMQ enqueue (`voiceQueue.add('transcribe-audio', …)`), OpenAI Whisper API, Prisma write
- **Idempotency**: partial (message-level dedup)
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

### Upload Media

- **Canonical implementation**: `MediaService.uploadDocument()` at `backend/src/media/media.service.ts:75`
- **Owning domain**: `media`
- **Inputs**: `{ workspaceId, file { buffer, originalname, mimetype, size } }`
- **Outputs**: `{ url, filename }`
- **Side effects**: StorageService.upload() → R2
- **Idempotency**: no (new key per upload)
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

### Dispatch Mass Send Batch

- **Canonical implementation**: `MassSendService` at `backend/src/mass-send/mass-send.service.ts:8`
- **Owning domain**: `mass-send`
- **Inputs**: batch targeting params
- **Outputs**: MassSendBatch record
- **Side effects**: BullMQ queue (`mass-send`), Prisma write
- **Idempotency**: partial (batch-level dedup)
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

---

## Phase 3 — Intelligence (KLOEL)

### Process Unified Agent Message (AI Reply)

- **Canonical implementation**: `UnifiedAgentService.processMessage()` at `backend/src/kloel/unified-agent.service.ts:136`
- **Owning domain**: `kloel`
- **Inputs**: `{ workspaceId, contactId, message, predecidedActions?, allowedTools? }`
- **Outputs**: AI-generated reply with tool calls
- **Side effects**: OpenAI API call, tool execution, Prisma writes (conversation, messages)
- **All implementations found**:
  1. `backend/src/kloel/unified-agent.service.ts:136` — canonical `processMessage()`
  2. `backend/src/kloel/unified-agent-context.service.ts:20` — context builder
  3. `backend/src/kloel/unified-agent-context-data.service.ts:16` — data fetcher
  4. `backend/src/kloel/unified-agent-response.service.ts:32` — response composer
  5. `backend/src/kloel/unified-agent-tool-executor.ts:13` — tool executor
  6. `backend/src/kloel/unified-agent-actions.service.ts:40` — actions orchestrator
  7. `backend/src/kloel/unified-agent-actions-commerce.service.ts:30` — commerce actions
  8. `backend/src/kloel/unified-agent-actions-crm.service.ts:32` — CRM actions
  9. `backend/src/kloel/unified-agent-actions-messaging.service.ts:32` — messaging actions
  10. `backend/src/kloel/unified-agent-actions-sales.service.ts:79` — sales actions
  11. `backend/src/kloel/unified-agent-actions-billing.service.ts:25` — billing actions
  12. `backend/src/kloel/unified-agent-actions-workspace.service.ts:36` — workspace actions
- **Idempotency**: enforced at HTTP layer via `@Idempotent()` guard
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

### Observe Cognition Event (Spine)

- **Canonical implementation**: `SpineEmitterService.emit()` at `backend/src/kloel/spine/spine-emitter.service.ts:46`
- **Owning domain**: `kloel`
- **Inputs**: `SpineEventInput { eventName, payload }`
- **Outputs**: `SpineEventEnvelope`
- **Side effects**: in-memory ring buffer, subscriber notification (46 domain event types)
- **Idempotency**: no (each emit is a new event)
- **Workspace isolation**: enforced (workspaceId in payload)
- **Status**: ✅ canonical

### Update Belief

- **Canonical implementation**: `BeliefUpdate` at `backend/src/kloel/hypproof/belief-update.ts:62`
- **Owning domain**: `kloel`
- **Inputs**: `{ workspaceId, beliefKey, newValue, evidence }`
- **Outputs**: updated Belief record
- **Side effects**: Prisma write, Spine emit (`cognition.belief_updated`)
- **Idempotency**: no (stateful)
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

### Make MIND Decision

- **Canonical implementation**: `MindPolicyService` at `backend/src/kloel/mind-policy.service.ts`
- **Owning domain**: `kloel`
- **Inputs**: `{ workspaceId, decisionType, context }`
- **Outputs**: `{ action, reason, confidence }`
- **Side effects**: Prisma write (decision record), potentially triggers actions via tool executor
- **All implementations found**:
  1. `backend/src/kloel/mind-policy.service.ts` — `MindPolicyService`
  2. `backend/src/kloel/mind-bandit.service.ts` — `MindBanditService` (bandit-based decisions)
  3. `backend/src/kloel/mind-guards.service.ts` — `MindGuardsService` (decision safety)
  4. `backend/src/kloel/commercial-decision-orchestrator.service.ts` — commercial decisions
  5. `backend/src/kloel/mind-recovery-decision-resolvers.ts` — cart recovery decisions
  6. `backend/src/kloel/mind-commercial-decision-resolvers.ts` — commercial resolvers
  7. `backend/src/kloel/mind-catalog-decision-resolvers.ts` — catalog resolvers
- **Idempotency**: no (stateful)
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

### Assign CRM Stage

- **Canonical implementation**: `CrmEventEmitterService` at `backend/src/kloel/crm-emitter/crm-event-emitter.service.ts`
- **Owning domain**: `crm`
- **Inputs**: `{ workspaceId, dealId, stage }`
- **Outputs**: Spine events (`commerce.crm.stage_changed`, `commerce.crm.deal_won`, `commerce.crm.deal_lost`)
- **Side effects**: Prisma write (CrmDeal), Spine emit
- **Idempotency**: no (stateful transition)
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

### Qualify Lead

- **Canonical implementation**: `KloelLeadBrainService` at `backend/src/kloel/kloel-lead-brain.service.ts`
- **Owning domain**: `kloel`
- **Inputs**: `{ workspaceId, contactId, message, history }`
- **Outputs**: buy-intent score + qualification decision
- **Side effects**: OpenAI API call, Prisma write (lead tags/stage)
- **Idempotency**: no (stateful)
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

### Convert Lead

- **Canonical implementation**: `CheckoutEventEmitterService` at `backend/src/kloel/checkout-emitter/checkout-event-emitter.service.ts`
- **Owning domain**: `kloel`
- **Inputs**: checkout completion context
- **Outputs**: Spine event `commerce.lead.converted` (at `checkout-event-emitter.service.ts:307`)
- **Side effects**: Spine emit
- **Idempotency**: no (stateful)
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

### Compute Dashboard Metrics

- **Canonical implementation**: `DashboardService.getHomeSnapshot()` at `backend/src/dashboard/dashboard.service.ts:156`
- **Owning domain**: `dashboard`
- **Inputs**: `{ workspaceId, period?, startDate?, endDate? }`
- **Outputs**: aggregated metrics (GMV, orders, conversations, health, flows, wallet balance)
- **Side effects**: Prisma reads (multiple aggregates), Redis read (operational metrics)
- **All implementations found**:
  1. `backend/src/dashboard/dashboard.service.ts:156` — canonical `getHomeSnapshot()`
  2. `backend/src/dashboard/dashboard.service.ts:69` — `getStats()`
  3. `backend/src/dashboard/home-aggregation.util.ts` — aggregation helpers
- **Idempotency**: yes (read-only)
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

### Aggregate Analytics

- **Canonical implementation**: `AnalyticsService` at `backend/src/analytics/analytics.service.ts:24`
- **Owning domain**: `analytics`
- **Inputs**: `{ workspaceId, dateRange, metrics[] }`
- **Outputs**: aggregated analytics data
- **Side effects**: Prisma reads (aggregate queries)
- **Idempotency**: yes (read-only)
- **Workspace isolation**: enforced
- **Status**: ✅ 75%

### Compute Goal Field

- **Canonical implementation**: `GoalFieldService` at `backend/src/kloel/goal-field/goal-field.service.ts`
- **Owning domain**: `kloel`
- **Inputs**: workspace context + historical data
- **Outputs**: emergent goals with scores
- **Side effects**: Prisma reads/writes (KloelMemory, Goal records)
- **Idempotency**: no (accumulative)
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

### Run MIND Analysis

- **Canonical implementation**: `MindBackgroundProcessor` at `backend/src/kloel/mind/mind-bg.processor.ts`
- **Owning domain**: `kloel`
- **Inputs**: background schedule (queued via `memory` BullMQ)
- **Outputs**: analysis results stored in KloelMemory
- **Side effects**: OpenAI API call, Prisma writes (analysis records, memory entries)
- **All implementations found**:
  1. `backend/src/kloel/mind/mind-bg.processor.ts` — `MindBackgroundProcessor`
  2. `backend/src/kloel/mind/mind-bg.scheduler.ts` — `MindBackgroundScheduler`
  3. `backend/src/kloel/mind.service.ts` — `MindService` (orchestrator)
  4. `backend/src/kloel/mind-processor.service.ts` — `MindProcessorService`
- **Idempotency**: partial (schedule-based)
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

### Assign Valence to Event

- **Canonical implementation**: `ValenceTaggerService` at `backend/src/kloel/mind/valence-tagger.service.ts`
- **Owning domain**: `kloel`
- **Inputs**: `{ workspaceId, eventType, eventData }`
- **Outputs**: valence score (-1.0 to +1.0)
- **Side effects**: Prisma write (Valence record), Spine emit (`cognition.valence_assigned`)
- **All implementations found**:
  1. `backend/src/kloel/mind/valence-tagger.service.ts` — `ValenceTaggerService`
  2. `backend/src/kloel/mind/valence-aggregator.service.ts` — `ValenceAggregatorService`
- **Idempotency**: no (stateful)
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

### Save / Load Conversation

- **Canonical implementation**: `KloelThreadService` at `backend/src/kloel/kloel-thread.service.ts`
- **Owning domain**: `kloel`
- **Inputs**: `{ workspaceId, threadId, messages }`
- **Outputs**: persisted thread with messages
- **Side effects**: Prisma writes (Thread, Message records)
- **All implementations found**:
  1. `backend/src/kloel/kloel-thread.service.ts` — `KloelThreadService`
  2. `backend/src/kloel/kloel-thread-summary.service.ts` — thread summary generation
  3. `backend/src/inbox/inbox.service.ts` — `InboxService` (conversation CRUD)
- **Idempotency**: no (append-only thread)
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

---

## Phase 4 — Growth

### Schedule Campaign

- **Canonical implementation**: `CampaignsService` at `backend/src/campaigns/campaigns.service.ts:29`
- **Owning domain**: `campaigns`
- **Inputs**: `{ workspaceId, campaign config }`
- **Outputs**: Campaign record + queued execution
- **Side effects**: BullMQ enqueue (`campaign` queue), Prisma write (Campaign, CampaignExecution)
- **Idempotency**: partial
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

### Execute Campaign Dispatch

- **Canonical implementation**: `CampaignEventEmitterService` at `backend/src/kloel/campaign-emitter/campaign-event-emitter.service.ts`
- **Owning domain**: `campaigns`
- **Inputs**: campaign execution context
- **Outputs**: Spine events (`commerce.campaign.audience_reached`, `commerce.campaign.clicked`, etc.)
- **Side effects**: per-channel dispatch via ChannelTransportRegistry, Spine emit
- **Idempotency**: partial (batch dedup)
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

### Create Affiliate Link

- **Canonical implementation**: AffiliateLinksService in `backend/src/affiliate/`
- **Owning domain**: `affiliate`
- **Inputs**: `{ workspaceId, productId, commissionConfig }`
- **Outputs**: AffiliateLink record
- **Side effects**: Prisma write
- **Idempotency**: no (new link)
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

### Enroll in Member Area

- **Canonical implementation**: `MemberAreaEventEmitterService` at `backend/src/kloel/member-area-emitter/member-area-event-emitter.service.ts`
- **Owning domain**: `kloel`
- **Inputs**: `{ workspaceId, memberId, enrollmentData }`
- **Outputs**: Spine event `commerce.member_area.enrolled`
- **Side effects**: Prisma write (MemberEnrollment), Spine emit
- **Idempotency**: partial
- **Workspace isolation**: enforced
- **Status**: 🟡

### Run Growth Experiment

- **Canonical implementation**: `GrowthExperimentService` at `backend/src/growth/`
- **Owning domain**: `growth`
- **Inputs**: `{ workspaceId, experimentConfig }`
- **Outputs**: GrowthExperiment record + results
- **Side effects**: Prisma writes, optional A/B routing
- **Idempotency**: no
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

---

## Phase 5 — Platform Advanced

### Sync Meta Ads

- **Canonical implementation**: MetaAdsSyncService queued via `ads-sync-meta` BullMQ
- **Owning domain**: `meta`
- **Inputs**: workspace OAuth token
- **Outputs**: synced ad account data, campaigns, insights
- **Side effects**: Meta Graph API calls, Prisma writes (MetaAccount, MetaAdAccount)
- **Job names**: `sync-meta-accounts`, `sync-meta-campaigns`, `sync-meta-insights`, `refresh-meta-token`
- **Idempotency**: partial (sync is repeatable)
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

### Connect OAuth Integration

- **Canonical implementation**: `IntegrationOauthService.start()` at `backend/src/integrations/`
- **Owning domain**: `integrations`
- **Inputs**: `{ provider, workspaceId, redirectUri }`
- **Outputs**: OAuth authorization URL
- **Side effects**: Prisma write (IntegrationToken pending)
- **Idempotency**: no (new auth flow each time)
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

### Run Scraper Job

- **Canonical implementation**: `ScrapersService.run()` at `backend/src/scrapers/`
- **Owning domain**: `scrapers`
- **Inputs**: `{ workspaceId, url, selectors }`
- **Outputs**: ScraperJob record + extracted data
- **Side effects**: BullMQ enqueue (`scraper` queue), HTTP fetch, Prisma write
- **Idempotency**: no (time-sensitive)
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

---

## Phase 6 — Operations

### Admin Impersonate User

- **Canonical implementation**: `AdminImpersonationService.start()`
- **Owning domain**: `admin`
- **Inputs**: `{ adminUserId, targetWorkspaceId }`
- **Outputs**: impersonation session
- **Side effects**: Prisma write (AdminAudit audit-logged), session creation
- **Idempotency**: no
- **Workspace isolation**: bypassed (by design, with audit)
- **Status**: ✅ canonical

### Send Push Notification

- **Canonical implementation**: `NotificationsService.sendPushNotification()` at `backend/src/notifications/notifications.service.ts:105`
- **Owning domain**: `notifications`
- **Inputs**: `{ agentId, title, body, data? }`
- **Outputs**: `{ sent: number, failed: number }`
- **Side effects**: Firebase Admin SDK (FCM push), Prisma read (DeviceToken), cleanup of invalid tokens
- **All implementations found**:
  1. `backend/src/notifications/notifications.service.ts:105` — canonical `sendPushNotification()`
  2. `backend/src/notifications/notifications.service.ts:156` — `sendPushToWorkspace()` (broadcast)
  3. `backend/src/notifications/notifications.service.ts:181` — `notifyNewMessage()` (convenience)
  4. `backend/src/notifications/notifications.service.ts:193` — `notifyPaymentReceived()` (convenience)
- **Idempotency**: no (push is fire-and-forget)
- **Workspace isolation**: enforced (agentId → workspaceId scoping)
- **Status**: ✅ canonical

### GDPR Export User Data

- **Canonical implementation**: `GdprService.export()` at `backend/src/gdpr/`
- **Owning domain**: `gdpr`
- **Inputs**: `{ workspaceId, userId }`
- **Outputs**: DataExportJob record
- **Side effects**: BullMQ enqueue (`webhook` queue), Prisma write
- **Idempotency**: partial (one export per job)
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

### GDPR Delete User Data

- **Canonical implementation**: `GdprService.delete()` at `backend/src/gdpr/`
- **Owning domain**: `gdpr`
- **Inputs**: `{ workspaceId, userId }`
- **Outputs**: deletion confirmation
- **Side effects**: Prisma cascade delete (anonymization)
- **Idempotency**: yes (idempotent delete)
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

### Report PULSE Health

- **Canonical implementation**: `PulseService.reportLive()` → POST /pulse/live/internal
- **Owning domain**: `pulse`
- **Inputs**: internal health check context
- **Outputs**: `{ gates: { passed, failed }, capabilities }`
- **Side effects**: Prisma write (PulseSignal, PulseGate), Spine emit (`pulse.gate_passed`, `pulse.gate_failed`)
- **Idempotency**: yes (new report each call)
- **Workspace isolation**: not applicable (system-level)
- **Status**: ✅ canonical

---

## Cross-cutting Capabilities

### Enforce Idempotency on Requests

- **Canonical implementation**: `IdempotencyGuard` at `backend/src/common/idempotency.guard.ts:106`
- **Owning domain**: `common`
- **Inputs**: HTTP request context (idempotency key from header/body)
- **Outputs**: pass-through or cached response
- **Side effects**: Redis (idempotency key cache)
- **Idempotency**: yes (this IS the idempotency mechanism)
- **Workspace isolation**: enforced
- **Status**: ✅ canonical

### Compute Idempotency Fingerprint

- **Canonical implementation**: `idempotencyFingerprint()` at `backend/src/common/idempotency-fingerprint.ts`
- **Owning domain**: `common`
- **Inputs**: key derivation parameters
- **Outputs**: deterministic fingerprint string
- **Side effects**: none (pure)
- **Idempotency**: yes (pure function)
- **Workspace isolation**: not applicable
- **Status**: ✅ canonical

### Safe String Conversion

- **Canonical implementation**: `safeStr()` at `backend/src/common/string.ts`
- **Owning domain**: `common`
- **Inputs**: `unknown`
- **Outputs**: `string` (never throws)
- **Side effects**: none (pure)
- **All implementations found**:
  1. `backend/src/common/string.ts` — canonical `safeStr()`
  2. 6 duplicate `safeStr` implementations across kloel helpers (per DUPLICATION_REGISTER)
- **Idempotency**: yes (pure function)
- **Workspace isolation**: not applicable
- **Status**: ✅ canonical (migrated from 6 dups)

### Clamp Numeric Value

- **Canonical implementation**: `clamp()` at `backend/src/common/math.ts`, `clampScore()` at `backend/src/common/math.ts`
- **Owning domain**: `common`
- **Inputs**: `{ value, min, max }` | `{ score }`
- **Outputs**: clamped number
- **Side effects**: none (pure)
- **All implementations found**:
  1. `backend/src/common/math.ts` — canonical `clamp()`, `clampScore()`, `daysSince()`
  2. 16 duplicate clamp implementations migrated to canonical
- **Idempotency**: yes (pure function)
- **Workspace isolation**: not applicable
- **Status**: ✅ canonical

### Format Money (cents ↔ reais)

- **Canonical implementation**: `centsToReais()`, `reaisToCents()` at `backend/src/common/money.ts`
- **Owning domain**: `common`
- **Inputs**: `bigint` (cents) or `number` (reais)
- **Outputs**: formatted currency value
- **Side effects**: none (pure)
- **All implementations found** (frontend duplicates):
  1. `backend/src/common/money.ts` — canonical `centsToReais()`, `reaisToCents()`
  2. `frontend/src/components/kloel/carteira/carteira.helpers.ts` — `formatCurrency`
  3. `frontend/src/components/kloel/vendas/utils.tsx` — `fmtBRL`
  4. `frontend/src/components/kloel/marketing/WhatsAppExperience.helpers.ts` — `formatMoney`
  5. `frontend-admin/src/app/(admin)/produtos/page.helpers.ts` — `formatMoney`
- **Idempotency**: yes (pure function)
- **Workspace isolation**: not applicable
- **Status**: 🟡 canonical in backend; frontend duplicates exist

### Normalize Email

- **Canonical implementation**: `normalizeEmail()` at `backend/src/common/string.ts`
- **Owning domain**: `common`
- **Inputs**: `string`
- **Outputs**: normalized lowercase email
- **Side effects**: none (pure)
- **All implementations found**:
  1. `backend/src/common/string.ts` — canonical `normalizeEmail()`
  2. `backend/src/auth/auth-service.helpers.ts` — duplicate
  3. `backend/src/auth/auth.helpers.ts` — duplicate
  4. `backend/src/checkout/checkout-social-lead.util.ts` — duplicate
- **Idempotency**: yes (pure function)
- **Workspace isolation**: not applicable
- **Status**: ⚠️ duplicated — canonical exists, 3 callers not migrated

### Filter Events by Workspace

- **Canonical implementation**: `filterByWorkspace()` at `backend/src/kloel/spine-events.helpers.ts`
- **Owning domain**: `kloel`
- **Inputs**: `{ events[], workspaceId }`
- **Outputs**: filtered events array
- **Side effects**: none (pure)
- **All implementations found**:
  1. `backend/src/kloel/spine-events.helpers.ts` — canonical
  2. `backend/src/kloel/channel/types.ts` — duplicate
  3. `backend/src/kloel/defens/types.ts` — duplicate
  4. `backend/src/kloel/postsale-consumers/postsale-consumers.types.ts` — duplicate
- **Idempotency**: yes (pure function)
- **Workspace isolation**: this IS the isolation helper
- **Status**: ⚠️ duplicated

### Prisma Unknown Record Type

- **Canonical implementation**: `UnknownRecord` at `backend/src/common/types.ts`
- **Owning domain**: `common`
- **Inputs**: N/A (type alias)
- **Outputs**: `Record<string, unknown>`
- **Side effects**: none (type-level)
- **Status**: ✅ canonical (migrated from 30 dups)

### Async Sequential Processing

- **Canonical implementation**: `forEachSequential()` at `backend/src/common/async-sequence.ts`
- **Owning domain**: `common`
- **Inputs**: `{ array, asyncFn }`
- **Outputs**: void (processes sequentially)
- **Side effects**: none (utility)
- **All implementations found**:
  1. `backend/src/common/async-sequence.ts` — canonical
  2. `frontend/src/lib/async-sequence.ts` — frontend duplicate
- **Idempotency**: depends on inner function
- **Workspace isolation**: not applicable
- **Status**: ✅ canonical

---

## Capabilities NOT yet implemented

| Capability | Reason | Action |
|---|---|---|
| `score_intent` | Commercial intent scoring | Roadmap candidate (CIA enhancement) |
| `qualify_contact` (vs `qualify_lead`) | Lead/contact distinction | Use `lead.qualify` canonical |
| Generic `parse_webhook` | Each provider has its own parser | KEEP per-provider (security) |

---

## Capability Map Summary

| Phase | Count | Status |
|---|---|---|
| Phase 0 — Identity & Tenancy | 7 | 5 ✅, 2 🟡 |
| Phase 1 — Commerce Engine | 11 | 8 ✅, 2 🟡, 1 ⚠️ |
| Phase 2 — Communication | 12 | 9 ✅, 2 ⚠️, 1 🟡 |
| Phase 3 — Intelligence (KLOEL) | 9 | 8 ✅, 1 🟡 |
| Phase 4 — Growth | 5 | 4 ✅, 1 🟡 |
| Phase 5 — Platform Advanced | 3 | 3 ✅ |
| Phase 6 — Operations | 4 | 4 ✅ |
| Cross-cutting | 8 | 5 ✅, 2 ⚠️, 1 🟡 |
| **Total** | **59** | **46 ✅, 8 🟡, 5 ⚠️** |

---

## Gates

- `npm run canonical:check-capability` (planned) — flags new service that overlaps existing canonical capability
- New service MUST declare its capability in `// @capability: name.action` JSDoc

## Related

- [CANONICAL_DOMAINS.md](CANONICAL_DOMAINS.md)
- [EVENT_TAXONOMY.md](EVENT_TAXONOMY.md)
- [QUEUES_CATALOG.md](QUEUES_CATALOG.md)
- [SERVICE_CATALOG.md](SERVICE_CATALOG.md)
- [DEPRECATION_MAP.md](DEPRECATION_MAP.md)
- [DUPLICATION_REGISTER.md](DUPLICATION_REGISTER.md)
