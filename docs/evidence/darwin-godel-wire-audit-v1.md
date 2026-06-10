# AUDITORIA v1 — O Fio Darwin⟷Gödel (Estágio 0a) — verificação independente

**Data:** 2026-06-09T20:00Z · **Auditor:** claude-genesis (front `darwin-godel-preregistration`)
**Auditado:** fio ligado pelo front `atomic-edit-darwin-godel-thread` (owner `codex-gpt5`),
`server-tools-self.ts` (sha256 no momento da auditoria:
`45a241ee1dd0672818ff16017c8ad9860161a6bf557d5ea526a4ae2ede8084fb`, 1015 linhas, NÃO commitado).

## VEREDITO: O LAÇO GIROU — com 4 ressalvas documentadas

### Confirmado com recibo (leitura direta minha, não relatório de agente)

1. **Call-path real existe** — `decidePromotion` é invocado por SUBPROCESSO
   (`runSelfEvolutionHarness('--receipt', …)`, l.650), não por import. Por isso
   `rg "decidePromotion" --glob "*.ts"` retorna vazio: a ilha fechou por spawn, não por símbolo.
2. **Fatos do candidato RE-DERIVADOS (L4 parcial ✓):** `sourceSha256`/`snapshotDigest`
   re-hasheados dos snapshots pré/pós-edição reais (l.586-649); `proofCoverage` = contagem de
   gates realmente executados e passados (`proofGateFacts`, com hash de stdout/stderr como
   evidência); rejeição → rollback byte-exato (l.960-967).
3. **Arquivo evolutivo PERSISTE e a cadeia RECOMPUTA (verificação por terceiro — eu):**
   ```
   jq -Rs '{archiveText: .}' scripts/mcp/atomic-edit/self-evolution-archive.jsonl \
     | node scripts/mcp/atomic-edit/self-evolution-harness.mjs --verify-archive-jsonl
   → ok: true · archiveId: atomic-real-self-expansion-archive-v1 · entryCount: 1
     decision: promote · headArchiveEntrySha256: c7631f4534bfde9f9748bf0c1be2b11f972f0b94b723cbff7e55be6cce705dff
     receiptSha256: cc9a2d3c6305b91e6ef20ffa3087a8d6e28c9867f00e1e947e7eb64c01cbfed3
   ```
   **Primeira auto-modificação real admitida por prova com recibo recalculável arquivado.**
4. **Sem enfraquecimento de gate detectado:** lattice intacto, ceilings de segurança absolutos
   em 0 (`bypassesIntroduced`/`invalidCommits`/`receiptForgeryAccepted`), monotonicidade de
   segurança roda ANTES das provas (l.934) e ratchet pós-promoção (l.973).
5. **Caminho correto do contrato CLI do harness:** stdin é JSON (`{archiveText}`), não JSONL cru —
   primeira tentativa de verificação minha falhou por contrato errado MEU; corrigida e documentada.

### Ressalvas (nenhuma é enfraquecimento; todas são DISTÂNCIAS abertas)

| # | Ressalva | Locus | Consequência |
|---|---|---|---|
| R1 | **Parent gates são DECLARADOS** (`status: 'passed'` por construção, l.616), não re-executados | `buildRealSelfExpansionPromotionReceipt` | baseline do parent é axiomático (motor em execução presumido verde). Aceitável como bootstrap; documentar como premissa, não como medição. |
| R2 | **Canal mole é CONSTANTE:** `publicScore: 1, holdoutScore: 1, medianLatencyMs: 1000` hardcoded p/ parent E candidato | l.607-609, l.629-631 | `holdout.regression` e `latency.regression` NUNCA podem disparar. O split duro/mole do Estágio 0d com medição real de capacidade **não está construído** — o canal mole é scaffold. |
| R3 | **`Math.max(parent, candidate)` em semanticOperators** (l.597-600) | idem | `semanticOperators.regression` vácua por construção — métrica que não pode regredir não é métrica. |
| R4 | **III.a segue ABERTO:** reject → rollback + string de rejections (l.960-967); **zero `DisproofWitness`** construído/persistido | caminho de reject | a rejeição ainda morre como veto. A disprova-como-gradiente continua sendo a vaga vazia. |

### Riscos operacionais

- O fio está **NÃO COMMITADO** num subtree rastreado (`git status`: `M server-tools-self.ts`,
  `M` 3 gates, `??` 2 proofs novos + arquivo). Árvore compartilhada com committer concorrente:
  trabalho não-commitado pode ser revertido. Escalação: o dono do lock deve commitar.
- L5 (catraca-comportamento vs contagem) **não foi exercitada** — só o ataque A5 do catálogo
  pré-registrado (`docs/evidence/darwin-godel-braco-ab-catalogo-v1.md`) decide.

### Estado dos critérios do lock `atomic-edit-darwin-godel-thread`

| Critério declarado | Estado verificado |
|---|---|
| atomic_expand_self permanece fail-closed | ✓ (rollback em proof-fail E em reject) |
| PromotionReceipt usa fatos re-derivados de snapshots/proofs reais | ✓ candidato / R1 parent / R2-R3 métricas |
| arquivo evolutivo persistido e verificável | ✓ (verificado por terceiro acima) |
| sem enfraquecer gates | ✓ (nenhum sinal) |
