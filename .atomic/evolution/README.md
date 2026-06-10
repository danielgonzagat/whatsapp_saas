# .atomic/evolution — artefatos do Movimento III sobre dados REAIS

Gerados por `scripts/mcp/atomic-edit-evolution/run-real-harvest.mjs` (determinístico
dado os bytes dos ledgers + arquivo evolutivo; re-rodar com os mesmos inputs reproduz
byte-exato). O corpus é ancorado no head VERIFICADO do arquivo evolutivo real.

| Artefato | O quê |
|---|---|
| `real-disproof-corpus.jsonl` | corpus de disprovas hash-encadeado colhido das recusas REAIS (exec-ledger `kind:refused` + bypass-ledger `blockedByDenyHook:true` estrito) |
| `real-lessons.jsonl` | leis III.d sintetizadas do corpus real, validadas por previsão temporal (treino explica 100%, futuro ≥2 previstos), `neverAGate:true` |
| `held-out-v1.json` | partição held-out pré-registrada (sha256(id+"darwin-godel-heldout-v1") top-20%) MATERIALIZADA sobre os invariantIds reais |
| `real-briefing.md` | briefing III.c (L1 leis + L2 contra-exemplos), held-out excluído nas DUAS camadas |
| `real-harvest-stats.json` | reconciliação completa linha-a-linha + digests (zero caps silenciosos) |

HONESTIDADE DE ESCOPO: recusas da superfície de ferramentas, NÃO rejeições do caminho
de promoção do expand_self (III.a engine-side segue pendente, sob lock concorrente).
