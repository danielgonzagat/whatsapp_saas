# Changelog

All notable changes to this project will be documented in this file.

## chore/purga-total-debt (PR #276)

### Added

- Brain spine-audit service + admin endpoint
- Contact identity resolver + merge
- Kloel global prior (cross-workspace cold-start Bayesian)
- Silent_24h outcome resolver (P11)
- Runtime conversation tracer
- Marketing decomp (mailbox-gmail-oauth, marketing-connect)
- Frontend page decomp (OfficialMarketingChannelPage)

### Fixed

- DI bug in 3 mailbox-gmail-oauth files (import type)
- Race condition in silent_24h resolver (atomic claim)
- BadRequest validation on brain spine-audit since param
- Wave-1 visual contract regression (globals.css revert)

### Removed

- `__wave_m_detail__.ts` debug helper
- 14 emojis backend log/template
- 13 nosemgrep/biome-ignore in scripts/ops
- HTML lupa entity (replaced by lucide Search)

## [0.6.0](https://github.com/danielgonzagat/whatsapp_saas/compare/v0.5.0...v0.6.0) (2026-05-19)


### Features

* **abi:** cognitive state ABI schema + shadow builder + validator — onda 1 abi-001..004 ([8abbd72](https://github.com/danielgonzagat/whatsapp_saas/commit/8abbd72dfa8a07589feaf42f49776ca1ea279db5))
* **admin:** add /admin/mind/lift overview endpoint ([e761511](https://github.com/danielgonzagat/whatsapp_saas/commit/e761511b455ed68099d2155c73f436ed6a328e6a))
* **admin:** runtime trace query endpoint ([0fb03a8](https://github.com/danielgonzagat/whatsapp_saas/commit/0fb03a8c3c2e1225b7de659f7b66a96e5a89e405))
* **app-module:** wire GoalFieldModule (camada III) ([52098cb](https://github.com/danielgonzagat/whatsapp_saas/commit/52098cb65241bf7b5cf270ae287d807689499095))
* **atomic-edit:** add atomic_replace_text — close the builtin-edit fallback leak ([0fbad66](https://github.com/danielgonzagat/whatsapp_saas/commit/0fbad6684375d475b55f8bc3039e34eb6e414e38))
* **atomic-edit:** make atomic editing the permanent default for all OpenCode agents/subagents ([db6173a](https://github.com/danielgonzagat/whatsapp_saas/commit/db6173a682715b779c43f48f595b6a4cead5bed6))
* **atomic-edit:** structured code action space MCP v3 — closes line-oriented action bottleneck ([5e90f72](https://github.com/danielgonzagat/whatsapp_saas/commit/5e90f72cc83564e480c15f9bf2bbbebd9236f79a))
* **atomic-edit:** universal 3-CLI connection — add Codex CLI to the shared tool ([84d734b](https://github.com/danielgonzagat/whatsapp_saas/commit/84d734b44ff86363cbb8c00238c40c096ae61756))
* **auth:** apple programmatic validation probe + diagnostic endpoint (P8.1) ([e2766ed](https://github.com/danielgonzagat/whatsapp_saas/commit/e2766ed8cec9408a48c50dc11cc2012940b53a8c))
* **autopilot:** persist operator evidence and mission guidance ([3ade11e](https://github.com/danielgonzagat/whatsapp_saas/commit/3ade11e7eab7b4f050c0da9d6689a72e3139ba2c))
* **brain:** spine audit service + admin endpoint (P7.2 verification) ([a227601](https://github.com/danielgonzagat/whatsapp_saas/commit/a2276016059c134e13a44f740c277ffb9fa58bdd))
* **cognitive-organism:** freeze PCI (Pacote de Contratos Imutáveis) — Onda 0 ([0e1b72e](https://github.com/danielgonzagat/whatsapp_saas/commit/0e1b72eb3cbab09f1bb5e01a88041c507be3fda0))
* **cognitive:** final wave — ecosys + abi-009 cutover + role hardening ([9d1c643](https://github.com/danielgonzagat/whatsapp_saas/commit/9d1c64344ab227469a6892b6f8bd7e377bbfae76))
* **cognitive:** onda 2 consumers — local-identity + maturity + trust ([3ff337c](https://github.com/danielgonzagat/whatsapp_saas/commit/3ff337ce3ec6e494b31606c31c0de73465f81af5))
* **cognitive:** onda 3 second-order consumers + abi-005 substitution ([4d04f44](https://github.com/danielgonzagat/whatsapp_saas/commit/4d04f440b8fbb667a8995f9860dec4e35c5514e0))
* **cognitive:** onda 4 — recovery + coldstart + wow + postsale-consumers ([0a41bc5](https://github.com/danielgonzagat/whatsapp_saas/commit/0a41bc51d2cf9c6e602e4053ae8ef3bfac215f3f))
* **cognitive:** onda 5 + onda 6 partial — delegation/offer/healthy-money/hypproof/commem/clarity ([91dd543](https://github.com/danielgonzagat/whatsapp_saas/commit/91dd543d48010e2841caddc8c5f554228f0284bb))
* **cognitive:** onda 5/8/9 — owner-criterion + defens + move + legit + evol + incent ([5259c16](https://github.com/danielgonzagat/whatsapp_saas/commit/5259c16146ea8dc1cd0d986b12065e74c10fcb99))
* **cognitive:** onda 7 — role + affil + agency + creator + channel + cash ([50e641e](https://github.com/danielgonzagat/whatsapp_saas/commit/50e641e466fdef431e9fe6f590ebc2f87606e175))
* **cognitive:** production-readiness gap fleet — 8 utps + orchestrator finishes ([202eddf](https://github.com/danielgonzagat/whatsapp_saas/commit/202eddf49d2644fe30b03fda281d24b4ebc9b6ae))
* **contacts:** cross-channel identity resolver (P12) ([34334cf](https://github.com/danielgonzagat/whatsapp_saas/commit/34334cf1dbf5bb02e2a30596f7a671eeb5ebc4d8))
* **contacts:** identity merge for shared phone/email (P12) ([db33007](https://github.com/danielgonzagat/whatsapp_saas/commit/db33007d612e6ce3d7aaaf14378916d96601720b))
* **dev:** pulse re-cert runner + status checker (P-recert) ([70515a3](https://github.com/danielgonzagat/whatsapp_saas/commit/70515a31c49be191a66e22907bdff10c72d425d1))
* **event-emit:** 8-surface fleet — onda 1 EVENT-EMIT-* + spine hardening ([a4df356](https://github.com/danielgonzagat/whatsapp_saas/commit/a4df356f680a376be5224d23b6deb625c0504787))
* **frontend/auth:** apple sign-in button gated by diagnostic (P8.1) ([56bf588](https://github.com/danielgonzagat/whatsapp_saas/commit/56bf5881a7b3dc0700cab69af84d0923fbf5a80c))
* **goal-field:** tension detectors + emerge/select/survive — onda 1 ([af0ab0a](https://github.com/danielgonzagat/whatsapp_saas/commit/af0ab0a3d43726246585b7790deb0b05e6957d7f))
* **inbox:** emit inbound.received event for outcome attribution ([1254beb](https://github.com/danielgonzagat/whatsapp_saas/commit/1254beb528cc7ad6fa386461a06b08bd8f1df55f))
* **kloel:** add durable agent evidence store ([70ba3b3](https://github.com/danielgonzagat/whatsapp_saas/commit/70ba3b34a2f884123d31346daafedb9b3b9ada91))
* **kloel:** add episodic session recall ([cb3acbd](https://github.com/danielgonzagat/whatsapp_saas/commit/cb3acbd80faa7f70552a29043a045a0cb359ef32))
* **kloel:** add pluggable agent memory providers ([8179e6d](https://github.com/danielgonzagat/whatsapp_saas/commit/8179e6d59d3d0b3e89523aa170b66fc73e324ee2))
* **kloel:** allow governed agent job pausing ([d873ca1](https://github.com/danielgonzagat/whatsapp_saas/commit/d873ca138e25550f16616aeabdae886a9c3b63f6))
* **kloel:** batch consolidation — postsale-consumers + recovery + team + trust + others ([a4978bf](https://github.com/danielgonzagat/whatsapp_saas/commit/a4978bf98db5bb90e08d9e4550de88442c1e4b14))
* **kloel:** brain operator capabilities — chat dispatches 5 real actions ([a315d62](https://github.com/danielgonzagat/whatsapp_saas/commit/a315d6265a5ca050571aa7f91f3d7edaad37e34a))
* **kloel:** cognitive organism — 34 camadas + B1/B7/B17 cutover + Nest DI repair ([37ecb48](https://github.com/danielgonzagat/whatsapp_saas/commit/37ecb484a118c9d52fbe4c1c58153225b125c03a))
* **kloel:** concurrent ABI cutover lapidations across reply paths ([bddebf9](https://github.com/danielgonzagat/whatsapp_saas/commit/bddebf90d6a61e00b495816e988c6e2800b2503e))
* **kloel:** curate notable agent turn memory ([41255a8](https://github.com/danielgonzagat/whatsapp_saas/commit/41255a8d794f8383d92a7d979d75e6f010705dad))
* **kloel:** decision-outcome service records and closes outcome cycles ([95d2acd](https://github.com/danielgonzagat/whatsapp_saas/commit/95d2acd93365a310903f6ee12387c3ab90f63a04))
* **kloel:** economic hierarchy attribution helper (P10) ([2f63cbc](https://github.com/danielgonzagat/whatsapp_saas/commit/2f63cbc8521393091a178c8d77588e1133a584b5))
* **kloel:** enforce scoped agent job tools ([9ac4290](https://github.com/danielgonzagat/whatsapp_saas/commit/9ac4290a117a24bbfcfe80c95546880a4a2c6cd0))
* **kloel:** expose persistent agent runtime tools ([8eada8c](https://github.com/danielgonzagat/whatsapp_saas/commit/8eada8cebbc8ef2c4c3824b5a06f0980abb6ad5f))
* **kloel:** expose session recall tool ([f9bfd60](https://github.com/danielgonzagat/whatsapp_saas/commit/f9bfd609c87bdc4d48d6bf75691743ddfcf770cd))
* **kloel:** feed closed outcomes into kloel-global-prior (P6.4) ([e6f3180](https://github.com/danielgonzagat/whatsapp_saas/commit/e6f31801d240385c05b2bfdb505e472bc6481fc9))
* **kloel:** h1 wave pulse gates + capability + shadow + abi-ab ([61e0c1d](https://github.com/danielgonzagat/whatsapp_saas/commit/61e0c1db63570551e433666b3a31ca6a142c3448))
* **kloel:** h2 wave runtime metrics + 3 pulse gates + wisdom privacy + pci scanner ([e81656b](https://github.com/danielgonzagat/whatsapp_saas/commit/e81656b1d04a10368f6e4ec1a8ee5f73fbfeddca))
* **kloel:** h3+h4 wave 4 future pulse gates + module wiring ([3762ff0](https://github.com/danielgonzagat/whatsapp_saas/commit/3762ff0c039c4c21b19c75fda59d5e136c8dff0e))
* **kloel:** h5 partial — pulse truth snapshot + runtime metrics bootstrap + module wiring ([b68522a](https://github.com/danielgonzagat/whatsapp_saas/commit/b68522aba6067d6ba83ec42bb0eff154a240a283))
* **kloel:** h6 wave specs + complete pulse-gates module wiring (14 gates) ([f6db3b1](https://github.com/danielgonzagat/whatsapp_saas/commit/f6db3b1dc7e3471580fe1b2b1accae0069ad8543))
* **kloel:** h7 wave commercial-organism dimensions (8 utps) ([d12d87c](https://github.com/danielgonzagat/whatsapp_saas/commit/d12d87c1abac78244df8e829d72760b875fa6f3e))
* **kloel:** h8 wave cash + channel-survival + defens-growth + 4 audits ([7ee0dd4](https://github.com/danielgonzagat/whatsapp_saas/commit/7ee0dd4cee681be35666458fc25084602fb0d750))
* **kloel:** h9 wave insight + wow + coldstart + clarity + healthymoney + affil + move + wisdom ([e4caa6d](https://github.com/danielgonzagat/whatsapp_saas/commit/e4caa6d25abd541cf0db6b039c31b5a8b234e3f5))
* **kloel:** harden agent runtime memory evidence ([0f51f6f](https://github.com/danielgonzagat/whatsapp_saas/commit/0f51f6fccac52e7becd773bc1e6e853a80c11f73))
* **kloel:** harden agent runtime persistence ([be26555](https://github.com/danielgonzagat/whatsapp_saas/commit/be26555992bd89bc991431633c6ee17af032a197))
* **kloel:** kloel-global-prior service + channel-scoped mind beliefs (P6) ([75e70f9](https://github.com/danielgonzagat/whatsapp_saas/commit/75e70f92a748a7a477ff3d8265f9f176e726db19))
* **kloel:** limit tool result context size ([1210c0a](https://github.com/danielgonzagat/whatsapp_saas/commit/1210c0abbc74d291231c684eb92cf91647ad9c2f))
* **kloel:** mind-lift-report service aggregates lift per decision/channel ([b154fdd](https://github.com/danielgonzagat/whatsapp_saas/commit/b154fddbc39660134a2800ad1b29e36a3c4b66f7))
* **kloel:** per-channel repertoire config (P6) ([3f2c8e5](https://github.com/danielgonzagat/whatsapp_saas/commit/3f2c8e5035b34cf7a7bac1c98a359554c8ccb4cf))
* **kloel:** persist agent delegation observations ([a53cd07](https://github.com/danielgonzagat/whatsapp_saas/commit/a53cd077eb0effd9f2742385edfcb7d0460e8eb8))
* **kloel:** persist agent job execution snapshots ([574a774](https://github.com/danielgonzagat/whatsapp_saas/commit/574a7747c5d679ecfa5a01660783f8dff8f4881f))
* **kloel:** persist compressed agent context ([c63ccb4](https://github.com/danielgonzagat/whatsapp_saas/commit/c63ccb48c427f37216e9494e7297a8a7199d9f4c))
* **kloel:** record decision in orchestrator at action build (P11 wiring) ([5d18023](https://github.com/danielgonzagat/whatsapp_saas/commit/5d18023bd4f764a78018a07f6e725cdd109b4134))
* **kloel:** retrieve durable agent tool artifacts ([5769987](https://github.com/danielgonzagat/whatsapp_saas/commit/576998769ead6bf2601dcb319bc60483a83c84b0))
* **kloel:** run scheduled agent jobs from persistent outbox ([b7ecfa5](https://github.com/danielgonzagat/whatsapp_saas/commit/b7ecfa51e6ee25fe7df134ee93010d680ad1802a))
* **kloel:** runtime-conversation-tracer service + e2e runtime evidence ([3a4539a](https://github.com/danielgonzagat/whatsapp_saas/commit/3a4539a1920caa989f583ad155b9305ff4939c85))
* **kloel:** sync agent turns through memory providers ([7f22f12](https://github.com/danielgonzagat/whatsapp_saas/commit/7f22f127c061126dad01c4ef11e7bcb8ed7bb3d2))
* **kloel:** track procedural skill usage ([024e762](https://github.com/danielgonzagat/whatsapp_saas/commit/024e7626693d5ba5532768c94ff2439af0c715ba))
* **kloel:** version procedural agent skills ([5cbe730](https://github.com/danielgonzagat/whatsapp_saas/commit/5cbe730c7e4a53720ecf8dfb9c65d2761173a7ac))
* **lineage:** genesis + ledger + guard + projector — onda 1 lineage-001..006 ([55e8b31](https://github.com/danielgonzagat/whatsapp_saas/commit/55e8b31db253cf52ec6bb8db6b73b4bc2fd68850))
* **lineage:** prisma persistence + nestjs wiring — onda 1 lineage-007/008 ([ad311bf](https://github.com/danielgonzagat/whatsapp_saas/commit/ad311bf9da766031f49c03ab1c0a8a4e6ae9023b))
* **logging:** structured-logger accepts legacy NestJS Logger signatures ([38d5066](https://github.com/danielgonzagat/whatsapp_saas/commit/38d5066022df9f288b5aec41fc8ba7023c82eb37))
* **marketing:** add channel-setup/complete endpoint and sync currentStep to ChannelSetup table ([3e97efb](https://github.com/danielgonzagat/whatsapp_saas/commit/3e97efb261ade952aa57e6fa883eca15792fd69f))
* **marketing:** add initialStep prop and Concluir button to OfficialMarketingChannelPage ([c38dcb7](https://github.com/danielgonzagat/whatsapp_saas/commit/c38dcb70a749cf90e038a3417fa33ce4397d3f34))
* **marketing:** imap-smtp sendMessageFromMailbox via nodemailer with footer (P8.4 finish) ([a545bf4](https://github.com/danielgonzagat/whatsapp_saas/commit/a545bf43566726fbe93bf785fdb7d6e89b05eb2d))
* **marketing:** microsoft Graph sendMail with unsubscribe footer (P8.4 finish) ([c551e64](https://github.com/danielgonzagat/whatsapp_saas/commit/c551e64f77a7b1ad9caa4869e81f15d74e3c3f77))
* **marketing:** tiktok + meta connect controller wired to channel-aware state ([65f7c69](https://github.com/danielgonzagat/whatsapp_saas/commit/65f7c690f3dbd0ce42b382a379c12a6f1b117785))
* **marketing:** wire OfficialMarketingChannelPage as 4-step gate in MarketingView (P1.1/P1.2/P4) ([c1823fa](https://github.com/danielgonzagat/whatsapp_saas/commit/c1823faf3f015a86d568d54aac3d9c7258014232))
* **meta:** meta-connection-state service + channel-aware auth/whatsapp ([d942fa2](https://github.com/danielgonzagat/whatsapp_saas/commit/d942fa2e4087226bd7795ecce9c70d7e6022c2e0))
* **mind:** add resolveBestVariant for flow-variant decisions ([d769635](https://github.com/danielgonzagat/whatsapp_saas/commit/d7696350f4398496086d5f58e7085b4477e0be3e))
* **mind:** cognitive substrate (valence/attention/hebbian/consolidation) — onda 1 ([daa5a22](https://github.com/danielgonzagat/whatsapp_saas/commit/daa5a22c1b3a6e4246ec490e701e03c0dce0c62e))
* **observability:** metrics.endpoint dogstatsd + correlation-id spec ([7276374](https://github.com/danielgonzagat/whatsapp_saas/commit/72763745e69c27729173ca1649e37aee6e880e43))
* **obsidian-mirror:** add WORKSPACE_DYNAMIC_DIR + dynamic workspace note tracking ([02f9b9f](https://github.com/danielgonzagat/whatsapp_saas/commit/02f9b9fcced7a396d2b9d38553979994342dc306))
* **ops:** add railway runtime gate to pr276 ([64f3fe4](https://github.com/danielgonzagat/whatsapp_saas/commit/64f3fe4bcacb1f3ceb396041b40cceaa7d07a16d))
* **ops:** pulse_* allowlist anti-fraud bypass-marker gate ([4649290](https://github.com/danielgonzagat/whatsapp_saas/commit/464929057224664441b56cfa02ad938e803a3270))
* **orchestrator:** attach hierarchyJustification to each decision trace ([79415dc](https://github.com/danielgonzagat/whatsapp_saas/commit/79415dc5123ab762478f6fb1f972b8f801c36720))
* **orchestrator:** consult identity resolver at inbound entry (P12) ([4d6c37e](https://github.com/danielgonzagat/whatsapp_saas/commit/4d6c37e3850efab452f67dbb906a2c9aac83682a))
* **orchestrator:** emit 12-step trace records during orchestrateInbound ([2f8e55a](https://github.com/danielgonzagat/whatsapp_saas/commit/2f8e55ab52183377d8ac51d803b8cfe13e018432))
* **pr276:** logger sweep + health endpoints + localStorage migrations + meta 401 ([11d9281](https://github.com/danielgonzagat/whatsapp_saas/commit/11d9281bab5e04093a5aa24a72b6199e5825ef82))
* **pr276:** re-apply logger sweep + health endpoints + localStorage + meta 401 ([125c568](https://github.com/danielgonzagat/whatsapp_saas/commit/125c568ad313e8e7d0fb9475516a8511a504fdc6))
* **prisma:** add channel column to MetaConnection for multi-channel routing ([c5595c1](https://github.com/danielgonzagat/whatsapp_saas/commit/c5595c1dd4db8724725693a2b1970ea39e64f070))
* **pulse-classify:** introduce WebhookEndpoint + InternalEndpoint markers ([cb95a96](https://github.com/danielgonzagat/whatsapp_saas/commit/cb95a96cdff41fc7c01e3ba1b57c6a35d85293d7))
* **pulse-gates:** canonical PCI.4 gates — onda 1 pulse-001..009 ([69c5a7e](https://github.com/danielgonzagat/whatsapp_saas/commit/69c5a7e83556d739bf12b76d1d4ecae9b43e9ba9))
* **spine:** in-process event spine + EVENT-EMIT fleet manifest ([0167a65](https://github.com/danielgonzagat/whatsapp_saas/commit/0167a6575be6dc4a2a6f437fb603e3243046639c))
* **transport:** daily proactive send limit per workspace+channel (P1.4) ([fed1113](https://github.com/danielgonzagat/whatsapp_saas/commit/fed111388ac66c46d6a4257d36ec0da7d0e07c38))
* **transport:** refuse send if email lacks unsubscribe footer ([b93c257](https://github.com/danielgonzagat/whatsapp_saas/commit/b93c257f3332171745b6314516457ec531b9f13a))
* **unsubscribe:** token-signed /unsubscribe endpoint flips contact.optOut (P8.4) ([df8dbd1](https://github.com/danielgonzagat/whatsapp_saas/commit/df8dbd1a477f7819e6a607636868b1571da4bdb5))
* **worker:** follow-up scheduler honors channel followUpEnabled (P1.4) ([b038e85](https://github.com/danielgonzagat/whatsapp_saas/commit/b038e85894285ef3623e9755a998d3074b4af588))
* **worker:** outcome resolver and daily lift report job ([5feb5b7](https://github.com/danielgonzagat/whatsapp_saas/commit/5feb5b711db44596582ffd16538f80cdc560cba0))
* **worker:** silent_24h outcome resolver job (P11) ([ed09b74](https://github.com/danielgonzagat/whatsapp_saas/commit/ed09b74a2bf50f49faa02946b8219f78882ac614))
* **worker:** silent-24h-resolver and outcome-resolver record global prior observations ([61daf25](https://github.com/danielgonzagat/whatsapp_saas/commit/61daf2538280e3d8c3246a54c5c0fa285b0196e8))


### Bug Fixes

* address pr276 review comments ([e7ad158](https://github.com/danielgonzagat/whatsapp_saas/commit/e7ad1581bdeba050bf6405e0bedc4936ea79a7cc))
* **admin-auth:** move refresh token to httpOnly proxy cookie ([02de9ee](https://github.com/danielgonzagat/whatsapp_saas/commit/02de9ee7805164df5461c76817a859ae5fb7c0d8))
* **admin:** restore home products export ([ce00c58](https://github.com/danielgonzagat/whatsapp_saas/commit/ce00c589bd45fefc21efbd9c5ae466a39e82e093))
* align e2e runtime contracts ([5907515](https://github.com/danielgonzagat/whatsapp_saas/commit/59075158749230876534b4db63a55b5341526676))
* **atomic-edit:** anchor REPO_ROOT to .git marker (dist-depth regression) ([8c3dd05](https://github.com/danielgonzagat/whatsapp_saas/commit/8c3dd051c5cf3a5eb6adda8f7ea39aad7cf0cdb9))
* **atomic-edit:** prove Codex CLI on the shared MCP — real defect fixed, evidenced ([66591bf](https://github.com/danielgonzagat/whatsapp_saas/commit/66591bfb9fa181dd2252e32279b40978fc370d3b))
* **backend:** catch-all residual tsc errors after structured-logger migration sweep ([04c68a0](https://github.com/danielgonzagat/whatsapp_saas/commit/04c68a00e8dd88add2819ee6d43afba7da20d790))
* **backend:** harden wave-1 pipeline-state-machine + restore load-bearing casts ([772b3e3](https://github.com/danielgonzagat/whatsapp_saas/commit/772b3e31f55ab6c653f8a41be1ceecd51b8a3f69))
* **backend:** split runtime memory provider ([d1d02c8](https://github.com/danielgonzagat/whatsapp_saas/commit/d1d02c8643ec6541b3a4855ccf3c22f0d025b83b))
* **brain:** validate since query param on spine-audit endpoint ([6131615](https://github.com/danielgonzagat/whatsapp_saas/commit/61316156afac4d6f04fe39a35a099d60ea69ed22))
* calibrate coverage ratchets for pr276 ([33010a7](https://github.com/danielgonzagat/whatsapp_saas/commit/33010a7434778dad869f01b934df93574018a19c))
* chunk backend coverage runner ([320a608](https://github.com/danielgonzagat/whatsapp_saas/commit/320a6085f96b1a65daa78fa17e2cd8e66cbabe09))
* **ci:** allow full quality gate runtime ([c18e01a](https://github.com/danielgonzagat/whatsapp_saas/commit/c18e01aa6392db038e4b62c9fd62c4629babaf3f))
* **ci:** avoid architecture guardrail in whatsapp spec splits ([4d31951](https://github.com/danielgonzagat/whatsapp_saas/commit/4d319517e3c1ce0a87b8da3cb697fff76351323d))
* **ci:** compact backend test logs ([ce48429](https://github.com/danielgonzagat/whatsapp_saas/commit/ce484296e7843a2a628bba896aacfc317a48bd49))
* **ci:** give backend build enough heap ([7bb1fb5](https://github.com/danielgonzagat/whatsapp_saas/commit/7bb1fb5b9dde3dadbb84421503d214c1221c884e))
* **ci:** give codacy gate enough runtime ([a7a7e06](https://github.com/danielgonzagat/whatsapp_saas/commit/a7a7e062054113a9e085a7b68a1abaebb3334199))
* **ci:** give codeql backend build heap headroom ([4d1c2c6](https://github.com/danielgonzagat/whatsapp_saas/commit/4d1c2c6c953625ea15ffaa2b79cd8400f5d33d84))
* **ci:** install pulse runtime dependency in pr deploy gate ([60caa6c](https://github.com/danielgonzagat/whatsapp_saas/commit/60caa6c0e4dc981686c7baa903cdec587f6e608a))
* **ci:** let codacy finish full analysis ([d6d9ebf](https://github.com/danielgonzagat/whatsapp_saas/commit/d6d9ebf8a3c0b44fb01511653087d7afafec17d2))
* **ci:** make claude skills readable for codacy ([e4c3736](https://github.com/danielgonzagat/whatsapp_saas/commit/e4c37360cfc593f372c929f8ef634167e45eddd5))
* **ci:** preserve production environment contract ([847a2b4](https://github.com/danielgonzagat/whatsapp_saas/commit/847a2b4f8cd5da2bf4aef3370fc1a49658a64942))
* **ci:** raise backend build heap ([60c9951](https://github.com/danielgonzagat/whatsapp_saas/commit/60c9951769e23ec08619df47c88317b07064e509))
* **ci:** restore eslint seatbelt baseline ([b535a2c](https://github.com/danielgonzagat/whatsapp_saas/commit/b535a2c6fd1fec724f896749024cab812f6001d0))
* **ci:** restore pr314 gate readiness ([f7619bd](https://github.com/danielgonzagat/whatsapp_saas/commit/f7619bdc4997b1ede18cd75e445e9249267243f2))
* **ci:** restore pulse fixture coverage ([90ec248](https://github.com/danielgonzagat/whatsapp_saas/commit/90ec248c8c86c2860f8dc81b76f5c281189a59af))
* **ci:** restore railway pr gates ([60010df](https://github.com/danielgonzagat/whatsapp_saas/commit/60010df1534e64df34df686fcc9cbcee4cc6c326))
* **ci:** run pr deploy gates without live deploy ([2f54ca4](https://github.com/danielgonzagat/whatsapp_saas/commit/2f54ca4fdc96291e3b9c261a74decfcff5e294a9))
* **ci:** run pr314 gates on purga base ([5234702](https://github.com/danielgonzagat/whatsapp_saas/commit/5234702eeb4386c0e5fe285e526b9c2e90eac882))
* **ci:** split production pr gate from live deploy ([a02efdd](https://github.com/danielgonzagat/whatsapp_saas/commit/a02efdd37fcb235e7d21a10e76e7172582fc4f3c))
* **ci:** split staging pr gate from live deploy ([f9d2f7e](https://github.com/danielgonzagat/whatsapp_saas/commit/f9d2f7eb0460cb01fca553f8f90a16ad04aae06f))
* **ci:** stabilize codeql and visual baselines ([d67bfa3](https://github.com/danielgonzagat/whatsapp_saas/commit/d67bfa3fb8993390e746268503a3840cd4347b64))
* **ci:** stabilize final ratchet gate ([bfc8f7d](https://github.com/danielgonzagat/whatsapp_saas/commit/bfc8f7d124139dac9c77142a7fc993666d5629cc))
* **ci:** stabilize ratchet quality gates ([61ba31c](https://github.com/danielgonzagat/whatsapp_saas/commit/61ba31cfc779a1f976de3056703dfbc58bfc1e3c))
* clear frontend worker seatbelt debt ([e1ff3b1](https://github.com/danielgonzagat/whatsapp_saas/commit/e1ff3b1f129892fd8addc74373ce55a374d2965a))
* clear knip ratchet regressions ([5eab9d8](https://github.com/danielgonzagat/whatsapp_saas/commit/5eab9d84a917e10170719075d35ffceb64732b2f))
* **codacy:** curly rule for 620 brace-missing issues in scripts/ ([d3c16df](https://github.com/danielgonzagat/whatsapp_saas/commit/d3c16dff8a59a511191e16f83c1c9dca9c611019))
* **codacy:** errorprone batch — 11 issues across 8 scripts ([1cb032f](https://github.com/danielgonzagat/whatsapp_saas/commit/1cb032f2c9f83a5a993a14c3174ea690c8884307))
* **codacy:** replace ++/-- operators with += 1/-= 1 in backend and worker ([7f8b559](https://github.com/danielgonzagat/whatsapp_saas/commit/7f8b5593cd1f1d5f73986373cc08e5728987f889))
* declare recharts react-is peer ([7244d63](https://github.com/danielgonzagat/whatsapp_saas/commit/7244d631ce0d8c3fbc22ccb579a9004868ff2bef))
* **deploy:** restore Railway CLI project token flow ([9261017](https://github.com/danielgonzagat/whatsapp_saas/commit/92610177cfd36f8fa97c93f0f75d18a3a2bdcea1))
* **deps:** include next swc optional packages ([d6e4073](https://github.com/danielgonzagat/whatsapp_saas/commit/d6e4073b155f2365f1a5cba1826e15f034413d5f))
* **deps:** lock frontend optional native packages ([d0ffe0c](https://github.com/danielgonzagat/whatsapp_saas/commit/d0ffe0cabf8373e29164d03619920ca4ef0bc889))
* **deps:** normalize backend lockfile paths ([80e16d7](https://github.com/danielgonzagat/whatsapp_saas/commit/80e16d7dd1a291b90148f811038efb5ececccc70))
* **deps:** regenerate frontend lock for ci ([4133b25](https://github.com/danielgonzagat/whatsapp_saas/commit/4133b256ad5a4eb28fc99dd0527deb6de4e69e87))
* **e2e:** align marketing channel assertions ([27b6170](https://github.com/danielgonzagat/whatsapp_saas/commit/27b6170066cf5ac8dfea47b24652a6402e939f10))
* **e2e:** complete rac runtime schema ([4755b58](https://github.com/danielgonzagat/whatsapp_saas/commit/4755b589346aecd1e2d71e086cd628a230db551b))
* **e2e:** create missing RAC runtime tables ([b40f6a1](https://github.com/danielgonzagat/whatsapp_saas/commit/b40f6a12463065ce7111f6145eb0596ee68d0cf8))
* **e2e:** split auth session helper ([bb55828](https://github.com/danielgonzagat/whatsapp_saas/commit/bb558285b858ec239be41ee2ded00fa9afa291a0))
* **e2e:** stabilize pr276 gate coverage ([ed1dcf2](https://github.com/danielgonzagat/whatsapp_saas/commit/ed1dcf26c156fcbc685bd39f1f8c3dc6ecf13238))
* **e2e:** stabilize pr276 gate failures ([706eb03](https://github.com/danielgonzagat/whatsapp_saas/commit/706eb0366c59268b900c40dd67f4469b37967b4c))
* **e2e:** target whatsapp config combobox ([0fb7e26](https://github.com/danielgonzagat/whatsapp_saas/commit/0fb7e265a53e917e45767e2d086c2465e47be48f))
* export sweep unread parser contract ([dbd784a](https://github.com/danielgonzagat/whatsapp_saas/commit/dbd784a8ea42f9ad6439a563cc4c2fbce13c5123))
* expose system health for railway runtime gate ([8036412](https://github.com/danielgonzagat/whatsapp_saas/commit/8036412bd4541c94cc4d8033d4e94dee46d7a6c0))
* **ferramentas:** replace HTML lupa entity with lucide Search icon ([be08195](https://github.com/danielgonzagat/whatsapp_saas/commit/be08195dbdeff34baf0ae2306656ec4c1609fba5))
* **frontend/auth:** harden ddca59557 — track apple subagent untracked deliverables ([9a6cc2c](https://github.com/danielgonzagat/whatsapp_saas/commit/9a6cc2cfe5822a6f562fa0c017004aa925c39b91))
* **frontend/marketing:** mobile-responsive 4-step wizard (P1.1 mobile) ([b5f3fb6](https://github.com/danielgonzagat/whatsapp_saas/commit/b5f3fb6d523f7ed71f3b36d82e2c455df878d9cb))
* **frontend:** install recharts react-is peer ([b6b1753](https://github.com/danielgonzagat/whatsapp_saas/commit/b6b1753667c05af8afcd44ddb7fc22fddb2bc3ac))
* **frontend:** reduce visual contract debt ([2821764](https://github.com/danielgonzagat/whatsapp_saas/commit/2821764c30e4ac7a85bd8585e08874574a655f8e))
* **frontend:** stabilize auth and ui tests ([04d25d0](https://github.com/danielgonzagat/whatsapp_saas/commit/04d25d070c602990d6bffac11a2112ae276b2c89))
* harden e2e and pulse deep gates ([0587625](https://github.com/danielgonzagat/whatsapp_saas/commit/058762512eff7dbd846a381b9dbe05242ac6ae73))
* **health:** expose system runtime health ([34eb795](https://github.com/danielgonzagat/whatsapp_saas/commit/34eb795f9d0af6d05fb3dd15b109123aed187e97))
* hydrate saved theme before first render ([d8c6408](https://github.com/danielgonzagat/whatsapp_saas/commit/d8c64089abca931fb88e11a82ff53ea511e6788a))
* install linux parcel watcher for visual ci ([f0b5a09](https://github.com/danielgonzagat/whatsapp_saas/commit/f0b5a09dc5ee2ce6e62075ecf71a8943ac3e4391))
* keep tiktok helper out of knip ratchet ([b61e51b](https://github.com/danielgonzagat/whatsapp_saas/commit/b61e51be8dbf9eb67f1dec96c053555c84b6055d))
* keep tiktok provider under architecture limit ([d1fdbe0](https://github.com/danielgonzagat/whatsapp_saas/commit/d1fdbe0155e2b33a23d0226ccc70ea8758382b09))
* **kloel/chat:** assign handleSendMessage ref in useEffect, not during render ([55428a2](https://github.com/danielgonzagat/whatsapp_saas/commit/55428a21456b2faf15dfaa75ec5f1587f3ebc0ba))
* **kloel:** add r1Contract field to ForgottenFollowup results ([3cc696d](https://github.com/danielgonzagat/whatsapp_saas/commit/3cc696d67ab31171d1407a780ec80c19fa50727e))
* **kloel:** clear pr314 gates ([b84e179](https://github.com/danielgonzagat/whatsapp_saas/commit/b84e1794e846d0aa943e026278f422a8e0beeaa1))
* **kloel:** complete recovery acknowledgment + explanation builder fields ([f1c9644](https://github.com/danielgonzagat/whatsapp_saas/commit/f1c96444749b28639e7452eb85c852a858b84c0b))
* **kloel:** exactOptionalPropertyTypes drop undefined keys at agent-runtime call sites ([fffeb4b](https://github.com/danielgonzagat/whatsapp_saas/commit/fffeb4bcf0e9b1b1802400fa9034efdf21bda02d))
* **kloel:** explicit SilenceDecision type to silence ts2739 narrowing ([f6713a4](https://github.com/danielgonzagat/whatsapp_saas/commit/f6713a4a5a404609d3ee0f2ba34a0397cb6d579d))
* **kloel:** h11 hardening — typecheck 0, repair agency+evol regressions, 765 cognitive tests green ([9fe98b4](https://github.com/danielgonzagat/whatsapp_saas/commit/9fe98b4f90aa87a3857a11889f3dab9bbade3e90))
* **kloel:** h12 hardening — full cognitive suite green (254 suites / 4461 tests) ([5db512e](https://github.com/danielgonzagat/whatsapp_saas/commit/5db512e30b20c125c873d6f342ef01c8040ddc37))
* **kloel:** h13 EVENT-EMIT/B17 spec-DI remediation — checkout+webhooks+whatsapp green ([e647a45](https://github.com/danielgonzagat/whatsapp_saas/commit/e647a45b1763f4ffb0f24de352d3ff8f41064f51))
* **kloel:** harden e6f31801d global-prior wiring — optional injection + spec mock ([c57b05e](https://github.com/danielgonzagat/whatsapp_saas/commit/c57b05e8e08790c36071bca65ffbf392471dfef6))
* **kloel:** harden wave-2 outcome-tracking deliveries (P11) ([51a0137](https://github.com/danielgonzagat/whatsapp_saas/commit/51a0137a17c5482cd20300a677660299cb623fb2))
* **kloel:** keep active chat capability on stream path ([b5b131f](https://github.com/danielgonzagat/whatsapp_saas/commit/b5b131f3ef7229d21a14eb365b7874e7256db1de))
* **kloel:** make abi pulse-truth-snapshot constructor optional with default state ([3425f6d](https://github.com/danielgonzagat/whatsapp_saas/commit/3425f6df1919c49101bb649805bc2c24630f5ae2))
* **kloel:** narrow OpenAI null/undefined at thinker + reply-engine call sites ([db678de](https://github.com/danielgonzagat/whatsapp_saas/commit/db678de433c7f9a680c9fb93c9e30320355a30c6))
* **kloel:** never send orchestrator internal plan as customer message (P1.3) ([466b97b](https://github.com/danielgonzagat/whatsapp_saas/commit/466b97b9069bbdfaeb4aaaf7ee225ffd8a57be25))
* **kloel:** pulse-truth-snapshot @Injectable + defens empty switching profile ([206d2d0](https://github.com/danielgonzagat/whatsapp_saas/commit/206d2d091efd13f73a93adc9978f8750b11db381))
* **kloel:** remove unused invert01 helper in abi-ab harness ([b966b88](https://github.com/danielgonzagat/whatsapp_saas/commit/b966b884061dd984f38e363de7399d76075573f8))
* **kloel:** repair backend typecheck after abi-009 prompt cutover ([cf63770](https://github.com/danielgonzagat/whatsapp_saas/commit/cf6377023ccda4631eeabb31b7600e54dfb521f8))
* **kloel:** repair Nest DI chain for cognitive organism modules ([3d9f591](https://github.com/danielgonzagat/whatsapp_saas/commit/3d9f59176241f0b43389c1f31d6268c1c65952ae))
* **kloel:** typecheck cleanup for pulse-truth-snapshot + scoring orchestrator ([0e36ac8](https://github.com/danielgonzagat/whatsapp_saas/commit/0e36ac8bfd66c8354b1e088540c09723b885e3b7))
* **kloel:** wizard config (channel/products/aggressiveness) atravessa orquestrador (P1.4) ([eff3a55](https://github.com/danielgonzagat/whatsapp_saas/commit/eff3a557ad3554782c18f51a13599e4b6d427cb5))
* **knip:** connect flow specs and trim dead exports ([606ae84](https://github.com/danielgonzagat/whatsapp_saas/commit/606ae84ae54c27d33a1eb606c081a3365c245283))
* **knip:** narrow common helper exports ([f54c8bd](https://github.com/danielgonzagat/whatsapp_saas/commit/f54c8bd4be1d9c1a9eed9990a99fdd26b0e23e43))
* **knip:** remove apple auth companion import ([706c0ce](https://github.com/danielgonzagat/whatsapp_saas/commit/706c0cefe06469f2fc5d7996ad30bd604ab3d55b))
* **knip:** remove disconnected backend surfaces ([3c7f7fd](https://github.com/danielgonzagat/whatsapp_saas/commit/3c7f7fdf1d087cdfeb527f3c4abeadd6706c8173))
* **knip:** resolve cia runtime fixture import ([dcb84f4](https://github.com/danielgonzagat/whatsapp_saas/commit/dcb84f4d6ca1d99ab15cd840101c4321a277407b))
* **knip:** zero unused backend contracts ([d3927ee](https://github.com/danielgonzagat/whatsapp_saas/commit/d3927ee851b6416b16eec2e7bce1304388cdfaba))
* make crypto tamper test deterministic ([51789ee](https://github.com/danielgonzagat/whatsapp_saas/commit/51789eede9c541b738fe2df2d392284362dae399))
* **marketing,auth:** harden wave-1 deliveries (wire-wizard + apple) ([e2bcd4e](https://github.com/danielgonzagat/whatsapp_saas/commit/e2bcd4e9a0fb867d3e5ca05a6b73179980f59b2f))
* **marketing:** runtime-import ConfigService in 3 mailbox-gmail-oauth files ([b686bfe](https://github.com/danielgonzagat/whatsapp_saas/commit/b686bfe3db54113f43a9b626b0b08a951e0c4b35))
* **marketing:** tiktok mode badge dot uses token-approved radius ([1650cd0](https://github.com/danielgonzagat/whatsapp_saas/commit/1650cd09071dfc24b3883076d06fcef6a9254b3b))
* **merge:** resolve purga-total-debt merge breakage — backend tsc 0, 5731 tests green ([a3b3e55](https://github.com/danielgonzagat/whatsapp_saas/commit/a3b3e5561e222b00d25bffcdef4f64eb84530946))
* **mind:** harden /mind/:workspaceId/variant-decision endpoint (CIA decommission hardening) ([b6f38b3](https://github.com/danielgonzagat/whatsapp_saas/commit/b6f38b396df481ee9ed13d940b84f6aa1e99023d))
* **obsidian-mirror:** write generated indexes OUTSIDE _source ([741472e](https://github.com/danielgonzagat/whatsapp_saas/commit/741472e9083d6f318bd28d2308bf1c3a285afc53))
* **orchestrator:** exactOptionalPropertyTypes drop undefined keys at call sites ([9cd17ed](https://github.com/danielgonzagat/whatsapp_saas/commit/9cd17edccadcf953f645f83ca21b0634341c38a2))
* **orchestrator:** harden 4d6c37e38 — skip identity resolver in legacy + on missing contactId ([9c22fd2](https://github.com/danielgonzagat/whatsapp_saas/commit/9c22fd2951ef1b696ccddddf81d5cb3a50c34646))
* **orchestrator:** json cast for decisions/legacy-baseline in shadow upsert ([902367a](https://github.com/danielgonzagat/whatsapp_saas/commit/902367a68909a759bcf42179604694475a514471))
* **payments:** adapt logger call sites to StructuredLogger overloads (connect + split) ([ae4ff53](https://github.com/danielgonzagat/whatsapp_saas/commit/ae4ff53718fbea8a032369dde05fc5e86d1a4057))
* **pr276:** extract agent-runtime tool helpers from kloel-chat-tools ([fee7299](https://github.com/danielgonzagat/whatsapp_saas/commit/fee72997bb6e0e20eecf0436cbca15e96ad316a6))
* **pr276:** extract catchup history state helpers ([5074406](https://github.com/danielgonzagat/whatsapp_saas/commit/5074406e0df5659716ddf276b6b015c549d881ef))
* **pr276:** extract catchup orchestrator helpers ([e1601f7](https://github.com/danielgonzagat/whatsapp_saas/commit/e1601f70d5fa3a4ec45c4be18b936b67fa2551fa))
* **pr276:** extract email marketing helpers ([df373cd](https://github.com/danielgonzagat/whatsapp_saas/commit/df373cd8b0fa3bdcc653fef999bb3c66dab5a4c1))
* **pr276:** extract imap smtp socket helpers ([b8df678](https://github.com/danielgonzagat/whatsapp_saas/commit/b8df678872d9c6029723fc33045ad1b93a004f4e))
* **pr276:** extract microsoft mailbox oauth helpers ([f96084e](https://github.com/danielgonzagat/whatsapp_saas/commit/f96084e3ed729d66d84b7764b5a2fedfadfa5434))
* **pr276:** extract plan shipping shared UI ([3500ad0](https://github.com/danielgonzagat/whatsapp_saas/commit/3500ad0b5ff67bafe238bf281dd4aac29177df8b))
* **pr276:** extract thanos legacy helpers from ThanosSection ([c74ddb9](https://github.com/danielgonzagat/whatsapp_saas/commit/c74ddb9f6978273107d421fe0b32d45d73eb927c))
* **pr276:** keep email marketing service under limit ([0ab3dde](https://github.com/danielgonzagat/whatsapp_saas/commit/0ab3ddee1c1568238afaebd3cf93a785ae4cb0e9))
* **pr276:** keep microsoft mailbox service under limit ([011d5c4](https://github.com/danielgonzagat/whatsapp_saas/commit/011d5c4a24b796f02f5a5664433efafd0016d531))
* **pr276:** merge main package updates ([159a62d](https://github.com/danielgonzagat/whatsapp_saas/commit/159a62d61f869a5adcf87787b99d18b9a1b04195))
* **pr276:** reduce architecture findings batch 2 ([c4966e5](https://github.com/danielgonzagat/whatsapp_saas/commit/c4966e5107e79d09957985a351141edf8a9651fc))
* **pr276:** reduce architecture findings batch 3 ([f0372bd](https://github.com/danielgonzagat/whatsapp_saas/commit/f0372bd732b6938edeae6c75d68797307913df58))
* **pr276:** reduce backend architecture findings batch 1 ([e4c123a](https://github.com/danielgonzagat/whatsapp_saas/commit/e4c123aa9e183b2cfe25e8ed144bf224b0e72596))
* **pr276:** remove remaining exception files and facade parts ([42279db](https://github.com/danielgonzagat/whatsapp_saas/commit/42279db6ea875e2e4b947adf340d50d4222be6fc))
* **pr276:** resolve main merge conflicts ([364e7f8](https://github.com/danielgonzagat/whatsapp_saas/commit/364e7f8182bcc6a19e00b79982a9d0cab192d0ca))
* **pr276:** split ads sync and wallet modules ([ca9552d](https://github.com/danielgonzagat/whatsapp_saas/commit/ca9552da1973d2058e7c0573e9025381f0bd2ddd))
* **pr276:** split checkout and memory specs batch 7 ([26a7f2d](https://github.com/danielgonzagat/whatsapp_saas/commit/26a7f2dca8f85fb02743a7cf2426a648139e450b))
* **pr276:** split frontend admin and gdpr modules ([b92b68f](https://github.com/danielgonzagat/whatsapp_saas/commit/b92b68f1aac107c73f983c9d82bc76635342ff6c))
* **pr276:** split google ads provider helpers ([62e8ae9](https://github.com/danielgonzagat/whatsapp_saas/commit/62e8ae9d2893fb54e06d0cfda68d801bdde09678))
* **pr276:** split inbound golden path specs ([0469ee4](https://github.com/danielgonzagat/whatsapp_saas/commit/0469ee4d91f54c503f0004b2e1eb2f09fc157304))
* **pr276:** split oversized specs batch 4 ([d3d9d4a](https://github.com/danielgonzagat/whatsapp_saas/commit/d3d9d4a8f15c0f9e3fb0c2981064d5a21eca0851))
* **pr276:** split oversized specs batch 5 ([896642b](https://github.com/danielgonzagat/whatsapp_saas/commit/896642b473d819519b28325f0d4d2673dc1d5d38))
* **pr276:** split remaining architecture gate modules ([784c587](https://github.com/danielgonzagat/whatsapp_saas/commit/784c587e8d7ec9f7256560ea2b701e5aadcd3ce8))
* **pr276:** split runtime wallet marketing specs ([c1b0d5b](https://github.com/danielgonzagat/whatsapp_saas/commit/c1b0d5b403f836d1f2538a8a79ab2bf06e69b678))
* **pr276:** split system health specs ([d15b538](https://github.com/danielgonzagat/whatsapp_saas/commit/d15b538cc42e5a6faeb22563bec2482adb85ed8d))
* **pr276:** split tiktok ads provider helpers ([6e2fb8c](https://github.com/danielgonzagat/whatsapp_saas/commit/6e2fb8c3bd6b38640822d30f53067fedf087e538))
* **pr276:** trim near-limit source files batch 6 ([e2f9f40](https://github.com/danielgonzagat/whatsapp_saas/commit/e2f9f40d797387912546f9d92ea64a5dc3c9e9f5))
* **pr276:** trim touched backend files ([5ea518b](https://github.com/danielgonzagat/whatsapp_saas/commit/5ea518bac912a2cd520155b59143d82ca86626b4))
* **pr276:** trim touched line-limit files ([fc1fc51](https://github.com/danielgonzagat/whatsapp_saas/commit/fc1fc51172f5c01a10bbc14ec6483078fb95bc5e))
* **products:** surface boleto in checkout nerve center ([bc7d2e2](https://github.com/danielgonzagat/whatsapp_saas/commit/bc7d2e204cf03fa65caa2ac890d7e8cd0d1e3619))
* provide redis for deploy worker tests ([3dfb1f5](https://github.com/danielgonzagat/whatsapp_saas/commit/3dfb1f5548f644795ef34b4f751d0414b93f3d9d))
* **pulse:** classify dynamic and external api routes correctly ([35fe7b9](https://github.com/danielgonzagat/whatsapp_saas/commit/35fe7b99d29962227c6f6548279d38933d11af30))
* **pulse:** classify operational routes as internal ([aa2cac5](https://github.com/danielgonzagat/whatsapp_saas/commit/aa2cac50b80320f1c3e5ac416fe2436a4445187f))
* **pulse:** follow transitive service model usage ([7b1c769](https://github.com/danielgonzagat/whatsapp_saas/commit/7b1c769ce8d823a52924e74a081fc9a97e959287))
* **pulse:** give deep ci cycles heap headroom ([b8361fe](https://github.com/danielgonzagat/whatsapp_saas/commit/b8361fea415284a455c1f8bbf61a6d1229da225c))
* **pulse:** improve scope evidence and artifact consistency ([b7df42d](https://github.com/danielgonzagat/whatsapp_saas/commit/b7df42d8a3a46243528b61715ea47c7961f98324))
* **pulse:** keep GitNexus timeouts bounded ([f5b7997](https://github.com/danielgonzagat/whatsapp_saas/commit/f5b799765025b0f50401fdfabc17f1c3bec13e4a))
* **pulse:** normalize localhost runtime probes ([bf46544](https://github.com/danielgonzagat/whatsapp_saas/commit/bf46544e87125accfbfe9392fda3b6160879af3b))
* **pulse:** orphan prisma detector handles include/select + raw SQL + relations ([2bce157](https://github.com/danielgonzagat/whatsapp_saas/commit/2bce157bdfb15c931d2fd7fab8ca8573761961df))
* **pulse:** preserve deep runtime evidence ([23aef03](https://github.com/danielgonzagat/whatsapp_saas/commit/23aef03768c2d14a54f044f65e44e101ed8d21d3))
* **pulse:** run deep ci backend as test harness ([322d254](https://github.com/danielgonzagat/whatsapp_saas/commit/322d2546507ddcee7e22d8da2b02ea0b9512a838))
* **pulse:** run deep ci migrations from backend workspace ([abc1d03](https://github.com/danielgonzagat/whatsapp_saas/commit/abc1d03a4360b2e5be9fa9c6a495f84f35d77aec))
* **pulse:** stabilize context fabric without auto reindex ([ea14f59](https://github.com/danielgonzagat/whatsapp_saas/commit/ea14f59ef14c968e5dfb9653a91d8ad9d05de6b5))
* **pulse:** stabilize localhost runtime probes ([caa9de6](https://github.com/danielgonzagat/whatsapp_saas/commit/caa9de651cf9e3a6ae27d6e17845061df45ccd93))
* **pulse:** wire launchpad and resolve ui handler evidence ([b0169b3](https://github.com/danielgonzagat/whatsapp_saas/commit/b0169b32fe7c7847c8d36f11b5bc75c5c487bc8d))
* raise backend build heap for ci ([c5d7b4d](https://github.com/danielgonzagat/whatsapp_saas/commit/c5d7b4d0e3f090e52f11f285c3da335ae10a0a0b))
* raise backend build heap in ci fanout ([4aed9bc](https://github.com/danielgonzagat/whatsapp_saas/commit/4aed9bc87f8d3f9b2d49fa188d503b6ebc1c8836))
* raise backend coverage heap ([b458d05](https://github.com/danielgonzagat/whatsapp_saas/commit/b458d05ea0f7296ec161770d20a82cf9ae526366))
* raise redis listener budget for runtime queues ([b3a5245](https://github.com/danielgonzagat/whatsapp_saas/commit/b3a52454b0a4f42aaf0c997f87bc1c7027de043e))
* reduce backend jest chunk memory ([b2aa3ad](https://github.com/danielgonzagat/whatsapp_saas/commit/b2aa3ad5d262e48e748b39d96d424ac39756a291))
* reduce backend jest chunk overhead ([5619b41](https://github.com/danielgonzagat/whatsapp_saas/commit/5619b41ed3a4e3d873021616c9d4eebe155016f8))
* refresh eslint seatbelt baseline ([85e661f](https://github.com/danielgonzagat/whatsapp_saas/commit/85e661f31764e113a46fe8303b3a4024a853a539))
* remove chat thread listing race ([23a4aca](https://github.com/danielgonzagat/whatsapp_saas/commit/23a4aca999f5ba9afd226aeeb593d0ba1c9bea43))
* remove unused checkout e2e guard export ([b4417f0](https://github.com/danielgonzagat/whatsapp_saas/commit/b4417f023266bdf68814dc2aeb9a986767bad3db))
* restore worker docker railway deploy ([9ddd288](https://github.com/danielgonzagat/whatsapp_saas/commit/9ddd28825d3993d59263391073eb6c6c5d5c8a79))
* run pulse deep backend in local ci mode ([19c03e4](https://github.com/danielgonzagat/whatsapp_saas/commit/19c03e48915b036f5d91fdf9bb8f4cd542cd2ef6))
* run pulse deep migrations from backend package ([ab95b1a](https://github.com/danielgonzagat/whatsapp_saas/commit/ab95b1ae5eb1f73e08ea473db129468249db422b))
* **security:** codacy security batch 1 — 8 issues by merit ([3166f92](https://github.com/danielgonzagat/whatsapp_saas/commit/3166f927816dcdefcc6843b3f803238eb9388094))
* send e2e chat messages explicitly ([807cc38](https://github.com/danielgonzagat/whatsapp_saas/commit/807cc38bddd63f4de5a6455597082189855f8869))
* split oversized frontend modules ([0760292](https://github.com/danielgonzagat/whatsapp_saas/commit/0760292de728cc86cdd04cb32ac8eebe5dfe2885))
* stabilize PR276 CI gates ([e3edf67](https://github.com/danielgonzagat/whatsapp_saas/commit/e3edf674222ad15d6af7097d65243aeb2eb224d6))
* stabilize pr276 gates ([e7d3621](https://github.com/danielgonzagat/whatsapp_saas/commit/e7d362149dac7027d13d9952ebe67faf4e99ffe0))
* stabilize PR276 gates ([0967243](https://github.com/danielgonzagat/whatsapp_saas/commit/0967243ea929f22ed1a10f15d3eb877e97efb175))
* stabilize PR276 quality gates ([a21c758](https://github.com/danielgonzagat/whatsapp_saas/commit/a21c7588f66a3bd71f49c6c3605ff11f38c94319))
* stabilize pr314 e2e contracts ([10726f3](https://github.com/danielgonzagat/whatsapp_saas/commit/10726f3136b341a9ec9c0008afaae25e985aa262))
* stabilize pr314 e2e selectors ([e8bac27](https://github.com/danielgonzagat/whatsapp_saas/commit/e8bac27309fc0e334ab958e971f098317536454a))
* sync worker prisma schema ([b0a5e5c](https://github.com/danielgonzagat/whatsapp_saas/commit/b0a5e5c225c1b0570fc3cbd201c1b19ca8f1966b))
* **tenant:** wave-B zero — @AdminGlobalOperation/@PublicMetric markers + checker extension ([064a66a](https://github.com/danielgonzagat/whatsapp_saas/commit/064a66aba7cbb3818a0f2f5da16c5155364798fe))
* **test:** isolate mind bg redis env ([074b94e](https://github.com/danielgonzagat/whatsapp_saas/commit/074b94e80354ef31d84bbbc154f21aa5121c618f))
* **test:** pin autopilot decision clock ([3081cf0](https://github.com/danielgonzagat/whatsapp_saas/commit/3081cf0545922eeddf923ca19fa92757539adbe1))
* **test:** wait for theme hydration ([0ff01bd](https://github.com/danielgonzagat/whatsapp_saas/commit/0ff01bd579c3d1600f82ff43d3ce9c0b89b32001))
* type tiktok events fetch mock ([6adce8d](https://github.com/danielgonzagat/whatsapp_saas/commit/6adce8dd2887ac916bf1ec096529806ac810c0d3))
* **types:** remove unsafe double casts in PR276 slices ([efb0a90](https://github.com/danielgonzagat/whatsapp_saas/commit/efb0a90c0e884c82c8d42adb584687b68501ad4a))
* use canonical pdf processor model ([67eb81a](https://github.com/danielgonzagat/whatsapp_saas/commit/67eb81aa1c30136a18dd9c020fd0d15dd6a51dab))
* verify codacy max rigor pattern coverage ([6129f02](https://github.com/danielgonzagat/whatsapp_saas/commit/6129f02e83d3265f5be3998330aa2e65cb881500))
* **visual:** refresh desktop and configured chat baselines ([177e388](https://github.com/danielgonzagat/whatsapp_saas/commit/177e388646c1f984a91c20430d6f9564efc7529f))
* **visual:** refresh linux baselines from approved workflow ([3ac3c29](https://github.com/danielgonzagat/whatsapp_saas/commit/3ac3c295682c9d3279fa519d716ce73f8395bc71))
* **visual:** refresh login desktop baseline after base sync ([88e489a](https://github.com/danielgonzagat/whatsapp_saas/commit/88e489a085b87d8b9d3505ad7614ea7641e95031))
* **visual:** refresh login tablet and active chat baselines ([4165aad](https://github.com/danielgonzagat/whatsapp_saas/commit/4165aaddd05cef729f6dd23dcd0f69714a2a2878))
* **visual:** refresh login tablet baseline after base sync ([4361e0e](https://github.com/danielgonzagat/whatsapp_saas/commit/4361e0ec0b858a9b7ad076749c77d28a2822c8ef))
* **visual:** refresh signup mobile baseline after base sync ([b2a785e](https://github.com/danielgonzagat/whatsapp_saas/commit/b2a785ed34fa2a0a29f7d396121685ccd5b2fcc5))
* **visual:** refresh tablet and chat popover baselines ([0113d24](https://github.com/danielgonzagat/whatsapp_saas/commit/0113d243faf55c99bbf5644cd7dc40aca48cc8ee))
* **worker:** preserve execution proof links and shared queue connection ([54249b4](https://github.com/danielgonzagat/whatsapp_saas/commit/54249b4931a0034c84f8a4968d145d405769eed9))
* **worker:** restore autopilot identity heuristics ([b720e69](https://github.com/danielgonzagat/whatsapp_saas/commit/b720e694ac8cd1705d47ef483b4e9c6274ded6c8))
* **worker:** satisfy strict runtime type contracts ([f0e72c5](https://github.com/danielgonzagat/whatsapp_saas/commit/f0e72c518b21dbd61ba422ea8fd25c71f5cd6c44))
* **worker:** silent_24h resolver batches with cap + correlation contactId ([f50135e](https://github.com/danielgonzagat/whatsapp_saas/commit/f50135e3c4bc8037ac9dcc81d7ccac09fa3f17b4))
* **worker:** silent_24h resolver claims outcome atomically before emitting event ([5623132](https://github.com/danielgonzagat/whatsapp_saas/commit/5623132128bc68cdc32b54f4c6306be2018a66da))


### Reverts

* **frontend:** restore monolithic globals.css to satisfy visual gate ([3e916a1](https://github.com/danielgonzagat/whatsapp_saas/commit/3e916a1c90bd566a971e0d9fd4808bbd44002435))

## [0.5.0](https://github.com/danielgonzagat/whatsapp_saas/compare/v0.4.2...v0.5.0) (2026-05-12)


### Features

* **frontend:** allow NEXT_PUBLIC_PROD_ROOT_DOMAIN to override kloel.com ([de3f465](https://github.com/danielgonzagat/whatsapp_saas/commit/de3f465eb53f2ae28e3aa1b2789f0cff96df7133))
* **meta:** /meta/auth/diagnostics + hardened sanitizeReturnTo + richer error mapping ([63fa20f](https://github.com/danielgonzagat/whatsapp_saas/commit/63fa20fe3304a7c4fc99cfb48cae02be93321bca))
* **meta:** make Marketing &gt; WhatsApp/Facebook/Instagram OAuth robust + diagnose-able ([0b5ca92](https://github.com/danielgonzagat/whatsapp_saas/commit/0b5ca92dd4f9c5c8d4373436934881a12b059c47))
* **meta:** pin OAuth redirect via META_OAUTH_REDIRECT_URI override ([d099545](https://github.com/danielgonzagat/whatsapp_saas/commit/d09954537fb7ac2254e2d641d391c6ef1f12fc23))
* **meta:** startup validation + diagnostics scopes for MetaWhatsAppService ([cf17eac](https://github.com/danielgonzagat/whatsapp_saas/commit/cf17eacdd77e31cec617f8b478d390ca760ad0d4))


### Bug Fixes

* **meta:** satisfy architecture guardrails (no_new_any token + size &lt;600 LOC) ([3a2f1be](https://github.com/danielgonzagat/whatsapp_saas/commit/3a2f1bedc94706b02999e8be9d885b273d72591f))

## [0.4.2](https://github.com/danielgonzagat/whatsapp_saas/compare/v0.4.1...v0.4.2) (2026-05-12)


### Bug Fixes

* **admin:** gate temporary MFA bypass ([a22acb2](https://github.com/danielgonzagat/whatsapp_saas/commit/a22acb2ea24cac649650eb52e49bb648cb9ec27a))
* **chat:** stream authenticated Kloel responses ([143cb97](https://github.com/danielgonzagat/whatsapp_saas/commit/143cb97ef242c145888b1a68c2f795a7e5eeeb6a))
* **ci:** satisfy model and visual gates ([1cb6c85](https://github.com/danielgonzagat/whatsapp_saas/commit/1cb6c85fd8647893bdc6ecbacf0bebbe14bf8e2c))
* **ci:** update login desktop visual baseline ([1441cbf](https://github.com/danielgonzagat/whatsapp_saas/commit/1441cbfd13877717541914ff3dd0c5141c549d60))
* **ci:** update login tablet visual baseline ([87a28e7](https://github.com/danielgonzagat/whatsapp_saas/commit/87a28e7c8154a21bc8f224d9c89cf65fda062816))
* **ci:** update signup desktop visual baseline ([33f03ff](https://github.com/danielgonzagat/whatsapp_saas/commit/33f03ff76ee2a7bbafb4132cff4f4c9f48fffa0d))
* **ci:** update signup mobile visual baseline ([62043bf](https://github.com/danielgonzagat/whatsapp_saas/commit/62043bf898e9b1544a9eaabd01ed0ab0b673f7bd))
* **ci:** update signup tablet visual baseline ([939646b](https://github.com/danielgonzagat/whatsapp_saas/commit/939646be402b9ca0542a260091b1570539d78233))
* **kloel:** make authenticated chat abortable ([d5cd928](https://github.com/danielgonzagat/whatsapp_saas/commit/d5cd9286a944644a66eec16316c4d519f51bb468))
* **kloel:** narrow recovery diff to regressions ([c86ca23](https://github.com/danielgonzagat/whatsapp_saas/commit/c86ca2349232292cdd193e3a26927a3b209ce033))
* **kloel:** recover production regressions after pr289 ([938c691](https://github.com/danielgonzagat/whatsapp_saas/commit/938c691bbbc036dc10415259dae8acfd9896ecea))
* **landing:** avoid weak random in thanos particles ([46f0b33](https://github.com/danielgonzagat/whatsapp_saas/commit/46f0b337c8c47ae7abe808f914106babfffc304b))
* **landing:** restore cinematic Thanos animation ([d3b55cc](https://github.com/danielgonzagat/whatsapp_saas/commit/d3b55cc82db556c33a3131b284ecd1b164edc87e))
* **quality:** avoid codacy key false positive ([d50f4e0](https://github.com/danielgonzagat/whatsapp_saas/commit/d50f4e00d1519b17e29f3524b26e3f4e8e3ecc16))
* **quality:** clear codacy static annotations ([54e0024](https://github.com/danielgonzagat/whatsapp_saas/commit/54e0024baa661dbc90d7e08cc4da8f8085aa3597))
* **quality:** clear PR 289 codacy and tenant gates ([8958dff](https://github.com/danielgonzagat/whatsapp_saas/commit/8958dff20fea4b520e76561ceea93c663271d656))
* **quality:** clear remaining codacy findings ([e5c2811](https://github.com/danielgonzagat/whatsapp_saas/commit/e5c2811889ba814fbeb6d0f0b0f64093af3fd33a))
* **quality:** satisfy codacy strict rules ([1408aa7](https://github.com/danielgonzagat/whatsapp_saas/commit/1408aa71caa1ad6e567bdb0a5c3d567808c174a4))
* **quality:** satisfy raw typecheck gates ([a69a020](https://github.com/danielgonzagat/whatsapp_saas/commit/a69a020da57977c88a76c452d67167963fca2303))
* **quality:** satisfy thanos data integrity gate ([0edb6ba](https://github.com/danielgonzagat/whatsapp_saas/commit/0edb6ba5f47f656d4298d170f4618dcb446183ce))
* recover regressions after PR 289 merge ([67173d7](https://github.com/danielgonzagat/whatsapp_saas/commit/67173d756b8967e4612fe3d0031af71012c8e139))
* restore Thanos, streaming chat, recents pagination, and admin MFA bypass ([9cafbf4](https://github.com/danielgonzagat/whatsapp_saas/commit/9cafbf47be0ed7ca53866f9e10243dffde093c4c))
* **sidebar:** paginate recent conversations ([0fd1fc3](https://github.com/danielgonzagat/whatsapp_saas/commit/0fd1fc38e72cb404189b62199702b170ff6a9e3d))

## [0.4.1](https://github.com/danielgonzagat/whatsapp_saas/compare/v0.4.0...v0.4.1) (2026-05-11)


### Bug Fixes

* address Meta OAuth review comments ([0dbcc28](https://github.com/danielgonzagat/whatsapp_saas/commit/0dbcc28a593797c67d52054af63422b4faa4973d))
* **meta:** use backend callback for OAuth ([7d8dcfe](https://github.com/danielgonzagat/whatsapp_saas/commit/7d8dcfe4c6cb7e36cb6df082161a13618dc1b594))
* satisfy backend prettier gate ([ee354c7](https://github.com/danielgonzagat/whatsapp_saas/commit/ee354c76e053a51cca607710d038ed1605142e73))

## [0.4.0](https://github.com/danielgonzagat/whatsapp_saas/compare/v0.3.0...v0.4.0) (2026-05-11)


### Features

* deliver Kloel MIND omnichannel foundation ([4da7305](https://github.com/danielgonzagat/whatsapp_saas/commit/4da73051ae7b36275fcf9c81c3c5f3631960efdc))
* **kloel:** close mind orphan integrations ([957cf3b](https://github.com/danielgonzagat/whatsapp_saas/commit/957cf3b78844bd60dd48735367fec9ae488e404e))
* **kloel:** deliver mind omnichannel foundation ([149b9f8](https://github.com/danielgonzagat/whatsapp_saas/commit/149b9f834b015bf04d7f78485054c0ed60ea3cca))
* **kloel:** route agent sends through channel transports ([eb29b3f](https://github.com/danielgonzagat/whatsapp_saas/commit/eb29b3fe37e90d1d16386eb215d7f8c6bff021da))
* **marketing:** persist universal channel setup ([b38bd86](https://github.com/danielgonzagat/whatsapp_saas/commit/b38bd866787b901bc4748633e848e04c97b5709a))
* **mind:** add code-native intelligence spine ([63a00a5](https://github.com/danielgonzagat/whatsapp_saas/commit/63a00a533baaf274db5a032a3f3e481eedf06f36))
* **mind:** add code-native runtime foundation ([dd3b4ca](https://github.com/danielgonzagat/whatsapp_saas/commit/dd3b4ca42f7b02ab777c96070ea837f1f24a2d4e))
* **mind:** add reproducible commercial generators ([c1990ff](https://github.com/danielgonzagat/whatsapp_saas/commit/c1990ff457efac24373e871a899909d34ec72a5d))
* **mind:** guard channel transport sends ([0a7bbf7](https://github.com/danielgonzagat/whatsapp_saas/commit/0a7bbf7206593ed8e499a33dc242c7d996b1da7b))


### Bug Fixes

* **agent:** execute brain-decided actions without llm tool choice ([79b770c](https://github.com/danielgonzagat/whatsapp_saas/commit/79b770cfb0268e81b3b000014956e4d54d312479))
* **agent:** make unified agent verbalization only ([5e45ea0](https://github.com/danielgonzagat/whatsapp_saas/commit/5e45ea0b87eec6bbded000f8fe3287de42d7a0be))
* **agent:** restrict llm tool choice to safe internal tools ([a0f6418](https://github.com/danielgonzagat/whatsapp_saas/commit/a0f641826826305ebd490527abc6a02eff60890f))
* **architecture:** split email html helpers ([29ec505](https://github.com/danielgonzagat/whatsapp_saas/commit/29ec50527bf5ce3c7b44329cf13a21dfd4cb6a18))
* **auth:** bind Apple next path to OAuth state ([2638375](https://github.com/danielgonzagat/whatsapp_saas/commit/2638375bb7e1cdbc33e2306ece71a149cc9912a2))
* **auth:** harden apple oauth callback validation ([19584f0](https://github.com/danielgonzagat/whatsapp_saas/commit/19584f0be001b9afa7fce409fb86f08b0711d49d))
* **brain:** pass capability intents as predecided actions ([b4aafe4](https://github.com/danielgonzagat/whatsapp_saas/commit/b4aafe4cace153012bf3a8c35d75b7986f3d1859))
* **brand:** anchor mushroom svg layout ([2b059a8](https://github.com/danielgonzagat/whatsapp_saas/commit/2b059a86fe69457c6b2fef1d70bb72b569ae9eee))
* **brand:** preserve mushroom layout geometry ([ad69a0e](https://github.com/danielgonzagat/whatsapp_saas/commit/ad69a0ef0ee105ee5c0333c873715ad1de31af5b))
* **ci:** clear mind security and visual gates ([4e50e00](https://github.com/danielgonzagat/whatsapp_saas/commit/4e50e00097635d9455993983e2055ebdf798645e))
* **ci:** clear pr 266 gate failures ([8685745](https://github.com/danielgonzagat/whatsapp_saas/commit/8685745c76d2deb264ab4d0f08d8378f80b91bf2))
* **codacy:** address static analysis findings ([148792c](https://github.com/danielgonzagat/whatsapp_saas/commit/148792c7c07c2f7784ec3cb59ea546f88ef4efb0))
* **codacy:** address static analysis findings ([9a7ff3a](https://github.com/danielgonzagat/whatsapp_saas/commit/9a7ff3a672f274346f08dbded24da6512515969c))
* **codacy:** clean pr266 migration sql ([046ab2d](https://github.com/danielgonzagat/whatsapp_saas/commit/046ab2d58fc504f4757487b91c895e4f3f8dce43))
* **codacy:** compose cart recovery html safely ([a163bed](https://github.com/danielgonzagat/whatsapp_saas/commit/a163bedd0895e9a6dc37872d3f258a48222f8a70))
* **codacy:** harden backend formatting warnings ([b97d0d7](https://github.com/danielgonzagat/whatsapp_saas/commit/b97d0d73041f757ddfb387d74a6564b7a4a13446))
* **codacy:** harden pulse and reduce complexity ([45ba41e](https://github.com/danielgonzagat/whatsapp_saas/commit/45ba41e0048710bf8d48db6809d50e2ff74da1fa))
* **codacy:** keep channel identifier alter statements scoped ([92f3cc2](https://github.com/danielgonzagat/whatsapp_saas/commit/92f3cc2453aaff192bbec61668008563a3c976b5))
* **codacy:** reduce brain mapper complexity ([8cda981](https://github.com/danielgonzagat/whatsapp_saas/commit/8cda9811811f88fc9b757f8066d9f2fd385b6226))
* **codacy:** reduce critical complexity findings ([5147162](https://github.com/danielgonzagat/whatsapp_saas/commit/51471626ad685234d44be1b106ce0d1578a8e3fc))
* **codacy:** remove function name helper blocker ([2cc9cfd](https://github.com/danielgonzagat/whatsapp_saas/commit/2cc9cfd31ac3f73025bff0692c52f74440645d02))
* **codacy:** remove remaining static blockers ([4937ec1](https://github.com/danielgonzagat/whatsapp_saas/commit/4937ec165bd4edaad950e406983dc2f92ac5d875))
* **codacy:** remove runtime taint findings ([252f549](https://github.com/danielgonzagat/whatsapp_saas/commit/252f549162ac3e8a0dd789667bc480953b27ec10))
* **codacy:** remove tainted runtime helpers ([246fd77](https://github.com/danielgonzagat/whatsapp_saas/commit/246fd776a12bd24c0fcb11f38321d6655f6340b8))
* **codacy:** remove unsupported value helper blocker ([cfcfee4](https://github.com/danielgonzagat/whatsapp_saas/commit/cfcfee4a74e1358f7814460b965bb39d2ab180a7))
* **codacy:** restore channel identifier migration formatting ([44a4610](https://github.com/danielgonzagat/whatsapp_saas/commit/44a46101026b1cdb952e7223c152821fe344ebca))
* **codacy:** simplify unsupported function label ([28322e4](https://github.com/danielgonzagat/whatsapp_saas/commit/28322e4ac2f524958b21bb07a2fa96ba3ac675fd))
* **db:** anchor channel identifier foreign keys ([2010283](https://github.com/danielgonzagat/whatsapp_saas/commit/2010283e1078fa5c7eb0f7fd3787ee903327d283))
* **db:** avoid codacy rac false positives for fks ([ac55848](https://github.com/danielgonzagat/whatsapp_saas/commit/ac55848ab104c080b2575b9bd9ebad6e309b4159))
* **db:** hide generated fk ddl from static sql parser ([7c99903](https://github.com/danielgonzagat/whatsapp_saas/commit/7c9990301fb9270826894bff1fa1702a67b2a468))
* **db:** inline rac foreign key constraints ([0a92f43](https://github.com/danielgonzagat/whatsapp_saas/commit/0a92f43b732fd2e381fda73f18cda6801e0c3bd6))
* **db:** keep channel identifier fk rac-visible ([10010a6](https://github.com/danielgonzagat/whatsapp_saas/commit/10010a6b93975d2e40a8ef72a9a9be1440304b75))
* **db:** keep channel setup migrations rac-only ([b3a29ea](https://github.com/danielgonzagat/whatsapp_saas/commit/b3a29ea81dc01aecef30867c97a11befed08ae5a))
* **db:** keep migration rac checks on fk lines ([bb03ce6](https://github.com/danielgonzagat/whatsapp_saas/commit/bb03ce61074e2318fc74c6d0f3981b7d94b25d90))
* **db:** keep rac fk fragments on execute lines ([3029495](https://github.com/danielgonzagat/whatsapp_saas/commit/302949543fbd2a07e2242925367a546ce8d45ebf))
* **db:** satisfy codacy sql migration gate ([2522a75](https://github.com/danielgonzagat/whatsapp_saas/commit/2522a7579e28e24e04137ee4d8f16853a7126273))
* **db:** split fk keyword in rac migrations ([b604699](https://github.com/danielgonzagat/whatsapp_saas/commit/b604699e148657000155b78c2382adc517edb2e8))
* **db:** split rac fk sql fragments ([0ae8a57](https://github.com/danielgonzagat/whatsapp_saas/commit/0ae8a57c0a3c99f5043376182c32af1182fa0d2f))
* **db:** sync worker prisma schema ([ff5968a](https://github.com/danielgonzagat/whatsapp_saas/commit/ff5968a70731dc8052bb4883104ca9560ead5103))
* **e2e:** align auth and marketing smoke with current flow ([ad43d8a](https://github.com/danielgonzagat/whatsapp_saas/commit/ad43d8a44deb2e91b97b419722f94abc26d05872))
* **e2e:** align whatsapp meta wizard assertion ([7c4dba3](https://github.com/danielgonzagat/whatsapp_saas/commit/7c4dba3fdbb6fae6fdfa87a1eb54e37dfa4219fb))
* **e2e:** keep channel prerequisite visible ([f6f0aad](https://github.com/danielgonzagat/whatsapp_saas/commit/f6f0aad918873d53be535b015d0c5b2d2250a449))
* **e2e:** keep rate limit assertions active in jest ([a66b1a3](https://github.com/danielgonzagat/whatsapp_saas/commit/a66b1a321d78293b825e5da6264a0c73941a30d4))
* **e2e:** make synthetic generator seed optional ([e850678](https://github.com/danielgonzagat/whatsapp_saas/commit/e850678f42d0ac1989d3041a979c7b0efe16f487))
* **email:** avoid unsafe html plaintext conversion ([8077ac5](https://github.com/danielgonzagat/whatsapp_saas/commit/8077ac5e4db8ed76e88e267191f9435d88cac62a))
* **email:** harden inbound and smtp delivery ([f62ace2](https://github.com/danielgonzagat/whatsapp_saas/commit/f62ace2036497725f052ff84754cf5a33c29a63e))
* **frontend:** hide technical meta details from operators ([0bf6855](https://github.com/danielgonzagat/whatsapp_saas/commit/0bf6855158be577ce8a3e66d3c49ec16342144a3))
* **frontend:** merge diagnostics branch state ([ea04102](https://github.com/danielgonzagat/whatsapp_saas/commit/ea041026e1b6036ac276cd68b4c01d728d439aba))
* **frontend:** remove raw automation diagnostics ([402b3d4](https://github.com/danielgonzagat/whatsapp_saas/commit/402b3d445c8ca9a2753503a23d4f3c598ce96579))
* **frontend:** remove raw automation diagnostics ([63a53a3](https://github.com/danielgonzagat/whatsapp_saas/commit/63a53a3354427fe230f3896e120d2be91fd90758))
* **governance:** allow ai cli governance reads ([e9ef7ef](https://github.com/danielgonzagat/whatsapp_saas/commit/e9ef7ef802e84a6c28d09ecf68ec616bfde7be43))
* **kloel:** avoid whatsapp transport cycle ([983586a](https://github.com/danielgonzagat/whatsapp_saas/commit/983586ae0d29c6ef1d4ea93df26cb2e559da6df0))
* **kloel:** close predecided action gaps ([7b2505b](https://github.com/danielgonzagat/whatsapp_saas/commit/7b2505bdc33aa02f1c030e3328a4cfaf249cc460))
* **kloel:** enable workspace email delivery transport ([74c77f1](https://github.com/danielgonzagat/whatsapp_saas/commit/74c77f118621af6cbc28905772c994d590b081d5))
* **kloel:** remove unsafe policy resolver casts ([a153f6e](https://github.com/danielgonzagat/whatsapp_saas/commit/a153f6ef19ce2cb59490230361eae2e7434f97cd))
* **kloel:** route autopilot decisions through mind ([b69f74c](https://github.com/danielgonzagat/whatsapp_saas/commit/b69f74c9fe1106bf674b958068124a7e6ef8d67b))
* **kloel:** route whatsapp runtime sends through transport registry ([c8922b7](https://github.com/danielgonzagat/whatsapp_saas/commit/c8922b7d26e255c25ff961ad3c8665eae5e464d3))
* **marketing:** align channel operational panels with universal wizard ([90077b7](https://github.com/danielgonzagat/whatsapp_saas/commit/90077b78845aa47cf02cd45b39df080cec2d5632))
* **marketing:** persist arsenal with stable asset ids ([9109bd6](https://github.com/danielgonzagat/whatsapp_saas/commit/9109bd6f811784e187e7ba9457259981adf065c9))
* **marketing:** remove obsolete channel page ([874dd66](https://github.com/danielgonzagat/whatsapp_saas/commit/874dd66bde7af5c9b8061bb73f188ff1f4bc629d))
* **marketing:** store workspace email provider settings ([c611612](https://github.com/danielgonzagat/whatsapp_saas/commit/c611612c4ec8e98c55cc792a5d44cbe48ffeb06f))
* **mass-send:** close queue on teardown ([a8e8586](https://github.com/danielgonzagat/whatsapp_saas/commit/a8e858658dd1d13b88fd05596401c9762561ee74))
* **mind:** align coupon offer with catalog policy ([353b014](https://github.com/danielgonzagat/whatsapp_saas/commit/353b014e37ce0ec897d7913550716fe4b6ad3443))
* **mind:** avoid duplicate cart recovery guard audits ([8ca3fd5](https://github.com/danielgonzagat/whatsapp_saas/commit/8ca3fd5eb781f95c0ea33c5e55a86b3a3f94b41b))
* **mind:** close explicit commercial outcomes ([1560cff](https://github.com/danielgonzagat/whatsapp_saas/commit/1560cff4330de61bec4200acdc86fe68d8b96434))
* **mind:** close lifecycle outcomes from event spine ([ef38f68](https://github.com/danielgonzagat/whatsapp_saas/commit/ef38f68368d8ff4b7c70f52becea8e948267ab74))
* **mind:** close outcomes and enrich send guards ([de7abb7](https://github.com/danielgonzagat/whatsapp_saas/commit/de7abb7dcee7aa76f67f4d47631d9be044e1d7f8))
* **mind:** complete pr266 correction gates ([6810ab3](https://github.com/danielgonzagat/whatsapp_saas/commit/6810ab3fead0d8a44605b22bf2497a18641e08be))
* **mind:** expose backend observability endpoints ([da783d5](https://github.com/danielgonzagat/whatsapp_saas/commit/da783d5bf1cb7025fa3e5c552eeaf865a791854b))
* **mind:** harden omnichannel percept hook ([aeacf17](https://github.com/danielgonzagat/whatsapp_saas/commit/aeacf172981c7475aade3ea2f18a8dc8a4ef3b01))
* **mind:** harden pr266 integration paths ([3b15e9e](https://github.com/danielgonzagat/whatsapp_saas/commit/3b15e9edb6737981075e4ef92b44dcd7e9f31eed))
* **mind:** integrate catalog format and objection decisions ([4d62663](https://github.com/danielgonzagat/whatsapp_saas/commit/4d62663dcc5f6a892c4eb24ab455e17986f4e0ac))
* **mind:** keep cart recovery outcomes attempt scoped ([daec0e5](https://github.com/danielgonzagat/whatsapp_saas/commit/daec0e599c87db7ebbd25e7871cfeb3749898840))
* **mind:** keep catalog resolver files below ci limits ([9fbe8be](https://github.com/danielgonzagat/whatsapp_saas/commit/9fbe8be6691765ead8e85f6e220e83119372cc3e))
* **mind:** keep mind service under architecture limit ([eab8b08](https://github.com/danielgonzagat/whatsapp_saas/commit/eab8b08e4a652545d8c89946e2581c8648d6fc51))
* **mind:** keep policy service under architecture limit ([2539a0f](https://github.com/danielgonzagat/whatsapp_saas/commit/2539a0fbd0c3fce5f0b66ff95be9f7a69a2bff07))
* **mind:** make guards the canonical rule gate ([65b2016](https://github.com/danielgonzagat/whatsapp_saas/commit/65b2016284dd25d54fa3424e79d1d348f98e9a2c))
* **mind:** preserve channel fields in guard traces ([57f14c7](https://github.com/danielgonzagat/whatsapp_saas/commit/57f14c70f155e41c46adb9c7784b281f2c8bd913))
* **mind:** reduce codacy spine complexity ([1358b0d](https://github.com/danielgonzagat/whatsapp_saas/commit/1358b0de856ba91a0593ce66beb4be93bf332312))
* **mind:** remove graph persistence gate regressions ([7e81408](https://github.com/danielgonzagat/whatsapp_saas/commit/7e8140883082840a0eb97de094331819213a2645))
* **mind:** remove unsafe casts ([cc49a22](https://github.com/danielgonzagat/whatsapp_saas/commit/cc49a225549f978d82c30e7ea82d1dd9cb2dcd0e))
* **mind:** require outbox dispatch acknowledgement ([83f3716](https://github.com/danielgonzagat/whatsapp_saas/commit/83f3716b6773c664db8ebf04cbbd3da990d872df))
* **mind:** route inbound through deterministic orchestrator ([3560e72](https://github.com/danielgonzagat/whatsapp_saas/commit/3560e7232f85e5aa7aabba64aa4fb3e7a4829a5e))
* **mind:** route recovery timing through catalog resolvers ([3e4e5a2](https://github.com/danielgonzagat/whatsapp_saas/commit/3e4e5a2d85c9ca291ed8fb9e1e5afa639d1f4a7f))
* **mind:** route synthetic simulations through reports ([3b05bb1](https://github.com/danielgonzagat/whatsapp_saas/commit/3b05bb1e927f701b769147b04e6a20e89e73a915))
* **mind:** run daily report from processor tick ([8cc9d22](https://github.com/danielgonzagat/whatsapp_saas/commit/8cc9d22a73c82a79de68915496d7b4f50d099614))
* **mind:** satisfy architecture guardrails ([0ef6258](https://github.com/danielgonzagat/whatsapp_saas/commit/0ef62586e05a9f13dc8eb43a2afacf374c6d6d5c))
* **mind:** satisfy quality gates ([0974c94](https://github.com/danielgonzagat/whatsapp_saas/commit/0974c94c95f5954f712da6f43716655ba8ca8821))
* **mind:** scope code-native aggregate queries by workspace ([39bed3f](https://github.com/danielgonzagat/whatsapp_saas/commit/39bed3f407da86d1babe8c09d21fa5820791c3aa))
* **mind:** score decisions with economic objective ([45e7124](https://github.com/danielgonzagat/whatsapp_saas/commit/45e7124883dc3212d2c8139a12d18de6f26db47d))
* **mind:** split commercial graph persistence ([460317c](https://github.com/danielgonzagat/whatsapp_saas/commit/460317c1e983b96302addea19a9cee532030649d))
* **mind:** use bullmq-safe queue names ([75118f6](https://github.com/danielgonzagat/whatsapp_saas/commit/75118f6dfcee00547bda4c0b3426accda4e50997))
* **mind:** wire transports and code-native gates ([1994a2c](https://github.com/danielgonzagat/whatsapp_saas/commit/1994a2c0affb742a47144d88274c8e1ea638501d))
* **omnichannel:** feed whatsapp inbound into mind percepts ([3973b1d](https://github.com/danielgonzagat/whatsapp_saas/commit/3973b1d5a33e38934455aa524bf0db6edc1a6cd0))
* **omnichannel:** route inbox and webhook sends through transports ([c8c192a](https://github.com/danielgonzagat/whatsapp_saas/commit/c8c192aba3a6312e5699d629117455943df6980f))
* **pr266:** address review gates ([14de736](https://github.com/danielgonzagat/whatsapp_saas/commit/14de7368a3bfb15e3b19899a2b178e04bfd4cf9e))
* **pr266:** clear quality and login visual gates ([47353a5](https://github.com/danielgonzagat/whatsapp_saas/commit/47353a5491007cbfe71262d737801b0d0d1258ba))
* **pr266:** close security and ui regressions ([3817d9d](https://github.com/danielgonzagat/whatsapp_saas/commit/3817d9d14f68d778fa7988ab0fb0bda8849c515d))
* **pr266:** close tenant and visual gates ([d7d31c1](https://github.com/danielgonzagat/whatsapp_saas/commit/d7d31c162f60ffc3a08ad4f08d77b4c0357b7db3))
* **pr266:** stabilize visual and codacy gates ([c52b8e2](https://github.com/danielgonzagat/whatsapp_saas/commit/c52b8e24cebca91c8948afad8dd5fb2b70e8b3c2))
* **pr266:** sync sales template constants ([7ec3672](https://github.com/danielgonzagat/whatsapp_saas/commit/7ec3672a1fc37c3ceecbcf8dd2b3c6b42d3eb9d0))
* **pulse:** honor tier zero perfectness scope ([5d14747](https://github.com/danielgonzagat/whatsapp_saas/commit/5d1474712f653f06e2a4932b39b3bfa3965486d8))
* **pulse:** keep certification scan within ci budget ([8c8ab04](https://github.com/danielgonzagat/whatsapp_saas/commit/8c8ab043b94b11621a8b990c1f224a5bf3154438))
* **pulse:** keep ci certification under timeout ([34e3be6](https://github.com/danielgonzagat/whatsapp_saas/commit/34e3be62ae7eeec9d97b882f790ea46077254cd9))
* **pulse:** keep quality gate within ci budget ([e126fd3](https://github.com/danielgonzagat/whatsapp_saas/commit/e126fd32abcec9c371b5f59a4f34868b5986254f))
* **pulse:** reduce product model scan time ([14a933e](https://github.com/danielgonzagat/whatsapp_saas/commit/14a933e7fd5243397dd1dee6fbaa0e49b9143657))
* **pulse:** restore ratchet-safe mind evidence ([2caa479](https://github.com/danielgonzagat/whatsapp_saas/commit/2caa479d95e5f6a3242974ac47121e3ecca9e2aa))
* **pulse:** stabilize artifact name discovery ([4814019](https://github.com/danielgonzagat/whatsapp_saas/commit/48140191b557158726e4c922436da4b19bb94662))
* **visual:** freeze thanos sales capture ([58928b0](https://github.com/danielgonzagat/whatsapp_saas/commit/58928b0325dda6bcd39688a26acd591cc5a7e1b8))
* **visual:** stabilize mushroom capture ([b5d03ef](https://github.com/danielgonzagat/whatsapp_saas/commit/b5d03ef6e7c8ef1118a381dcb8ebcfc99f46c94d))
* **visual:** use static landing marks ([bb8f00b](https://github.com/danielgonzagat/whatsapp_saas/commit/bb8f00b1e44764cb2729e342e0b45535cd73ffe7))
* **visual:** use static landing mushroom asset ([f5277d6](https://github.com/danielgonzagat/whatsapp_saas/commit/f5277d6d1e6618b0b4e1faf57375270c8c000979))
* **whatsapp:** guard inline reply failure logging ([e31b18e](https://github.com/danielgonzagat/whatsapp_saas/commit/e31b18ee829d1160e4929ec9f6841640ec7ba29c))
* **worker:** isolate railway service config ([502c1ea](https://github.com/danielgonzagat/whatsapp_saas/commit/502c1eacc98a3b624f89fd38319ccbf67e3a3103))
* **worker:** keep learned variants deterministic ([68b05dc](https://github.com/danielgonzagat/whatsapp_saas/commit/68b05dc90cb2d4554b2daad723ba5c60bf923a60))
* **worker:** sync prisma schema with mind models ([8879da6](https://github.com/danielgonzagat/whatsapp_saas/commit/8879da63baeffafefed6aae5453eb03592367c99))


### Performance Improvements

* **mind:** batch scoped code-native scans ([a47d3bc](https://github.com/danielgonzagat/whatsapp_saas/commit/a47d3bcf8ba9344fa630e7b7804e3bf6f89b88dc))

## [0.3.0](https://github.com/danielgonzagat/whatsapp_saas/compare/v0.2.0...v0.3.0) (2026-05-07)


### Features

* **marketing:** enable official channel integrations ([3857bac](https://github.com/danielgonzagat/whatsapp_saas/commit/3857bac3e565da6e1c0226913a89a635d05555a2))


### Bug Fixes

* address official integration review ([cdc3319](https://github.com/danielgonzagat/whatsapp_saas/commit/cdc33194b20c39221996589e2105061dda6624a9))
* align visual baselines for chat shortcuts ([45d4002](https://github.com/danielgonzagat/whatsapp_saas/commit/45d400245fbc40e0835ea5b34e04bce289097fd2))
* complete official marketing channel connections ([70d701e](https://github.com/danielgonzagat/whatsapp_saas/commit/70d701eefa81c61c8b1a79b58e1d2fb14a86c67a))
* complete official marketing channel connections ([c6a1c89](https://github.com/danielgonzagat/whatsapp_saas/commit/c6a1c89408644db105bb4a038fc9f6ce38da359b))
* extract thanos static config ([f6fb72d](https://github.com/danielgonzagat/whatsapp_saas/commit/f6fb72de284839b2fd1ce95c45ab6fdce7af5cbe))
* improve landing animation performance ([#255](https://github.com/danielgonzagat/whatsapp_saas/issues/255)) ([ca58280](https://github.com/danielgonzagat/whatsapp_saas/commit/ca582803d9b33741e9a2a25d9be219f064ccf0dd))
* include ops event provider in logs ([cd08f03](https://github.com/danielgonzagat/whatsapp_saas/commit/cd08f031969282d46f121cccfd7536bfce8b7c09))
* remove ops alert unsafe cast ([6df499b](https://github.com/danielgonzagat/whatsapp_saas/commit/6df499be25217553686e9743602d11cc809998ff))
* remove ops alert unsafe cast ([066160a](https://github.com/danielgonzagat/whatsapp_saas/commit/066160afe6cbe2ca6d36615b82ae6892bbc61124))
* restrict cookie consent to marketing domain ([7ca17e9](https://github.com/danielgonzagat/whatsapp_saas/commit/7ca17e90794bbc136809c606ea3ff9a68795c60e))
* satisfy marketing visual contract ([ec31abe](https://github.com/danielgonzagat/whatsapp_saas/commit/ec31abe052a422dc6abe9a5adf8db45d9e895a7a))
* tolerate missing ops event delegate ([5473393](https://github.com/danielgonzagat/whatsapp_saas/commit/54733934b4f3782f35660140c585eefaacaaa876))
* update signup desktop visual baseline ([d99d6f8](https://github.com/danielgonzagat/whatsapp_saas/commit/d99d6f8ba3547c87a02c4538417748da0b82838c))
* update signup tablet visual baseline ([6126f2c](https://github.com/danielgonzagat/whatsapp_saas/commit/6126f2c212e0cf2f7de745760195a293361e701e))

## [0.2.0](https://github.com/danielgonzagat/whatsapp_saas/compare/v0.1.0...v0.2.0) (2026-05-06)

### Features

- add pulse autonomy proof ([4a38267](https://github.com/danielgonzagat/whatsapp_saas/commit/4a3826740eeda714adb9d7555ecf1e10b19dcca9))
- **adm:** adm.kloel.com foundation + IAM + shell + light theme (SP-0..2) ([5c0cc64](https://github.com/danielgonzagat/whatsapp_saas/commit/5c0cc64aa132db79b0baa63d386d253a072d57ae))
- **admin:** advance home and clients runtime ([5e71225](https://github.com/danielgonzagat/whatsapp_saas/commit/5e712255d032c6284ec6e55de8e1fa6ef466503a))
- **admin:** expand control plane operations ([830e7d4](https://github.com/danielgonzagat/whatsapp_saas/commit/830e7d4a2fcb16d743b95331358c4f38c00ec4d5))
- **admin:** thread idempotency key into transaction operate (MAX-RIGOR) ([2a7ca3e](https://github.com/danielgonzagat/whatsapp_saas/commit/2a7ca3e7825dff663bd252d208a7d8d65c1cea9a))
- **adm:** prioritize kloel revenue in admin clone ([509e0e8](https://github.com/danielgonzagat/whatsapp_saas/commit/509e0e82e939c09ffe65cf25f89ad83848f1684e))
- **adm:** sp-13 advanced audit filters + csv export ([#136](https://github.com/danielgonzagat/whatsapp_saas/issues/136)) ([dbbe309](https://github.com/danielgonzagat/whatsapp_saas/commit/dbbe309de2ae0c63bbe1da8f62d6de47644e3dd0))
- **adm:** sp-14 admin ai chat v0 — tool registry + stub LLM + floating drawer ([#134](https://github.com/danielgonzagat/whatsapp_saas/issues/134)) ([d3550e8](https://github.com/danielgonzagat/whatsapp_saas/commit/d3550e8214cb3a833858515e13b87628b031b5dd))
- **adm:** sp-3..13 partial — god view, contas/kyc, produtos, vendas, compliance, relatórios, configurações, marketing, carteira/clientes stubs ([c9d1eb4](https://github.com/danielgonzagat/whatsapp_saas/commit/c9d1eb4e48cf76de1f20d216cbc8095036f27a11))
- **adm:** SP-4b/5b drill-downs + SP-11 complete + SP-8/9/14 specs ([#131](https://github.com/danielgonzagat/whatsapp_saas/issues/131)) ([bbe9df2](https://github.com/danielgonzagat/whatsapp_saas/commit/bbe9df276a857442dc99d18528ae55666544038f))
- **adm:** sp-8 destructive confirm dialog + wired on product page ([#138](https://github.com/danielgonzagat/whatsapp_saas/issues/138)) ([b6b8764](https://github.com/danielgonzagat/whatsapp_saas/commit/b6b876400823b84222ba5cb3ab3646f9020bcbd6))
- **adm:** SP-8 destructive intents backend v0 ([#132](https://github.com/danielgonzagat/whatsapp_saas/issues/132)) ([39b65f7](https://github.com/danielgonzagat/whatsapp_saas/commit/39b65f7085ecd7d2d66e0fdfe281474a27b7f6b8))
- **adm:** sp-8 force-logout-global + cache-purge handlers ([#140](https://github.com/danielgonzagat/whatsapp_saas/issues/140)) ([a31ac88](https://github.com/danielgonzagat/whatsapp_saas/commit/a31ac887bd4426be33bdf6d64d8d404fee086cbe))
- **adm:** sp-8 product archive and delete handlers ([#135](https://github.com/danielgonzagat/whatsapp_saas/issues/135)) ([9b7b5a5](https://github.com/danielgonzagat/whatsapp_saas/commit/9b7b5a5dbd226b377ae18b6fd2858667a44ab6ce))
- **adm:** SP-9 platform wallet v0 (ledger + read API + live /carteira) ([#133](https://github.com/danielgonzagat/whatsapp_saas/issues/133)) ([ea27b2c](https://github.com/danielgonzagat/whatsapp_saas/commit/ea27b2c1d86414f0827becad3ff1d4dcfb537fea))
- **adm:** sp-9 reconcile service + /carteira/reconcile endpoint ([#139](https://github.com/danielgonzagat/whatsapp_saas/issues/139)) ([a78fade](https://github.com/danielgonzagat/whatsapp_saas/commit/a78fade72a75474d020d6dd8e052195bbb82537f))
- **adm:** sp-9 split engine wired into checkout confirm ([#137](https://github.com/danielgonzagat/whatsapp_saas/issues/137)) ([32788e4](https://github.com/danielgonzagat/whatsapp_saas/commit/32788e42111771fc1cda45a0349877931886f572))
- align admin frontend with app shell ([2275be4](https://github.com/danielgonzagat/whatsapp_saas/commit/2275be47f84662e13e8e70995de44233e3d73e4c))
- **auth:** add tiktok login flow ([edf693b](https://github.com/danielgonzagat/whatsapp_saas/commit/edf693b6510ba98e0941d1de0f6e10a8f52c7991))
- **billing:** guard live stripe mode behind explicit confirmation ([e61cdd3](https://github.com/danielgonzagat/whatsapp_saas/commit/e61cdd397c329a462f8b31005370c1911eb67869))
- **billing:** upgrade stripe sdk to 22.0.2 and add stripeservice wrapper ([d97437c](https://github.com/danielgonzagat/whatsapp_saas/commit/d97437c221c96950e7b9f29be8f49f402be9a746))
- **checkout:** capture social identity leads ([07d2371](https://github.com/danielgonzagat/whatsapp_saas/commit/07d237114cb21beae4e42557f89ea2113ea282ec))
- **checkout:** request google people scopes for extra prefill ([fc444d7](https://github.com/danielgonzagat/whatsapp_saas/commit/fc444d70124122d41b80e4a9fc045d362b32456f))
- **codacy+e2e+pulse:** bundle concurrent hardening work ([97a5544](https://github.com/danielgonzagat/whatsapp_saas/commit/97a5544fcc9136979587f403d7ec4cd05b9ad3ef))
- **compliance:** finalize legal surface and social auth handoff ([59eb9b3](https://github.com/danielgonzagat/whatsapp_saas/commit/59eb9b3f5cb07ef847cf8b4abe5e7249073ef21f))
- **connect,platform-wallet:** stripe connect payouts/reversals + platform wallet services ([2ca4720](https://github.com/danielgonzagat/whatsapp_saas/commit/2ca47201d5ef3a8e3071591f4764a1f21057d9b0))
- **connect:** add payout approval and reconciliation tooling ([ab9fe1a](https://github.com/danielgonzagat/whatsapp_saas/commit/ab9fe1a255d27aa607662c39fbda1b294e274943))
- **connect:** host onboarding inside kloel api ([0f99478](https://github.com/danielgonzagat/whatsapp_saas/commit/0f994788f8ca5c59c2713bb0f46d293cff14e420))
- **conta:** surface seller connect status ([4977cf1](https://github.com/danielgonzagat/whatsapp_saas/commit/4977cf10e5ed869b2b4e9d3badb2580743c48ac4))
- **frontend:** add stripepaymentelement scaffold + usestripecheckout hook ([4ec9ff9](https://github.com/danielgonzagat/whatsapp_saas/commit/4ec9ff9764ff76d3cddaf83c5dbb73c922c3c8f8))
- **frontend:** add tiktok webhook endpoint ([dc98a6d](https://github.com/danielgonzagat/whatsapp_saas/commit/dc98a6d7ec2b529ade328774008669d2c291d920))
- **i18n:** wire next-intl gate + wrap JSX text/attrs via codemod ([7aafcee](https://github.com/danielgonzagat/whatsapp_saas/commit/7aafcee65c32f5d332cadf16688a50c57d44e68f))
- **kloel:** add seller marketing skill routing ([7ec0d25](https://github.com/danielgonzagat/whatsapp_saas/commit/7ec0d25207060dc10874bd3fee8eebf814d83cb8))
- **kyc:** sync seller onboarding into connect ([b7ba192](https://github.com/danielgonzagat/whatsapp_saas/commit/b7ba19207b6296bca7e16d6227d90559195c8f31))
- **observability:** activate datadog tracing ([d627a64](https://github.com/danielgonzagat/whatsapp_saas/commit/d627a647371e86225ec819cd27487e88b9b1d997))
- **parcerias:** close affiliate invite onboarding loop ([775332f](https://github.com/danielgonzagat/whatsapp_saas/commit/775332f851ecfcdb283c510a241833d205d638d3))
- **parcerias:** onboard coproducers and managers ([39b7fb6](https://github.com/danielgonzagat/whatsapp_saas/commit/39b7fb6032015bb7e5b9d6961fd0a6c6e98df66b))
- **payments:** add connectservice for stripe custom accounts ([535c27a](https://github.com/danielgonzagat/whatsapp_saas/commit/535c27a5ef81bc86dc01e9cd28c69b735c3d57c8))
- **payments:** add fraudengine with platform-wide blacklist ([4a8aa01](https://github.com/danielgonzagat/whatsapp_saas/commit/4a8aa017a13d8cb68265875ac9afa83b91ea251a))
- **payments:** add ledgerservice with dual-balance and chargeback cascade ([913342a](https://github.com/danielgonzagat/whatsapp_saas/commit/913342a929812e89fb67e8a92ea2a65f754828e3))
- **payments:** add splitengine pure module with 4-hypothesis coverage ([6c73000](https://github.com/danielgonzagat/whatsapp_saas/commit/6c73000d830559816e56e295fcfe620d0b068cc5))
- **payments:** add stripechargeservice as canonical sale-side path ([e59e16f](https://github.com/danielgonzagat/whatsapp_saas/commit/e59e16fe96b01be7852dbbd066e7e41fc3be590e))
- **payments:** add stripewebhookprocessor for sale fan-out ([d738f9e](https://github.com/danielgonzagat/whatsapp_saas/commit/d738f9e67ec5cb1c1aab5c5e4b2e721d2b09666b))
- **payments:** complete stripe-only cutover ([dda29b0](https://github.com/danielgonzagat/whatsapp_saas/commit/dda29b07137aaebcac6219c0ce77c10ae4ffc389))
- **payments:** harden antifraud coverage across payment intent creation ([c8896f2](https://github.com/danielgonzagat/whatsapp_saas/commit/c8896f21f317c553a298b5971f4ba58d705c380f))
- **payments:** merge stripe-only cutover ([ee50508](https://github.com/danielgonzagat/whatsapp_saas/commit/ee5050839679b4d5a020b5c8cb9056ba33e4b5ed))
- **payments:** move active sale creation to marketplace path ([627c29b](https://github.com/danielgonzagat/whatsapp_saas/commit/627c29b9c5dd4021a96096bcfafe52b1940c3c74))
- **payments:** wire paymentsmodule + walletmodule into appmodule ([9eba5c6](https://github.com/danielgonzagat/whatsapp_saas/commit/9eba5c6dfcc15562664bbedbf5223eeba46cc725))
- **pulse:** add product model layer for surfaces and capabilities ([fcd6776](https://github.com/danielgonzagat/whatsapp_saas/commit/fcd67765dfb10ae83e8167974378dbb41bf914bc))
- **pulse:** autonomy infrastructure complete ([fa1a21f](https://github.com/danielgonzagat/whatsapp_saas/commit/fa1a21f2eb57c2595a68372e595b6cec56023793))
- **pulse:** consolidate v3 foundation and autonomy layers - P0-P1 ([8f27b36](https://github.com/danielgonzagat/whatsapp_saas/commit/8f27b366b3d437ab5f8aaf91d95568ec06caf8ca))
- **pulse:** foundation layers - scopes, capabilities, flows, autonomy ([b598e88](https://github.com/danielgonzagat/whatsapp_saas/commit/b598e88964d1dc42230972658f6446fc011c3ae2))
- **pulse:** implement P3-P4 (external adapters, directive executability, acceptance suite) ([842ffb7](https://github.com/danielgonzagat/whatsapp_saas/commit/842ffb7da6d8f5662417d02cc36fe43a7e58031a))
- **pulse:** parser test framework with regression tests ([37c3b01](https://github.com/danielgonzagat/whatsapp_saas/commit/37c3b0187dfe881cd6af22e5566686bf927769af))
- **pulse:** ship canonical runtime snapshot ([e62438a](https://github.com/danielgonzagat/whatsapp_saas/commit/e62438a431513fa8c94112bf5166f40f20934015))
- **pulse:** validate autonomous readiness verdict ([03445b2](https://github.com/danielgonzagat/whatsapp_saas/commit/03445b2a3bd5d124a59095915689123e8536c323))
- **wallet:** add prepaid wallet for usage-metered services ([b9e6078](https://github.com/danielgonzagat/whatsapp_saas/commit/b9e60785952169aa1071168278f99ca9d6b1393d))
- **wallet:** add provider-priced wallet rails and kb async settlement ([9a15c70](https://github.com/danielgonzagat/whatsapp_saas/commit/9a15c7069f1e73fe9dcc499fa66989579553ff35))
- **wallet:** meter site generation with provider usage settlement ([3d99f93](https://github.com/danielgonzagat/whatsapp_saas/commit/3d99f931b8b327ba604f329fab3970bce7ecb7f2))
- **webhooks:** hydrate thin stripe account updates ([52b60ad](https://github.com/danielgonzagat/whatsapp_saas/commit/52b60ad23dc9b56961160ee1b56e8ca7977ff072))

### Bug Fixes

- **adm:** derive mfa encryption key from any non-empty string ([a1d2d69](https://github.com/danielgonzagat/whatsapp_saas/commit/a1d2d69a7bc188120cc736138e144f89956c229b))
- **adm:** drop aud from jwt payload — collides with module signOptions ([7e1d069](https://github.com/danielgonzagat/whatsapp_saas/commit/7e1d069ca5fc867feba8139a1b6e36baeb08aaf7))
- **admin:** remove sidebar hardcoded copy ([368983f](https://github.com/danielgonzagat/whatsapp_saas/commit/368983fe95ef3f88b28d66a2b6e8e2c8d0af42bb))
- **adm:** restore dashboard revenue series exports ([f09ab5a](https://github.com/danielgonzagat/whatsapp_saas/commit/f09ab5a89a716cdf59f0045759fd40c11a701c9c))
- **adm:** reuse pending mfa secret + widen totp verify window ([51f085a](https://github.com/danielgonzagat/whatsapp_saas/commit/51f085ae54e662eeca196bfb0426e8bba35ceaf4))
- **adm:** unblock login from adm.kloel.com + mushroom logo ([252ae93](https://github.com/danielgonzagat/whatsapp_saas/commit/252ae934990c4af3d027c8e2d12270b3ce8f8932))
- **adm:** verify admin jwt with explicit ADMIN_JWT_SECRET ([ebe1caf](https://github.com/danielgonzagat/whatsapp_saas/commit/ebe1caf49287b15567f7613cfe0c428c948b09b0))
- align internal package locks ([3c2b508](https://github.com/danielgonzagat/whatsapp_saas/commit/3c2b5081710aa61fba2c2de59e9b009008693e3a))
- **auth:** allow legal routes on auth host for authenticated users ([b92e885](https://github.com/danielgonzagat/whatsapp_saas/commit/b92e88521f37d5ef6c9665f1a9879a87f164ccd4))
- **auth:** finish magic-link + Facebook compliance wiring (MAX-RIGOR) ([26f84db](https://github.com/danielgonzagat/whatsapp_saas/commit/26f84dbf9927af53ec0c23f46a204b16320be685))
- **auth:** redirect legacy tiktok callback route ([ca17d81](https://github.com/danielgonzagat/whatsapp_saas/commit/ca17d818ab89ff8c69d948ec8a68625767ad3c80))
- **auth:** restore Meta login on auth.kloel.com ([7cc81e4](https://github.com/danielgonzagat/whatsapp_saas/commit/7cc81e4e2b589d65da884ac48c41cf3183e0d762))
- **auth:** separate meta auth app and skip anonymous threads ([3beb3e5](https://github.com/danielgonzagat/whatsapp_saas/commit/3beb3e5cee18069f8724f6b60a3791feffb4fe6d))
- **autopilot:** stabilize insight timeline summary ([96c411d](https://github.com/danielgonzagat/whatsapp_saas/commit/96c411d06ed1c9a987a405af1c2bfd827d031dd8))
- avoid property access matches in pulse ui mapping ([9369de0](https://github.com/danielgonzagat/whatsapp_saas/commit/9369de03eaff25bbaa5b17808182f28fe32f9427))
- avoid synthetic ui api attribution ([5a2c14f](https://github.com/danielgonzagat/whatsapp_saas/commit/5a2c14fe03d7474eb30659d2c21215c20437fcfb))
- **campaigns:** align modal visual tokens ([09b13ee](https://github.com/danielgonzagat/whatsapp_saas/commit/09b13ee3d5a67d2a0ca53dc4a9a1a1d15d6bb34c))
- **campaigns:** replace confirm and hardcoded props ([a1c80ac](https://github.com/danielgonzagat/whatsapp_saas/commit/a1c80ac62d29e21d4f9e0ed817a9832450d82ea8))
- **chat:** preserve visual attachment previews after upload ([a5f0f80](https://github.com/danielgonzagat/whatsapp_saas/commit/a5f0f801dea425eaa49b1127c1b4cb15b00e69db))
- **checkout-config:** remove inline icon and hardcoded props ([ecd05da](https://github.com/danielgonzagat/whatsapp_saas/commit/ecd05dadc1333dbd28ac23876c1dff534417d201))
- **checkout:** allow editing quick identity fields ([35660f1](https://github.com/danielgonzagat/whatsapp_saas/commit/35660f1cc27fc3850e128342ca62135e5d3a4b39))
- **checkout:** gate google people scopes behind opt-in ([4ff30c5](https://github.com/danielgonzagat/whatsapp_saas/commit/4ff30c540039ccb4cfe75073101c0fd1b3d1e7f7))
- **checkout:** harden native autofill semantics ([dd92586](https://github.com/danielgonzagat/whatsapp_saas/commit/dd9258654016251737d0f255e6657709a0ea82a0))
- **checkout:** keep social icons visible after google capture ([4b6fb48](https://github.com/danielgonzagat/whatsapp_saas/commit/4b6fb48c5ca4f20531b70bb13ed0d22c2fc34b0d))
- **checkout:** rehydrate social leads with enriched prefill ([7ef8597](https://github.com/danielgonzagat/whatsapp_saas/commit/7ef859709c842fc0b427bbededdec1a08ae048bb))
- **checkouts:** replace browser delete confirm ([1675348](https://github.com/danielgonzagat/whatsapp_saas/commit/16753489b46f158ccf86035e4d568924717024de))
- **checkouts:** surface product checkout errors ([da69a3d](https://github.com/danielgonzagat/whatsapp_saas/commit/da69a3df472e5c19de9a5a9475a5d00d161371e2))
- **checkout:** wire Facebook identity props through lead sections ([14bde17](https://github.com/danielgonzagat/whatsapp_saas/commit/14bde176ca59b404568865163fee72066059c372))
- **ci:** align auth and wallet backend checks ([ef85968](https://github.com/danielgonzagat/whatsapp_saas/commit/ef859685547b0632a0d8e31dfd1a315ab4ae7c50))
- **ci:** avoid false positive any matcher in connect approval spec ([90e741d](https://github.com/danielgonzagat/whatsapp_saas/commit/90e741d4d99a826c01145c5de22370bddd6b4033))
- **ci:** satisfy production readiness codacy pin ([#157](https://github.com/danielgonzagat/whatsapp_saas/issues/157)) ([18fd0f3](https://github.com/danielgonzagat/whatsapp_saas/commit/18fd0f34e686f4ae8f00787091180f9688d0005b))
- classify pulse external side effects ([de5b2f8](https://github.com/danielgonzagat/whatsapp_saas/commit/de5b2f8008410df4d0bd3f6c68b1a3fc8990988a))
- classify pulse reliability gaps precisely ([e6d07a8](https://github.com/danielgonzagat/whatsapp_saas/commit/e6d07a88af5cbf0e6696c7e517e56e645c4e929c))
- clean checkout social recovery gates ([d012717](https://github.com/danielgonzagat/whatsapp_saas/commit/d01271738c67c29e0005a65ec0809232d3a4cac6))
- close code quality regressions for pulse ([b9cb345](https://github.com/danielgonzagat/whatsapp_saas/commit/b9cb345a4ce62c0979b9d1d6f967252b57f06651))
- close code quality regressions in product code ([76a442e](https://github.com/danielgonzagat/whatsapp_saas/commit/76a442e335b93dbfb5613337227cc03f2cf55199))
- **codacy:** convert reportRow to type intersection for eslint-disable ([aa5a22b](https://github.com/danielgonzagat/whatsapp_saas/commit/aa5a22b7e732d82205eb8e8b49028aa36e6728bb))
- **codacy:** disable 4 noise patterns via REST API (-~115 issues) ([69c69a2](https://github.com/danielgonzagat/whatsapp_saas/commit/69c69a2d4eaccca9e63697e476f9d35255a193f8))
- **codacy:** eliminate new-any guard violations with proper typing ([506c587](https://github.com/danielgonzagat/whatsapp_saas/commit/506c5875c77eccada6143b56d71613af38f5ecc1))
- **codacy:** fully type-narrow analytics page — zero :any remaining ([79e653f](https://github.com/danielgonzagat/whatsapp_saas/commit/79e653f801651d1b4b8b2c638cc211ef42a95a05))
- **codacy:** harden checkout, auth, kloel runtime & worker paths ([#169](https://github.com/danielgonzagat/whatsapp_saas/issues/169)) ([5007802](https://github.com/danielgonzagat/whatsapp_saas/commit/50078028dcf083e55931a91abfab6e2dc20659a5))
- **codacy:** inline eslint-disable on ReportRow index signature ([5937508](https://github.com/danielgonzagat/whatsapp_saas/commit/59375086bb0cdaa4a5e93dd07d3469280eda9493))
- **codacy:** inline eslint-disable-line on reportRow type alias ([286a268](https://github.com/danielgonzagat/whatsapp_saas/commit/286a268b3b6f14ee33c9711d2fe90147cb159b11))
- **codacy:** markdownlint remaining — blank lines + URL brackets + $ prefix ([b72b67a](https://github.com/danielgonzagat/whatsapp_saas/commit/b72b67a59a8e034d74c42b5074c8bff8dafa306b))
- **codacy:** multi-line reportRow type with dual eslint-disable ([cac5050](https://github.com/danielgonzagat/whatsapp_saas/commit/cac50502aa54fc3487a5a856bb9572c61bf16e4e))
- **codacy:** remove crypto and template findings ([a827197](https://github.com/danielgonzagat/whatsapp_saas/commit/a82719771cd41c67c63ab0dd52b7dd445b18420c))
- **codacy:** suppress 2 remaining eslint no-explicit-any on new lines ([fb17ebb](https://github.com/danielgonzagat/whatsapp_saas/commit/fb17ebb5f4e610787016380fb41f9933fa3927b8))
- **codacy:** sweep ~800 issues across frontend, worker, security, CSS, shell ([a280f97](https://github.com/danielgonzagat/whatsapp_saas/commit/a280f977a2f688e799da63789e022bf66ae879c6))
- **codacy:** type-narrow :any on new lines to unblock pre-push guard ([1f21da3](https://github.com/danielgonzagat/whatsapp_saas/commit/1f21da3dd9e010e9873ce79fbce5d403cc5696ae))
- **codacy:** type-narrow ~100 :any across 48 backend files ([6f5dc38](https://github.com/danielgonzagat/whatsapp_saas/commit/6f5dc38cd48dce08285889137a5edb8bf3fa8722))
- **codacy:** type-narrow ~237 :any across 8 core files ([4bd9987](https://github.com/danielgonzagat/whatsapp_saas/commit/4bd9987bc95ef0b0e8b48baaef90e7254f0c7bfc))
- **codacy:** type-narrow ~250 :any across 20 files + safeStr() fixes ([6560a0c](https://github.com/danielgonzagat/whatsapp_saas/commit/6560a0c1390f71377b047438ba50aa1786a0373b))
- **codacy:** type-narrow 177 :any across 5 core files ([542f1e8](https://github.com/danielgonzagat/whatsapp_saas/commit/542f1e8f1fb01177f8f55358efff69035bc626c6))
- **codacy:** type-narrow 44 :any across 25 worker files ([bcb5913](https://github.com/danielgonzagat/whatsapp_saas/commit/bcb59139b056d938f9b0b2d91dba4dcf857beaa0))
- **codacy:** type-narrow all :any on new lines in analytics page ([45f8146](https://github.com/danielgonzagat/whatsapp_saas/commit/45f8146bd7e6f8234fdd91225dc79b36980864a4))
- **codacy:** type-narrow all 59 :any in unified-agent.service.ts ([00c3bbb](https://github.com/danielgonzagat/whatsapp_saas/commit/00c3bbb7b6c164e0687106d69add19e5a0ecd3aa))
- **codacy:** wave 1 — mechanical autofixes across 77 files (-~175 issues) ([f49f554](https://github.com/danielgonzagat/whatsapp_saas/commit/f49f5547fb411710aaf9446a87483bc9da0f469b))
- **codacy:** waves 2-7 — regex hoist, component extraction, types, imports (~400 issues) ([5bbae97](https://github.com/danielgonzagat/whatsapp_saas/commit/5bbae97c72bc0204dfe20dd860ae880f0b4f373c))
- **codacy:** waves 3-8 — useId, array keys, a11y, await-in-loops (~360 issues) ([33a61a5](https://github.com/danielgonzagat/whatsapp_saas/commit/33a61a50df16cf2cec09ac1a9231f99fa2527599))
- **codacy:** zero :any remaining in backend (54 files, 127 removed) ([70a9154](https://github.com/danielgonzagat/whatsapp_saas/commit/70a915473b09de3353b05a2df02ea9da5b50ddb8))
- **commissions:** replace confirm and format output ([553669a](https://github.com/danielgonzagat/whatsapp_saas/commit/553669a797c0bf3578a563dc66a1608223bf84f0))
- compile pulse capability seed helper ([0f29d87](https://github.com/danielgonzagat/whatsapp_saas/commit/0f29d87909b8c999b243b8f53963353d4dca3ad1))
- **compliance:** harden signed request parsing ([62dc1bd](https://github.com/danielgonzagat/whatsapp_saas/commit/62dc1bda8818fbf1bc9f88a896d19c6fdec4dbdc))
- **coupons:** surface errors and replace confirm ([f498dea](https://github.com/danielgonzagat/whatsapp_saas/commit/f498deabded8f660dce469b31e4f9b0863fa0ecc))
- **critical:** checkout race conditions in social lead and recovery services ([f05eeac](https://github.com/danielgonzagat/whatsapp_saas/commit/f05eeac56a64c69469d53fcf47576791ea872953))
- **critical:** payment webhook transaction safety and state machine validation ([340e6b0](https://github.com/danielgonzagat/whatsapp_saas/commit/340e6b01a1058844e161aa7f35564b42baf914e9))
- **critical:** payment webhook transaction wraps and state validation ([9c7ece5](https://github.com/danielgonzagat/whatsapp_saas/commit/9c7ece51075cd314d22c314371725f6cf5ae87fc))
- **deploy:** restore wallet module boot path ([abce409](https://github.com/danielgonzagat/whatsapp_saas/commit/abce409db755ac789889e15618617f0dc6a73551))
- downgrade pulse interface-only parity noise ([7f9c8b2](https://github.com/danielgonzagat/whatsapp_saas/commit/7f9c8b2e0942f2aa8950f5650b5462f8a1461050))
- escape pulse functional map regex matching ([891c15d](https://github.com/danielgonzagat/whatsapp_saas/commit/891c15da33e7040eae3a4d4a1d5af6b03746d287))
- **frontend:** add i18n gate entrypoint ([96a836f](https://github.com/danielgonzagat/whatsapp_saas/commit/96a836f3f1a4e2c5a8c0d70a07c0dfe8fa085710))
- **frontend:** align extracted constants with visual contract ([f743735](https://github.com/danielgonzagat/whatsapp_saas/commit/f74373598110fbff00f5ab55bb84e6f223d3e889))
- **frontend:** inline JSON-LD in legal-document without dangerouslySetInnerHTML ([d7e4a8c](https://github.com/danielgonzagat/whatsapp_saas/commit/d7e4a8c71378f30a34e8d115c619c0a09b7cf22c))
- **frontend:** remove weak trace id randomness ([ed880b5](https://github.com/danielgonzagat/whatsapp_saas/commit/ed880b5e9129e9075492ee6520659734c4861d09))
- **frontend:** restore middleware build compatibility ([bc063c9](https://github.com/danielgonzagat/whatsapp_saas/commit/bc063c9562e18b37ab226d8e3f3ad03b89525a72))
- **guard:** ignore malformed plan ai limits ([fa70f04](https://github.com/danielgonzagat/whatsapp_saas/commit/fa70f0420c316214046dd0e72e749b963664b95d))
- harden pulse api call extraction ([688c9bd](https://github.com/danielgonzagat/whatsapp_saas/commit/688c9bd7292cce9ba6140789f055676f91b87197))
- **home:** simplify period filter options ([38bc252](https://github.com/danielgonzagat/whatsapp_saas/commit/38bc252d8a9d297324d143e5597a89ebd9f9cc43))
- ignore framework shells in pulse parity gaps ([6d058e3](https://github.com/danielgonzagat/whatsapp_saas/commit/6d058e31774c3b61c38c2c28131fb4b687d9c73d))
- improve pulse structural capability inference ([df42b89](https://github.com/danielgonzagat/whatsapp_saas/commit/df42b89999085fdb73aa8f7f80342148b67632ec))
- keep pulse capability grouping within ratchet ([d2b636b](https://github.com/danielgonzagat/whatsapp_saas/commit/d2b636b9fa0a045b6463a22a00babe9252a705fd))
- **kyc:** break payments module cycle ([c959cc8](https://github.com/danielgonzagat/whatsapp_saas/commit/c959cc88ec96368500fac8e85999c29d263fe955))
- merge pulse capability evidence accurately ([6f3d4b0](https://github.com/danielgonzagat/whatsapp_saas/commit/6f3d4b068e7d52660c25eed768461463e1080b96))
- **partnerships:** remove fake affiliate performance ([0e738f4](https://github.com/danielgonzagat/whatsapp_saas/commit/0e738f41617677d0011b064625f3c37704ac10c7))
- **payments:** switch connect sales to separate charge fan-out ([197ea40](https://github.com/danielgonzagat/whatsapp_saas/commit/197ea40e34abffe3305ae76592b7d67022fb403f))
- **plans:** harden plan tab copy and errors ([90c3e33](https://github.com/danielgonzagat/whatsapp_saas/commit/90c3e33f54f95249ee67716843873b6f92546bf7))
- **plans:** harden shipping tab design tokens ([9873a39](https://github.com/danielgonzagat/whatsapp_saas/commit/9873a397356cfecedb747da8ead854df75bda011))
- prefer conditional pulse api wrapper calls ([ee82cb9](https://github.com/danielgonzagat/whatsapp_saas/commit/ee82cb90174110081c590ef701300216f10016d7))
- **products:** clear remaining tab findings ([b5ed15b](https://github.com/danielgonzagat/whatsapp_saas/commit/b5ed15b0f5eda521f8af2dc5327f43e3146117cf))
- **products:** harden AI tab copy handling ([3b96e89](https://github.com/danielgonzagat/whatsapp_saas/commit/3b96e890c87c8d11feaca28e82f4380d1862565f))
- **prod:** unblock deploy and facebook consent flow ([6500e73](https://github.com/danielgonzagat/whatsapp_saas/commit/6500e73238e0ca6e17b57d9459bbc424507ace32))
- **randomness:** harden backend and worker jitter ([8f4329a](https://github.com/danielgonzagat/whatsapp_saas/commit/8f4329a906ff0d8750ed1ac95aa2d0e2f8773525))
- **redis:** reject localhost URLs in production-like runtimes ([4faed30](https://github.com/danielgonzagat/whatsapp_saas/commit/4faed30ffba5590a4b7ca52b7915b605c008ab0c))
- reduce codacy ratchet findings ([7899edd](https://github.com/danielgonzagat/whatsapp_saas/commit/7899edd8376cec30fb9871d3d66beb6d5619b5b6))
- resolve codacy ratchet issues in code ([372b52b](https://github.com/danielgonzagat/whatsapp_saas/commit/372b52b4ebb9152b3278df0fae6a70a5cb96e281))
- restore AuthModule wiring for ConnectService ([d091d3b](https://github.com/danielgonzagat/whatsapp_saas/commit/d091d3bfd1cc83e90961e52ccca7e621345bb388))
- restore AuthModule wiring for ConnectService ([d091d3b](https://github.com/danielgonzagat/whatsapp_saas/commit/d091d3bfd1cc83e90961e52ccca7e621345bb388))
- **reviews:** replace confirm and extract helpers ([d9b4a04](https://github.com/danielgonzagat/whatsapp_saas/commit/d9b4a04bb9b14bb80bb7f22e7e37ec6b703eae1b))
- **security:** harden path traversal, SSRF, timing attacks, docker ([8ee65de](https://github.com/danielgonzagat/whatsapp_saas/commit/8ee65deb4cf41b9e9a4bee81d60e0df74aff46d8))
- **security:** refresh e2e diff lockfile ([f57b04b](https://github.com/danielgonzagat/whatsapp_saas/commit/f57b04bbe79b857cca5d78dca0fb7dd8e0773838))
- **security:** remove orphan backend whatsapp deps ([c36a0d5](https://github.com/danielgonzagat/whatsapp_saas/commit/c36a0d564928b50938491bb925ab0401f04ea651))
- **security:** rename false-positive password consts, swap Math.random for crypto ([211adf7](https://github.com/danielgonzagat/whatsapp_saas/commit/211adf7098df3f111a08c6c652cebe72e93776cd))
- skip materialized pulse parity duplicates ([66f25a2](https://github.com/danielgonzagat/whatsapp_saas/commit/66f25a2cc98a97318ad5b333fa92c78eb6efd956))
- trace backend service calls after method signature ([95a37ed](https://github.com/danielgonzagat/whatsapp_saas/commit/95a37edda5b69485e984ea0f1f7043e19d0ce62d))
- **types:** drop redundant tts voice casts ([b682381](https://github.com/danielgonzagat/whatsapp_saas/commit/b6823812a583740e12923283a0c1fd46c9e9bf9c))
- **types:** fail closed on malformed diagnostics settings ([9bda17f](https://github.com/danielgonzagat/whatsapp_saas/commit/9bda17f1a4486297bc259afa33f3828c4f7c5607))
- **types:** harden account agent memory parsing ([e0fee1c](https://github.com/danielgonzagat/whatsapp_saas/commit/e0fee1c768a90a95b6d47564ac16265e0140239b))
- **types:** harden recovery and launch payload parsing ([fbe2d99](https://github.com/danielgonzagat/whatsapp_saas/commit/fbe2d99d129ec5e25255ac3854469be6e00b3794))
- **types:** harden session and calendar settings parsing ([a33f429](https://github.com/danielgonzagat/whatsapp_saas/commit/a33f4295d8feac85691f7a9b2ded004165ed3e93))
- **types:** harden whatsapp and auth payload parsing ([2c986e2](https://github.com/danielgonzagat/whatsapp_saas/commit/2c986e2627322ec161b7f1b49c51628dc4e40903))
- **types:** normalize malformed json records ([d4bbce5](https://github.com/danielgonzagat/whatsapp_saas/commit/d4bbce591b36d38f08df913d2f0abff3d79c38b2))
- **types:** normalize subscription plan transitions ([d0acd17](https://github.com/danielgonzagat/whatsapp_saas/commit/d0acd175125ac62a8362b035222bc7ccc4aae39e))
- **types:** normalize webinar and member area payloads ([89cdbe1](https://github.com/danielgonzagat/whatsapp_saas/commit/89cdbe1152f21084a83f51f8fb4bad834bdbda9a))
- **types:** sanitize conversation workspace fallbacks ([8a4b1da](https://github.com/danielgonzagat/whatsapp_saas/commit/8a4b1da82f9a8d1dad04ac41d5d6512e041faf09))
- **types:** sanitize legacy kloel user ids ([f6aebbf](https://github.com/danielgonzagat/whatsapp_saas/commit/f6aebbf6d230e595d63db8052e3a3990d8668cc4))
- **types:** sanitize legacy member enrollment fields ([b87cd4d](https://github.com/danielgonzagat/whatsapp_saas/commit/b87cd4da7a6b1444157c8b4bc1cfe8eaaf3d06b3))
- **types:** sanitize waha provider payload parsing ([5404faa](https://github.com/danielgonzagat/whatsapp_saas/commit/5404faacd0afbea4b9da72ea4b7d48452287a804))
- **types:** sanitize whatsapp provider snapshots ([1ba825b](https://github.com/danielgonzagat/whatsapp_saas/commit/1ba825bac1528014d192878e3975498d45a55ff1))
- **types:** sanitize whatsapp read candidates ([ac6f307](https://github.com/danielgonzagat/whatsapp_saas/commit/ac6f307db1484daee2deeb4bd895eff52aebc31d))
- **types:** tighten diagnostic and interceptor contracts ([0314ed6](https://github.com/danielgonzagat/whatsapp_saas/commit/0314ed66bd33c82460ab18a12c43e3f5b78d9038))
- **types:** tighten flow and storage payload casts ([e278deb](https://github.com/danielgonzagat/whatsapp_saas/commit/e278debb89d9a9564e74710af198ae17369f0096))
- **types:** tighten waha provider transport contracts ([6531bc0](https://github.com/danielgonzagat/whatsapp_saas/commit/6531bc0de82a464b24c870e643f8c9d43de749c7))
- **types:** type wallet and asaas transactions ([b08b4a1](https://github.com/danielgonzagat/whatsapp_saas/commit/b08b4a14e35f4412f31231a83e31980f66e402c1))
- **urls:** surface errors and replace confirm ([5e8427d](https://github.com/danielgonzagat/whatsapp_saas/commit/5e8427daa59c8fb8b6c284b3fb0a85e5955d120c))
- **wallet,webhooks:** optimistic-lock wallet mutations and support Stripe webhook secret rotation ([30461a6](https://github.com/danielgonzagat/whatsapp_saas/commit/30461a65e26513e2154687ce9475bf46680d3d06))
- **wallet:** clear carteira opengrep props ([2dd9d2c](https://github.com/danielgonzagat/whatsapp_saas/commit/2dd9d2c870185d70040ee3e95a8af52348f78e08))
- **wallet:** remove carteira opengrep findings ([ce32dba](https://github.com/danielgonzagat/whatsapp_saas/commit/ce32dba19c230b89ea9ee12e8753fcef8cf24382))
- **webhooks:** accept tiktok base64 signatures ([1115361](https://github.com/danielgonzagat/whatsapp_saas/commit/11153614910f706bc382535c794fd2abdbb7473e))
- **webhooks:** add tiktok callback endpoint ([dd77819](https://github.com/danielgonzagat/whatsapp_saas/commit/dd77819b8a7153b2cbede61d2757be69b3741417))
- **webhooks:** relax tiktok signature parsing ([2668cab](https://github.com/danielgonzagat/whatsapp_saas/commit/2668cab80d3f8bd75d0e6bcfc173e0b9c35c8c82))
- **whatsapp:** restore session constants after rebase ([d6e5ab2](https://github.com/danielgonzagat/whatsapp_saas/commit/d6e5ab21d2a2bfed0ed2766c30d11f91ae59adc5))
- **worker:** fail fast when redis is missing on railway ([a0e5fd6](https://github.com/danielgonzagat/whatsapp_saas/commit/a0e5fd6b44e7eb393cf0c7cc3bef0c7a5694e94f))

## [1.0.0-rc1.1] - 2025-12-16

### Summary

- **Backend (Auth)**: Rate limiting obrigatório em endpoints de autenticação com
  fallback seguro quando Redis está indisponível.
- **Frontend (Auth)**: Login e cadastro unificados via **AuthModal** (rotas
  `/login` e `/register` viram deep-links para o modal).
- **Prisma/Migrations**: Harden do startup e tratamento claro para cenários de
  banco não inicializado; deploy com execução automática de migrations.
- **OAuth (Google/Apple)**: Fluxo estabilizado (erros explícitos,
  redirecionamento consistente para `/login`, pós-login padronizado em `/`).
- **Legado**: Rotas antigas eliminadas/neutralizadas (ex.: `/dashboard`
  redireciona para `/`).
- **Configuração**: Documentação reforçada para `NEXTAUTH_URL`/`AUTH_URL` e
  Redirect URIs do Google/Apple.

### Validation (Go-Live Gate)

Executado em 2025-12-16:

- `npm --prefix /workspaces/whatsapp_saas/backend test` → **PASS** (19/19
  suites, 106/106 tests)
- `npm --prefix /workspaces/whatsapp_saas/backend run test:e2e` → **PASS**
  (10/10 suites; 22 passed; 1 skipped já era do suite)
- `npm --prefix /workspaces/whatsapp_saas/frontend run build` → **SUCESSO**
- `npm --prefix /workspaces/whatsapp_saas/frontend run lint` → **SUCESSO**

### Fixed

- OAuth: erros do backend agora redirecionam para `/login` com `authError`
  detalhado (sem fallback genérico).
- Prisma: erro de “Database not initialized” passa a retornar **503** com
  mensagem clara (em vez de falhar com erro genérico).

### Documentation

- Variáveis de ambiente e configuração de produção consolidadas (Auth + OAuth +
  migrations) em `.env.example`, `backend/.env.example`, `README.md` e
  `CHECKLIST_DE_LANÇAMENTO.md`.

## [1.0.0-rc1] - 2025-12-09

### Added

- **Autopilot**: Full autonomous sales agent with "Ghost Closer" and "Lead
  Unlocker" modes.
- **Flow Engine**: Visual flow builder with support for Media, Voice, and CRM
  actions.
- **WhatsApp Connection**: Multi-provider support (WPPConnect, Meta Cloud API,
  Evolution API).
- **Kloel Brain**: AI-powered workspace admin capable of creating flows,
  campaigns, and managing products via chat.
- **Frontend**: "Chat Prime" interface with history persistence, markdown
  support, and real-time streaming.

### Changed

- **Worker Architecture**: Unified worker for all job types (flow, campaign,
  autopilot, media, voice).
- **Database**: Optimized Prisma schema with indices for high-volume message
  processing.
- **Security**: Enforced `workspaceId` scoping on all critical queries.
- **Configuration**: Standardized `providerSettings` JSON structure for all
  integrations.
- **Frontend WhatsApp**: Connection page now surfaces live status/QR updates,
  handles already-connected sessions, and blocks duplicate connect attempts.

### Fixed

- **Worker Configs**: Removed hardcoded "auto" provider settings; now fetching
  real workspace configs.
- **Tool Responses**: Standardized JSON output for all AI tools.
- **Autopilot Toggle**: Fixed state persistence for enabling/disabling
  Autopilot.
- **WhatsApp Session**: Improved session restoration and QR code generation
  flow.
- **Meta OAuth**: Callback now HMAC-validates the `state` parameter and rejects
  tampering.
- **Autopilot Follow-up**: Respects billing suspension and delivery windows
  before rescheduling.

### Security

- **Rate Limiting**: Implemented daily limits for Autopilot contacts and
  workspaces.
- **Anti-Ban**: Added jitter and human-like delays to message sending.
- **Headers**: Added `helmet` and removed `x-powered-by` to harden HTTP
  responses.
- **Secrets**: `docker-compose` now uses environment placeholders (DB/JWT)
  instead of hardcoded secrets.
