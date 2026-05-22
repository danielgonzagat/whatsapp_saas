# Kloel CIA Gap Inventory

Generated: 2026-05-11
Baseline branch: `feat/kloel-cia-convergence`

Tags: `[VERIFICADO_NO_REPO]`, `[PROVAVEL_MAS_PRECISA_CONFIRMAR]`, `[HIPOTESE_DA_VISAO]`, `[NAO_EXISTE_AINDA]`, `[EXISTE_MAS_DESLIGADO]`, `[EXISTE_MAS_INCOMPLETO]`.

## Boot / Git / Governance

- `[VERIFICADO_NO_REPO]` Current branch was created as `feat/kloel-cia-convergence` from dirty `chore/purga-total-debt`.
- `[VERIFICADO_NO_REPO]` `git status --short` already had a large accumulated diff before Wave 0, including protected files (`AGENTS.md`, `.github/workflows/deploy-production.yml`, `backend/package.json`, `backend/src/lib/openai-models.ts`, etc.).
- `[VERIFICADO_NO_REPO]` `npm run check:governance` fails because protected governance files are modified in the existing worktree. These were not changed by this Wave 0 pass.
- `[VERIFICADO_NO_REPO]` `git fetch origin main --prune` succeeded, but `git pull --ff-only` on `main` was not safe because the checkout was not on `main` and had extensive uncommitted work.

## Validation Baseline

- `[VERIFICADO_NO_REPO]` Root scripts inventory exists in `package.json`: `lint`, `typecheck`, `test`, `build`, `check:all`, `check:governance`, `check:security`, `check:architecture`, `guard:db-push`, `readiness:check`, `pulse:ci`, `pulse:*`, `backend:*`, `frontend:*`, `worker:*`.
- `[VERIFICADO_NO_REPO]` Backend scripts include `build`, `typecheck`, `lint:check`, `test`, `test:e2e`, `prisma:validate`, `prisma:generate`, `prisma:migrate`.
- `[VERIFICADO_NO_REPO]` Frontend scripts include `build`, `lint`, `typecheck`, `test`, `test:coverage`.
- `[VERIFICADO_NO_REPO]` Worker scripts include `build`, `typecheck`, `lint:check`, `test`, `test:coverage`.
- `[VERIFICADO_NO_REPO]` `npm run typecheck` fails at `backend/src/main.ts:30` with TS4114 missing `override` modifier.
- `[VERIFICADO_NO_REPO]` `npm run backend:typecheck` passed after adding the missing `override` modifier in `backend/src/main.ts`.
- `[VERIFICADO_NO_REPO]` `npm run typecheck` now fails in `frontend:typecheck`, with many frontend errors led by `exactOptionalPropertyTypes`, unused imports, missing exports (`NeuroPulse`), and unresolved `colors` references in `anuncios`/`produtos` helper files.
- `[VERIFICADO_NO_REPO]` `npm run worker:typecheck` passes.
- `[VERIFICADO_NO_REPO]` `npm run lint` fails during backend lint with 2463 errors, mostly unsafe `any`/unsafe assignment/access in specs and tests plus a smaller number of Prettier and production-code lint errors.
- `[VERIFICADO_NO_REPO]` `npm run prisma:validate` passes.
- `[VERIFICADO_NO_REPO]` `npm run guard:db-push` passes.

## Marketing Wizard / Five Channels

- `[VERIFICADO_NO_REPO]` Frontend Marketing surfaces exist: `frontend/src/components/kloel/marketing/MarketingView.tsx`, `OfficialMarketingChannelPage.tsx`, `WhatsAppMarketingTab.tsx`, `InstagramMarketingTab.tsx`, `FacebookMarketingTab.tsx`, `TikTokMarketingTab.tsx`, `EmailMarketingTab.tsx`, shared helpers.
- `[VERIFICADO_NO_REPO]` WhatsApp has a richer setup state in `frontend/src/components/kloel/marketing/WhatsAppExperience.controller.ts` with `STEPS = ['Conectar', 'Produtos', 'Arsenal', 'Configurar']` and `workspace.providerSettings.whatsappSetup`.
- `[VERIFICADO_NO_REPO]` W1 initial slice added `GET/POST /marketing/connect/channel-setup`, persisting per-channel four-step setup under `Workspace.providerSettings.marketingChannelSetup[channel]`.
- `[VERIFICADO_NO_REPO]` W1 initial slice updated `frontend/src/components/kloel/marketing/OfficialMarketingChannelPage.tsx` to render a persistent four-step bar (`Conexão`, `Produtos`, `Arsenal`, `Configuração`) for all five official channel routes, with products, arsenal and operational config saved through the real backend endpoint.
- `[VERIFICADO_NO_REPO]` W1 Playwright proof passes for all five official channel routes at 1024px and 380px and verifies product-step persistence through `connect/channel-setup` after reload.
- `[EXISTE_MAS_INCOMPLETO]` No explicit Prisma models named `ChannelSetup`, `ChannelProduct`, `ChannelArsenal`, or `ChannelConfig` were found. The W1 initial slice deliberately extends the repo's existing `Workspace.providerSettings` pattern instead of creating parallel schema.
- `[EXISTE_MAS_INCOMPLETO]` Backend Marketing surfaces exist: `backend/src/marketing/marketing-connect.controller.ts`, `email-marketing.controller.ts`, `facebook-messenger.controller.ts`, `instagram/instagram-marketing.controller.ts`, `tiktok-marketing.controller.ts`.
- Blocks: V05, V06, V07.

