# Obsidian Conference Gaps — Organismo Delivery

> Conferencia agentica 2026-05-12. Registro de gaps no espelho do Obsidian descobertos
> durante a conferencia modulo por modulo.
> Nao substitui o mirror daemon — aponta para o que o daemon ja espelha vs. o que
> a conferencia revelou que ainda nao esta visivel como estrutura do organismo.

## Inspection Method

Obsidian MCP nao disponivel nesta sessao CLI. Inspecao feita via:
1. Leitura dos arquivos fonte no repo (`backend/src/kloel/*`, `worker/processors/cia/*`, etc.).
2. Leitura da configuracao do mirror daemon (`scripts/obsidian-mirror-daemon-constants.mjs`).
3. Busca no vault path (`/Users/danielpenin/Documents/Obsidian Vault/Kloel/99 - Espelho do Codigo/`).

## Gaps Identified

### G1 — Directory `backend/src/brain/` does not exist; brain lives in `backend/src/kloel/`

**What the prompt expected:** `backend/src/brain/*` com capability registry, controller.
**Reality:** Os arquivos do brain estao em `backend/src/kloel/`:
- `brain-capability-registry.service.ts`
- `brain-capability-executor.service.ts`
- `brain-capability-policy.ts`
- `brain-runtime.service.ts`
- `whatsapp-brain.controller.ts`

**Obsidian impact:** O mirror daemon espelha `backend/` inteiro, entao os arquivos
estarao em `_source/backend/src/kloel/`. Nao existe diretorio `_source/backend/src/brain/`.
Queries no Obsidian Graph por `path:brain/` nao encontrarao estes modulos.
**Mitigacao:** Nenhuma necessaria para o mirror — os arquivos estao espelhados.
Apenas documentar que o layout esperado no prompt difere do real.

### G2 — `worker/processors/__companions__/autopilot-core.companion.ts` does not exist

**What the prompt expected:** Arquivo de companion do autopilot.
**Reality:** Apenas o teste existe: `worker/test/autopilot-core.companion.spec.ts`.
O companion foi decomposto em:
- `worker/processors/autopilot/cia-action-dispatch.ts` — despacho de acoes
- `worker/processors/autopilot/cia-cycle-workspace.ts` — ciclo por workspace
- `worker/processors/cia/global-learning.ts` — aprendizado global
- `worker/processors/cia/self-improvement.ts` — RL de variantes

**Obsidian impact:** O mirror espelha `worker/` -> `_source/worker/`. O test file
`autopilot-core.companion.spec.ts` aparece mas nenhum `autopilot-core.companion.ts`
source. A funcionalidade existe, fragmentada em 4 arquivos.
**Mitigacao:** Documentado. Nao requer acao.

### G3 — Organism layers not tagged in Obsidian nodes

**What's missing:** Cada arquivo espelhado em `_source/` recebe tags do mirror daemon
(`graph/surface-backend`, `graph/effect-*`, `graph/risk-*`, etc.), mas nao recebe
uma tag de camada do organismo (`organism/corpo`, `organism/sentidos`,
`organism/memoria`, `organism/politica`, `organism/linguagem`, `organism/acao`,
`organism/aprendizado`).

**Obsidian impact:** O grafo do Obsidian nao permite queries como
`tag:#organism/acao` para ver todos os modulos de execucao. A estrutura do
organismo so existe em `docs/audit/organism-layers-mapping.md` (este arquivo,
que o mirror espelhara).
**Mitigacao:** Opcoes:
a) Adicionar tags `organism/*` via frontmatter nos arquivos fonte (invasivo).
b) Criar nota indice em Obsidian (`Organismo Camadas.md`) com links para os modulos.
c) Estender o mirror daemon para injetar tags de organismo baseado no mapeamento
   deste arquivo.

### G4 — Module conference (7 questions) lives only in markdown, not in graph edges

