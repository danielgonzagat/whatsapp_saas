# PULSE REPORT — 2026-04-01T01:37:25.770Z

## Health Score: 67/100
`█████████████░░░░░░░` 67%

## Summary

| Metric | Total | Issues |
|--------|-------|--------|
| UI Elements | 904 | 0 dead handlers |
| API Calls | 639 | 0 no backend |
| Backend Routes | 630 | 0 empty |
| Prisma Models | 107 | 0 orphaned |
| Facades | 0 | 0 critical, 0 warning |
| Proxy Routes | 48 | 0 no upstream |
| Security | - | 0 issues |
| Data Safety | - | 90 issues |
| Quality | - | 1461 issues |

## Breaks (1552 total)

### Backend Routes Not Called by Frontend (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/kloel/kloel.controller.ts:183 | POST /kloel/upload-chat is not called by any frontend code |

### Division by Zero Risk (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/checkout/checkout.service.ts:638 | Division by variable without zero-check — potential division by zero in financial code |

### Financial Errors Swallowed (5)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/billing/payment-method.service.ts:186 | catch in financial code handles error without rethrow |
| HIGH | backend/src/billing/plan-limits.service.ts:191 | catch in financial code handles error without rethrow |
| HIGH | backend/src/kloel/external-payment.service.ts:338 | catch in financial code returns null/default — caller may not detect failure |
| HIGH | backend/src/kloel/smart-payment.service.ts:337 | catch in financial code handles error without rethrow |
| HIGH | backend/src/kloel/wallet.service.ts:126 | catch in financial code returns null/default — caller may not detect failure |

### JSON.parse Without try/catch (15)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/copilot/copilot.service.ts:176 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
| HIGH | backend/src/crm/neuro-crm.service.ts:211 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
| HIGH | backend/src/kloel/conversational-onboarding.service.ts:374 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
| HIGH | backend/src/kloel/conversational-onboarding.service.ts:416 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
| HIGH | backend/src/kloel/pdf-processor.service.ts:69 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
| HIGH | backend/src/kloel/smart-payment.service.ts:113 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
| HIGH | backend/src/kloel/smart-payment.service.ts:316 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
| HIGH | backend/src/kloel/unified-agent.service.ts:3076 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
| HIGH | backend/src/kloel/unified-agent.service.ts:3794 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
| HIGH | backend/src/kloel/unified-agent.service.ts:4537 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
| HIGH | backend/src/kloel/unified-agent.service.ts:4639 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
| HIGH | backend/src/kloel/unified-agent.service.ts:4649 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
| HIGH | worker/flow-engine-global.ts:492 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
| HIGH | worker/processors/autopilot-processor.ts:482 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
| HIGH | worker/processors/autopilot-processor.ts:658 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |

### Empty Catch Blocks (69)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/alerts/alerts.gateway.ts:48 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/auth/auth.service.ts:316 | Empty catch block — error silently swallowed |
| WARNING | backend/src/calendar/calendar.service.ts:85 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:238 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:283 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:361 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:385 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/copilot/copilot.gateway.ts:44 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/crm/crm.service.ts:457 | Empty catch block — error silently swallowed |
| WARNING | backend/src/i18n/i18n.service.ts:238 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/ad-rules-engine.service.ts:27 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/ad-rules-engine.service.ts:31 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/cart-recovery.service.ts:78 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/kloel.service.ts:2600 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/kloel.service.ts:2648 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/kloel.service.ts:2759 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/kloel.service.ts:2788 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/kloel.service.ts:2903 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/kloel.service.ts:2941 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/memory-management.service.ts:90 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/memory-management.service.ts:106 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/memory-management.service.ts:177 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/memory-management.service.ts:258 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/product.controller.ts:239 | Empty catch block — error silently swallowed |
| WARNING | backend/src/kloel/product.controller.ts:313 | Empty catch block — error silently swallowed |
| WARNING | backend/src/kloel/product.controller.ts:346 | Empty catch block — error silently swallowed |
| WARNING | backend/src/kloel/sales.controller.ts:577 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/unified-agent.service.ts:3939 | Empty catch block — error silently swallowed |
| WARNING | backend/src/main.ts:57 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/main.ts:237 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/meta/webhooks/meta-webhook.controller.ts:74 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/reports/reports.service.ts:134 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/webhooks/webhooks.service.ts:138 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/webhooks/whatsapp-api-webhook.controller.ts:601 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:430 | Empty catch block — error silently swallowed |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:454 | Empty catch block — error silently swallowed |
| WARNING | backend/src/whatsapp/inbound-processor.service.ts:500 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/whatsapp/inbound-processor.service.ts:650 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:945 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:896 | Empty catch block — error silently swallowed |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:2031 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:2166 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:2191 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/bootstrap.ts:208 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/dlq-monitor.ts:34 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/dlq-monitor.ts:116 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/flow-engine-global.ts:363 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/flow-engine-global.ts:401 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/flow-engine-global.ts:572 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/flow-engine-global.ts:602 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/flow-engine-global.ts:635 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/flow-engine-global.ts:743 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/flow-engine-global.ts:832 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/flow-engine-global.ts:936 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/flow-engine-global.ts:1108 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/flow-engine-global.ts:1126 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/flow-engine-global.ts:1129 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/flow-engine-global.ts:1157 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/flow-engine-global.ts:1175 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/flow-engine-global.ts:1413 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/flow-engine-global.ts:1436 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/processor.ts:507 | Empty catch block — error silently swallowed |
| WARNING | worker/processor.ts:976 | Empty catch block — error silently swallowed |
| WARNING | worker/processor.ts:1013 | Empty catch block — error silently swallowed |
| WARNING | worker/providers/rate-limiter.ts:115 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/reprocess-dlq.ts:45 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/scrapers/google-maps.ts:154 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/scrapers/instagram.ts:64 | Empty catch block — error silently swallowed |
| WARNING | worker/scrapers/instagram.ts:125 | catch block only logs without throw/return — error effectively swallowed |