## Meta OAuth / WhatsApp / Instagram / Facebook

- `[VERIFICADO_NO_REPO]` Meta OAuth/status/disconnect code exists in `backend/src/meta/meta-auth.controller.ts`.
- `[VERIFICADO_NO_REPO]` Meta OAuth URL construction exists in `backend/src/meta/meta-whatsapp.service.ts`.
- `[VERIFICADO_NO_REPO]` W2 patch changed `MetaWhatsAppService.buildEmbeddedSignupUrl` to use channel-specific Config IDs (`META_CONFIG_ID_WHATSAPP`, `META_CONFIG_ID_INSTAGRAM`, `META_CONFIG_ID_MESSENGER` with safe fallbacks), channel-specific minimal scopes, `redirect_uri = getPublicBackendBaseUrl() + /meta/auth/callback`, and JSON `state` with `workspaceId`, normalized `channel`, and `returnTo`.
- `[VERIFICADO_NO_REPO]` W2 tests prove WhatsApp URL uses the WhatsApp Config ID, strips trailing slash from `BACKEND_PUBLIC_URL`, includes Embedded Signup extras, and does not request `instagram_content_publish` or `catalog_management`; Instagram URL uses the Instagram Config ID and does not request WhatsApp scopes.
- `[VERIFICADO_NO_REPO]` W2 patch added `facebook` channel status alias to `/meta/auth/status`, preserving existing `messenger` alias while matching the official Marketing channel key.
- `[VERIFICADO_NO_REPO]` `getPublicBackendBaseUrl()` resolves `BACKEND_PUBLIC_URL`, `APP_URL`, `BACKEND_URL`, `NEXT_PUBLIC_API_URL`, or `RAILWAY_PUBLIC_DOMAIN`, then falls back to `http://localhost:3001`. This makes env canonicalization a W2 risk if production envs disagree.
- `[VERIFICADO_NO_REPO]` `MetaAuthController.handleCallback` exchanges the OAuth code, fetches pages, Instagram business account, ad accounts, discovers WhatsApp assets, and upserts `MetaConnection`.
- `[VERIFICADO_NO_REPO]` External smoke without credentials: `https://api.kloel.com/meta/auth/callback` returns controlled `302` to frontend with `meta=error&reason=missing_params`, proving the callback path is externally reachable; `https://api.kloel.com/webhooks/meta?...invalid...` returns `403`, proving the verify path rejects invalid tokens.
- `[VERIFICADO_NO_REPO]` Meta webhook receivers exist in `backend/src/meta/webhooks/meta-webhook.controller.ts` and `backend/src/meta/meta-webhook.controller.ts`.
- `[VERIFICADO_NO_REPO]` W2 webhook hardening now rejects unsigned Meta webhook POSTs when `META_APP_SECRET` is configured in both the core Meta webhook controller and the marketing Meta webhook controller. Focused Jest proof covers missing-signature rejection without touching Redis/DB.
- `[VERIFICADO_NO_REPO]` `backend/src/meta/webhooks/meta-webhook.controller.ts` routes Instagram and Messenger/Page events through `OmnichannelService`; WhatsApp Cloud messages route through `InboundProcessorService` and status events update `Message`.
- `[EXISTE_MAS_INCOMPLETO]` Meta webhook signature validation is conditional: when `META_APP_SECRET` and signature are present, invalid signatures are rejected; if the secret/header is absent, the webhook can proceed. W2/W8 must prove production env sets `META_APP_SECRET` and signatures are enforced.
- `[VERIFICADO_NO_REPO]` `MetaConnection` Prisma model exists and stores access/page/Instagram/WhatsApp fields in `backend/prisma/schema.prisma`.
- `[EXISTE_MAS_INCOMPLETO]` Tokens are encrypted by `backend/src/integrations/meta-token-crypto.ts` only when `META_TOKEN_ENCRYPTION_KEY` is set. Without that env, encryption/decryption helpers return plaintext for compatibility. W2/W8 must prove the env exists in production before claiming S2.
- `[PROVAVEL_MAS_PRECISA_CONFIRMAR]` `RAILWAY_TOKEN` and `VERCEL_TOKEN` are not present in the orchestrator environment, so live Railway/Vercel env inventory could not be completed without printing or handling secrets.
- `[PROVAVEL_MAS_PRECISA_CONFIRMAR]` `META_TEST_ACCESS_TOKEN` is not present in the orchestrator environment, so Graph API step 10 was not run from shell without exposing the token pasted in chat.
- Blocks: V10, V13.

