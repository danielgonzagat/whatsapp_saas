# atomic-edit-evolution — substrato do Movimento III (disprova-como-gradiente)

Kernels determinísticos para o programa Darwin-Gödel do atomic-edit. Estilo idêntico ao
`self-evolution-harness.mjs` do engine: funções puras, CLI por stdin JSON, **zero escrita em
disco** (append retorna texto; quem persiste é o chamador governado), hash-compatível
(`canonicalSha256(v) === sha256(JSON.stringify(v))`).

## Módulos

| Módulo | O que prova | Proof |
|---|---|---|
| `disproof-corpus-harness.mjs` | witnesses hash-encadeados recomputáveis (forja rejeitada por recálculo), dedup semântico append-only (`wall-hit`/`hitCount`), `supersededBy` (parede vira história), `selectDisproofs-v1` (região > hitCount > anti-miopia determinística), briefing 3 camadas + `briefingDigest`, held-out determinístico, métricas M1-M5 | `disproof-corpus.proof.mjs` (29 checks) |
| `experiment-harness.mjs` | controles C1-C5 do A/B pré-registrado: propositor congelado (esqueleto byte-idêntico entre braços), anti-vazamento (ESCALAR+briefing recusado mesmo com hash válido), orçamento shadow B=3, run-ledger encadeado, agregação média±desvio (nunca best-run) | `experiment.proof.mjs` (16 checks) |

Rode os proofs: `node disproof-corpus.proof.mjs` / `node experiment.proof.mjs` (exit 0 = verde).

## Status honesto (não infle isto)

- **Zero consumidores no engine.** O caminho de promoção (`scripts/mcp/atomic-edit/server-tools-self.ts`)
  ainda NÃO constrói witnesses em rejeições (III.a aberto) nem injeta briefings.
- Recompute do corpus = hash/chain/schema. O recompute byte-level contra a árvore candidata
  arquivada nasce junto com o consumidor engine-side.
- Nenhum experimento rodou. Dados sintéticos nos proofs exercitam o PIPELINE, não a tese.
- Faltam para o run real: III.a (consumidor), III.e (`shadowGate` somente-leitura), suite de
  tarefas com stepping-stones, propositor LLM congelado.

## Pré-registro (lei do experimento)

`docs/evidence/darwin-godel-preregistration-v1.md` (commit `2b8594d2f`) — predições M1-M5,
critérios de morte da tese, anti-Goodhart, held-out `sha256(invariantId+"darwin-godel-heldout-v1")`
top-20%. Curva produzida sem referência ao pré-registro não é o experimento.
