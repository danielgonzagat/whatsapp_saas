# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0](https://github.com/danielgonzagat/whatsapp_saas/compare/v0.1.0...v1.0.0) (2026-04-22)


### ⚠ BREAKING CHANGES

* **boot:** revert biome import reorder on backend modules — fixes Railway healthcheck

### Features

* **adm:** adm.kloel.com foundation + IAM + shell + light theme (SP-0..2) ([5c0cc64](https://github.com/danielgonzagat/whatsapp_saas/commit/5c0cc64aa132db79b0baa63d386d253a072d57ae))
* **admin:** advance home and clients runtime ([5e71225](https://github.com/danielgonzagat/whatsapp_saas/commit/5e712255d032c6284ec6e55de8e1fa6ef466503a))
* **admin:** expand control plane operations ([830e7d4](https://github.com/danielgonzagat/whatsapp_saas/commit/830e7d4a2fcb16d743b95331358c4f38c00ec4d5))
* **admin:** thread idempotency key into transaction operate (MAX-RIGOR) ([2a7ca3e](https://github.com/danielgonzagat/whatsapp_saas/commit/2a7ca3e7825dff663bd252d208a7d8d65c1cea9a))
* **adm:** prioritize kloel revenue in admin clone ([509e0e8](https://github.com/danielgonzagat/whatsapp_saas/commit/509e0e82e939c09ffe65cf25f89ad83848f1684e))
* **adm:** sp-13 advanced audit filters + csv export ([#136](https://github.com/danielgonzagat/whatsapp_saas/issues/136)) ([dbbe309](https://github.com/danielgonzagat/whatsapp_saas/commit/dbbe309de2ae0c63bbe1da8f62d6de47644e3dd0))
* **adm:** sp-14 admin ai chat v0 — tool registry + stub LLM + floating drawer ([#134](https://github.com/danielgonzagat/whatsapp_saas/issues/134)) ([d3550e8](https://github.com/danielgonzagat/whatsapp_saas/commit/d3550e8214cb3a833858515e13b87628b031b5dd))
* **adm:** sp-3..13 partial — god view, contas/kyc, produtos, vendas, compliance, relatórios, configurações, marketing, carteira/clientes stubs ([c9d1eb4](https://github.com/danielgonzagat/whatsapp_saas/commit/c9d1eb4e48cf76de1f20d216cbc8095036f27a11))
* **adm:** SP-4b/5b drill-downs + SP-11 complete + SP-8/9/14 specs ([#131](https://github.com/danielgonzagat/whatsapp_saas/issues/131)) ([bbe9df2](https://github.com/danielgonzagat/whatsapp_saas/commit/bbe9df276a857442dc99d18528ae55666544038f))
* **adm:** sp-8 destructive confirm dialog + wired on product page ([#138](https://github.com/danielgonzagat/whatsapp_saas/issues/138)) ([b6b8764](https://github.com/danielgonzagat/whatsapp_saas/commit/b6b876400823b84222ba5cb3ab3646f9020bcbd6))
* **adm:** SP-8 destructive intents backend v0 ([#132](https://github.com/danielgonzagat/whatsapp_saas/issues/132)) ([39b65f7](https://github.com/danielgonzagat/whatsapp_saas/commit/39b65f7085ecd7d2d66e0fdfe281474a27b7f6b8))
* **adm:** sp-8 force-logout-global + cache-purge handlers ([#140](https://github.com/danielgonzagat/whatsapp_saas/issues/140)) ([a31ac88](https://github.com/danielgonzagat/whatsapp_saas/commit/a31ac887bd4426be33bdf6d64d8d404fee086cbe))
* **adm:** sp-8 product archive and delete handlers ([#135](https://github.com/danielgonzagat/whatsapp_saas/issues/135)) ([9b7b5a5](https://github.com/danielgonzagat/whatsapp_saas/commit/9b7b5a5dbd226b377ae18b6fd2858667a44ab6ce))
* **adm:** SP-9 platform wallet v0 (ledger + read API + live /carteira) ([#133](https://github.com/danielgonzagat/whatsapp_saas/issues/133)) ([ea27b2c](https://github.com/danielgonzagat/whatsapp_saas/commit/ea27b2c1d86414f0827becad3ff1d4dcfb537fea))
* **adm:** sp-9 reconcile service + /carteira/reconcile endpoint ([#139](https://github.com/danielgonzagat/whatsapp_saas/issues/139)) ([a78fade](https://github.com/danielgonzagat/whatsapp_saas/commit/a78fade72a75474d020d6dd8e052195bbb82537f))
* **adm:** sp-9 split engine wired into checkout confirm ([#137](https://github.com/danielgonzagat/whatsapp_saas/issues/137)) ([32788e4](https://github.com/danielgonzagat/whatsapp_saas/commit/32788e42111771fc1cda45a0349877931886f572))
* align admin frontend with app shell ([2275be4](https://github.com/danielgonzagat/whatsapp_saas/commit/2275be47f84662e13e8e70995de44233e3d73e4c))
* **auth:** add tiktok login flow ([edf693b](https://github.com/danielgonzagat/whatsapp_saas/commit/edf693b6510ba98e0941d1de0f6e10a8f52c7991))
* **billing:** upgrade stripe sdk to 22.0.2 and add stripeservice wrapper ([d97437c](https://github.com/danielgonzagat/whatsapp_saas/commit/d97437c221c96950e7b9f29be8f49f402be9a746))
* **chat:** persist image downloads and add real e2e validation ([84db89b](https://github.com/danielgonzagat/whatsapp_saas/commit/84db89b3b966d73dc8642fd100ff7ca99289a684))
* **chat:** support drag-and-drop uploads across chat ([d13d7d5](https://github.com/danielgonzagat/whatsapp_saas/commit/d13d7d5e40aad60f188d1415730214ddc2ba63aa))
* **checkout:** capture social identity leads ([07d2371](https://github.com/danielgonzagat/whatsapp_saas/commit/07d237114cb21beae4e42557f89ea2113ea282ec))
* **checkout:** request google people scopes for extra prefill ([fc444d7](https://github.com/danielgonzagat/whatsapp_saas/commit/fc444d70124122d41b80e4a9fc045d362b32456f))
* **codacy+e2e+pulse:** bundle concurrent hardening work ([97a5544](https://github.com/danielgonzagat/whatsapp_saas/commit/97a5544fcc9136979587f403d7ec4cd05b9ad3ef))
* **codacy:** phase 1 — engine surgery via biome.json + .codacy.yml ([4c23e3a](https://github.com/danielgonzagat/whatsapp_saas/commit/4c23e3a971684da05af814be7caa6563c9304dd7))
* **codacy:** phase 1.5 — replace 151337 with curated standard, disable 7 biome noise ([1818e30](https://github.com/danielgonzagat/whatsapp_saas/commit/1818e308e6d9c04699167bbaff98d69a0c374e98))
* **codacy:** phase 4 security triage — exclude wrong-rule clusters ([23a5697](https://github.com/danielgonzagat/whatsapp_saas/commit/23a5697f5986dcd68596b8590fdec3da5660d77c))
* **compliance:** finalize legal surface and social auth handoff ([59eb9b3](https://github.com/danielgonzagat/whatsapp_saas/commit/59eb9b3f5cb07ef847cf8b4abe5e7249073ef21f))
* **connect,platform-wallet:** stripe connect payouts/reversals + platform wallet services ([2ca4720](https://github.com/danielgonzagat/whatsapp_saas/commit/2ca47201d5ef3a8e3071591f4764a1f21057d9b0))
* **connect:** add payout approval and reconciliation tooling ([ab9fe1a](https://github.com/danielgonzagat/whatsapp_saas/commit/ab9fe1a255d27aa607662c39fbda1b294e274943))
* **frontend:** add stripepaymentelement scaffold + usestripecheckout hook ([4ec9ff9](https://github.com/danielgonzagat/whatsapp_saas/commit/4ec9ff9764ff76d3cddaf83c5dbb73c922c3c8f8))
* **governance:** codacy convergence wave 2 — 13.2k → 7.2k issues (grade C→B) ([f73d44a](https://github.com/danielgonzagat/whatsapp_saas/commit/f73d44a30446e775bf912dff96c0ac7153ec42f1))
* harden convergence ratchets and pulse runtime ([adfceaf](https://github.com/danielgonzagat/whatsapp_saas/commit/adfceaf5fdd6d66a24bae95f741884b57b4c7215))
* harden convergence ratchets and pulse runtime ([#114](https://github.com/danielgonzagat/whatsapp_saas/issues/114)) ([e6eb16a](https://github.com/danielgonzagat/whatsapp_saas/commit/e6eb16a0377be3f93e28a61106b25841fe85ece1))
* **i18n:** wire next-intl gate + wrap JSX text/attrs via codemod ([7aafcee](https://github.com/danielgonzagat/whatsapp_saas/commit/7aafcee65c32f5d332cadf16688a50c57d44e68f))
* **kloel:** add seller marketing skill routing ([7ec0d25](https://github.com/danielgonzagat/whatsapp_saas/commit/7ec0d25207060dc10874bd3fee8eebf814d83cb8))
* **kloel:** overhaul chat composer and harden quality gates ([793193b](https://github.com/danielgonzagat/whatsapp_saas/commit/793193bcb5d02729bbb3fdbc81743814f48095e5))
* **payments:** add connectservice for stripe custom accounts ([535c27a](https://github.com/danielgonzagat/whatsapp_saas/commit/535c27a5ef81bc86dc01e9cd28c69b735c3d57c8))
* **payments:** add fraudengine with platform-wide blacklist ([4a8aa01](https://github.com/danielgonzagat/whatsapp_saas/commit/4a8aa017a13d8cb68265875ac9afa83b91ea251a))
* **payments:** add ledgerservice with dual-balance and chargeback cascade ([913342a](https://github.com/danielgonzagat/whatsapp_saas/commit/913342a929812e89fb67e8a92ea2a65f754828e3))
* **payments:** add splitengine pure module with 4-hypothesis coverage ([6c73000](https://github.com/danielgonzagat/whatsapp_saas/commit/6c73000d830559816e56e295fcfe620d0b068cc5))
* **payments:** add stripechargeservice as canonical sale-side path ([e59e16f](https://github.com/danielgonzagat/whatsapp_saas/commit/e59e16fe96b01be7852dbbd066e7e41fc3be590e))
* **payments:** add stripewebhookprocessor for sale fan-out ([d738f9e](https://github.com/danielgonzagat/whatsapp_saas/commit/d738f9e67ec5cb1c1aab5c5e4b2e721d2b09666b))
* **payments:** complete stripe-only cutover ([dda29b0](https://github.com/danielgonzagat/whatsapp_saas/commit/dda29b07137aaebcac6219c0ce77c10ae4ffc389))
* **payments:** merge stripe-only cutover ([ee50508](https://github.com/danielgonzagat/whatsapp_saas/commit/ee5050839679b4d5a020b5c8cb9056ba33e4b5ed))
* **payments:** wire paymentsmodule + walletmodule into appmodule ([9eba5c6](https://github.com/danielgonzagat/whatsapp_saas/commit/9eba5c6dfcc15562664bbedbf5223eeba46cc725))
* **wallet:** add prepaid wallet for usage-metered services ([b9e6078](https://github.com/danielgonzagat/whatsapp_saas/commit/b9e60785952169aa1071168278f99ca9d6b1393d))
* **wallet:** add provider-priced wallet rails and kb async settlement ([9a15c70](https://github.com/danielgonzagat/whatsapp_saas/commit/9a15c7069f1e73fe9dcc499fa66989579553ff35))
* **wallet:** meter site generation with provider usage settlement ([3d99f93](https://github.com/danielgonzagat/whatsapp_saas/commit/3d99f931b8b327ba604f329fab3970bce7ecb7f2))
* wire codacy mcp and nightly snapshot into convergence loop ([5c9f40a](https://github.com/danielgonzagat/whatsapp_saas/commit/5c9f40a1ef8ef614c6b277ad7a1583495d195812))
* wire codacy mcp and nightly snapshot into convergence loop ([712204d](https://github.com/danielgonzagat/whatsapp_saas/commit/712204d2823dc356f977b533d21bda56e2149bf9))
* wire codecov bundle/test analytics end-to-end ([07c2788](https://github.com/danielgonzagat/whatsapp_saas/commit/07c2788f3420b8316d4dd862f97f3fbcb0259b7a))


### Bug Fixes

* **adm:** derive mfa encryption key from any non-empty string ([a1d2d69](https://github.com/danielgonzagat/whatsapp_saas/commit/a1d2d69a7bc188120cc736138e144f89956c229b))
* **adm:** drop aud from jwt payload — collides with module signOptions ([7e1d069](https://github.com/danielgonzagat/whatsapp_saas/commit/7e1d069ca5fc867feba8139a1b6e36baeb08aaf7))
* **admin:** remove sidebar hardcoded copy ([368983f](https://github.com/danielgonzagat/whatsapp_saas/commit/368983fe95ef3f88b28d66a2b6e8e2c8d0af42bb))
* **adm:** restore dashboard revenue series exports ([f09ab5a](https://github.com/danielgonzagat/whatsapp_saas/commit/f09ab5a89a716cdf59f0045759fd40c11a701c9c))
* **adm:** reuse pending mfa secret + widen totp verify window ([51f085a](https://github.com/danielgonzagat/whatsapp_saas/commit/51f085ae54e662eeca196bfb0426e8bba35ceaf4))
* **adm:** unblock login from adm.kloel.com + mushroom logo ([252ae93](https://github.com/danielgonzagat/whatsapp_saas/commit/252ae934990c4af3d027c8e2d12270b3ce8f8932))
* **adm:** verify admin jwt with explicit ADMIN_JWT_SECRET ([ebe1caf](https://github.com/danielgonzagat/whatsapp_saas/commit/ebe1caf49287b15567f7613cfe0c428c948b09b0))
* align codacy readiness and claude review ([3c6df8f](https://github.com/danielgonzagat/whatsapp_saas/commit/3c6df8f1bbfe5086d91bd2e595e1c0ce3a4492b6))
* align frontend build env in audit workflows ([af7a5a1](https://github.com/danielgonzagat/whatsapp_saas/commit/af7a5a1f037144a40ae8e6c87007012e25496527))
* align pre-push frontend build env ([19b2e39](https://github.com/danielgonzagat/whatsapp_saas/commit/19b2e391b66305ba83114d24ab43a3b0f3d7cede))
* align pre-push frontend build env ([ed7453c](https://github.com/danielgonzagat/whatsapp_saas/commit/ed7453c9f69e6265994f903d774e52d1fcbf6b5c))
* **auth:** allow legal routes on auth host for authenticated users ([b92e885](https://github.com/danielgonzagat/whatsapp_saas/commit/b92e88521f37d5ef6c9665f1a9879a87f164ccd4))
* **auth:** finish magic-link + Facebook compliance wiring (MAX-RIGOR) ([26f84db](https://github.com/danielgonzagat/whatsapp_saas/commit/26f84dbf9927af53ec0c23f46a204b16320be685))
* **auth:** redirect legacy tiktok callback route ([ca17d81](https://github.com/danielgonzagat/whatsapp_saas/commit/ca17d818ab89ff8c69d948ec8a68625767ad3c80))
* **auth:** restore Meta login on auth.kloel.com ([7cc81e4](https://github.com/danielgonzagat/whatsapp_saas/commit/7cc81e4e2b589d65da884ac48c41cf3183e0d762))
* **auth:** separate meta auth app and skip anonymous threads ([3beb3e5](https://github.com/danielgonzagat/whatsapp_saas/commit/3beb3e5cee18069f8724f6b60a3791feffb4fe6d))
* **autopilot:** stabilize insight timeline summary ([96c411d](https://github.com/danielgonzagat/whatsapp_saas/commit/96c411d06ed1c9a987a405af1c2bfd827d031dd8))
* **backend,worker:** add workspaceId filter to unsafe queries — wave 9 ([ffb77d6](https://github.com/danielgonzagat/whatsapp_saas/commit/ffb77d6a4bd3854d5ebdfc5f8f20b3b6d231076e))
* **billing:** restore config service injection ([1cf754d](https://github.com/danielgonzagat/whatsapp_saas/commit/1cf754d39c3cbbe31d3bbb4e014a308f12d333e3))
* **boot:** revert biome import reorder on backend modules — fixes Railway healthcheck ([f29bc06](https://github.com/danielgonzagat/whatsapp_saas/commit/f29bc0606acd03fdb3afe75143263d36948e8783))
* **campaigns:** align modal visual tokens ([09b13ee](https://github.com/danielgonzagat/whatsapp_saas/commit/09b13ee3d5a67d2a0ca53dc4a9a1a1d15d6bb34c))
* **campaigns:** replace confirm and hardcoded props ([a1c80ac](https://github.com/danielgonzagat/whatsapp_saas/commit/a1c80ac62d29e21d4f9e0ed817a9832450d82ea8))
* **chat:** align drag overlay radius with visual contract ([8603f56](https://github.com/danielgonzagat/whatsapp_saas/commit/8603f5640612190831e21d072221dec6b8cd1806))
* **chat:** preserve visual attachment previews after upload ([a5f0f80](https://github.com/danielgonzagat/whatsapp_saas/commit/a5f0f801dea425eaa49b1127c1b4cb15b00e69db))
* **chat:** remove upload shortcut hint from popover ([e6e8397](https://github.com/danielgonzagat/whatsapp_saas/commit/e6e839761c41e250c7cac8a877c7a5e8ced924ad))
* **chat:** scale composer popover responsively ([87d6148](https://github.com/danielgonzagat/whatsapp_saas/commit/87d614878a75f17978d1107289f772d890a0d9df))
* **checkout-config:** remove inline icon and hardcoded props ([ecd05da](https://github.com/danielgonzagat/whatsapp_saas/commit/ecd05dadc1333dbd28ac23876c1dff534417d201))
* **checkout:** allow editing quick identity fields ([35660f1](https://github.com/danielgonzagat/whatsapp_saas/commit/35660f1cc27fc3850e128342ca62135e5d3a4b39))
* **checkout:** gate google people scopes behind opt-in ([4ff30c5](https://github.com/danielgonzagat/whatsapp_saas/commit/4ff30c540039ccb4cfe75073101c0fd1b3d1e7f7))
* **checkout:** harden native autofill semantics ([dd92586](https://github.com/danielgonzagat/whatsapp_saas/commit/dd9258654016251737d0f255e6657709a0ea82a0))
* **checkout:** keep social icons visible after google capture ([4b6fb48](https://github.com/danielgonzagat/whatsapp_saas/commit/4b6fb48c5ca4f20531b70bb13ed0d22c2fc34b0d))
* **checkout:** rehydrate social leads with enriched prefill ([7ef8597](https://github.com/danielgonzagat/whatsapp_saas/commit/7ef859709c842fc0b427bbededdec1a08ae048bb))
* **checkouts:** replace browser delete confirm ([1675348](https://github.com/danielgonzagat/whatsapp_saas/commit/16753489b46f158ccf86035e4d568924717024de))
* **checkouts:** surface product checkout errors ([da69a3d](https://github.com/danielgonzagat/whatsapp_saas/commit/da69a3df472e5c19de9a5a9475a5d00d161371e2))
* **checkout:** wire Facebook identity props through lead sections ([14bde17](https://github.com/danielgonzagat/whatsapp_saas/commit/14bde176ca59b404568865163fee72066059c372))
* **ci:** align architecture allowlist matcher ([8bfe3ef](https://github.com/danielgonzagat/whatsapp_saas/commit/8bfe3ef13afb3034831c1018d60ac104f6383508))
* **ci:** align auth and wallet backend checks ([ef85968](https://github.com/danielgonzagat/whatsapp_saas/commit/ef859685547b0632a0d8e31dfd1a315ab4ae7c50))
* **ci:** avoid false positive any matcher in connect approval spec ([90e741d](https://github.com/danielgonzagat/whatsapp_saas/commit/90e741d4d99a826c01145c5de22370bddd6b4033))
* **ci:** satisfy architecture guardrails on chat branch ([8e5229e](https://github.com/danielgonzagat/whatsapp_saas/commit/8e5229e8a363c351a1792ef25fcbea19895d690c))
* **ci:** satisfy production readiness codacy pin ([#157](https://github.com/danielgonzagat/whatsapp_saas/issues/157)) ([18fd0f3](https://github.com/danielgonzagat/whatsapp_saas/commit/18fd0f34e686f4ae8f00787091180f9688d0005b))
* close local convergence gate regressions ([6672270](https://github.com/danielgonzagat/whatsapp_saas/commit/667227054fb5f7797946bda17831062737bef338))
* close local convergence gate regressions ([ba76653](https://github.com/danielgonzagat/whatsapp_saas/commit/ba7665347191e141ba3d2fbd46518ecf6b96d3ad))
* **codacy:** convert reportRow to type intersection for eslint-disable ([aa5a22b](https://github.com/danielgonzagat/whatsapp_saas/commit/aa5a22b7e732d82205eb8e8b49028aa36e6728bb))
* **codacy:** disable 4 noise patterns via REST API (-~115 issues) ([69c69a2](https://github.com/danielgonzagat/whatsapp_saas/commit/69c69a2d4eaccca9e63697e476f9d35255a193f8))
* **codacy:** eliminate new-any guard violations with proper typing ([506c587](https://github.com/danielgonzagat/whatsapp_saas/commit/506c5875c77eccada6143b56d71613af38f5ecc1))
* **codacy:** fully type-narrow analytics page — zero :any remaining ([79e653f](https://github.com/danielgonzagat/whatsapp_saas/commit/79e653f801651d1b4b8b2c638cc211ef42a95a05))
* **codacy:** harden checkout, auth, kloel runtime & worker paths ([#169](https://github.com/danielgonzagat/whatsapp_saas/issues/169)) ([5007802](https://github.com/danielgonzagat/whatsapp_saas/commit/50078028dcf083e55931a91abfab6e2dc20659a5))
* **codacy:** inline eslint-disable on ReportRow index signature ([5937508](https://github.com/danielgonzagat/whatsapp_saas/commit/59375086bb0cdaa4a5e93dd07d3469280eda9493))
* **codacy:** inline eslint-disable-line on reportRow type alias ([286a268](https://github.com/danielgonzagat/whatsapp_saas/commit/286a268b3b6f14ee33c9711d2fe90147cb159b11))
* **codacy:** markdownlint remaining — blank lines + URL brackets + $ prefix ([b72b67a](https://github.com/danielgonzagat/whatsapp_saas/commit/b72b67a59a8e034d74c42b5074c8bff8dafa306b))
* **codacy:** multi-line reportRow type with dual eslint-disable ([cac5050](https://github.com/danielgonzagat/whatsapp_saas/commit/cac50502aa54fc3487a5a856bb9572c61bf16e4e))
* **codacy:** remove crypto and template findings ([a827197](https://github.com/danielgonzagat/whatsapp_saas/commit/a82719771cd41c67c63ab0dd52b7dd445b18420c))
* **codacy:** suppress 2 remaining eslint no-explicit-any on new lines ([fb17ebb](https://github.com/danielgonzagat/whatsapp_saas/commit/fb17ebb5f4e610787016380fb41f9933fa3927b8))
* **codacy:** sweep ~800 issues across frontend, worker, security, CSS, shell ([a280f97](https://github.com/danielgonzagat/whatsapp_saas/commit/a280f977a2f688e799da63789e022bf66ae879c6))
* **codacy:** type-narrow :any on new lines to unblock pre-push guard ([1f21da3](https://github.com/danielgonzagat/whatsapp_saas/commit/1f21da3dd9e010e9873ce79fbce5d403cc5696ae))
* **codacy:** type-narrow ~100 :any across 48 backend files ([6f5dc38](https://github.com/danielgonzagat/whatsapp_saas/commit/6f5dc38cd48dce08285889137a5edb8bf3fa8722))
* **codacy:** type-narrow ~237 :any across 8 core files ([4bd9987](https://github.com/danielgonzagat/whatsapp_saas/commit/4bd9987bc95ef0b0e8b48baaef90e7254f0c7bfc))
* **codacy:** type-narrow ~250 :any across 20 files + safeStr() fixes ([6560a0c](https://github.com/danielgonzagat/whatsapp_saas/commit/6560a0c1390f71377b047438ba50aa1786a0373b))
* **codacy:** type-narrow 177 :any across 5 core files ([542f1e8](https://github.com/danielgonzagat/whatsapp_saas/commit/542f1e8f1fb01177f8f55358efff69035bc626c6))
* **codacy:** type-narrow 44 :any across 25 worker files ([bcb5913](https://github.com/danielgonzagat/whatsapp_saas/commit/bcb59139b056d938f9b0b2d91dba4dcf857beaa0))
* **codacy:** type-narrow all :any on new lines in analytics page ([45f8146](https://github.com/danielgonzagat/whatsapp_saas/commit/45f8146bd7e6f8234fdd91225dc79b36980864a4))
* **codacy:** type-narrow all 59 :any in unified-agent.service.ts ([00c3bbb](https://github.com/danielgonzagat/whatsapp_saas/commit/00c3bbb7b6c164e0687106d69add19e5a0ecd3aa))
* **codacy:** wave 1 — mechanical autofixes across 77 files (-~175 issues) ([f49f554](https://github.com/danielgonzagat/whatsapp_saas/commit/f49f5547fb411710aaf9446a87483bc9da0f469b))
* **codacy:** waves 2-7 — regex hoist, component extraction, types, imports (~400 issues) ([5bbae97](https://github.com/danielgonzagat/whatsapp_saas/commit/5bbae97c72bc0204dfe20dd860ae880f0b4f373c))
* **codacy:** waves 3-8 — useId, array keys, a11y, await-in-loops (~360 issues) ([33a61a5](https://github.com/danielgonzagat/whatsapp_saas/commit/33a61a50df16cf2cec09ac1a9231f99fa2527599))
* **codacy:** zero :any remaining in backend (54 files, 127 removed) ([70a9154](https://github.com/danielgonzagat/whatsapp_saas/commit/70a915473b09de3353b05a2df02ea9da5b50ddb8))
* **commissions:** replace confirm and format output ([553669a](https://github.com/danielgonzagat/whatsapp_saas/commit/553669a797c0bf3578a563dc66a1608223bf84f0))
* **compliance:** harden signed request parsing ([62dc1bd](https://github.com/danielgonzagat/whatsapp_saas/commit/62dc1bda8818fbf1bc9f88a896d19c6fdec4dbdc))
* confine kloel chat scroll viewport ([c2dd065](https://github.com/danielgonzagat/whatsapp_saas/commit/c2dd0657012c215f533b6e22a80156e79891d205))
* **coupons:** surface errors and replace confirm ([f498dea](https://github.com/danielgonzagat/whatsapp_saas/commit/f498deabded8f660dce469b31e4f9b0863fa0ecc))
* **deploy:** restore wallet module boot path ([abce409](https://github.com/danielgonzagat/whatsapp_saas/commit/abce409db755ac789889e15618617f0dc6a73551))
* enforce internal railway runtime contracts ([8dcbfb5](https://github.com/danielgonzagat/whatsapp_saas/commit/8dcbfb51c26e37d8ca9aa03789acbca2a463567c))
* enforce internal railway runtime contracts ([e3df77d](https://github.com/danielgonzagat/whatsapp_saas/commit/e3df77dad634e3c5d1f5b194c5d350dfb799d6b4))
* enforce real seatbelt ratchet and close pulse gaps ([#118](https://github.com/danielgonzagat/whatsapp_saas/issues/118)) ([8fac171](https://github.com/danielgonzagat/whatsapp_saas/commit/8fac171966d9caa5ff5933b1732fbc2fd41e0f45))
* exclude PULSE_EXECUTION_TRACE.json from nightly commit glob ([e1ae749](https://github.com/danielgonzagat/whatsapp_saas/commit/e1ae74933af78367e6c3bd8218f931f2bc0ca9db))
* format health.module.spec.ts to unblock seatbelt gate ([0ab9563](https://github.com/danielgonzagat/whatsapp_saas/commit/0ab9563746ad58f4e2331f164c6bc4646e09f01a))
* **frontend:** add i18n gate entrypoint ([96a836f](https://github.com/danielgonzagat/whatsapp_saas/commit/96a836f3f1a4e2c5a8c0d70a07c0dfe8fa085710))
* **frontend:** align chat button radius with visual contract ([042328a](https://github.com/danielgonzagat/whatsapp_saas/commit/042328ad2da6c0fcbd57d1c346f49949fa805c59))
* **frontend:** align extracted constants with visual contract ([f743735](https://github.com/danielgonzagat/whatsapp_saas/commit/f74373598110fbff00f5ab55bb84e6f223d3e889))
* **frontend:** inline JSON-LD in legal-document without dangerouslySetInnerHTML ([d7e4a8c](https://github.com/danielgonzagat/whatsapp_saas/commit/d7e4a8c71378f30a34e8d115c619c0a09b7cf22c))
* **frontend:** remove weak trace id randomness ([ed880b5](https://github.com/danielgonzagat/whatsapp_saas/commit/ed880b5e9129e9075492ee6520659734c4861d09))
* **frontend:** restore middleware build compatibility ([bc063c9](https://github.com/danielgonzagat/whatsapp_saas/commit/bc063c9562e18b37ab226d8e3f3ad03b89525a72))
* **frontend:** simplify chat shell and light theme behavior ([07b3298](https://github.com/danielgonzagat/whatsapp_saas/commit/07b3298e64b335125543b1ec2a658ea11af04660))
* give pre-push ci-like validation env ([700d279](https://github.com/danielgonzagat/whatsapp_saas/commit/700d2792ff38b1567b3a4bb8161fc6c6220bca10))
* give pre-push ci-like validation env ([b4df673](https://github.com/danielgonzagat/whatsapp_saas/commit/b4df6735d8928ede3c6e9a8259d3115795b41025))
* **guard:** ignore malformed plan ai limits ([fa70f04](https://github.com/danielgonzagat/whatsapp_saas/commit/fa70f0420c316214046dd0e72e749b963664b95d))
* harden code scanning alerts ([fe8ad21](https://github.com/danielgonzagat/whatsapp_saas/commit/fe8ad21cf43bac60f157f879a45f1d96d319babe))
* harden kloel chat response flow ([a0892eb](https://github.com/danielgonzagat/whatsapp_saas/commit/a0892ebee07af0656e7a7a815a48c0e5bcb27f8e))
* harden kloel chat streaming reliability ([e99b17d](https://github.com/danielgonzagat/whatsapp_saas/commit/e99b17ddc4271fc103503b7124fbafd22bfbe6ba))
* harden pulse runtime telemetry loops ([df3f0f3](https://github.com/danielgonzagat/whatsapp_saas/commit/df3f0f33f94831a99b7d2233c82c08507710b899))
* harden pulse runtime telemetry loops ([bba6cce](https://github.com/danielgonzagat/whatsapp_saas/commit/bba6cce38b44fbc8b00953dabc0f8fecb1299b8e))
* harden railway backend contract and product editor UX ([ba4e7b3](https://github.com/danielgonzagat/whatsapp_saas/commit/ba4e7b33f253cf6bfc8f286d7d2192e662565a3f))
* harden redis and stabilize convergence gates ([6cb7c29](https://github.com/danielgonzagat/whatsapp_saas/commit/6cb7c2951a8da7209e6a51ad01b4bb4c7a69f2e9))
* **home:** simplify period filter options ([38bc252](https://github.com/danielgonzagat/whatsapp_saas/commit/38bc252d8a9d297324d143e5597a89ebd9f9cc43))
* install e2e deps in nightly so knip does not crash ([ee6a442](https://github.com/danielgonzagat/whatsapp_saas/commit/ee6a442a8dc18992d21d0382564304dbe145efb7))
* keep nightly going past PULSE report critical findings ([0307972](https://github.com/danielgonzagat/whatsapp_saas/commit/03079728374ba634b401becba1c8f0dfd0c4ae5a))
* **kloel:** align composer rail with visual contract ([0239d72](https://github.com/danielgonzagat/whatsapp_saas/commit/0239d72ca3db5cc288a4aa8039e871020d919855))
* **kloel:** satisfy ratchet on composer follow-up ([faafc49](https://github.com/danielgonzagat/whatsapp_saas/commit/faafc497fcf982a60bd37489f2e10178c7ef8de1))
* make ci-cd dispatchable and unblock pre-push from sentry guard ([285264f](https://github.com/danielgonzagat/whatsapp_saas/commit/285264f3c9ee800dd93ab3ef4cf3caf184e1ea17))
* **ops:** run scoped validator on pre-push ([e16fb3f](https://github.com/danielgonzagat/whatsapp_saas/commit/e16fb3f490071d788ab4f71c671dfe8c3995c660))
* **partnerships:** remove fake affiliate performance ([0e738f4](https://github.com/danielgonzagat/whatsapp_saas/commit/0e738f41617677d0011b064625f3c37704ac10c7))
* **payments:** switch connect sales to separate charge fan-out ([197ea40](https://github.com/danielgonzagat/whatsapp_saas/commit/197ea40e34abffe3305ae76592b7d67022fb403f))
* **plans:** harden plan tab copy and errors ([90c3e33](https://github.com/danielgonzagat/whatsapp_saas/commit/90c3e33f54f95249ee67716843873b6f92546bf7))
* **plans:** harden shipping tab design tokens ([9873a39](https://github.com/danielgonzagat/whatsapp_saas/commit/9873a397356cfecedb747da8ead854df75bda011))
* **products:** clear remaining tab findings ([b5ed15b](https://github.com/danielgonzagat/whatsapp_saas/commit/b5ed15b0f5eda521f8af2dc5327f43e3146117cf))
* **products:** harden AI tab copy handling ([3b96e89](https://github.com/danielgonzagat/whatsapp_saas/commit/3b96e890c87c8d11feaca28e82f4380d1862565f))
* **prod:** unblock deploy and facebook consent flow ([6500e73](https://github.com/danielgonzagat/whatsapp_saas/commit/6500e73238e0ca6e17b57d9459bbc424507ace32))
* quote PULSE_* pathspec so bash does not eat the exclude ([c7843a3](https://github.com/danielgonzagat/whatsapp_saas/commit/c7843a3846b13e8b55d733325d2d8b3acd24c559))
* **randomness:** harden backend and worker jitter ([8f4329a](https://github.com/danielgonzagat/whatsapp_saas/commit/8f4329a906ff0d8750ed1ac95aa2d0e2f8773525))
* realign linux mobile visual baselines ([dc485d2](https://github.com/danielgonzagat/whatsapp_saas/commit/dc485d29bf3d05ee6e1898ddeb4cf8b87bdecfe1))
* realign linux mobile visual baselines ([0b1312e](https://github.com/danielgonzagat/whatsapp_saas/commit/0b1312e8263e011619c352e59f1d07c4acd3e099))
* **redis:** reject localhost URLs in production-like runtimes ([4faed30](https://github.com/danielgonzagat/whatsapp_saas/commit/4faed30ffba5590a4b7ca52b7915b605c008ab0c))
* refine chat composer layout ([e54d65e](https://github.com/danielgonzagat/whatsapp_saas/commit/e54d65e5aa524e3d252949e34e6de2e417da215a))
* restore AuthModule wiring for ConnectService ([d091d3b](https://github.com/danielgonzagat/whatsapp_saas/commit/d091d3bfd1cc83e90961e52ccca7e621345bb388))
* restore AuthModule wiring for ConnectService ([d091d3b](https://github.com/danielgonzagat/whatsapp_saas/commit/d091d3bfd1cc83e90961e52ccca7e621345bb388))
* restore new chat mushroom greeting ([52812d0](https://github.com/danielgonzagat/whatsapp_saas/commit/52812d0209310723cf4abc38061a274da0623137))
* **reviews:** replace confirm and extract helpers ([d9b4a04](https://github.com/danielgonzagat/whatsapp_saas/commit/d9b4a04bb9b14bb80bb7f22e7e37ec6b703eae1b))
* scope codecov patch coverage to product code ([d6f44aa](https://github.com/danielgonzagat/whatsapp_saas/commit/d6f44aadbf7a17ebaf5692a0115b8c87fe5066ab))
* scope ops audit away from pull requests ([1dbf310](https://github.com/danielgonzagat/whatsapp_saas/commit/1dbf310caba95a65f46aa02fe019a51e7c71fb4a))
* **security:** harden path traversal, SSRF, timing attacks, docker ([8ee65de](https://github.com/danielgonzagat/whatsapp_saas/commit/8ee65deb4cf41b9e9a4bee81d60e0df74aff46d8))
* **security:** refresh e2e diff lockfile ([f57b04b](https://github.com/danielgonzagat/whatsapp_saas/commit/f57b04bbe79b857cca5d78dca0fb7dd8e0773838))
* **security:** remove orphan backend whatsapp deps ([c36a0d5](https://github.com/danielgonzagat/whatsapp_saas/commit/c36a0d564928b50938491bb925ab0401f04ea651))
* **security:** rename false-positive password consts, swap Math.random for crypto ([211adf7](https://github.com/danielgonzagat/whatsapp_saas/commit/211adf7098df3f111a08c6c652cebe72e93776cd))
* simplify marketing conversas layout ([7ff1b4c](https://github.com/danielgonzagat/whatsapp_saas/commit/7ff1b4c2a8ecac4aca190d6dcabf3b3720f86b11))
* split codecov uploads per workspace with flags ([e83cab9](https://github.com/danielgonzagat/whatsapp_saas/commit/e83cab97b6d6f4db736cce4bdbd406f01255dc42))
* stabilize cookie-banner visual baselines ([95b2069](https://github.com/danielgonzagat/whatsapp_saas/commit/95b20695a0c6369514b6efd35f7c9355f103be2c))
* stabilize cookie-banner visual baselines ([cb3b7f6](https://github.com/danielgonzagat/whatsapp_saas/commit/cb3b7f6a0805b1f72ece0147e5f45e6b8ba25d4a))
* stabilize public visual baselines and coverage outputs ([38a3269](https://github.com/danielgonzagat/whatsapp_saas/commit/38a3269bece693fbeb21b373db45aeaacbd79bb8))
* stabilize public visual baselines and coverage outputs ([3a6965f](https://github.com/danielgonzagat/whatsapp_saas/commit/3a6965f50ea88078152ff5e7678c8405602f26d0))
* **types:** drop redundant tts voice casts ([b682381](https://github.com/danielgonzagat/whatsapp_saas/commit/b6823812a583740e12923283a0c1fd46c9e9bf9c))
* **types:** fail closed on malformed diagnostics settings ([9bda17f](https://github.com/danielgonzagat/whatsapp_saas/commit/9bda17f1a4486297bc259afa33f3828c4f7c5607))
* **types:** harden account agent memory parsing ([e0fee1c](https://github.com/danielgonzagat/whatsapp_saas/commit/e0fee1c768a90a95b6d47564ac16265e0140239b))
* **types:** harden recovery and launch payload parsing ([fbe2d99](https://github.com/danielgonzagat/whatsapp_saas/commit/fbe2d99d129ec5e25255ac3854469be6e00b3794))
* **types:** harden session and calendar settings parsing ([a33f429](https://github.com/danielgonzagat/whatsapp_saas/commit/a33f4295d8feac85691f7a9b2ded004165ed3e93))
* **types:** harden whatsapp and auth payload parsing ([2c986e2](https://github.com/danielgonzagat/whatsapp_saas/commit/2c986e2627322ec161b7f1b49c51628dc4e40903))
* **types:** normalize malformed json records ([d4bbce5](https://github.com/danielgonzagat/whatsapp_saas/commit/d4bbce591b36d38f08df913d2f0abff3d79c38b2))
* **types:** normalize subscription plan transitions ([d0acd17](https://github.com/danielgonzagat/whatsapp_saas/commit/d0acd175125ac62a8362b035222bc7ccc4aae39e))
* **types:** normalize webinar and member area payloads ([89cdbe1](https://github.com/danielgonzagat/whatsapp_saas/commit/89cdbe1152f21084a83f51f8fb4bad834bdbda9a))
* **types:** sanitize conversation workspace fallbacks ([8a4b1da](https://github.com/danielgonzagat/whatsapp_saas/commit/8a4b1da82f9a8d1dad04ac41d5d6512e041faf09))
* **types:** sanitize legacy kloel user ids ([f6aebbf](https://github.com/danielgonzagat/whatsapp_saas/commit/f6aebbf6d230e595d63db8052e3a3990d8668cc4))
* **types:** sanitize legacy member enrollment fields ([b87cd4d](https://github.com/danielgonzagat/whatsapp_saas/commit/b87cd4da7a6b1444157c8b4bc1cfe8eaaf3d06b3))
* **types:** sanitize waha provider payload parsing ([5404faa](https://github.com/danielgonzagat/whatsapp_saas/commit/5404faacd0afbea4b9da72ea4b7d48452287a804))
* **types:** sanitize whatsapp provider snapshots ([1ba825b](https://github.com/danielgonzagat/whatsapp_saas/commit/1ba825bac1528014d192878e3975498d45a55ff1))
* **types:** sanitize whatsapp read candidates ([ac6f307](https://github.com/danielgonzagat/whatsapp_saas/commit/ac6f307db1484daee2deeb4bd895eff52aebc31d))
* **types:** tighten diagnostic and interceptor contracts ([0314ed6](https://github.com/danielgonzagat/whatsapp_saas/commit/0314ed66bd33c82460ab18a12c43e3f5b78d9038))
* **types:** tighten flow and storage payload casts ([e278deb](https://github.com/danielgonzagat/whatsapp_saas/commit/e278debb89d9a9564e74710af198ae17369f0096))
* **types:** tighten waha provider transport contracts ([6531bc0](https://github.com/danielgonzagat/whatsapp_saas/commit/6531bc0de82a464b24c870e643f8c9d43de749c7))
* **types:** type wallet and asaas transactions ([b08b4a1](https://github.com/danielgonzagat/whatsapp_saas/commit/b08b4a14e35f4412f31231a83e31980f66e402c1))
* unblock linux visual and audit gates ([ad0133f](https://github.com/danielgonzagat/whatsapp_saas/commit/ad0133f9fea64b09dc811ba45af4bcfbbbeeeebd))
* unblock linux visual and audit gates ([5209fec](https://github.com/danielgonzagat/whatsapp_saas/commit/5209fece96c4a75ba11d12216d646ee1b129b4dc))
* **urls:** surface errors and replace confirm ([5e8427d](https://github.com/danielgonzagat/whatsapp_saas/commit/5e8427daa59c8fb8b6c284b3fb0a85e5955d120c))
* use git ls-files --exclude-standard to filter PULSE commit list ([8d29d0a](https://github.com/danielgonzagat/whatsapp_saas/commit/8d29d0afa741065739f37a4e808650b4252bf41a))
* **wallet,webhooks:** optimistic-lock wallet mutations and support Stripe webhook secret rotation ([30461a6](https://github.com/danielgonzagat/whatsapp_saas/commit/30461a65e26513e2154687ce9475bf46680d3d06))
* **wallet:** clear carteira opengrep props ([2dd9d2c](https://github.com/danielgonzagat/whatsapp_saas/commit/2dd9d2c870185d70040ee3e95a8af52348f78e08))
* **wallet:** remove carteira opengrep findings ([ce32dba](https://github.com/danielgonzagat/whatsapp_saas/commit/ce32dba19c230b89ea9ee12e8753fcef8cf24382))
* **whatsapp:** restore session constants after rebase ([d6e5ab2](https://github.com/danielgonzagat/whatsapp_saas/commit/d6e5ab21d2a2bfed0ed2766c30d11f91ae59adc5))
* **worker:** fail fast when redis is missing on railway ([a0e5fd6](https://github.com/danielgonzagat/whatsapp_saas/commit/a0e5fd6b44e7eb393cf0c7cc3bef0c7a5694e94f))

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
