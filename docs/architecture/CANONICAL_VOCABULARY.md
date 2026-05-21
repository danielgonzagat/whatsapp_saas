# Kloel Canonical Vocabulary

> The single official name for every recurring concept. New code MUST use the
> canonical name. Aliases listed are deprecated or context-specific.
>
> Anti-regression: `scripts/ops/check-canonical-duplicates.mjs` flags new
> implementations that look like aliases of a canonical capability.

**Entries: 123** (was ~30 before Waves A–K, 2026-05).

## Domain entities

| Canonical | Aliases (migrate) | Scope note |
|---|---|---|
| `Workspace` | `Tenant`, `Org`, `Account` | Multi-tenant isolation unit |
| `User` | `Agent` (inbox role), `Operator` (admin context) | Person with login; role qualifiers allowed |
| `Contact` | `Lead`, `Customer`, `Prospect`, `Person` | CRM/Inbox entity; `Lead`/`Customer` only as funnel-stage labels |
| `ChannelSession` | `whatsappSession`, `waSession`, `connection`, `instance`, `botSession`, `WAHASession` | Per-workspace session across messaging channels |
| `Message` | `ChatMessage`, `inboundMessage`, `outboundMessage` | Atomic conversation unit; direction is a field |
| `Conversation` | `Thread`, `Dialog`, `Chat` | Ordered Message[] per (Contact, ChannelSession) |
| `Product` | `Item` (commerce only), `Offer` (marketing only) | Catalog entity; `Offer` is marketing wrapper, not synonym |
| `Plan` | `Tier`, `SubscriptionTier`, `Pricing` | Product variant with billing semantics |
| `Checkout` | `Order` (post-payment only), `Purchase` | Pre-payment intent; becomes `Order` after payment |
| `Payment` | `Charge`, `Transaction` (overloaded) | Money-move event; `Transaction` too overloaded |
| `Wallet` | `Balance` (display), `Account` (collision) | Prepaid balance scoped to Workspace |
| `LedgerEntry` | `Movement`, `Posting`, `JournalEntry` | Append-only; never UPDATE, only compensating entries |
| `Workflow` | `Flow`, `Sequence`, `Automation`, `Funnel` | Declarative orchestration; `Funnel` is UX wrapper |
| `Campaign` | `Broadcast`, `Blast`, `Outreach` | Outbound wave with audience selector |
| `Affiliate` | `Partner`, `Reseller`, `Referrer` | Commission earner; `Partner` allowed in partnerships module only |
| `Webhook` | `Hook`, `Callback`, `Notification`, `IncomingEvent` | External provider → internal event boundary |

## Phone-number facets (`common/phone.ts`)

| Canonical | Location | Aliases (migrate) | Usage example |
|---|---|---|---|
| `NON_DIGIT_RE` | `common/phone.ts:30` | `D_RE` (22 dup declarations across auth, whatsapp, checkout, meta, cia, flows) | `value.replace(NON_DIGIT_RE, '')` |
| `digitsOnly` | `common/phone.ts:40` | `normalizePhone` (base variant), `stripDigits`, `phoneOnly` | `digitsOnly(phone)` → `'5511999999999'` |
| `digitsOrNull` | `common/phone.ts:51` | `normalizePhone` (nullable variant) in checkout-social-lead.util | `digitsOrNull(phone)` → `'5511999999999' \| null` |
| `whatsappDigits` | `common/phone.ts:65` | `normalizePhone` (WA variant) in inbound-processor.helpers; `stripSuffix` | `whatsappDigits('5511999999999@s.whatsapp.net')` → `'5511999999999'` |

## String helpers (`common/string.ts`)

| Canonical | Location | Aliases (migrate) | Usage example |
|---|---|---|---|
| `normalizeEmail` | `common/string.ts:23` | 3 local copies in `auth-service.helpers.ts`, `auth.helpers.ts` (migrated); checkout variant stays local (null-on-empty semantics) | `normalizeEmail(' Foo@Bar.COM ')` → `'foo@bar.com'` |
| `safeStr` | `common/string.ts:36` | 4 local copies in kloel/lead-brain, lead-processor, workspace-context, product-sub-resources (all migrated) | `safeStr(unk)` → `'string' \| ''` |

## Math helpers (`common/math.ts`)

