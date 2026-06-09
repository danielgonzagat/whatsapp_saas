# Colheita Real v1 — o primeiro corpus de disprovas REAL do atomic (III.a′ lado-ledger)

Data dos dados: até ledger-ts 1781039565296 (2026-06-09). Branch `feat/kloel-honest-completion-20260609`.
Pré-registro: `docs/evidence/darwin-godel-preregistration-v1.md` (commit `2b8594d2f`). Substrato: `scripts/mcp/atomic-edit-evolution/`.

## O que aconteceu (fato, recomputável)

As **recusas reais** que o envelope atomic produziu em produção — exec-ledger `kind:"refused"`
e bypass-ledger `blockedByDenyHook:true` estrito — foram convertidas no corpus de disprovas
hash-encadeado do Movimento III, as **leis III.d foram sintetizadas de dados reais pela
primeira vez**, o held-out pré-registrado foi **materializado**, e o **primeiro briefing real**
(III.c) foi gerado com anti-vazamento nas duas camadas.

| Artefato | Medida | Digest |
|---|---|---|
| `.atomic/evolution/real-disproof-corpus.jsonl` | **6.778 registros, 658 paredes, 87 gerações-hora** | sha256 `4ad16154…`, head `517efc66…` |
| `.atomic/evolution/real-lessons.jsonl` | **26 leis aceitas, 70 clusters descartados COM razão** | sha256 `b691ca42…` |
| `.atomic/evolution/held-out-v1.json` | 3 de 11 invariantes reservados (regra sha256(id+salt) top-20%) | — |
| `.atomic/evolution/real-briefing.md` | L1=6, L2=3; **5 paredes + 23 leis held-out EXCLUÍDAS** | `2e1fbb21…` |
| Âncora de linhagem | arquivo evolutivo real VERIFICADO (2 entradas) | head `a61af6c6…` |

Reconciliação completa (zero caps silenciosos): 20.071 linhas exec parseadas → 6.146 refused;
639 bypass → 632 estritos; 6.778 eventos = 658 witnesses + 6.120 hits. 0 JSON inválido, 0 descartes de campo.

## A geometria das paredes (o que o organismo aprendeu sobre si)

- Parede mais dura: `governance-file-write :: exec/sed # …package.json` — **1.020 colisões** (ger. 35-87).
  Segunda: a mesma forma contra `CLAUDE.md` — 334 colisões. O smoke-triplo da memória institucional
  (`.smoke-exec-unproven.N.txt`) é UMA parede com 61 colisões atravessando as gerações 1-57 —
  a normalização de forma (dígitos→N, hex→H) funcionou em dados reais.
- Leis com maior força preditiva (validação temporal out-of-sample, treino explica 100%):
  - `native-read :: tool/Read` — 162 witnesses, **prevê 63/63 colisões futuras**
  - `effect-proof-required :: exec/node` — 62 witnesses, prevê 31/31
  - `effect-proof-required :: exec/git` — 33 witnesses, prevê 16/16
- Sobreajuste morreu como desenhado: `exec/tsc` (train=7 test=1), `exec/printenv` (6/0),
  `exec/sha256sum` (3/0) → DESCARTADOS por split inviável, não viraram lei falsa.

## Verificação independente (o leitor pode recomputar)

```bash
cat .atomic/evolution/real-disproof-corpus.jsonl | jq -Rs '{corpusText: .}' \
  | node scripts/mcp/atomic-edit-evolution/disproof-corpus-harness.mjs --verify-corpus-jsonl
cat .atomic/evolution/real-lessons.jsonl | jq -Rs '{lessonsText: .}' \
  | node scripts/mcp/atomic-edit-evolution/lesson-harness.mjs --verify-lessons-jsonl
node scripts/mcp/atomic-edit-evolution/real-refusal-harvest.proof.mjs   # 33/33
node scripts/mcp/atomic-edit-evolution/run-real-harvest.mjs             # determinístico dado os ledgers
```

## Limites honestos (o que isto NÃO é)

1. **Família de paredes**: recusas da SUPERFÍCIE DE FERRAMENTAS (atomic_exec/deny-hook), NÃO
   rejeições do caminho de promoção do `atomic_expand_self`. III.a engine-side segue pendente
   (sob lock concorrente `atomic-edit-darwin-godel-thread`).
2. **Forma fraca das leis**: todas as 26 são `wall-presence` — preveem RECORRÊNCIA do cluster
   no futuro held-out temporal, não uma condição decidível rica. As famílias ricas
   (removal-over-cap, fixture-loss) precisam dos campos de contra-exemplo que só o consumidor
   engine-side fornecerá. A validação preditiva é real, mas é o degrau mais fraco da escada.
3. **Recibo de efeito do runner**: o byte-effect diff da escrita dos artefatos foi RECUSADO
   pelo próprio envelope (cap de cobertura do snapshot — corpus 4,7MB). A escrita rodou
   confinada por sandbox `writeRoot=.atomic/evolution` e os artefatos foram re-julgados
   INDEPENDENTEMENTE do disco pelo kernel (comandos acima, receipts no exec-ledger). A
   recusa do diff é ela própria mais uma parede real — e está no corpus da próxima colheita.
4. **Ruído de forma**: comandos compostos geram cluster-keys lixo (ex.: `exec/NODE_ENV=production`)
   — visíveis nos 70 descartes, nenhum virou lei.
5. **O briefing ainda não foi consumido por propositor nenhum** — III.c consumo é o próximo degrau.

## Auditoria do arquivo evolutivo real (de passagem, mesma sessão)

Cadeia re-verificada (2 entradas, 2 promote / 0 reject). Entrada 2 = conserto da catraca-proxy
(same-count weakening recusado por fixtures recomputáveis; semanticOperators 7→9). Ressalvas
que PERSISTEM: R2 canal mole constante (publicScore/holdoutScore=1, latency=1000 nas duas
entradas); **novo achado**: proofCoverage caiu 40→39 entre a entrada 1 (candidato) e a entrada 2
(parent) — o gate `self-evolution-archive-persistence` saiu do required set silenciosamente; e a
genealogia de variantes reseta a cada entrada (parent.parentId=null), i.e. a cadeia liga RECIBOS,
não LINHAGEM de variantes.

## Por que isto importa (a fronteira)

Nenhum sistema publicado devolve a INFORMAÇÃO das próprias recusas formais ao gerador de
propostas (proof-as-filter é universal; proof-as-signal é a célula vazia). Este artefato fecha a
metade ledger→corpus→lei→briefing do laço com DADOS REAIS. A metade briefing→propositor
(III.c consumo) e a metade engine-side (III.a) fecham o círculo. O experimento pré-registrado
III.f decide se o gradiente transfere — se a curva negar, a tese morre com recibo.
