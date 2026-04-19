# noSecrets Triage — 2026-04-15

> Historical note: the recommendation below that mentions inline
> `biome-ignore` suppressions is superseded. Under the Codacy MAX-RIGOR lock,
> this repository no longer allows suppression comments as a response to Codacy
> noise.

**Source**: Biome `lint/nursery/noSecrets` (1.9.4) on HEAD
`a72ca6dbfee626f2626d70685b50b5d15a75f56b`.
Scanned trees: `frontend/src`, `worker`, `backend/src`. Backend uses `/tmp/biome-secrets.json` with
`unsafeParameterDecoratorsEnabled: true`. Frontend was split into subdirectories (`app`,
`components/kloel`, `components/products`, `lib/fabric`, `lib/frontend-capabilities.ts`,
`lib/machine-rails.ts`, `proxy.ts`) to bypass Biome 1.9.4's hard 100-diagnostic cap so all results
were captured.

**Total findings**: 145 (100 frontend + 19 worker + 26 backend)
**Real leaks**: 0
**False positives**: 145
**Files Biome could not parse**: 0 (every file in scope linted cleanly under the security rule)

## Real leaks (ACTION REQUIRED)

None. No `sk-*`, `pk_live_*`, `xox[bapr]-*`, `AKIA*`, `ghp_*`, `pypi-*`, `ya29*`, JWT (`ey...`),
Google service-account JSON, or `proto://user:pass@host` URL was detected anywhere in the scanned
trees. The single named-pattern hit (Facebook OAuth, see below) is the public Facebook Pixel script
URL — not a token.

## False positives (document reason)

### Type-of-secret breakdown

| Type                                               | Count |
| -------------------------------------------------- | ----- |
| `Detected high entropy string` (heuristic only)    | 144   |
| `Facebook OAuth` (regex on `connect.facebook.net`) | 1     |

The high-entropy heuristic in Biome 1.9.4 fires on any string that exceeds an entropy threshold and
is wider than ~20 characters. It does not look at content semantics. Every flagged string in this
codebase is one of the following non-secret categories:

### Group A — Route / URL literals (Next.js navigation, redirects, marketing copy)

~70 findings. Long descriptive URLs like `'/analytics?tab=exportacoes'`,
`'/settings?section=billing'`, `'/parcerias/colaboradores'`, `'/products?feature=order-bump'`, etc.
These are public route paths used by `router.push` / anchor `href` and as map keys in
`frontend/src/lib/frontend-capabilities.ts`, `frontend/src/lib/machine-rails.ts`,
`frontend/src/components/kloel/AppShell.tsx`,
`frontend/src/components/kloel/sidebar/SidebarUserMenu.tsx`,
`frontend/src/components/kloel/landing/KloelLanding.tsx`,
`frontend/src/app/(main)/followups/page.tsx`, `frontend/src/app/(main)/scrapers/page.tsx`,
`frontend/src/app/(main)/whatsapp/page.tsx`, `frontend/src/app/(public)/onboarding-chat/page.tsx`,
`frontend/src/components/kloel/conta/ContaView.tsx`,
`frontend/src/components/kloel/anuncios/AnunciosView.tsx`,
`frontend/src/components/kloel/parcerias/ParceriasView.tsx`,
`frontend/src/components/kloel/vendas/VendasView.tsx`,
`frontend/src/components/products/CheckoutConfigPage.tsx`,
`frontend/src/components/products/ProductGeneralTab.tsx`,
`frontend/src/components/products/ProductPlansTab.tsx`,
`frontend/src/components/kloel/cookies/CookiePolicyPage.tsx`,
`frontend/src/components/kloel/header-minimal.tsx`. None of these strings are credentials.

### Group B — Public third-party endpoints

- `frontend/src/app/(checkout)/components/PixelTracker.tsx:82:11` —
  `https://connect.facebook.net/en_US/fbevents.js` (Facebook Pixel public bootstrap script). Only
  "Facebook OAuth"-typed hit; matches solely because of the `connect.facebook.net` domain.
- `frontend/src/lib/fabric/FontManager.ts:27:3` —
  `https://fonts.googleapis.com/css2?family=Sora:...` Google Fonts URL.
- `backend/src/auth/google-auth.service.ts:40:5` —
  `https://people.googleapis.com/v1/people/me?personFields=...` Google People API endpoint constant.

### Group C — Audit-log resource / action constants

~10 findings. `'DELETE_RECORD'`, `'CheckoutProductPlan'`, `'ProductCommission'`,
`'WebhookSubscription'`, etc., passed to `auditService.log({ action, resource })` in
`backend/src/checkout/checkout.service.ts`, `backend/src/kloel/product-sub-resources.controller.ts`,
`backend/src/webhooks/webhook-settings.controller.ts`. These are static enum-like identifiers, not
secrets.

### Group D — Error / exception messages and class names

