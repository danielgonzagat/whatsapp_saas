# Y_PARTITION — KloelGraph (protótipo LITERAL) → produção

> **Alvo (Opção C, escolhida pelo dono)**: o grafo é o `KloelGraphPrototype.jsx`
> **literal** (6576 linhas, já renderizando como `/dashboard`). Y = (1) nós
> derivados de **dados reais**; (2) overlay 80% renderiza os **componentes reais
> do repo** no lugar das telas reinventadas inline; (3) deep-linking, mobile,
> a11y, 60fps, build/lint/tsc/test verdes. O grafo
> (física/galáxias/sóis/nav/câmera/arrastar-vs-clicar/busca/estética) permanece
> **byte-idêntico** ao protótipo.
>
> **Worktree**: `/Users/danielpenin/whatsapp_saas-kg` @ `feat/kloelgraph-literal-prototype` (HEAD 172c924ae)
> **Arquivo-alvo**: `frontend/src/components/kloel/graph/KloelGraphPrototype.jsx`
> **Dev server**: http://app.localhost:3013/dashboard (200)
>
> **Procedência**: re-mirado a partir da anatomia real do protótipo + a estrutura
> do plano anterior `docs/ai/Y_PLAN` (que era válida mas mirava na shell #473).
> O raciocínio dos 12 agentes do re-aim está preservado em `/tmp/kg_results/`
> (12 payloads, 311 KB) para enriquecimento dos slice-prompts.

---

## A — O fato que molda tudo

O protótipo é **um arquivo monolítico** (`KloelGraphPrototype.jsx`). Hoje:

- O grafo já renderiza idêntico (`buildGraph` + `GraphCanvas`, verificado: 93
  nós / 85 arestas / 7 galáxias).
- Os nós são **derivados de SEEDS internos** (PRODUCTS, MARKETPLACE_SEED,
  MY_AFFILIATES_SEED, MEMBER_AREAS_SEED, CRM_SEED, CONTACTS_SEED,
  CONVERSATIONS_SEED, AD_*_SEED, ORDERS_SEED, DEFAULT_WALLET, OPERATIONAL_DAYS,
  DEFAULT_ACCOUNT_DATA), não de dados reais.
- O overlay (`KloelOverlay` + `NodePanel` + telas inline `CriarProdutosScreen`,
  `AfiliarScreen`, `EducarScreen`, `ConversarScreen`, `ProductOverview`,
  `WalletOverview`, etc.) renderiza **reinvenções inline**, não os componentes
  reais do repo.

**Logo Y tem dois eixos por domínio**: (eixo-D) trocar o seed pelo hook real;
(eixo-T) trocar a tela inline pelo componente real no overlay. Mais decomposição
(para paralelizar) + routing/deep-link + mobile/a11y/perf + verificação.

## B — Lei anti-colisão (decisão de carga)

1. **DECOMPOSIÇÃO PRIMEIRO (serial).** O monólito é quebrado em módulos por
   domínio **preservando render byte-idêntico**. Só depois as galáxias
   paralelizam — senão N agentes editam o mesmo arquivo = colisão garantida.
2. Pós-decomposição, **cada galáxia edita só o body do seu próprio módulo** +
   cria seu adapter de dados. Zero edição cruzada; zero edição do engine.
3. **Arquivos-engine (chokepoints) são serial-owned** por S0/S8/S9/S10:
   o arquivo-engine remanescente (motor + `KloelOverlay` + `NodePanel`-router +
   `KloelInner`) e o registro de fontes de nós.
4. **Estado honesto em todo builder**: loading / empty(200,0 linhas) /
   error(4xx/5xx/throw) → **emite zero nós-entidade**. Nunca seed, nunca fake,
   nunca deixa o throw subir pro engine. O nó-sol da galáxia é sempre estático.
5. **Visual idêntico = mesma casca/layout/interação do grafo**, dado real,
   estado honesto. A decomposição não pode mudar 1px (gate §I).
6. **Componente real no overlay sem reestilizar** (casca quase invisível): o
   `NodePanel`/`KloelOverlay` monta o componente real do repo intacto; só
   resolve providers/props que ele exige. Onde **não houver** equivalente real,
   **mantém o painel do protótipo** (decisão explícita por nó no contrato).

## C — Fatias (12) — re-miradas no protótipo

| Fatia | Fase | Conc. | Cria / Edita (exclusivo) |
|---|---|---|---|
| **S0** Decomposição + seam | 0 | serial-só | EXTRAI do monólito os módulos por domínio (seeds+builders+telas-inline) preservando render byte-idêntico; cria o registro de fontes de nós; engine importa dos módulos |
| **S1** Badges + a11y por-nó | 1 | paralelo (NodeButton c/ lock) | EDITA o desenho do nó (badge/contador real) + aria/role/tab-order por nó |
| **S2** Perfil + Dashboard | 1 | paralelo | body do módulo perfil: `buildProfileNodesEdges`/`computeDesempenho` ← dados reais; overlay Perfil/Home ← `HomeView`/Settings reais; cria `adapters/` |
| **S3** Afiliar | 1 | paralelo | body do módulo afiliar: `buildAffiliateNodesEdges` ← `useAffiliates`/`usePartnerships`; overlay ← `AfiliarSe`/`ParceriasView` reais |
| **S4** Criar/Produtos | 1 | paralelo | body do módulo criar: `buildProductSubnodes` ← `useProducts`; overlay ← `ProdutosView`/`ProductNerveCenter` reais + wizard real |
| **S5** Educar | 1 | paralelo | body do módulo educar: `buildEducarNodesEdges` ← `useMemberAreas`; overlay ← `AreaMembros` real |
| **S6** Conversar | 1 | paralelo | body do módulo conversar: `buildConversarNodesEdges` ← `useCRM`/conversations/`useAnuncios`; overlay ← Inbox/CRM/Contatos/Anuncios/Autopilot reais + onboarding de canais; **trata /api/anuncios ausente** |
| **S7** Consultar | 1 | paralelo | body do módulo consultar: `buildWalletNodesEdges` ← wallet/analytics reais; overlay ← `KloelCarteira` + Analytics reais |
| **S8** Kloel IA central | 2a | serial-só | `buildKloelNodesEdges` + chat real (trocar `api.anthropic` direto por endpoint do backend) + busca real (command palette) + Imagens/Recentes; toca engine → serial |
| **S9** Overlay routing + deep-link | 2b | serial-só (após S8) | `?node=`, voltar/avançar, `?graph=1`; resolver nó↔rota; fallback plain-branch |
| **S10** Mobile + a11y + perf | 3 | serial | KloelOverlay (só a11y, zero-visual-diff), GraphCanvas perf 60fps, NodeButton aria |
| **S11** Verificação + integração | 4 | serial-último | E2E Chrome (4 estados honestos/galáxia) + build/lint/tsc/test verdes; integra no `(main)` + remove sidebar atrás do flag |

## D — Ordem de dependência

```
Fase 0:  S0  (serial, só — decomposição byte-idêntica + seam)
Fase 1:  S2 ‖ S3 ‖ S4 ‖ S5 ‖ S6 ‖ S7   (6 galáxias paralelas) + S1 oportunista
Fase 2a: S8  (serial, só — Kloel IA, toca engine)
Fase 2b: S9  (serial, só — routing/deep-link; depois de S8)
Fase 3:  S10 (mobile/a11y/perf, serial)
Fase 4:  S11 (verificação + integração, serial-último)
```

`dependencyOrder = S0 → {S2,S3,S4,S5,S6,S7,S1} → S8 → S9 → S10 → S11`
**pico de concorrência = 6** (as galáxias na Fase 1).

## E — Protocolo por fatia (toda fatia roda)

1. **Pré-voo**: health-probe (Read de arquivo conhecido + Bash echo). Proibido
   `awk`+`strftime` (gatilho da degradação observada). Runner mudo é abortado,
   nunca contado verde-por-ausência.
2. `task_lock_acquire` nos seus arquivos; verificar concessão.
3. Ancorar no real: `codegraph` (search/node/callers/context) + `gitnexus`
   (route_map/query/api_impact) antes de editar.
4. Editar via **atomic-edit** preservando o contrato visual. **Se atomic-edit
   estiver indisponível** (caiu nesta sessão), usar Edit/Write e **registrar no
   recibo**.
5. `test-runner` verde (run_tsc 0 / run_eslint 0 / run_vitest|run_jest) — saída
   real capturada, nunca verde-por-ausência-de-output.
6. **Chrome** (`chrome-devtools`) em http://app.localhost:3013/<rota>: asserir
   visual idêntico (resize 1440x900 antes do screenshot <2000px) + os 4 estados
   honestos (loading/empty/error/success). Stack down → marcar
   **EXTERNAL_BLOCKED** com substituto (unit + snapshot byte dos graphNodes +
   PULSE + contagem network 200/404), nunca verde por E2E não-rodado.
7. `pulse_scan_module` limpo.
8. Liberar locks; `task_update`.

## F — Lacunas funcionais conhecidas (do protótipo)

- **Chat (S8)**: `KloelChatScreen` chama `https://api.anthropic.com/v1/messages`
  **direto do client** — inseguro/irreal. Trocar pelo endpoint real de chat do
  backend Kloel (sem expor key no browser). Onde indisponível → estado honesto.
- **Conversar (S6)**: `/api/anuncios/*` pode faltar (`useAnuncios` → 404). Criar
  proxy (espelhar marketing) **ou** repointar; registrar a opção no recibo p/ S9
  acoplar o branch `anuncios`. 404 → zero nós-anúncio (inbox/crm intactos).
- **Imagens (S8)**: `KloelImagesScreen` é upload local em memória; ligar ao
  storage/endpoint real de imagens ou estado honesto setup-required.

## G — Bloqueios conhecidos

- **Degradação de I/O ATIVA** nesta sessão (Bash stdout esvaziando, Read
  truncando 1-linha, "tool result temporarily unavailable"). Mitigação: cada
  fatia faz health-probe e aborta runner mudo; **fan-out só quando o canal
  estabilizar** — senão estala na escrita (como estalou o re-aim).
- **Backend não sondado**: builders emitem honest-empty onde ausente; Chrome de
  cada fatia exige stack local, senão EXTERNAL_BLOCKED com evidência substituta.
- **Suppressions do arquivo literal** (`/* eslint-disable */` + `@ts-nocheck`):
  o merge à `main` precisa do OK do dono (regra Codacy). Não bloqueia o build em
  worktree.
- **≥6 worktrees kloelgraph irmãos**: esta partição aterrissa SÓ no worktree-kg.
  Gate pré-voo aborta se um irmão segurar lock num chokepoint.

## H — Gate pré-voo (fail-closed, antes de QUALQUER fan-out)

1. Canal de I/O saudável (probe Read+Bash retornam conteúdo completo). Se
   degradado → **NÃO disparar fan-out**; rodar serial/inline.
2. Worktree exclusivo: nenhum irmão com lock em chokepoint.
3. Higiene: stash/commit do `backend/src/kloel/*` + `.mcp.json` sujos (fora do
   escopo, mas evita confusão).
4. `adapters/` criado uma vez por S2 (dono designado).
5. Gate de fase: confirmar release de locks antes de avançar.

## I — Gate render byte-idêntico (base de toda a Fase 1, dono S0)

`graphNodes` deve renderizar **byte-idêntico** após a decomposição. Gate forte
(não contagem):

1. Serializa por nó `{ id, type, label, subtitle, parentId, area }` em **ordem
   congelada** (a ordem de `buildGraph`: BASE_SUNS → STATIC_BRANCHES → canais →
   produtos+subnós → afiliar → carteira → educar → conversar → perfil →
   desempenho → kloel).
2. Snapshot antes/depois da extração de cada módulo — devem bater exatamente.
3. Verificação visual no Chrome: screenshot `/dashboard` antes/depois idêntico
   (93 nós / 85 arestas / 7 galáxias).
4. Qualquer divergência = reverter a extração daquele módulo (atomic rollback ou
   snapshot git).

---

*Fim Y_PARTITION.md (re-mirado no protótipo literal)*