## TikTok

- `[VERIFICADO_NO_REPO]` TikTok marketing backend files exist: `backend/src/marketing/tiktok-marketing.controller.ts`, `tiktok-marketing.service.ts`, `tiktok-ads.service.ts`.
- `[VERIFICADO_NO_REPO]` TikTok status/OAuth endpoints exist under `/marketing/connect/tiktok/status`, `/marketing/connect/tiktok/url`, and `/marketing/connect/tiktok/complete`; tokens are persisted in `workspace.providerSettings.tiktok` rather than a dedicated provider connection model.
- `[VERIFICADO_NO_REPO]` TikTok webhook receiver exists at `backend/src/webhooks/tiktok-webhook.controller.ts`; it validates `TikTok-Signature` when present but accepts unsigned portal probes when the signature header is absent.
- `[VERIFICADO_NO_REPO]` W3 slice now rejects unsigned or malformed TikTok webhook writes when `TIKTOK_CLIENT_SECRET` is configured, while preserving unsigned Developer Portal probes only when the secret is not configured. Focused Jest proof passes.
- `[VERIFICADO_NO_REPO]` W3 slice added `POST /marketing/connect/tiktok/disconnect`, clearing `workspace.providerSettings.tiktok`.
- `[VERIFICADO_NO_REPO]` Frontend tab exists at `frontend/src/components/kloel/marketing/TikTokMarketingTab.tsx`.
- `[EXISTE_MAS_INCOMPLETO]` OAuth/live platform status is not proven, frontend disconnect is not wired yet, and TikTok inbound is still audit-only (not inbox/CIA) until a W5 adapter is implemented.
- Blocks: V11.

## Email