### Fetch Without Timeout (44)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/audio/transcription.service.ts:69 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/audio/transcription.service.ts:96 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/auth/auth.service.ts:909 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/auth/email.service.ts:117 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/auth/email.service.ts:149 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/checkout/facebook-capi.service.ts:53 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/crm/crm.service.ts:443 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/health/system-health.service.ts:190 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/kloel/asaas.service.ts:238 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/kloel/asaas.service.ts:257 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/kloel/asaas.service.ts:319 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/kloel/asaas.service.ts:347 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/kloel/asaas.service.ts:411 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/kloel/asaas.service.ts:485 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/kloel/asaas.service.ts:735 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/kloel/asaas.service.ts:770 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/kloel/asaas.service.ts:814 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/kloel/email-campaign.service.ts:92 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/kloel/email-campaign.service.ts:110 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/kloel/mercadopago.service.ts:200 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/kloel/mercadopago.service.ts:281 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/kloel/mercadopago.service.ts:451 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/kloel/mercadopago.service.ts:493 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/kloel/site.controller.ts:67 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/kloel/site.controller.ts:99 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/marketing/marketing.controller.ts:311 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/marketing/marketing.controller.ts:331 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/webhooks/payment-webhook.controller.ts:715 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/webhooks/webhooks.controller.ts:188 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/whatsapp/whatsapp-watchdog.service.ts:924 | fetch() call without AbortController/signal timeout |
| HIGH | worker/browser-runtime/backend-inbound-bridge.ts:66 | fetch() call without AbortController/signal timeout |
| HIGH | worker/browser-runtime/computer-use-orchestrator.ts:371 | fetch() call without AbortController/signal timeout |
| HIGH | worker/browser-runtime/computer-use-orchestrator.ts:427 | fetch() call without AbortController/signal timeout |
| HIGH | worker/browser-runtime/session-manager.ts:2060 | fetch() call without AbortController/signal timeout |
| HIGH | worker/browser-runtime/session-manager.ts:2280 | fetch() call without AbortController/signal timeout |
| HIGH | worker/dlq-monitor.ts:20 | fetch() call without AbortController/signal timeout |
| HIGH | worker/processor.ts:100 | fetch() call without AbortController/signal timeout |
| HIGH | worker/processor.ts:159 | fetch() call without AbortController/signal timeout |
| HIGH | worker/processor.ts:180 | fetch() call without AbortController/signal timeout |
| HIGH | worker/processor.ts:268 | fetch() call without AbortController/signal timeout |
| HIGH | worker/processors/autopilot-processor.ts:220 | fetch() call without AbortController/signal timeout |
| HIGH | worker/providers/unified-agent-integrator.ts:59 | fetch() call without AbortController/signal timeout |
| HIGH | worker/providers/whatsapp-api-provider.ts:316 | fetch() call without AbortController/signal timeout |
| HIGH | worker/utils/ssrf-protection.ts:257 | fetch() call without AbortController/signal timeout |