~12 findings. Portuguese validator messages (`'afterPayShippingProvider é inválido'`,
`'commissionCookieDays precisa ficar entre 1 e 3650'`,
`'Conecte/configure o WhatsApp antes de ativar o Autopilot. Faltando: ...'`,
`'useNerveCenterContext must be used inside ProductNerveCenterProvider'`) and error-class `name`
properties (`'RedisConfigurationError'`, `'LLMInputTooLargeError'`) in
`backend/src/kloel/product.controller.ts`, `backend/src/autopilot/autopilot.service.ts`,
`backend/src/campaigns/campaigns.service.ts`, `backend/src/kloel/openai-wrapper.ts`,
`backend/src/common/redis/resolve-redis-url.ts`, `worker/resolve-redis-url.ts`,
`frontend/src/components/kloel/products/product-nerve-center.context.tsx`. Pure literals.

### Group E — Console / Logger banner strings

~14 findings on lines like `console.log('========================================')` or
`appLogger.warn('============================================')`. The banner of `=` characters is
high-entropy by Biome's heuristic. Locations: `worker/bootstrap.ts:38`, `worker/bootstrap.ts:74`,
`worker/bootstrap.ts:76`, `worker/queue.ts:60`, `worker/queue.ts:62`, `worker/redis-client.ts:33`,
`worker/redis-client.ts:35`, `backend/src/main.ts:82`, `backend/src/main.ts:101`,
`backend/src/bootstrap.ts:36`, `backend/src/bootstrap.ts:68`, `backend/src/bootstrap.ts:70`,
`backend/src/app.module.ts:135`, `backend/src/app.module.ts:140`. Cosmetic logging only.

### Group F — Logger context names / log message labels

- `backend/src/metrics/queue-health.service.ts:17:29` — `new Logger('QueueHealthService')`.
- `worker/processors/autopilot-processor.ts:6330:14` — log key
  `'acquireCiaContactLock redis failure'`.
- `backend/src/i18n/i18n.service.ts:246:9` — telemetry tag `'i18n.detectLanguageFromText'`.
- `backend/src/meta/meta-auth.controller.ts:91:12` — fallback redirect path
  `'/settings?section=apps'`.
- `backend/src/flows/flows.service.ts:390:18` — Prisma JSON path field name `'waitingForContact'`.
- `backend/src/checkout/checkout-social-lead.service.ts:557:9` — address-field synonym
  `'addressComplement'`.

### Group G — DOM / scraper selectors and crypto alphabet constants

- `worker/scrapers/instagram.ts:63:34` — `'input[name="username"]'` Puppeteer selector.
- `worker/scrapers/google-maps.ts:70:31` / `:102:53` / `:121:33` / `:126:44` —
  `'form[action*="consent"] button'`, `'div[role="article"]'` selectors.
- `frontend/src/proxy.ts:256:5` — Next.js middleware matcher regex (`/((?!_next/static|...).*)/`).
- `backend/src/checkout/checkout-code.util.ts:3:23` — public-checkout-code alphabet
  `'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'`.
- `frontend/src/components/kloel/landing/KloelLanding.tsx:17:12` — glitch-effect alphabet
  constant.
- `frontend/src/components/kloel/landing/FloatingChat.tsx:403:24` — CSS
  `animation: 'floatingChatFadeIn 150ms ease'`.

### Group H — LLM JSON-schema prompt descriptors (worker autopilot)

- `worker/processors/autopilot-processor.ts` lines `6603`, `6605`, `6606`, `6607`, `6618`. Strings
  like `'purchaseProbability ("LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH")'`,
  `'demographicsConfidence (0-1 número)'`. These are field-spec lines fed to the model in a system
  prompt. Not secrets.

### Group I — UI placeholder / form copy

- `frontend/src/components/kloel/conta/ContaView.tsx:1187:38`, `:1196:36` — Brazilian field labels
  `'inscricaoEstadual'`, `'inscricaoMunicipal'`.
- `frontend/src/components/products/CheckoutConfigPage.tsx:778`, `:847`, `:930`, `:938` — checkout
  welcome-message form copy and onChange handler keys.
- `backend/src/common/payment-state-machine.ts:3:27` — Logger context name
  `'PaymentStateMachine'`.

## Not scanned

None — all 482 frontend, 79 worker, and 403 backend files in scope linted successfully. Test files
(`__tests__/**`, `*.spec.ts`, `*.test.ts(x)`, `*.d.ts`) were excluded per `/tmp/biome-secrets.json`
to mirror standard CI scope.

## Conclusion

The Biome `noSecrets` rule in 1.9.4 is heuristic-only outside of a handful of named patterns. On
this codebase the heuristic produces 100% noise and zero signal: 144/145 hits are pure entropy noise
on routes, log banners, error messages, and prompt schemas, and the one named-pattern hit is the
public Facebook Pixel CDN URL. No credential rotation is required from this scan. If the rule is
enabled in CI it should be configured with the project's known false-positive shapes (route
literals, audit constants, logger banners) suppressed via inline
`// biome-ignore lint/nursery/noSecrets` comments at the source of each repeating shape, or —
preferred — kept off until Biome ships content-aware detection.