- `[VERIFICADO_NO_REPO]` Email campaign surfaces exist: `backend/src/marketing/email-marketing.controller.ts`, `email-marketing.service.ts`, `email-marketing-webhook.controller.ts`, `EmailCampaign`, `EmailCampaignRecipient`, `EmailCampaignDelivery` models.
- `[VERIFICADO_NO_REPO]` EMAIL-0 OpenCode discovery run `artifacts/opencode-fleet/kloel-cia-w2-discovery-2026-05-11/w4-email-current-state.out` completed successfully and is accepted as read-only evidence after local spot-checks.
- `[VERIFICADO_NO_REPO]` Email campaign coverage remains: `EmailCampaign`, `EmailCampaignRecipient`, `EmailCampaignDelivery`, `EmailCampaignStatus`, `EmailRecipientStatus`, and `EmailDeliveryEvent`.
- `[EXISTE_MAS_DESLIGADO]` `EmailMarketingController`, `EmailMarketingWebhookController`, and `EmailMarketingService` implement campaign CRUD/delivery tracking/webhook reconciliation, but the current `backend/src/marketing/marketing.module.ts` does not register them, so that tracked campaign surface is structurally dead from Nest DI until wired.
- `[VERIFICADO_NO_REPO]` Worker fallback email exists at `worker/fallback-email.helpers.ts`.
- `[VERIFICADO_NO_REPO]` `backend/src/marketing/marketing-connect.controller.ts` currently connects Email by updating `workspace.providerSettings.email.enabled` and resolving a backend sender provider (`resend`, `sendgrid`, `smtp`, or `log`). The default sender path is Kloel/provider-owned, not a customer mailbox.
- `[VERIFICADO_NO_REPO]` Worker email dispatch uses process-level SMTP settings (`MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`) in `worker/providers/email-provider.ts` and `worker/providers/channel-dispatcher.ts`.
- `[VERIFICADO_NO_REPO]` Autopilot can fall back to Email in `worker/processors/autopilot/execution-dispatcher.ts`, but that path calls the generic SMTP dispatcher and records an `EMAIL` fallback message; it is not customer Gmail/Microsoft/IMAP mailbox ownership.
- `[NAO_EXISTE_AINDA]` No inbound mailbox processing exists for Gmail Pub/Sub, Microsoft Graph notifications, IMAP IDLE/polling, parsed inbound email, mailbox-to-inbox adapter, or mailbox-to-CIA bridge.
- `[VERIFICADO_NO_REPO]` EMAIL-1 schema/security slice now adds `MailboxProvider`, `MailboxStatus`, and `MailboxConnection` related to `Workspace`, with separated encrypted-token fields for OAuth access/refresh tokens and IMAP/SMTP credentials. No production migration was applied.
- `[VERIFICADO_NO_REPO]` EMAIL-1 adds `backend/src/marketing/mailbox-token-crypto.ts`, using AES-256-GCM versioned ciphertext with `EMAIL_TOKEN_ENCRYPTION_KEY`, plus focused tests.
- `[VERIFICADO_NO_REPO]` EMAIL-2 adds the Gmail OAuth base: `MailboxGmailOAuthService`, public signed-state callback, authenticated `GET /marketing/connect/email/gmail/auth-url`, authenticated `POST /marketing/connect/email/gmail/complete`, and Email status now reflects an active Gmail `MailboxConnection`.
- `[VERIFICADO_NO_REPO]` EMAIL-3 adds authenticated manual Gmail sync via `POST /marketing/connect/email/gmail/sync`: refreshes access token when needed, lists recent Gmail messages, fetches full message payloads, deduplicates by synced message id in mailbox metadata, and writes normalized `EMAIL` messages through `OmnichannelService`.
- `[VERIFICADO_NO_REPO]` EMAIL-4 adds basic Gmail outbound through the connected customer mailbox: `POST /marketing/connect/email/gmail/send-test` builds a Gmail MIME payload, sends through Gmail API `users/me/messages/send`, and adds `List-Unsubscribe` plus Kloel unsubscribe footer for proactive sends.
- `[VERIFICADO_NO_REPO]` EMAIL-5/6 bridge: Omnichannel marks inbound messages as reactive, and `UnifiedAgentActionsMessagingService.actionSendMessage()` routes `channel=email` sends through `MailboxGmailOAuthService.sendMessageFromMailbox()` while preserving WhatsApp routing for `channel=whatsapp`.
- `[VERIFICADO_NO_REPO]` EMAIL-7 adds Microsoft OAuth code-side parity: `MailboxMicrosoftOAuthService`, public signed-state callback, authenticated `GET /marketing/connect/email/microsoft/auth-url`, authenticated `POST /marketing/connect/email/microsoft/complete`, encrypted token persistence under `MailboxProvider.MICROSOFT`, and Email status overlay for an active Microsoft mailbox.
- `[VERIFICADO_NO_REPO]` EMAIL-8 adds IMAP+SMTP code-side connection base: `MailboxImapSmtpService` validates IMAP/SMTP connectivity before persistence, stores encrypted IMAP/SMTP passwords under `MailboxProvider.IMAP_SMTP`, and exposes `POST /marketing/connect/email/imap-smtp/connect` plus status overlay.
- `[VERIFICADO_NO_REPO]` EMAIL-9 compliance base: proactive Gmail mailbox sends consult real `Contact.optIn=false` suppressions before mailbox lookup/provider send and return `status: suppressed` without calling Gmail.
- `[VERIFICADO_NO_REPO]` EMAIL-10 observability base: `backend/src/observability/metrics.ts` adds mailbox counters/histograms for connected, sync completed/failed, send completed/failed, and send suppressed; Gmail emits connect/sync/send/suppression/failure metrics, while Microsoft and IMAP+SMTP emit connection metrics. Tags use provider/status/workspace and avoid email/subject/recipient PII.
- `[EXISTE_MAS_INCOMPLETO]` Email mailbox-to-inbox adapter exists for manual Gmail sync, basic Gmail outbound exists, Microsoft OAuth connection base exists, IMAP+SMTP connection storage exists, mailbox observability counters exist, and CIA `send_message` can route to Gmail when tool execution is enabled for Email; Pub/Sub/polling worker, live Gmail/Microsoft/IMAP smoke, Microsoft Graph inbound/outbound, IMAP polling/SMTP send, bounce/complaint handling, metrics dashboard/alerts, and production send-as-customer proof are still pending.
- `[EXISTE_MAS_INCOMPLETO]` Email currently is confirmed as toggle + campaign + shared-sender in the UI. EMAIL-1/2/3/4/5/6/7/8/9/10 add schema, crypto, Gmail OAuth URL/callback/token-storage base, manual Gmail inbound sync, basic Gmail outbound, CIA Email send routing, Microsoft OAuth token-storage base, IMAP+SMTP credential validation/storage, proactive opt-out suppression for Gmail sends, and mailbox metrics; Gmail/Microsoft/IMAP live smoke, broader compliance events, alerting, and full policy proof remain pending.
- Blocks: V12, V13, V15.

## Inbox / Identity

