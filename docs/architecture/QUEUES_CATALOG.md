# Kloel Queues Catalog (canonical)

> All BullMQ queues + processors. Generated 2026-05-21 via grep `Queue(`, `@Process`, `getOrCreateQueue`.
> Re-run via `node tools/canonicalize/scan.mjs`.

## Canonical queue inventory (15)

| Queue | Producer (emits jobs) | Consumer (processes) | Job names |
|---|---|---|---|
| `autopilot` | autopilot/* | worker/processors/autopilot | `tick`, `dispatch` |
| `autopilot-jobs` (alias) | autopilot legacy | worker | superseded by `autopilot` |
| `campaign` | campaigns/* | worker/processors/campaign | `dispatch`, `tick` |
| `campaign-jobs` | autopilot/autopilot-cycle-money.service.ts, campaigns/campaigns.service.ts | worker/processors/campaign | `send-message`, `tick` |
| `crm` | crm/* | worker/processors/crm | `sync-accounts`, `sync-campaigns`, `sync-insights` |
| `crm-jobs` | crm legacy | — | superseded by `crm` |
| `flow` | flows/* | worker/processors/flow | `run-flow` |
| `flow-jobs` | flows legacy | — | superseded by `flow` |
| `mass-send` | mass-send/mass-send.service.ts | worker/processors/mass-send | `send-message` |
| `media` | media/* | worker/processors/media | `generate-audio`, `transcribe-audio`, `generate-video` |
| `media-jobs` | media/media.service.ts | worker/processors/media | superseded by `media` |
| `memory` | (cognitive) | worker/processors/memory | (lazy) |
| `memory-jobs` | memory legacy | — | superseded by `memory` |
| `mind-bg-tick` | mind/* | worker/processors/mind | `tick` (5s interval) |
| `scraper` | scrapers/* | worker/processors/scraper | `run-scraper` |
| `scraper-jobs` | scrapers/scrapers.service.ts | worker/processors/scraper | superseded by `scraper` |
| `voice` | voice/* | worker/processors/voice | (lazy) |
| `voice-jobs` | voice/voice.service.ts | worker/processors/voice | superseded by `voice` |
| `webhook` | webhooks/* | worker/processors/webhook | (lazy) |
| `webhook-jobs` | webhooks legacy | — | superseded by `webhook` |
| `ads-sync-meta` | tiktok-ads / meta-ads | worker/processors/ads | `sync-meta-accounts`, `sync-meta-campaigns`, `sync-meta-insights`, `refresh-meta-token` |
| `ads-sync-google` | google-ads/* | worker/processors/ads | `sync-meta-insights`, `refresh-google-token` |

## Canonical naming convention

**Queue names:** lowercase kebab-case, singular noun or noun-phrase, no `-jobs` suffix.

❌ Deprecated suffix: `*-jobs` (e.g., `campaign-jobs`, `media-jobs`) — clearly redundant since all queue items ARE jobs.

✅ Canonical: `campaign`, `media`, `scraper`, `voice`, `flow`, `webhook`, `memory`, `crm`.

**Migration status:** 8 `-jobs`-suffixed queues exist in parallel with their canonical counterparts. Workers process from both during cutover. Migration plan: deprecate `-jobs` aliases over 2 release cycles, then remove.

**Job names:** `<verb>-<noun>` kebab-case. Examples: `send-message`, `run-flow`, `sync-accounts`, `generate-audio`. Avoid camelCase, avoid `_underscore`.

## Cross-cutting concerns

### Idempotency

Per CLAUDE.md "REGRA DE BANCO DE DADOS" item 5, **all webhook-triggered queues must accept replay without duplicate side effects**:

- `webhook` queue: every job MUST include an `externalId` in `data` and check `WebhookEvent.@@unique([provider, externalId])` before processing
- `campaign`, `mass-send`: idempotency via `MessageLog` with `(workspaceId, messageId)` unique
- `media`, `voice`: idempotency via `Media.fingerprint` or content sha256

### Retry policy

| Queue | Max attempts | Backoff |
|---|---:|---|
| `webhook` | 5 | exp 30s..30min |
| `campaign`/`mass-send` | 3 | linear 1min |
| `media`/`voice` | 3 | exp 5s..5min |
| `autopilot`/`mind-bg-tick` | 2 | linear 30s |
| `ads-sync-*` | 5 | exp 60s..1h |
| `scraper` | 3 | exp 60s..30min |
| `flow` | 3 | linear 5min |

### Dead-letter

All queues have `removeOnFail: false` and a DLQ inspector accessible via admin/operations module.

## Gates

- New queue creation outside this catalog FAILS `npm run canonical:check`
- `*-jobs` suffix is BLOCKED in new code (gate emits warning + suggestion to drop suffix)
- Job names in non-canonical format (camelCase, underscore) flagged

## Related

- [EVENT_TAXONOMY.md](EVENT_TAXONOMY.md) — domain events vs queue jobs distinction
- [CAPABILITY_MAP.md](CAPABILITY_MAP.md) — which capability owns which queue
- worker/README.md — processor implementation details