| Canonical | Location | Aliases (migrate) | Usage example |
|---|---|---|---|
| `clamp` | `common/math.ts:22` | 9 prior local copies across commem, agency, defens, channel, evol, postsale, incent types | `clamp(value, 0, 100)` |
| `clampScore` | `common/math.ts:32` | 4 prior duplicates in agency, clarity, healthy-money types | `clampScore(score)` → `[0, 1]` |
| `daysSince` | `common/math.ts:46` | 3 prior duplicates in channel, postsale types | `daysSince('2026-05-01', Date.now())` |

## Type helpers (`common/types.ts`)

| Canonical | Location | Aliases (migrate) | Usage example |
|---|---|---|---|
| `UnknownRecord` | `common/types.ts:21` | 30 prior `type UnknownRecord = Record<string, unknown>` declarations across kloel/* and whatsapp/* | `type UnknownRecord = Record<string, unknown>` |
| `asRecord` | `common/types.ts:39` | 5 prior local copies in payments/ledger, connect, webhooks, kloel/email-workspace | `asRecord(unk)` → `UnknownRecord \| null` |
| `asString` | `common/types.ts:49` | New helper (Wave E1+E4) — no migrations yet | `asString(unk)` → `string \| null` |
| `isObject` | `common/types.ts:64` | 8 prior duplicates across kloel/abi and kloel/pulse-gates | `isObject(value)` → `value is UnknownRecord` |

## Regex constants (`common/regex.ts`)

| Canonical | Location | Aliases (migrate) | Usage example |
|---|---|---|---|
| `UUID_DASH_RE` | `common/regex.ts:13` | `PATTERN_RE` variants in meta/oauth, member-area, storage | `uuid.replace(UUID_DASH_RE, '')` |
| `SLUG_EDGE_HYPHEN_RE` | `common/regex.ts:16` | `HYPHEN_RE`, `EDGE_DASH` in slug utilities | `slug.replace(SLUG_EDGE_HYPHEN_RE, '')` |
| `TRAILING_SLASH_RE` | `common/regex.ts:19` | `slash_RE`, `trailingSlash`, `TRAILING_SLASH` in storage, pulse | `url.replace(TRAILING_SLASH_RE, '')` |
| `WHITESPACE_G_RE` | `common/regex.ts:28` | `S_RE`, `SPACE_RE`, `WHITESPACE_RE` (9 dup declarations) | `text.replace(WHITESPACE_G_RE, ' ')` |

## Primitive parsers (`common/parse.ts`)

| Canonical | Location | Variant | Aliases (migrate) | Usage example |
|---|---|---|---|---|
| `readString` | `common/parse.ts:30` | S1 (no trim, undef on empty) | 4 prior copies in request-logger, idempotency, flows, provider-registry | `readString(value)` → `string \| undefined` |
| `readTrimmedString` | `common/parse.ts:38` | S2 (trimmed, undef on empty) | 1 prior copy in kloel/email-workspace-delivery | `readTrimmedString(value)` → `string \| undefined` |
| `readStringOrNull` | `common/parse.ts:47` | S3 (trimmed, null on empty) | 3 file targets pending migration | `readStringOrNull(value)` → `string \| null` |
| `readStringForce` | `common/parse.ts:58` | S4 (always string, '' on empty) | 1 prior copy in correction.observer | `readStringForce(value)` → `string` |
| `readStringOr` | `common/parse.ts:66` | S5a (caller fallback, trimmed) | 2 targets pending | `readStringOr(value, 'fallback')` |
| `readStringOrUntrimmed` | `common/parse.ts:75` | S5b (caller fallback, no trim) | 1 target pending | `readStringOrUntrimmed(value, 'x')` |
| `readStringProperty` | `common/parse.ts:86` | S6 (record-aware) | 3 targets pending (Wave D1) | `readStringProperty(source, 'key')` |
| `readStringArray` | `common/parse.ts:102` | S7a (returns [] on missing) | 4 targets pending (Wave E1+E4) | `readStringArray(value)` → `string[]` |
| `readStringArrayOr` | `common/parse.ts:113` | S7b (returns undef on missing) | New helper | `readStringArrayOr(value)` → `string[] \| undefined` |
| `readNumber` | `common/parse.ts:128` | N1 (strict, number only) | 7 file targets pending (Wave A2) | `readNumber(value)` → `number \| undefined` |
| `readNumberLoose` | `common/parse.ts:136` | N2 (string coercion) | New helper | `readNumberLoose('123')` → `123` |
| `readNumberOr` | `common/parse.ts:154` | N3 (caller fallback) | New helper | `readNumberOr(value, 0)` |
| `readNumberForce` | `common/parse.ts:163` | N4 (0 on missing) | New helper | `readNumberForce(value)` → `number` |
| `readInt` | `common/parse.ts:177` | N5 (parseInt, base-10) | New helper | `readInt('42')` → `42` |
| `readBoolean` | `common/parse.ts:196` | B1 (bool / 'true' / 0/1) | New helper (no migrations yet) | `readBoolean('true')` → `true` |
| `readDate` | `common/parse.ts:215` | D1 (Date / epoch ms/s / ISO) | New helper (no migrations yet) | `readDate('2026-05-21')` → `Date` |

## Money / cents (`common/money.ts`, `frontend/src/lib/common/money.ts`)

| Canonical | Location | Aliases (migrate) | Usage example |
|---|---|---|---|
| `Cents` (branded type) | `common/money.ts:48` | `number` used informally as cents across legacy code | `cents(12345)` — never raw `number` |
| `cents` | `common/money.ts:54` | `toCents`, `asCents` in legacy | `cents(12345)` → `Cents(12345)` |
| `ZERO_CENTS` | `common/money.ts:66` | `ZERO`, `0 as any` | `ZERO_CENTS === cents(0)` |
| `addCents` | `common/money.ts:69` | `+` operator directly on cents | `addCents(a, b)` |
| `subCents` | `common/money.ts:74` | `-` operator directly on cents | `subCents(a, b)` |
| `mulCentsInt` | `common/money.ts:83` | `*` with float drift risk | `mulCentsInt(cents(100), 3)` |
| `applyBasisPoints` | `common/money.ts:96` | `*` / 100 with rounding drift; `calcPercentage`, `applyRate` | `applyBasisPoints(cents(10000), 1000)` |
| `parseBRL` | `common/money.ts:123` | `parseCurrency`, `parseReal`, `BRLToCents` in CSV import | `parseBRL('R$ 1.234,56')` → `cents(123456)` |
| `formatBRL` (BE) | `common/money.ts:140` | `formatCurrency` (2 prior copies in cia) | `formatBRL(cents(123456))` → `'R$ 1.234,56'` |
| `formatBRL` (FE) | `frontend/src/lib/common/money.ts` | `formatCurrency` in cia/*, autopilot, brain-settings | Same signature; `autopilot` and `brain-settings` variants stay local (different semantics) |

## Async / iteration (`common/async-sequence.ts`)

| Canonical | Location | Aliases (migrate) | Usage example |
|---|---|---|---|
| `forEachSequential` | `common/async-sequence.ts:2` | `serialForEach`, `asyncEach`, `forEachAwait` | `await forEachSequential(items, fn)` |
| `findFirstSequential` | `common/async-sequence.ts:20` | `findFirst`, `asyncFind`, `findAwait` | `await findFirstSequential(items, fn)` |
| `pollUntil` | `common/async-sequence.ts:41` | `poll`, `waitFor`, `retryUntil` in test helpers | `await pollUntil({ timeoutMs, intervalMs, read, stop, sleep })` |

## Security / idempotency

| Canonical | Location | Aliases (migrate) | Usage example |
|---|---|---|---|
| `BCRYPT_ROUNDS` | `common/constants.ts:10` | `SALT_ROUNDS` (7 local consts in auth, team, kyc, admin) | `bcrypt.hash(pwd, BCRYPT_ROUNDS)` |
| `canonicalize` | `common/idempotency-fingerprint.ts:35` | `jsonCanonical`, `sortedJson`, `canonicalJson` | `canonicalize({ b: 1, a: 2 })` → `'{"a":2,"b":1}'` |
| `bodyFingerprint` | `common/idempotency-fingerprint.ts:56` | `hashBody`, `requestDigest` | `bodyFingerprint({ amount: 100 })` |
| `buildCacheKey` | `common/idempotency-fingerprint.ts:82` | `cacheKey`, `idempotencyKey` (constructed inline) | `buildCacheKey({ workspaceId, actorId, … })` |
| `buildScopeKey` | `common/idempotency-fingerprint.ts:103` | N/A (new) | `buildScopeKey(parts)` |

## Pagination (`common/pagination-clamp.pipe.ts`)

| Canonical | Location | Aliases (migrate) | Usage example |
|---|---|---|---|
| `clampLimit` | `common/pagination-clamp.pipe.ts:86` | 16 list endpoints with hand-rolled clamp | `clampLimit(rawQuery)` → `number` |
| `clampPage` | `common/pagination-clamp.pipe.ts:91` | Same as above | `clampPage(rawQuery)` → `number` |
| `PaginationLimitPipe` | `common/pagination-clamp.pipe.ts:100` | Inline guards; `ParseIntPipe` without clamp | `@Query('limit', new PaginationLimitPipe())` |
| `PaginationPagePipe` | `common/pagination-clamp.pipe.ts:117` | Inline guards | `@Query('page', new PaginationPagePipe())` |

## File / buffer utilities

| Canonical | Location | Aliases (migrate) | Usage example |
|---|---|---|---|
| `detectUploadedMime` | `common/file-signature.util.ts:149` | Hand-rolled mime detection in 3 controllers | `detectUploadedMime(file)` → `'image/png' \| null` |
| `UploadedFileLike` (interface) | `common/file-signature.util.ts:8` | `MulterFile`, `UploadedFile` inlined | `detectUploadedMime({ buffer, mimetype })` |
| `looksLikeUtf8Text` | `common/file-signature-bytes.util.ts:38` | `isTextFile`, `isUtf8` in storage | `looksLikeUtf8Text(buffer)` |
| `bufferStartsWith` | `common/file-signature-bytes.util.ts:52` | `startsWith` on Buffer (not a method) | `bufferStartsWith(buffer, PDF_SIG)` |
| `bufferSliceEquals` | `common/file-signature-bytes.util.ts:65` | Inline buffer substring comparisons | `bufferSliceEquals(buf, 0, 4, 'RIFF')` |

## Sales templates (`common/sales-templates.ts`)

| Canonical | Location | Aliases (migrate) | Usage example |
|---|---|---|---|
| `SALES_TEMPLATES` | `common/sales-templates.ts:27` | 13 hardcoded template strings in worker/processor.ts and autopilot.service.ts | `SALES_TEMPLATES.SEND_PRICE` |
| `renderTemplate` | `common/sales-templates.ts:76` | `generateTemplate` in worker/processor; inline string concat | `renderTemplate('SEND_PRICE', { calendarLink })` |

## Misc / other

| Canonical | Location | Aliases (migrate) | Usage example |
|---|---|---|---|
| `sanitizePayload` | `common/sanitize-payload.ts:70` | 3 inline redaction copies in audit, request-logger, audit-log | `sanitizePayload(req.body)` |
| `getTraceHeaders` | `common/trace-headers.ts:11` | 14 hand-rolled `X-Request-ID` headers in outbound HTTP | `getTraceHeaders(requestId)` |
| `safeJoin` | `common/safe-path.ts:4` | `path.join()` without null-byte guard in 3 modules | `safeJoin('uploads', userId)` |
| `safeResolve` | `common/safe-path.ts:17` | `path.resolve()` without null-byte guard | `safeResolve('/tmp', filename)` |
| `readText` | `common/utils.ts:6` | New helper (Wave H) | `readText(unk)` → `string` |
| `BRAND_COLORS` | `common/kloel-colors.ts:16` | Inline hex literals in emails, AI prompts, seed defaults | `BRAND_COLORS.EMBER` |
| `PIPELINE_STAGE_COLORS` | `common/kloel-colors.ts:33` | Inline in pipeline/CRM modules | `PIPELINE_STAGE_COLORS.LEAD_BLUE` |
| `TAG_DEFAULT_COLORS` | `common/kloel-colors.ts:48` | Inline in tag defaults | `TAG_DEFAULT_COLORS.WHATSAPP_OPTIN_GREEN` |
| `CANVAS_COLORS` | `common/kloel-colors.ts:57` | Inline in canvas defaults | `CANVAS_COLORS.DEFAULT_BG` |
| `MEMBER_AREA_COLORS` | `common/kloel-colors.ts:67` | Inline in member area defaults | `MEMBER_AREA_COLORS.DEFAULT_PRIMARY` |

## State machines

| Canonical | Location | Aliases (migrate) | Usage example |
|---|---|---|---|
| `validateOrderTransition` | `common/checkout-order-state-machine.ts:53` | Inline status checks in checkout, billing | `validateOrderTransition('PENDING', 'PAID', ctx)` |
| `assertValidOrderStatusFilter` | `common/checkout-order-state-machine.ts:74` | Ad-hoc status validation in query builders | `assertValidOrderStatusFilter('PENDING', 'listOrders')` |
| `isValidTransition` | `common/payment-state-machine.ts:46` | 3 inline transition matrices in payments | `isValidTransition('PENDING', 'CONFIRMED')` |
| `validatePaymentTransition` | `common/payment-state-machine.ts:61` | Out-of-order webhook guard duplicate | `validatePaymentTransition('PENDING', 'APPROVED', ctx)` |

## Test helpers (`test/helpers/`)

| Canonical | Location | Aliases (migrate) | Usage example |
|---|---|---|---|
| `createPrismaMock` | `test/helpers/prisma.mock.ts:119` | 5 spec-helper factories + ~282 inline `MockPrisma`/`PrismaMock` declarations across spec files (Waves E3, F1, I1, J1) | `const prisma = createPrismaMock()` |
| `createPartialPrismaMock` | `test/helpers/prisma.mock.ts:161` | Same as above (narrow model subset) | `createPartialPrismaMock({ agent: ['findUnique'] })` |
| `FlexMock` (type) | `test/helpers/prisma.mock.ts:43` | 6 local copies in contacts, autopilot specs | `type FlexMock<T> = jest.Mock & { mockResolvedValue: ... }` |
| `PrismaMockRecord` (type) | `test/helpers/prisma.mock.ts:34` | Inline types across 18 spec files | `let prisma: PrismaMockRecord` |
| `PrismaMockModel` (type) | `test/helpers/prisma.mock.ts:32` | Inline types | `type PrismaMockModel = Record<string, jest.Mock>` |
| `PrismaMockMethod` (type) | `test/helpers/prisma.mock.ts:30` | Inline types | `type PrismaMockMethod = jest.Mock` |
| `makeEventFactory` | `test/helpers/spine-event-factory.ts:51` | 18 local `makeEvent` declarations (Variants A+B) across commem, defens, channel, wisdom specs (Wave B1) | `const makeEvent = makeEventFactory()` |
| `makeEventFactoryMs` | `test/helpers/spine-event-factory.ts:76` | Variant with `occurredAtMs: number` instead of ISO string | `const makeEvent = makeEventFactoryMs()` |
| `makeSpine` | `test/helpers/spine-factory.ts:16` | 13 local `new SpineEmitterService(...)` in spec files (Wave E2) | `const spine = makeSpine()` |
| `baseInput` | `test/helpers/detection-input-factory.ts:24` | 12 byte-identical declarations across postsale-consumers, channel specs (Wave D2) | `baseInput(events, 'ws_001')` |
| `CreatePrismaMockOptions` (interface) | `test/helpers/prisma.mock.ts:105` | Inline in spec helpers | — |
| `MakeEvent` (type) | `test/helpers/spine-event-factory.ts:36` | Inline in spec files | — |

## Interceptors / guards (infrastructure middleware)

| Canonical | Location | Notes |
|---|---|---|
| `RequestIdInterceptor` | `common/request-id.interceptor.ts` | X-Request-ID propagation (NestJS interceptor) |
| `RequestLoggerInterceptor` | `common/request-logger.interceptor.ts` | Structured request logging; uses `sanitizePayload` |
| `IdempotencyInterceptor` | `common/idempotency.interceptor.ts` | Idempotency v2 with body fingerprint (I13) |
| `IdempotencyGuard` | `common/idempotency.guard.ts` | Same check at Guard level for early rejection |
| `HttpTracingInterceptor` | `common/http-tracing.interceptor.ts` | Outbound HTTP tracing headers |
| `PaginationLimitPipe` | `common/pagination-clamp.pipe.ts:100` | (listed above) |
| `PaginationPagePipe` | `common/pagination-clamp.pipe.ts:117` | (listed above) |
| `LedgerReconciliationService` | `common/ledger-reconciliation.service.ts` | Wallet ledger reconciliation engine |
| `FinancialAlertService` | `common/financial-alert.service.ts` | Financial monitoring and alert thresholds |
| `FinancialAlertModule` | `common/financial-alert.module.ts` | NestJS module for financial alerts |

## Capabilities (verbs)

| Canonical | Aliases (migrate) | Scope note |
|---|---|---|
| `MessageDispatchService.dispatch` | `sendMessage`, `sendWhatsappMessage`, `sendText`, `wahaSend`, `CampaignSender.send` | Single send pipeline; channel adapters live below |
| `phone.normalize` (E164 digits) | `normalizePhone`, `normalizeNumber`, `cleanPhone`, `formatPhone` (when normalizing) | Digits-only base normalizer |
| `phone.optional` (null on empty) | `normalizePhone` in `checkout-social-lead.util.ts` | Returns `null \| string` for nullable lookups |
| `phone.whatsapp` (strips @c.us/@s.whatsapp.net) | `normalizePhone` in `whatsapp/inbound-processor.helpers.ts` | WhatsApp-specific |
| `WorkspaceContext.resolve` | `resolveTenant`, `resolveWorkspace`, `getTenantId`, `getWorkspaceId`, `extractTenant` | Resolves Workspace from auth + request |
| `filterByWorkspace` | 3 prior duplicates in channel, defens, postsale types | SpineEvent[] workspace filter |
| `filterByWorkspaceAndEntity` | — | Pairs with above when entityRef provided |

## Events (taxonomy)

| Canonical form | Banned forms |
|---|---|
| `channel.message.received` | `message_received`, `whatsapp.message.incoming`, `incomingMessage`, `WA_MESSAGE_RECEIVED` |
| `channel.message.sent` | `outboundMessage`, `messageSent` |
| `channel.message.failed` | `messageFail`, `wa_send_error` |
| `channel.session.connected` | `wa_connected`, `qr_authenticated`, `sessionOpen` |
| `channel.session.disconnected` | `wa_disconnected`, `sessionClose` |
| `conversation.started` | `thread_created`, `newConversation` |
| `conversation.updated` | `conversationDirty`, `thread_touched` |
| `lead.qualified` | `qualifyLead`, `leadQualified`, `prospect.qualified` |
| `checkout.created` | `newCheckout`, `checkoutInit` |
| `checkout.completed` | `checkoutDone`, `checkout.success` |
| `payment.approved` | `paymentSucceeded`, `chargeOK`, `payment.captured` |
| `payment.failed` | `paymentDeclined`, `chargeFail` |
| `payment.refunded` | `refundDone`, `chargeReversed` |
| `campaign.action.scheduled` | `campaignQueued`, `actionPlanned` |
| `campaign.action.executed` | `campaignSent`, `actionFired` |

**Canonical form rules**: lowercase, dot-separator only (no underscore/colon/camelCase), `domain.entity.verb-past-participle` order. The canonical scanner (`scripts/ops/check-canonical-events.mjs`) refuses any new emit that doesn't match this shape.

## Provider names

| Canonical | Aliases (migrate) | Scope note |
|---|---|---|
| `MercadoPago` | `mp`, `MercadoPagoSDK`, `mercado_pago` | PIX BR provider (see [ADR 0009](../adr/0009-mercadopago-pix-stripe-card-split.md)) |
| `Stripe` | `StripeConnect`, `stripe_sdk` | Cartão internacional + Connect (marketplace, payouts) |
| `WAHA` | `whatsapp_http_api`, `WhatsAppWebApi` | WhatsApp QR-based session provider |
| `MetaCloud` | `MetaCloudAPI`, `whatsapp_business`, `wabusiness` | WhatsApp Business Cloud API (official) |
| `Asaas` | — | **Deprecated** as of ADR 0003; do not reintroduce |

## How to add a row

1. Find duplication in `DUPLICATION_REGISTER.md` or `CAPABILITY_MAP.md`
2. Pick the canonical name (domain-clear, no abbreviation, English unless BR-market noun like PIX/CNPJ)
3. List historical aliases (grep the codebase)
4. Add row with scope note for context-specific exceptions
5. Run codemod via `mcp__atomic-edit__atomic_rename_symbol_cross_file`
6. Update `DEPRECATION_MAP.md` with deadline + status
7. Regenerate: `npm run canonical:scan`
8. Gate must remain green: `npm run canonical:check`
