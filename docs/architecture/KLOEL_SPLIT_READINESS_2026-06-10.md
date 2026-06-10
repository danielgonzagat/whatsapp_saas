# KLOEL Split Readiness — go/no-go por fatia (2026-06-10)

> **Fecha a issue [#422](https://github.com/danielgonzagat/Kloel/issues/422)** ([architecture] KLOEL god-module split readiness — K3 autópsia parcial).
> **Método:** 100% medido no código em 2026-06-10 (comandos colados em cada seção). Não herda números do log do K3 (2026-05-21) — vários estavam errados (§2).
> **Pares:** [`CANONICAL_DOMAINS_2026-06-10.md`](CANONICAL_DOMAINS_2026-06-10.md) (16 domínios + 13 vazamentos) · [`SERVICE_CATALOG_2026-06-10.md`](SERVICE_CATALOG_2026-06-10.md) (~35 serviços centrais) · [`MIND_UNIFICATION_PLAN.md`](MIND_UNIFICATION_PLAN.md) (F0–F10) · [`WHATSAPP_DISSOLUTION_PLAN.md`](WHATSAPP_DISSOLUTION_PLAN.md) (fatias 0–5).

---

## 1. Mapa pedido-da-issue → artefato entregue

| Pedido da issue #422 | Artefato que entrega | Status |
|---|---|---|
| Documentar composição dos 20 subdirs do kloel | Issue (parcial, defasada) + censo corrigido na §2 deste doc | ✅ corrigido |
| Cross-reference com inventário de stubs do K6 (#418) | §5 deste doc (reconciliação `anuncios`) | ✅ |
| Definir ordem canônica de extração | §4 (tabela go/no-go) + §6 (ordem recomendada revisada) | ✅ |
| Por split: módulo novo + mover arquivos + atualizar `kloel.module.ts` + ADR | §7 (mecânica padrão, com precedentes já executados no repo) | ✅ padrão estabelecido |
| Reconciliar K6 "anuncios Tier 3" vs K3 "anuncios é real" | §5 | ✅ reconciliado |
| Longo prazo: kloel root < 100 arquivos, ciclos eliminados | §8 (baseline de métricas para acompanhar) | ✅ baseline registrado |

---

## 2. Correções aos dados do K3 (medidos hoje)

```bash
find backend/src/kloel -name '*.ts' | wc -l                                   # 1712
find backend/src/kloel -name '*.ts' ! -name '*.spec.ts' ! -name '*.test.ts' | wc -l  # 1069
find backend/src/kloel -name '*.service.ts' ! -name '*.spec.ts' | wc -l       # 273
find backend/src/kloel -maxdepth 1 -name '*.ts' ! -name '*.spec.ts' | wc -l   # 350 (raiz)
find backend/src/kloel -maxdepth 1 -name '*.controller.ts' ! -name '*.spec.ts' | wc -l  # 26
wc -l backend/src/kloel/kloel.module.ts                                       # 603
```

| Afirmação do K3 (issue) | Realidade em 2026-06-10 |
|---|---|
| "1.118 .ts / 189 services" | **1.712 .ts** (1.069 não-spec) / **273 services** — o módulo CRESCEU ~50% desde a autópsia |
| "`pulse-gates/` 40 arquivos / 8.537 LOC — maior subdir" | **NÃO EXISTE.** `find backend/src -type d -name '*pulse*' -o -name '*gate*'` → vazio; `grep -rn "pulse-gates\|PulseGate" backend/src` → 0 hits. Item confabulado pelo K3 (a autópsia estourou timeout sem relatório final). Nenhuma fatia "pulse-gates" deve ser planejada |
| "`wisdom/` 19, `mind/` 19, `defens/` 17 …" | Censo real (top, `.ts` incl. specs): `mind/` **310**, `agent-runtime/` 36, `capability-registry-v2/` 29, `postsale-consumers/` 27, `product-sub-resources/` 26, `wisdom/` 22, `rules/` 21, `services-v2/` 20, `goal-field/` 20, `legit/` 19, `insight/` 18, `evol/` 18, `agency/` 18, `defens/` 17, `affil/` 16, `offer/` 15, `hypproof/` 15, `commem/` 15, `cash/` 15, `role/` 14, `team/` 13 |
| "ABI state em `kloel-reply-engine.service.ts:394` / helpers `:168,294,295`" | Confirmado com linhas deslizadas: `kloel-reply-engine.service.ts:346,495` e `kloel-reply-engine.helpers.ts:180,326-327` (`abiStateJson` injetado no system prompt). A tese se mantém: payload tipado, extração limpa possível |
| "26 controllers" | Confirmado: **26 controllers na raiz de `kloel/`** (lista no vazamento 5.3 do mapa de domínios). Desses, ~16 são superfície de comércio (sales, wallet, site, webinar, payment, product…) e ~10 são cognitivos legítimos (kloel, unified-agent, memory, canvas, diagnostics, whatsapp-brain…) |

---

## 3. Acoplamento medido por fatia candidata

Inbound = arquivos fora do subdir que importam dele (não-spec, `backend/src` + `worker`); outbound = paths `../*` únicos importados pelo subdir (não-spec).

```bash
# inbound:  grep -rln "from '[^']*/<dir>/" backend/src worker --include='*.ts' | grep -v "kloel/<dir>/" | grep -v spec | wc -l
# outbound: grep -rhoE "from '\.\./[^']*'" backend/src/kloel/<dir> --include='*.ts' | grep -v spec | sort -u | wc -l
```

| Subdir | .ts | inbound | outbound | Observação |
|---|---:|---:|---:|---|
| `agent-runtime/` | 36 | 2 | 10 | quase selado |
| `postsale-consumers/` | 27 | 1 | 9 (6 de runtime: `common/math`, `channel/types`, `mind/mind.types`, `spine-events.helpers`, `spine/*`) | depende do spine |
| `product-sub-resources/` | 26 | 6 | 21 | mais emaranhado; +1 controller na raiz |
| `rules/` | 21 | 7 | 4 (`kloel-rule-builders`, `kloel-rules.types`, `mind/policy/*` ×2) | ADR-0007 (portão único) já governa |
| `team/` | 13 | 1 | 3 | colide com `backend/src/team/` existente |
| `cash/` | 15 | 2 | 0 | zero outbound — mas é domínio Payment |
| `wisdom/ insight/ legit/ evol/ hypproof/ commem/` | 15–22 cada | 1–6 cada | 1–5 cada | satélites cognitivos do Mind |
| `mind/` | 310 | **182** | **175** | núcleo — não é "move", é o órgão |

---

## 4. Tabela de prontidão go/no-go

| Fatia | Veredito | Por quê | Pré-condições / gates |
|---|---|---|---|
| ~~`pulse-gates/`~~ | **VOID** | diretório não existe (§2) | remover do plano; não substituir por proxy |
| `agent-runtime/` → `backend/src/agent-runtime/` | **GO** | 2 inbound / 10 outbound; já coeso (scheduler, sessões, skills, evidence-store) | shim de reexport antes do move; `npm run typecheck` + `npx jest src/kloel/agent-runtime --silent`; remover do `kloel.module.ts` em PR isolado |
| `postsale-consumers/` → `backend/src/postsale/` | **GO** (após selar spine) | 1 inbound; outbound concentrado no `kloel/spine/` | expor `SpineEmitterService` via barrel/port primeiro (mesmo padrão da Fatia 1 do plano WhatsApp); depois move + shim |
| `rules/` → `backend/src/rules/` | **GO com ressalva** | 7 inbound; depende de `mind/policy/mind-quality.service` | levar junto `kloel-rule-builders.ts` + `kloel-rules.types.ts` (raiz); dependência de mind/policy vira import cross-módulo explícito (aceitável — ADR-0007) |
| `team/` → fundir com `backend/src/team/` | **GO com rename** | 1 inbound, 3 outbound; `backend/src/team/` (convites/membros) já existe — **colisão de nome** | decidir nome (`team-agents/`? fundir?) ANTES do move; nunca dois `TeamModule` |
| `cash/` → `payments/` ou `wallet/` | **GO, mas sequenciar após 5.1** | zero outbound; porém o vazamento 5.1 (dois `WalletService` homônimos) precisa resolver primeiro para `cash/` ter destino inequívoco | executar migração 5.1 do mapa de domínios (renomear `SellerWalletService` vs `PrepaidWalletService`), depois mover `cash/` |
| 26 controllers da raiz (superfície de comércio) | **GO incremental** | vazamento 5.3 já lista alvo por controller | 1 controller (ou família) por PR, rota preservada, smoke de rotas (`RoutesResolver` diff) |
| `wisdom/ insight/ legit/ evol/ hypproof/ commem/` → consolidar no Mind | **NO-GO como move físico isolado** | são satélites do órgão cognitivo; mover para `backend/src/mind/` top-level agora criaria uma 2ª fronteira do Mind enquanto F0–F10 estão em voo | seguir [`MIND_UNIFICATION_PLAN.md`](MIND_UNIFICATION_PLAN.md) — consolidação é interna a `kloel/mind/` (ABSORB/ADAPTER §6 do plano); só re-endereçar top-level via ADR novo após F10 |
| `mind/` (310 .ts) | **NO-GO como "split"** | 182 inbound / 175 outbound — é o núcleo, não um vazamento | idem: F0–F10 do plano de unificação; F10 bloqueada por ADR-0014 |
| Canal WhatsApp (fora do kloel, mas no caminho crítico) | **GO — plano pronto** | dissolução restante já fatiada com provas | [`WHATSAPP_DISSOLUTION_PLAN.md`](WHATSAPP_DISSOLUTION_PLAN.md) fatias 0–5 |

---

## 5. Reconciliação `anuncios` (K3 vs K6)

```bash
ls backend/src/anuncios/        # anuncios.{controller,module,service}.ts (+2 specs)
wc -l backend/src/anuncios/*.ts # 847 linhas no total
head backend/src/anuncios/anuncios.service.ts
# → injeta MetaMarketingProvider, GoogleAdsProvider, TikTokAdsProvider (integrations/), PrismaService
```

**Veredito: K3 estava certo — não há contradição real.** O backend `anuncios/` é implementação real: agregador fino (3 arquivos src, 847 linhas) sobre os providers reais de `integrations/` (Meta/Google/TikTok), com contas, campanhas e insights. O próprio texto do K6 em #418 lista "**Anuncios (5-10h audit) — backend exists**" no ranking de promoção — a classificação "Tier 3/facade" do K6 se aplicava às **páginas pass-through do frontend** (`kloel/anuncios/`, 18 .tsx), não ao módulo backend. Classificação final registrada: `anuncios` = **implementação real, fina** (domínio Campaign/Ads — ver `CANONICAL_DOMAINS_2026-06-10.md` §1.2); ação restante é a auditoria de 5–10h do ranking K6, não promoção de stub.

---

## 6. Ordem canônica de extração (revisada)

A ordem recomendada pela issue (`pulse-gates → agent-runtime → mind → postsale-consumers → product-sub-resources`) cai por dois motivos: `pulse-gates` não existe e `mind` não é extraível por move. Ordem revisada, por risco crescente e dependência:

1. **Higiene** (vazamento 5.13): limpar `jest_dx/`, `test-results/` de dentro de `src/` — destrava qualquer contagem/grep confiável.
2. **`agent-runtime/`** — menor acoplamento, maior coesão (GO seco).
3. **Selar o spine** (barrel/port) → **`postsale-consumers/`**.
4. **`rules/`** (+ builders/types da raiz).
5. **Migração 5.1** (dois WalletService) → **`cash/`** → controllers de comércio da raiz (5.3), em famílias.
6. **`product-sub-resources/`** — por último entre os GO (21 outbound; reavaliar após 2–5 reduzirem a raiz).
7. **Mind**: exclusivamente via `MIND_UNIFICATION_PLAN.md` F0–F10 (paralelo às fatias acima, sem conflito de arquivos).

---

## 7. Mecânica padrão por split (pedida pela issue, já estabelecida no repo)

Cada fatia = 1 PR, reversível:

1. **Shim antes do move** — precedente executado: `backend/src/kloel/product.service.ts` é só `export { ProductService } from '../products/product.service'`.
2. **Criar `backend/src/<modulo>/`** com `*.module.ts` próprio; mover arquivos preservando imports.
3. **Atualizar `kloel.module.ts`** (603 linhas hoje): remover providers/controllers movidos, importar o módulo novo. Remoções de `forwardRef` em PR isolado com boot real (`start:dev`), não só typecheck — risco mapeado no plano WhatsApp §6.
4. **Gates mínimos**: `cd backend && npm run typecheck` + `npx jest <paths-afetados> --silent`; para controllers, diff de rotas registradas.
5. **ADR por split** — precedentes: ADR-0012 (OmniCore/canal), ADR-0013 (Mind), ADR-0006 (papéis cognitivos), ADR-0007 (portão único de regras).
6. **Deleção do shim** só na última fatia da família, com prova de grep 0 referências.

---

## 8. Baseline de métricas (alvos de longo prazo da issue)

| Métrica | 2026-06-10 (baseline) | Alvo issue |
|---|---:|---:|
| `.ts` totais em `kloel/` | 1.712 | — |
| `.ts` não-spec em `kloel/` | 1.069 | — |
| Arquivos não-spec na **raiz** de `kloel/` | 350 | **< 100** (glue + tipos ABI) |
| Controllers na raiz de `kloel/` | 26 | ~10 (só cognitivos) |
| `*.service.ts` não-spec em `kloel/` | 273 | — |
| Linhas de `kloel.module.ts` | 603 | — |
| `WalletService` homônimos | 2 | 1 por domínio, nomes distintos |
| Flags de dual-write em voo | 5+ (lista no catálogo de serviços, anti-padrão 5) | 0 (cada uma concluída) |

Re-medir com os mesmos comandos da §2 a cada fatia mesclada.