- `[VERIFICADO_NO_REPO]` Inbox frontend exists at `frontend/src/components/kloel/inbox/InboxWorkspace.tsx`, `useInboxData.ts`, `useInboxRealtime.ts`.
- `[VERIFICADO_NO_REPO]` Conversation/message models exist in `backend/prisma/schema.prisma`.
- `[VERIFICADO_NO_REPO]` Inbox backend exists in `backend/src/inbox/inbox.controller.ts` and `backend/src/inbox/inbox.service.ts`, with conversation listing, message listing, reply/assign/close actions, and `saveMessageByPhone`/`saveMessage`.
- `[VERIFICADO_NO_REPO]` `backend/src/inbox/omnichannel.service.ts` provides a generic `handleIncomingMessage` normalization entry point and an Instagram webhook adapter.
- `[EXISTE_MAS_INCOMPLETO]` Omnichannel adapters for WhatsApp/Facebook/TikTok/Email were not found in `omnichannel.service.ts` during this pass; those channels may route through separate services and still need point-by-point CIA/inbox proof.
- `[VERIFICADO_NO_REPO]` W5 OpenCode analysis confirmed TikTok webhook previously logged only `WebhookEvent` and did not call `OmnichannelService`, and confirmed frontend inbox filters omitted TikTok/Messenger.
- `[VERIFICADO_NO_REPO]` W5 implementation now adds `TIKTOK` as an Omnichannel normalized channel, `tt:` contact identifiers, `processTikTokWebhook()` adapter, TikTok webhook-to-Omnichannel routing after idempotency/audit, and frontend inbox filters for Facebook/TikTok.
- `[EXISTE_MAS_INCOMPLETO]` W5 still needs Email inbound adapter and cross-channel identity reconciliation beyond prefixed identifiers before `D-INBOX` can pass for all five channels.
- `[VERIFICADO_NO_REPO]` Identity/autopilot files exist under `worker/processors/autopilot/identity*.ts`.
- `[EXISTE_MAS_INCOMPLETO]` Cross-channel identity reconciliation has not been proven with multi-channel records.
- Blocks: V08, V09.

## CIA / Brain / Mind / Autopilot

- `[VERIFICADO_NO_REPO]` CIA backend and worker surfaces exist: `backend/src/cia/**`, `backend/src/kloel/**`, `worker/processors/cia/**`, `worker/processors/autopilot/**`.
- `[VERIFICADO_NO_REPO]` Chat persistence models exist: `ChatThread`, `ChatMessage`.
- `[VERIFICADO_NO_REPO]` Chat thread endpoints exist in `backend/src/kloel/kloel.controller.ts`: list/create/update/delete threads, search, list/add/update messages, feedback, and regenerate.
- `[VERIFICADO_NO_REPO]` Authenticated chat streaming goes through `POST /kloel/think` and sync chat through `POST /kloel/think/sync`; frontend `frontend/src/lib/kloel-conversations.ts` streams authenticated messages and mutates `/kloel` SWR keys.
- `[VERIFICADO_NO_REPO]` `frontend/src/components/kloel/useChatController.ts` uses `localStorage` for `kloel_guest_session` only; authenticated conversation loading uses backend thread IDs and `loadKloelThreadMessages`.
- `[VERIFICADO_NO_REPO]` Memory model exists: `KloelMemory`.
- `[VERIFICADO_NO_REPO]` Strategic commands now have a code-side policy mutation path: the `set_sales_policy` chat tool persists aggressiveness/tone/instructions/scope into `Workspace.providerSettings.autopilot.salesPolicy`, the dispatcher routes the tool, and the unified-agent system prompt includes the active owner policy for subsequent CIA decisions. Live channel before/after proof remains pending provider/test-account smoke.
- `[EXISTE_MAS_INCOMPLETO]` CIA Observability Checklist requires point-by-point proof before Wave 6 closes.
- Blocks: V01, V03, V04, V13, V14, V15, V17, V18.

### CIA Observability Checklist (Wave 0 Partial)

1. `[VERIFICADO_NO_REPO]` Service that receives inbound by channel:
   - WhatsApp Cloud events route through `backend/src/meta/webhooks/meta-webhook.controller.ts` into `backend/src/whatsapp/inbound-processor.service.ts`.
   - Instagram webhook events route through `backend/src/meta/webhooks/meta-webhook.controller.ts` into `backend/src/inbox/omnichannel.service.ts`.
   - Messenger/Page events route through `backend/src/meta/webhooks/meta-webhook.controller.ts`;
     full Messenger CIA loop still needs focused proof.
   - TikTok webhook receiver exists at `backend/src/webhooks/tiktok-webhook.controller.ts`,
     but TikTok inbound to CIA/inbox was not proven in Wave 0.
   - Email inbound mailbox-to-CIA does not exist yet as a customer mailbox path;
     current email is campaign/fallback/provider-owned.