### Queue Jobs Without Processor (5)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/kloel/mercadopago.service.ts:408 | Queue job 'payment-confirmed' is produced but has no worker processor |
| HIGH | backend/src/mass-send/mass-send.service.ts:45 | Queue job 'dispatch' is produced but has no worker processor |
| HIGH | backend/src/media/media.service.ts:45 | Queue job 'generate-video' is produced but has no worker processor |
| HIGH | backend/src/queue/queue.ts:328 | Queue job 'default' is produced but has no worker processor |
| HIGH | backend/src/scrapers/scrapers.service.ts:27 | Queue job 'run-scraper' is produced but has no worker processor |

### console.log in Production (110)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/bootstrap.ts:8 | console.log() found in production code — use Logger instead |
| INFO | backend/src/bootstrap.ts:9 | console.log() found in production code — use Logger instead |
| INFO | backend/src/bootstrap.ts:10 | console.log() found in production code — use Logger instead |
| INFO | backend/src/bootstrap.ts:41 | console.log() found in production code — use Logger instead |
| INFO | backend/src/bootstrap.ts:48 | console.log() found in production code — use Logger instead |
| INFO | backend/src/bootstrap.ts:53 | console.log() found in production code — use Logger instead |
| INFO | backend/src/bootstrap.ts:59 | console.log() found in production code — use Logger instead |
| INFO | backend/src/bootstrap.ts:82 | console.log() found in production code — use Logger instead |
| INFO | backend/src/bootstrap.ts:133 | console.log() found in production code — use Logger instead |
| INFO | backend/src/bootstrap.ts:148 | console.log() found in production code — use Logger instead |
| INFO | backend/src/bootstrap.ts:151 | console.log() found in production code — use Logger instead |
| INFO | backend/src/bootstrap.ts:201 | console.log() found in production code — use Logger instead |
| INFO | backend/src/bootstrap.ts:203 | console.log() found in production code — use Logger instead |
| INFO | backend/src/bootstrap.ts:218 | console.log() found in production code — use Logger instead |
| INFO | backend/src/bootstrap.ts:219 | console.log() found in production code — use Logger instead |
| INFO | backend/src/bootstrap.ts:220 | console.log() found in production code — use Logger instead |
| INFO | backend/src/bootstrap.ts:221 | console.log() found in production code — use Logger instead |
| INFO | backend/src/bootstrap.ts:222 | console.log() found in production code — use Logger instead |
| INFO | backend/src/logging/structured-logger.ts:29 | console.log() found in production code — use Logger instead |
| INFO | backend/src/main.ts:15 | console.log() found in production code — use Logger instead |
| INFO | backend/src/main.ts:40 | console.log() found in production code — use Logger instead |
| INFO | backend/src/main.ts:44 | console.log() found in production code — use Logger instead |
| INFO | backend/src/main.ts:278 | console.log() found in production code — use Logger instead |
| INFO | worker/bootstrap.ts:17 | console.log() found in production code — use Logger instead |
| INFO | worker/bootstrap.ts:18 | console.log() found in production code — use Logger instead |
| INFO | worker/bootstrap.ts:19 | console.log() found in production code — use Logger instead |
| INFO | worker/bootstrap.ts:20 | console.log() found in production code — use Logger instead |
| INFO | worker/bootstrap.ts:29 | console.log() found in production code — use Logger instead |
| INFO | worker/bootstrap.ts:33 | console.log() found in production code — use Logger instead |
| INFO | worker/bootstrap.ts:38 | console.log() found in production code — use Logger instead |
| INFO | worker/bootstrap.ts:44 | console.log() found in production code — use Logger instead |
| INFO | worker/bootstrap.ts:70 | console.log() found in production code — use Logger instead |
| INFO | worker/bootstrap.ts:112 | console.log() found in production code — use Logger instead |
| INFO | worker/bootstrap.ts:123 | console.log() found in production code — use Logger instead |
| INFO | worker/bootstrap.ts:126 | console.log() found in production code — use Logger instead |
| INFO | worker/bootstrap.ts:176 | console.log() found in production code — use Logger instead |
| INFO | worker/bootstrap.ts:178 | console.log() found in production code — use Logger instead |
| INFO | worker/bootstrap.ts:212 | console.log() found in production code — use Logger instead |
| INFO | worker/bootstrap.ts:213 | console.log() found in production code — use Logger instead |
| INFO | worker/bootstrap.ts:214 | console.log() found in production code — use Logger instead |
| INFO | worker/bootstrap.ts:215 | console.log() found in production code — use Logger instead |
| INFO | worker/bootstrap.ts:216 | console.log() found in production code — use Logger instead |
| INFO | worker/browser-runtime/observer-loop.ts:618 | console.log() found in production code — use Logger instead |
| INFO | worker/browser-runtime/screencast-server.ts:507 | console.log() found in production code — use Logger instead |
| INFO | worker/campaign-processor.ts:32 | console.log() found in production code — use Logger instead |
| INFO | worker/campaign-processor.ts:75 | console.log() found in production code — use Logger instead |
| INFO | worker/campaign-processor.ts:175 | console.log() found in production code — use Logger instead |
| INFO | worker/context-store.ts:22 | console.log() found in production code — use Logger instead |
| INFO | worker/context-store.ts:46 | console.log() found in production code — use Logger instead |
| INFO | worker/db.ts:28 | console.log() found in production code — use Logger instead |
| INFO | worker/dlq-monitor.ts:80 | console.log() found in production code — use Logger instead |
| INFO | worker/logger.ts:18 | console.log() found in production code — use Logger instead |
| INFO | worker/media-processor.ts:8 | console.log() found in production code — use Logger instead |
| INFO | worker/media-processor.ts:41 | console.log() found in production code — use Logger instead |
| INFO | worker/metrics-server.ts:476 | console.log() found in production code — use Logger instead |
| INFO | worker/providers/anti-ban.ts:15 | console.log() found in production code — use Logger instead |
| INFO | worker/providers/anti-ban.ts:52 | console.log() found in production code — use Logger instead |
| INFO | worker/providers/anti-ban.ts:72 | console.log() found in production code — use Logger instead |
| INFO | worker/providers/crm.ts:10 | console.log() found in production code — use Logger instead |
| INFO | worker/providers/crm.ts:31 | console.log() found in production code — use Logger instead |
| INFO | worker/providers/tools-registry.ts:120 | console.log() found in production code — use Logger instead |
| INFO | worker/providers/whatsapp-api-provider.ts:659 | console.log() found in production code — use Logger instead |
| INFO | worker/providers/whatsapp-api-provider.ts:689 | console.log() found in production code — use Logger instead |
| INFO | worker/providers/whatsapp-api-provider.ts:716 | console.log() found in production code — use Logger instead |
| INFO | worker/providers/whatsapp-api-provider.ts:744 | console.log() found in production code — use Logger instead |
| INFO | worker/providers/whatsapp-api-provider.ts:943 | console.log() found in production code — use Logger instead |
| INFO | worker/providers/whatsapp-api-provider.ts:957 | console.log() found in production code — use Logger instead |
| INFO | worker/providers/whatsapp-api-provider.ts:1016 | console.log() found in production code — use Logger instead |
| INFO | worker/providers/whatsapp-engine.ts:106 | console.log() found in production code — use Logger instead |
| INFO | worker/providers/whatsapp-engine.ts:201 | console.log() found in production code — use Logger instead |
| INFO | worker/queue.ts:8 | console.log() found in production code — use Logger instead |
| INFO | worker/queue.ts:9 | console.log() found in production code — use Logger instead |
| INFO | worker/queue.ts:30 | console.log() found in production code — use Logger instead |
| INFO | worker/queue.ts:31 | console.log() found in production code — use Logger instead |
| INFO | worker/queue.ts:49 | console.log() found in production code — use Logger instead |
| INFO | worker/queue.ts:53 | console.log() found in production code — use Logger instead |
| INFO | worker/queue.ts:237 | console.log() found in production code — use Logger instead |
| INFO | worker/queue.ts:253 | console.log() found in production code — use Logger instead |
| INFO | worker/redis-client.ts:7 | console.log() found in production code — use Logger instead |
| INFO | worker/redis-client.ts:8 | console.log() found in production code — use Logger instead |
| INFO | worker/redis-client.ts:38 | console.log() found in production code — use Logger instead |
| INFO | worker/redis-client.ts:39 | console.log() found in production code — use Logger instead |
| INFO | worker/redis-client.ts:98 | console.log() found in production code — use Logger instead |
| INFO | worker/reprocess-dlq.ts:25 | console.log() found in production code — use Logger instead |
| INFO | worker/reprocess-dlq.ts:44 | console.log() found in production code — use Logger instead |
| INFO | worker/reprocess-dlq.ts:50 | console.log() found in production code — use Logger instead |
| INFO | worker/resolve-redis.ts:40 | console.log() found in production code — use Logger instead |
| INFO | worker/resolve-redis.ts:44 | console.log() found in production code — use Logger instead |
| INFO | worker/resolve-redis.ts:50 | console.log() found in production code — use Logger instead |
| INFO | worker/resolve-redis.ts:78 | console.log() found in production code — use Logger instead |
| INFO | worker/resolve-redis.ts:146 | console.log() found in production code — use Logger instead |
| INFO | worker/retry-jobs.ts:8 | console.log() found in production code — use Logger instead |
| INFO | worker/retry-jobs.ts:11 | console.log() found in production code — use Logger instead |
| INFO | worker/retry-jobs.ts:15 | console.log() found in production code — use Logger instead |
| INFO | worker/scraper-processor.ts:19 | console.log() found in production code — use Logger instead |
| INFO | worker/scraper-processor.ts:31 | console.log() found in production code — use Logger instead |
| INFO | worker/scraper-processor.ts:45 | console.log() found in production code — use Logger instead |
| INFO | worker/scraper-processor.ts:57 | console.log() found in production code — use Logger instead |
| INFO | worker/scraper-processor.ts:147 | console.log() found in production code — use Logger instead |
| INFO | worker/scrapers/google-maps.ts:62 | console.log() found in production code — use Logger instead |
| INFO | worker/scrapers/google-maps.ts:83 | console.log() found in production code — use Logger instead |
| INFO | worker/scrapers/google-maps.ts:110 | console.log() found in production code — use Logger instead |
| INFO | worker/scrapers/google-maps.ts:159 | console.log() found in production code — use Logger instead |
| INFO | worker/scrapers/instagram.ts:55 | console.log() found in production code — use Logger instead |
| INFO | worker/scrapers/instagram.ts:82 | console.log() found in production code — use Logger instead |
| INFO | worker/voice-processor.ts:26 | console.log() found in production code — use Logger instead |
| INFO | worker/voice-processor.ts:82 | console.log() found in production code — use Logger instead |
| INFO | worker/voice-processor.ts:95 | console.log() found in production code — use Logger instead |
| INFO | worker/voice-processor.ts:167 | console.log() found in production code — use Logger instead |
| INFO | worker/voice-processor.ts:186 | console.log() found in production code — use Logger instead |

