# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0](https://github.com/danielgonzagat/whatsapp_saas/compare/v0.1.0...v0.2.0) (2026-04-23)

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
- **chat:** persist image downloads and add real e2e validation ([84db89b](https://github.com/danielgonzagat/whatsapp_saas/commit/84db89b3b966d73dc8642fd100ff7ca99289a684))
- **chat:** support drag-and-drop uploads across chat ([d13d7d5](https://github.com/danielgonzagat/whatsapp_saas/commit/d13d7d5e40aad60f188d1415730214ddc2ba63aa))
- **checkout:** capture social identity leads ([07d2371](https://github.com/danielgonzagat/whatsapp_saas/commit/07d237114cb21beae4e42557f89ea2113ea282ec))
- **checkout:** request google people scopes for extra prefill ([fc444d7](https://github.com/danielgonzagat/whatsapp_saas/commit/fc444d70124122d41b80e4a9fc045d362b32456f))
- **codacy+e2e+pulse:** bundle concurrent hardening work ([97a5544](https://github.com/danielgonzagat/whatsapp_saas/commit/97a5544fcc9136979587f403d7ec4cd05b9ad3ef))
- **codacy:** phase 1.5 — replace 151337 with curated standard, disable 7 biome noise ([1818e30](https://github.com/danielgonzagat/whatsapp_saas/commit/1818e308e6d9c04699167bbaff98d69a0c374e98))
- **compliance:** finalize legal surface and social auth handoff ([59eb9b3](https://github.com/danielgonzagat/whatsapp_saas/commit/59eb9b3f5cb07ef847cf8b4abe5e7249073ef21f))
- **connect,platform-wallet:** stripe connect payouts/reversals + platform wallet services ([2ca4720](https://github.com/danielgonzagat/whatsapp_saas/commit/2ca47201d5ef3a8e3071591f4764a1f21057d9b0))
- **connect:** add payout approval and reconciliation tooling ([ab9fe1a](https://github.com/danielgonzagat/whatsapp_saas/commit/ab9fe1a255d27aa607662c39fbda1b294e274943))
- **connect:** host onboarding inside kloel api ([0f99478](https://github.com/danielgonzagat/whatsapp_saas/commit/0f994788f8ca5c59c2713bb0f46d293cff14e420))
- **conta:** surface seller connect status ([4977cf1](https://github.com/danielgonzagat/whatsapp_saas/commit/4977cf10e5ed869b2b4e9d3badb2580743c48ac4))
- **frontend:** add stripepaymentelement scaffold + usestripecheckout hook ([4ec9ff9](https://github.com/danielgonzagat/whatsapp_saas/commit/4ec9ff9764ff76d3cddaf83c5dbb73c922c3c8f8))
- **frontend:** add tiktok webhook endpoint ([dc98a6d](https://github.com/danielgonzagat/whatsapp_saas/commit/dc98a6d7ec2b529ade328774008669d2c291d920))
- **governance:** codacy convergence wave 2 — 13.2k → 7.2k issues (grade C→B) ([f73d44a](https://github.com/danielgonzagat/whatsapp_saas/commit/f73d44a30446e775bf912dff96c0ac7153ec42f1))
- **i18n:** wire next-intl gate + wrap JSX text/attrs via codemod ([7aafcee](https://github.com/danielgonzagat/whatsapp_saas/commit/7aafcee65c32f5d332cadf16688a50c57d44e68f))
- **kloel:** add seller marketing skill routing ([7ec0d25](https://github.com/danielgonzagat/whatsapp_saas/commit/7ec0d25207060dc10874bd3fee8eebf814d83cb8))
- **kloel:** overhaul chat composer and harden quality gates ([793193b](https://github.com/danielgonzagat/whatsapp_saas/commit/793193bcb5d02729bbb3fdbc81743814f48095e5))
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
- **backend,worker:** add workspaceId filter to unsafe queries — wave 9 ([ffb77d6](https://github.com/danielgonzagat/whatsapp_saas/commit/ffb77d6a4bd3854d5ebdfc5f8f20b3b6d231076e))
- **billing:** restore config service injection ([1cf754d](https://github.com/danielgonzagat/whatsapp_saas/commit/1cf754d39c3cbbe31d3bbb4e014a308f12d333e3))
- **campaigns:** align modal visual tokens ([09b13ee](https://github.com/danielgonzagat/whatsapp_saas/commit/09b13ee3d5a67d2a0ca53dc4a9a1a1d15d6bb34c))
- **campaigns:** replace confirm and hardcoded props ([a1c80ac](https://github.com/danielgonzagat/whatsapp_saas/commit/a1c80ac62d29e21d4f9e0ed817a9832450d82ea8))
- **chat:** align drag overlay radius with visual contract ([8603f56](https://github.com/danielgonzagat/whatsapp_saas/commit/8603f5640612190831e21d072221dec6b8cd1806))
- **chat:** preserve visual attachment previews after upload ([a5f0f80](https://github.com/danielgonzagat/whatsapp_saas/commit/a5f0f801dea425eaa49b1127c1b4cb15b00e69db))
- **chat:** remove upload shortcut hint from popover ([e6e8397](https://github.com/danielgonzagat/whatsapp_saas/commit/e6e839761c41e250c7cac8a877c7a5e8ced924ad))
- **chat:** scale composer popover responsively ([87d6148](https://github.com/danielgonzagat/whatsapp_saas/commit/87d614878a75f17978d1107289f772d890a0d9df))
- **checkout-config:** remove inline icon and hardcoded props ([ecd05da](https://github.com/danielgonzagat/whatsapp_saas/commit/ecd05dadc1333dbd28ac23876c1dff534417d201))
- **checkout:** allow editing quick identity fields ([35660f1](https://github.com/danielgonzagat/whatsapp_saas/commit/35660f1cc27fc3850e128342ca62135e5d3a4b39))
- **checkout:** gate google people scopes behind opt-in ([4ff30c5](https://github.com/danielgonzagat/whatsapp_saas/commit/4ff30c540039ccb4cfe75073101c0fd1b3d1e7f7))
- **checkout:** harden native autofill semantics ([dd92586](https://github.com/danielgonzagat/whatsapp_saas/commit/dd9258654016251737d0f255e6657709a0ea82a0))
- **checkout:** keep social icons visible after google capture ([4b6fb48](https://github.com/danielgonzagat/whatsapp_saas/commit/4b6fb48c5ca4f20531b70bb13ed0d22c2fc34b0d))
- **checkout:** rehydrate social leads with enriched prefill ([7ef8597](https://github.com/danielgonzagat/whatsapp_saas/commit/7ef859709c842fc0b427bbededdec1a08ae048bb))
- **checkouts:** replace browser delete confirm ([1675348](https://github.com/danielgonzagat/whatsapp_saas/commit/16753489b46f158ccf86035e4d568924717024de))
- **checkouts:** surface product checkout errors ([da69a3d](https://github.com/danielgonzagat/whatsapp_saas/commit/da69a3df472e5c19de9a5a9475a5d00d161371e2))
- **checkout:** wire Facebook identity props through lead sections ([14bde17](https://github.com/danielgonzagat/whatsapp_saas/commit/14bde176ca59b404568865163fee72066059c372))
- **ci:** align architecture allowlist matcher ([8bfe3ef](https://github.com/danielgonzagat/whatsapp_saas/commit/8bfe3ef13afb3034831c1018d60ac104f6383508))
- **ci:** align auth and wallet backend checks ([ef85968](https://github.com/danielgonzagat/whatsapp_saas/commit/ef859685547b0632a0d8e31dfd1a315ab4ae7c50))
- **ci:** avoid false positive any matcher in connect approval spec ([90e741d](https://github.com/danielgonzagat/whatsapp_saas/commit/90e741d4d99a826c01145c5de22370bddd6b4033))
- **ci:** satisfy architecture guardrails on chat branch ([8e5229e](https://github.com/danielgonzagat/whatsapp_saas/commit/8e5229e8a363c351a1792ef25fcbea19895d690c))
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
- enforce real seatbelt ratchet and close pulse gaps ([#118](https://github.com/danielgonzagat/whatsapp_saas/issues/118)) ([8fac171](https://github.com/danielgonzagat/whatsapp_saas/commit/8fac171966d9caa5ff5933b1732fbc2fd41e0f45))
- escape pulse functional map regex matching ([891c15d](https://github.com/danielgonzagat/whatsapp_saas/commit/891c15da33e7040eae3a4d4a1d5af6b03746d287))
- **frontend:** add i18n gate entrypoint ([96a836f](https://github.com/danielgonzagat/whatsapp_saas/commit/96a836f3f1a4e2c5a8c0d70a07c0dfe8fa085710))
- **frontend:** align chat button radius with visual contract ([042328a](https://github.com/danielgonzagat/whatsapp_saas/commit/042328ad2da6c0fcbd57d1c346f49949fa805c59))
- **frontend:** align extracted constants with visual contract ([f743735](https://github.com/danielgonzagat/whatsapp_saas/commit/f74373598110fbff00f5ab55bb84e6f223d3e889))
- **frontend:** inline JSON-LD in legal-document without dangerouslySetInnerHTML ([d7e4a8c](https://github.com/danielgonzagat/whatsapp_saas/commit/d7e4a8c71378f30a34e8d115c619c0a09b7cf22c))
- **frontend:** remove weak trace id randomness ([ed880b5](https://github.com/danielgonzagat/whatsapp_saas/commit/ed880b5e9129e9075492ee6520659734c4861d09))
- **frontend:** restore middleware build compatibility ([bc063c9](https://github.com/danielgonzagat/whatsapp_saas/commit/bc063c9562e18b37ab226d8e3f3ad03b89525a72))
- **frontend:** simplify chat shell and light theme behavior ([07b3298](https://github.com/danielgonzagat/whatsapp_saas/commit/07b3298e64b335125543b1ec2a658ea11af04660))
- **guard:** ignore malformed plan ai limits ([fa70f04](https://github.com/danielgonzagat/whatsapp_saas/commit/fa70f0420c316214046dd0e72e749b963664b95d))
- harden pulse api call extraction ([688c9bd](https://github.com/danielgonzagat/whatsapp_saas/commit/688c9bd7292cce9ba6140789f055676f91b87197))
- **home:** simplify period filter options ([38bc252](https://github.com/danielgonzagat/whatsapp_saas/commit/38bc252d8a9d297324d143e5597a89ebd9f9cc43))
- ignore framework shells in pulse parity gaps ([6d058e3](https://github.com/danielgonzagat/whatsapp_saas/commit/6d058e31774c3b61c38c2c28131fb4b687d9c73d))
- improve pulse structural capability inference ([df42b89](https://github.com/danielgonzagat/whatsapp_saas/commit/df42b89999085fdb73aa8f7f80342148b67632ec))
- keep pulse capability grouping within ratchet ([d2b636b](https://github.com/danielgonzagat/whatsapp_saas/commit/d2b636b9fa0a045b6463a22a00babe9252a705fd))
- **kloel:** align composer rail with visual contract ([0239d72](https://github.com/danielgonzagat/whatsapp_saas/commit/0239d72ca3db5cc288a4aa8039e871020d919855))
- **kloel:** satisfy ratchet on composer follow-up ([faafc49](https://github.com/danielgonzagat/whatsapp_saas/commit/faafc497fcf982a60bd37489f2e10178c7ef8de1))
- **kyc:** break payments module cycle ([c959cc8](https://github.com/danielgonzagat/whatsapp_saas/commit/c959cc88ec96368500fac8e85999c29d263fe955))
- merge pulse capability evidence accurately ([6f3d4b0](https://github.com/danielgonzagat/whatsapp_saas/commit/6f3d4b068e7d52660c25eed768461463e1080b96))
- **ops:** run scoped validator on pre-push ([e16fb3f](https://github.com/danielgonzagat/whatsapp_saas/commit/e16fb3f490071d788ab4f71c671dfe8c3995c660))
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

---

## PULSE Auditor Immutability

`scripts/pulse/no-hardcoded-reality-audit.ts` is a locked PULSE governance surface.

No AI CLI may edit, weaken, bypass, rename, delete, chmod, unflag, move, or replace this auditor. This prohibition applies to Codex, Claude, OpenCode, and any autonomous or assisted AI agent.

The auditor must keep scanning every source file inside `scripts/pulse/**` and must preserve hardcode debt when hardcode is deleted without a dynamic production replacement, including accumulated Git history debt.

If the auditor itself needs to change, stop. The human owner must perform that change outside autonomous AI execution.