2. `[VERIFICADO_NO_REPO]` Canonical internal message/perception surfaces include `Conversation`, `Message`,
   `AutopilotEvent`, and `AutonomyExecution` in `backend/prisma/schema.prisma`;
   inbox writes are mediated by `backend/src/inbox/inbox.service.ts` and WhatsApp inbound writes messages before autopilot.
3. `[VERIFICADO_NO_REPO]` Reactive decision service exists at `backend/src/kloel/unified-agent.service.ts`;
   it loads workspace/contact/history/products/context, calls the LLM/tool stack, and returns actions/responses.
4. `[VERIFICADO_NO_REPO]` Proactive/symbolic worker planning exists under `worker/processors/cia/brain.ts`, `worker/processors/cia/build-state.ts`, `worker/processors/cia/conversation-policy.ts`, and `worker/processors/autopilot/**`.
5. `[EXISTE_MAS_INCOMPLETO]` Explicit belief/prediction/case-memory lifecycle was not fully mapped.
   Wave 6 must prove where beliefs, predictions, surprise, bandit learning, and case memories are written and read,
   or reclassify those vision terms as gaps/backlog.
6. `[VERIFICADO_NO_REPO]` Owner/workspace memory/context surfaces exist through `KloelMemory`,
   `Workspace.providerSettings`, product AI config, and `backend/src/kloel/unified-agent-context.service.ts` / Kloel
   context formatters.
7. `[VERIFICADO_NO_REPO]` Outbound action dispatcher exists at `backend/src/kloel/unified-agent-actions.service.ts` and
   related executor sub-services; WhatsApp messaging is wired through messaging helpers/providers.
   Non-WhatsApp outbound from the same brain remains unproven.
8. `[VERIFICADO_NO_REPO]` Human approval surfaces exist via `ApprovalRequest` and finance/admin approval services.
   W8 now makes the owner chat tool dispatcher create an `ApprovalRequest` for high-risk `create_campaign` and
   `change_plan` tool calls instead of executing immediately; `GET /kloel/approvals/pending` exposes open approval requests
   for the authenticated workspace; `POST /kloel/approvals/:id/{approve,reject,adjust}` transitions open workspace
   approvals; the owner chat dashboard has a small real-data approval strip wired through `frontend/src/lib/api/kloel.ts`;
   approved `kloel_tool:create_campaign` and `kloel_tool:change_plan` approvals now execute their original tool and mark
   the approval `COMPLETED`.
9. `[VERIFICADO_NO_REPO]` Brain/autopilot observability uses `AutopilotEvent`, `AutonomyExecution`, cognition logs,
   and worker metrics. A full inbound-to-action trace with request correlation has not been executed.
10. `[VERIFICADO_NO_REPO]` Internal owner chat bridge exists at `backend/src/kloel/kloel.controller.ts` and
    `backend/src/kloel/kloel-tool-dispatcher.service.ts`; tools include product, dashboard, autopilot, brand voice, memory,
    payment link, WhatsApp and business-context operations.
11. `[ENTREGUE_PARCIAL_COM_EVIDENCIA]` Same-CIA strategic-policy proof is code-side complete for chat tool -> `Workspace.providerSettings.autopilot.salesPolicy` -> unified-agent prompt context. `backend/src/kloel/kloel-chat-tools.service.spec.ts`, `backend/src/kloel/kloel-tool-dispatcher.service.spec.ts`, and `backend/src/kloel/unified-agent-context.service.spec.ts` prove persistence, dispatch, and prompt injection. Live channel output diff remains a W9/provider-smoke item.

### W6 bridge update

- `[VERIFICADO_NO_REPO]` W6 OpenCode analysis mapped the CIA bridge checklist and found WhatsApp reaches `UnifiedAgentService` fully, while Instagram/Messenger previously stopped at inbox persistence and TikTok/Email had no CIA bridge.
- `[VERIFICADO_NO_REPO]` W6 implementation now makes `OmnichannelService.handleIncomingMessage()` dispatch saved inbound messages to `UnifiedAgentService.processIncomingMessage()` when the unified agent is registered. Non-WhatsApp channels call the same brain with `executeTools: false`, preventing wrong-channel outbound while still creating perception/decision coverage.
- `[VERIFICADO_NO_REPO]` `backend/src/inbox/omnichannel.service.spec.ts` proves Instagram inbound is saved to inbox and dispatched to the unified agent with `channel: 'instagram'` and `executeTools: false`; WhatsApp remains `executeTools: true`; missing unified-agent provider does not break inbox persistence.
- `[EXISTE_MAS_INCOMPLETO]` Outbound routing for Instagram/Messenger/TikTok/Email is still not complete; the unified agent's messaging action path remains WhatsApp-oriented until a channel dispatcher is implemented.

## Product / Checkout / Wallet / Reports