**What's missing:** As respostas das 7 perguntas (`module-conference.md`) sao texto
linear. O grafo do Obsidian nao mostra edges como "M1 calls M2", "M2 calls M3",
etc. — que sao as relacoes reais de caller/callee documentadas nas perguntas 3 e 4.

**Obsidian impact:** Um operador humano olhando o grafo nao ve a cadeia:
`WhatsAppBrainController` -> `WhatsAppBrainService` -> `UnifiedAgentService` ->
`CommercialDecisionOrchestrator` -> `MindService`. Essas relacoes sao o sistema
nervoso real do organismo.
**Mitigacao:** O mirror daemon ja detecta imports e pode gerar edges. Verificar
se o graph lens (`scripts/obsidian-graph-lens.mjs`) ja captura essas dependencias.
Se sim, gap e apenas de verificacao. Se nao, e um gap de feature do mirror.

### G5 — `docs/audit/lacunas-identificadas.md` references resolved gaps but graph doesn't reflect resolution

**What's missing:** Lacunas marcadas como `RESOLVIDA em <commit>` (e.g., L6 resolvida
em `3f2c8e503`) tem o codigo fixo no repo, mas o no do Obsidian para o arquivo
de lacuna nao muda de cor/estado para indicar "resolvida". O commit SHA esta no
texto mas nao e um link clicavel no grafo.

**Obsidian impact:** Navegacao entre lacuna e commit que a resolveu requer
copia manual do SHA e `git show`. O grafo nao tem edge `lacuna -> commit`.
**Mitigacao:** O mirror daemon poderia parsear `RESOLVIDA em <sha>` no markdown
e gerar um node virtual para o commit com backlink.

### G6 — Organism layer "linguagem" has only 1 module in graph but touches 36 tool capabilities

**What's missing:** `UnifiedAgentService` (M5, linguagem) e um unico arquivo no
espelho, mas internamente roteia 36 tool calls (`send_message`, `create_payment_link`,
`apply_discount`, etc.). Essas 36 capabilities sao definidas em 4 arquivos de tools
(`unified-agent-tools-sales.ts`, `unified-agent-tools-messaging.ts`,
`unified-agent-tools-product.ts`, `unified-agent-tools-control.ts`). O grafo mostra
5 nos (1 service + 4 tool files) mas nao as 36 edges de capability.

**Obsidian impact:** O grafo sub-representa a superficie real da camada de linguagem.
**Mitigacao:** As tool definitions ja sao espelhadas. O gap e que o graph lens nao
extrai cada `tool.function.name` como um sub-no.

### G7 — Economic hierarchy (`attributeHierarchy`) computed in code but invisible in graph

**What's missing:** `commercial-decision-orchestrator.service.ts` chama
`attributeHierarchy()` do `economic-hierarchy.ts` para justificar cada decisao
(audio_vs_text, channel_choice, message_format, tom, coupon_offer,
product_offer, etc.). Essa funcao objetivo economica e o "porque" de cada
acao, mas nao aparece como no no grafo.

**Obsidian impact:** O arquivo `economic-hierarchy.ts` existe no mirror, mas
suas relacoes com o orquestrador (quem chama, com que parametros, com que resultado)
nao sao visiveis como edges.
**Mitigacao:** O mirror daemon com graph lens deve capturar imports. Verificar
se `attributeHierarchy` aparece como edge `CommercialDecisionOrchestratorService -> economic-hierarchy`.

## Summary

| Gap | Type | Severity | Action Needed |
|-----|------|----------|---------------|
| G1 | Layout mismatch | Low | Documented. No action. |
| G2 | Missing file | Low | Documented. No action. |
| G3 | Missing tags | Medium | Add organism tags or create index note. |
| G4 | Missing edges | Medium | Verify graph lens captures caller/callee edges. |
| G5 | Resolved gap invisible | Low | Future mirror enhancement. |
| G6 | Under-represented capabilities | Low | Documented. |
| G7 | Economic hierarchy invisible | Low | Verify graph lens captures import edges. |

**Total: 7 gaps found. 0 critical, 2 medium, 5 low.**
