# Wave 18 — Decompose meta-whatsapp.service.ts

> Authored by PI atomic subagent `w18-decompose-meta-whatsapp` (DeepSeek V4 Pro). Materialized 2026-05-26.


## Summary

Extracted message formatting helpers from `MetaWhatsAppService` (582 LOC → 556 LOC) into a dedicated sibling module. The extraction targets duplicated response-parsing and content-building logic shared between `sendTextMessage` and `sendMediaMessage` without touching session lifecycle, webhook validation, or idempotency.

## Files Created

### `backend/src/meta/meta-whatsapp.message.helpers.ts` (66 LOC)

Four exported pure functions:

| Function | Purpose |
|---|---|
| `buildTextMessageContent(message)` | Builds `{ body, preview_url }` for WhatsApp text messages; ensures body is never empty |
| `buildMediaMessageContent(mediaUrl, type, caption?)` | Builds the media-type field content; attaches caption (suppressed for audio) |
| `parseMessageIdFromResponse(response)` | Extracts WhatsApp message ID from Meta API response (handles 3 response shapes) |
| `normalizeWhatsAppPhone(value)` | Strip non-digit characters; canonical alias for the private `normalizePhone` |

## Lines Extracted

| Metric | Before | After | Δ |
|---|---|---|---|
| `meta-whatsapp.service.ts` | 582 LOC | 556 LOC | −26 |
| `meta-whatsapp.message.helpers.ts` | — | 66 LOC | +66 |
| **Net** | 582 LOC | 622 LOC | +40 |

The net +40 is structural: duplicated logic is now in one shared locus. The service file dropped the inline text content builder (4 lines), media content builder (5 lines), and msgId parser (17 lines) from each of the two send methods — removing ~52 lines of duplicated implementation while adding ~12 lines of imports and delegation.

## Verification

### Backend tsc

```
npm --prefix backend run typecheck
→ exit 0, no errors
```

### Spec Results

All meta-module specs pass (8 suites):

| Spec file | Result |
|---|---|
| `meta-whatsapp.service.spec.ts` | PASS |
| `meta-webhook.controller.spec.ts` | PASS |
| `webhooks/meta-webhook.controller.spec.ts` | PASS |
| `meta-connection-state.service.spec.ts` | PASS |
| `meta-auth.controller.spec.ts` | PASS |
| `meta-sdk.service.spec.ts` | PASS |
| `oauth/meta-oauth-url.helpers.spec.ts` | PASS |
| `oauth/meta-auth-helpers.spec.ts` | PASS |

### Invariants Preserved Checklist

- [x] **Session lifecycle** — No changes to `resolveConnection`, `onModuleInit`, `discoverWhatsAppAssets`, `getPhoneNumberDetails`, `touchWebhookHeartbeat`, `markMessageAsRead`, or `resolveWorkspaceIdByPhoneNumberId`.
- [x] **Idempotency** — `sendTextMessage` and `sendMediaMessage` retain identical pre-flight validation (`resolveConnection` → `accessToken`/`phoneNumberId` check), API call (`graphApiPost`), and error handling (`response?.error`). Only the content construction and response parsing were replaced with delegate calls.
- [x] **Webhook signature verification** — Untouched. Signature verification lives in `meta-webhook.controller.ts`, not the service.
- [x] **WhatsApp provider isolation** — `MetaWhatsAppService` remains the single public API for WhatsApp messaging; the extracted module is internal to the meta package.
- [x] **Public API** — No method signatures changed. `MetaWhatsAppService` exports the same class with the same public methods.
- [x] **OAuth / embedded signup** — `buildEmbeddedSignupUrl`, `safeBuildEmbeddedSignupUrl`, `resolveRedirect`, `getOAuthRedirectUri` unchanged.
- [x] **Phone normalization** — Private `normalizePhone` now delegates to `normalizeWhatsAppPhone`; behavior is byte-identical (`String(value || '').replace(NON_DIGIT_RE, '')`).
- [x] **Backend tsc green** — Confirmed.
- [x] **Existing specs unchanged** — Zero test file modifications.

## Extraction Details

### What moved

1. **Text content building** — `{ body: String(message || '').trim() || ' ', preview_url: false }` → `buildTextMessageContent(message)`
2. **Media content building** — 5-line `mediaPayload` construction with conditional caption → `buildMediaMessageContent(mediaUrl, type, caption)`
3. **Response msgId parsing** — 17-line nested null-check chain (handling `messages[0].id`, `message_id`, `id`) → `parseMessageIdFromResponse(response)`
4. **Phone digit stripping** — `String(value || '').replace(NON_DIGIT_RE, '')` → `normalizeWhatsAppPhone(value)` (service's private method delegates)

### What stayed

- All connection resolution logic
- All payload skeleton (messaging_product, recipient_type, to, type, context)
- All `graphApiPost` calls and error handling
- All module-initialization (`onModuleInit`)
- All webhook heartbeat (`touchWebhookHeartbeat`)
- All OAuth URL construction
- All asset discovery (`discoverWhatsAppAssets`)
 