- `[VERIFICADO_NO_REPO]` Product, checkout, wallet, ledger and reports surfaces exist in `backend/src/kloel/**`, `backend/src/checkout/**`, `backend/src/billing/**`, `backend/src/reports/**`, `backend/src/analytics/**`, and Prisma models (`Product`, `ProductPlan`, `ProductCheckout`, `ProductCoupon`, `ProductReview`, `ProductCommission`, `ProductUrl`, `ProductCampaign`, `ProductAIConfig`, `KloelWallet`, `KloelWalletLedger`).
- `[VERIFICADO_NO_REPO]` Product CRUD exists at `backend/src/kloel/product.controller.ts`; product sub-resource controllers exist for plans, checkouts, coupons, campaigns, URLs, AI config, reviews, commissions, and affiliates.
- `[VERIFICADO_NO_REPO]` Frontend product surfaces exist under `frontend/src/app/(main)/products/**`, `frontend/src/components/kloel/produtos/**`, and `frontend/src/components/kloel/products/**`.
- `[VERIFICADO_NO_REPO]` Member area surfaces exist through Prisma models (`MemberArea`, `MemberEnrollment`, `MemberModule`, `MemberLesson`), frontend `frontend/src/app/(main)/produtos/area-membros/**`, and public access route `frontend/src/app/(public)/area/[slug]/page.tsx`.
- `[VERIFICADO_NO_REPO]` Checkout payment path exists in `backend/src/checkout/checkout-payment.service.ts`, including Stripe sale charge creation, PIX display data, fraud decision logging, state transition validation, checkout payment persistence, and post-payment effects service dependency.
- `[VERIFICADO_NO_REPO]` Generic payment webhook path exists at `backend/src/webhooks/payment-webhook-generic.controller.ts`; in production it requires `PAYMENT_WEBHOOK_SECRET`, applies idempotency via Redis, updates `KloelSale`/`Payment`, marks conversion, sends confirmation, and can trigger post-purchase flow.
- `[VERIFICADO_NO_REPO]` Wallet endpoints exist in `backend/src/kloel/wallet.controller.ts` for balance, process sale, confirm payment, withdraw with KYC guard, transactions, bank accounts, anticipations, and monthly breakdown.
- `[VERIFICADO_NO_REPO]` `backend/src/kloel/wallet.service.ts` credits pending balance for sales, confirms payments with ownership checks, dual-writes cents fields, and appends immutable ledger entries inside the same transaction.
- `[VERIFICADO_NO_REPO]` W7 implementation adds a Prisma post-payment effect in `backend/src/prisma/checkout-paid-effects/wallet.ts` and `backend/src/prisma/prisma.service.ts` that credits the Kloel wallet when a `CheckoutOrder` is updated to `PAID`. The helper writes a pending wallet transaction plus immutable ledger entry, uses `checkout:<order.id>` as idempotency reference, and is covered by focused tests for first credit, duplicate skip, zero amount, and optimistic race loss.
- `[VERIFICADO_NO_REPO]` W7 implementation extends `get_dashboard_summary` in `backend/src/kloel/kloel-chat-tools.service.ts` and `backend/src/kloel/kloel-tool-executor-crm.service.ts` so the owner's chat tool reads paid checkout count/revenue and `KloelWallet` balances from real tables for the selected period.
- `[VERIFICADO_NO_REPO]` Reports endpoints exist in `backend/src/reports/reports.controller.ts` for vendas, summaries, daily, afterpay, churn, abandonos, afiliados, indicadores, assinaturas, indicadores-produto, recusa, origem, ad spend, metricas, estornos, chargeback, report email, and NPS.
- `[VERIFICADO_NO_REPO]` Analytics frontend route exists at `frontend/src/app/(main)/analytics/**` with tab modules; root typecheck currently reports a missing `NeuroPulse` export in analytics tabs, so this surface is not green.
- `[EXISTE_MAS_INCOMPLETO]` Sandbox checkout to paid order to wallet/report/chat answer is not fully executed yet. Code-side checkout-to-wallet credit and chat summary context now exist and pass focused tests, but live/sandbox payment smoke and report/chat screenshots still need proof.
- Blocks: V16, V19.

## Canvas / Sites

- `[VERIFICADO_NO_REPO]` Backend site and canvas controllers exist at `backend/src/kloel/site.controller.ts`, `backend/src/kloel/site-public.controller.ts`, and `backend/src/kloel/canvas.controller.ts`.
- `[VERIFICADO_NO_REPO]` Frontend Sites surfaces exist under `frontend/src/app/(main)/sites/**` and `frontend/src/components/kloel/sites/**`; UI calls `/kloel/site/list`, `/kloel/site/generate`, `/kloel/site/save`, and `/kloel/site/:id`.
- `[VERIFICADO_NO_REPO]` Frontend Canvas surfaces exist under `frontend/src/app/(main)/canvas/**`; deeper persistence/export verification was not executed in Wave 0.
- `[EXISTE_MAS_INCOMPLETO]` Save/open/export/publish flows for Sites and Canvas were not executed by browser/E2E in Wave 0.
- Blocks: V23.

