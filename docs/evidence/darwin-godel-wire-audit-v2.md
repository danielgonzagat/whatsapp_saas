# Auditoria do Fio v2 — O LAÇO FECHOU (fusão III.a + III.c + III.e, dois agentes, zero colisão)

Auditor: claude-genesis (front `darwin-godel-preregistration`). Auditado: fio `atomic-edit-darwin-godel-thread`
(codex-gpt5), commits `41309ee4e` (shadow gate + briefing engine-side), `03efa4387`, `c32ced208`.
Método: leitura read-only do subtree sob lock + execução INDEPENDENTE dos proofs + re-verificação
da cadeia do corpus pelo kernel. Zero bytes meus no subtree do lock.

## O FATO CENTRAL

O laço completo do Movimento III está ENGINE-WIRED e JÁ DISPAROU:

```
reject de expand_self → witness gate-red recomputável (carrier do NegativeActionProof, readLoci)
  → append em .atomic/disproof-corpus.jsonl VIA O KERNEL de atomic-edit-evolution (subprocesso, contrato stdin-JSON)
  → briefing-da-próxima-rejeição devolvido ao propositor NA resposta do reject
  → próxima proposta carrega preflightDisproofBriefing (digest recomputado; FORJA RECUSADA)
  → atomic_shadow_gate (III.e) disponível como sonda preflight read-only
```

**Corpus canônico do engine: EXISTE e tem 7 witnesses reais / 7 paredes, cadeia íntegra
(head `ae286b837669…`), verificada por mim com o kernel** (`--verify-corpus-jsonl`). As paredes
são rejeições reais de gates do caminho de promoção (invariantId = comando do gate reprovado,
região = candidateId) — inclui exercício via fixture de reject (gate dedicado
`self-evolution-reject-fixture.proof.mjs`, agora mandatório no lattice).

## Verificação independente (rodei eu; 18/18 verde)

- `gates/self-evolution-disproof-consumer.proof.mjs` — **8/8**. Destaques provados:
  - reject deriva recibo real ANTES do rollback e grava a disprova DEPOIS (split 0d: rejects arquivados);
  - witness gate-red é RECOMPUTÁVEL (dentes da FASE 0.2 fluem ao corpus);
  - append usa o harness externo determinístico + atomicWrite + caminho canônico;
  - **R3 MORTO**: "candidate semantic operator metric is no longer parent-clamped" (noMathMax:true).
- `gates/self-evolution-disproof-briefing.proof.mjs` — **10/10**. Destaques:
  - verify-before-select; briefing/shadow são read-only (não arquivam, não reparam, não admitem);
  - `atomic_expand_self` anexa o digest do briefing consumido ao recibo E **recusa digest forjado**.
- Ambos os proofs são MANDATÓRIOS no lattice (server-tools-self.ts:62-63) — o laço protege a si mesmo.
- Dist rebuildado (server.js + server-tools-disproof.js, 22:20Z); registro em server.ts:57,186.

## Integração entre os dois fios (colaboração concorrente, zero conflito)

- O engine consome o MEU kernel (`disproof-corpus-harness.mjs`) por subprocesso nos DOIS lados
  (producer em server-tools-self.ts e tools em server-tools-disproof.ts) — hash-compatibilidade
  garantida por construção (mesmo código julga).
- `c32ced208`: o codex melhorou o MEU runner (`run-real-harvest.mjs`, 10 linhas) para conformidade
  com a constituição (vocabulário deny-*, ledger path por env fail-closed) MANTENDO meu proof
  33/33 verde. Meu commit da colheita (`36b172251`) intacto.
- Dois corpora coexistem por desenho: engine (`.atomic/disproof-corpus.jsonl`, paredes do caminho
  de promoção, 7) e colheita-ledger (`.atomic/evolution/real-disproof-corpus.jsonl`, paredes da
  superfície de ferramentas, 6.778). As tools aceitam corpusText INLINE — consumidores escolhem;
  nenhuma mistura silenciosa.

## Ressalvas que PERSISTEM (sem enfeite)

1. **R2 — canal mole ainda constante**: publicScore:1, holdoutScore:1, medianLatencyMs:1000
   hardcoded (server-tools-self.ts:636-662). O A/B III.f precisa de canal mole real ou da
   declaração explícita de que M3 sai de outra fonte.
2. Convenções de digest distintas coexistem: shadowGateDigest/proposalDigest usam stableJson
   (chaves ordenadas); o corpus usa canonicalSha256 (ordem de inserção). Namespaces separados,
   sem unsoundness — mas interop exige atenção (não misturar).
3. `lessons` entram nas tools sem verificação de cadeia/neverAGate na borda (o kernel formata,
   não julga). Contido: briefing é guidance-only e não toca admissão; ainda assim, o consumidor
   engine-side de LEIS deveria validar via lesson-harness `--verify-lessons-jsonl` quando passar
   a usá-las.
4. Genealogia do arquivo evolutivo segue ligando RECIBOS, não linhagem de variantes
   (parent.parentId=null por entrada) e proofCoverage 40→39 da auditoria anterior segue valendo.

## O que isto destrava (mapa)

- **III.f A/B real**: arquiteturalmente DESBLOQUEADO — máquina completa existe ponta-a-ponta.
  Falta: canal mole real (R2), propositor LLM congelado (modelo/temperatura = decisão do Daniel),
  held-out aplicado ao corpus engine quando os clusters maturarem (≥3 por clusterKey).
- **III.d sobre o corpus engine**: aguarda volume (7 witnesses; clusters ainda <3).
- Ensaio de consumo v2 (meu, tool-surface) segue na fila com métricas redesenhadas.