### Hardcoded Internal URLs (15)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/app/(checkout)/[slug]/page.tsx:9 | Hardcoded internal/infrastructure URL: http://localhost |
| WARNING | frontend/src/lib/http.ts:75 | Hardcoded internal/infrastructure URL: http://localhost |
| WARNING | backend/src/billing/payment-method.service.ts:81 | Hardcoded internal/infrastructure URL: http://localhost |
| WARNING | backend/src/common/storage/storage.service.ts:39 | Hardcoded internal/infrastructure URL: http://localhost |
| WARNING | backend/src/config/app-config.module.ts:42 | Hardcoded internal/infrastructure URL: http://localhost |
| WARNING | backend/src/main.ts:110 | Hardcoded internal/infrastructure URL: https://kloel-frontend.vercel.app |
| WARNING | backend/src/main.ts:111 | Hardcoded internal/infrastructure URL: https://kloel.vercel.app |
| WARNING | backend/src/main.ts:112 | Hardcoded internal/infrastructure URL: http://localhost |
| WARNING | backend/src/main.ts:113 | Hardcoded internal/infrastructure URL: http://localhost |
| WARNING | backend/src/media/media.service.ts:31 | Hardcoded internal/infrastructure URL: http://localhost |
| WARNING | backend/src/partnerships/partnerships.service.ts:183 | Hardcoded internal/infrastructure URL: http://localhost |
| WARNING | backend/src/team/team.service.ts:104 | Hardcoded internal/infrastructure URL: http://localhost |
| WARNING | worker/metrics-server.ts:66 | Hardcoded internal/infrastructure URL: http://127.0.0.1 |
| WARNING | worker/providers/tools-registry.ts:155 | Hardcoded internal/infrastructure URL: http://localhost |
| WARNING | worker/utils/signed-storage-url.ts:17 | Hardcoded internal/infrastructure URL: http://localhost |

---

## CORRECTION PROMPT

Copy and paste the following into Claude Code to fix all critical and warning issues:

```
Fix the following codebase connectivity issues found by PULSE:

```