## Ads / War Room

- `[VERIFICADO_NO_REPO]` `AdRule` Prisma model exists and persists `condition`, `action`, `alertMethod`, `alertTarget`, `active`, `fireCount`, and `lastFiredAt`.
- `[VERIFICADO_NO_REPO]` `backend/src/kloel/ad-rules.controller.ts` provides authenticated CRUD/toggle endpoints guarded by `JwtAuthGuard` and `WorkspaceGuard`.
- `[EXISTE_MAS_INCOMPLETO]` `backend/src/kloel/ad-rules-engine.service.ts` evaluates active rules every 5 minutes and increments counters/fire metadata, but current `sendAlert` only logs; platform actions such as pausing/activating campaigns were not verified as executed against Meta/Google/TikTok Ads.
- Blocks: V21.

## Admin / Compliance / Observability

- `[VERIFICADO_NO_REPO]` Admin services exist in `backend/src/admin/**`; GDPR services exist in `backend/src/gdpr/**`; observability files exist in `backend/src/observability/**`.
- `[VERIFICADO_NO_REPO]` Admin audit surfaces exist in `backend/src/admin/audit/**`; controllers use `AdminAuthGuard`, `AdminPermissionGuard`, `RequireAdminPermission`, and append/list audit logs through `AdminAuditService`.
- `[VERIFICADO_NO_REPO]` GDPR request/export/delete surfaces exist in `backend/src/gdpr/**` and public frontend data-deletion routes exist under `frontend/src/app/(public)/data-deletion/**`.
- `[VERIFICADO_NO_REPO]` W8 high-risk tool safety: `backend/src/kloel/kloel-tool-dispatcher.service.ts` sanitizes tool args before logging/persisting and queues `create_campaign` as `ApprovalRequest` with `state: OPEN`.
- `[VERIFICADO_NO_REPO]` W8 visible approval API: `backend/src/kloel/kloel.controller.ts` exposes `GET /kloel/approvals/pending` behind `JwtAuthGuard` + `WorkspaceGuard`, queries only `state: OPEN` approvals for the resolved workspace, and selects bounded display fields for the owner UI.
- `[VERIFICADO_NO_REPO]` W8 owner approval decisions: `backend/src/kloel/kloel.controller.ts` exposes `POST /kloel/approvals/:approvalRequestId/approve`, `/reject`, and `/adjust`, resolves the authenticated workspace, rejects missing/closed approvals, and updates only `state: OPEN` rows with decision metadata.
- `[VERIFICADO_NO_REPO]` W8 owner chat approval surface: `frontend/src/components/kloel/dashboard/KloelDashboard.tsx` polls `kloel:pending-approvals` through `frontend/src/lib/api/kloel.ts`; `KloelDashboardView.tsx` renders pending approvals and calls approve/reject/adjust endpoints without localStorage or mock data.
- `[VERIFICADO_NO_REPO]` W8 owner chat approval surface test: `frontend/src/components/kloel/dashboard/KloelDashboardView.test.tsx` proves pending approval rendering and approve/adjust/reject callback dispatch.
- `[VERIFICADO_NO_REPO]` W8 approved campaign execution: `backend/src/kloel/kloel-tool-dispatcher.service.ts` reads approved `kloel_tool:create_campaign` approval payloads, calls `toolCreateCampaign()` with the original sanitized args, records execution metadata, and marks the approval `COMPLETED`; focused tests cover the execution path.
- `[EXISTE_MAS_INCOMPLETO]` Separate admin domain/IAM/audit/LGPD flow still needs focused verification.
- `[EXISTE_MAS_INCOMPLETO]` Other high-risk action classes still need point-by-point approval guards/execution proof.
- Blocks: V20, V22.

## OpenCode Subagents

- `[VERIFICADO_NO_REPO]` OpenCode CLI is installed: `1.14.48`.
- `[VERIFICADO_NO_REPO]` `scripts/orchestration/opencode-fleet.mjs` provides observable/auditable fleet execution by writing `.prompt`, `.out`, `.err`, `.exit`, `summary.json`.
- `[VERIFICADO_NO_REPO]` PULSE-specific delegation rules are scoped to `scripts/pulse/no-hardcoded-reality-audit.ts` debt reduction, not global Kloel CIA work.
- `[VERIFICADO_NO_REPO]` First W0 fleet run `kloel-cia-w0-discovery-2026-05-11` failed: 3/3 tasks exited via SIGKILL after timeout, so no subagent output was accepted as evidence.
