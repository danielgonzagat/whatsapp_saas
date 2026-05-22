# PCI.4 — Interfaces Canônicas dos Gates PULSE

> **Documento canônico imutável.** Onda 0 / UTP-PCI-004. Define cada gate
> PULSE relevante ao organismo cognitivo: entrada, saída, modo de falha,
> transição log_only → hard_fail.
>
> **Nome canônico**: `kloel-cognitive-organism-pci-4`
> **Versão**: `1.0.0`
> **Status**: `frozen` após selo final em UTP-PCI-008.

---

## 1. Princípio

Gates PULSE são as **defesas estruturais** do organismo. Cada gate é uma
função pura do estado em snapshot. Retorna `PASS` ou `FAIL` com motivo
estruturado. Em modo `log_only` o resultado é apenas registrado; em modo
`hard_fail` o resultado bloqueia operação downstream.

Gates falham **fechado**: ausência de evidência clara é `FAIL`, não `PASS`.

## 2. Schema Canônico de Gate

```
{
  gateName: <string canônica conforme §3>
  inputSchema: <descrição semântica do estado a inspecionar>
  outputSchema: {
    status: "PASS" | "FAIL"
    reason: <string estruturada quando FAIL>
    evidence: <array de eventIds, refs, ou snapshots que sustentam o veredicto>
    measuredAt: <ISO-8601>
    measuredBy: <processor identifier>
    mode: "log_only" | "hard_fail"
  }
  failureMode: "log_only" | "hard_fail"
  failurePolicy: <descrição de o que acontece quando status === "FAIL" em hard_fail>
  introducedAtWave: <onda em que o gate começa a rodar (mesmo que log_only)>
  hardFailAtWave: <onda em que o gate transiciona para hard_fail>
  layer: <camada do plano que define este gate>
}
```

## 3. Gates Canônicos

### 3.1 `no-roleplay`

**Camada IV** (PULSE Identity/Reality Gates) — UTP-PULSE-001.

- **Entrada**: payload completo do ABI a ser enviado ao LLM.
- **Saída**: `PASS` se nenhuma string contém instrução comportamental
  (`"você é"`, `"seu papel"`, `"sempre"`, `"nunca"`, `"tom"`, `"formato"`,
  persona declarations, few-shot como template); `FAIL` caso contrário com
  apontamento da string ofensora.
- **Mode at intro**: `log_only` (Onda 1).
- **Hard fail at**: Onda 2.
- **Failure policy** (hard_fail): bloqueia chamada ao LLM, força retry com
  builder corrigido, registra evento `pulse.gate_failed`.
- **Por quê**: B1 — proibição absoluta de instrução comportamental ao LLM.

### 3.2 `lineage-integrity`

**Camada IV** — UTP-PULSE-002.

- **Entrada**: estado completo do Lineage Ledger.
- **Saída**: `PASS` se hash-chain íntegro, primeira entrada é `lineage.genesis`
  com payload canônico, `canonicalName == "Kloel"`; `FAIL` com apontamento de
  divergência.
- **Mode at intro**: `log_only` (Onda 1).
- **Hard fail at**: Onda 1 (mesmo na introdução). Crítico demais para
  log_only.
- **Failure policy**: muda `lineageStatus` no ABI para `"compromised"`,
  bloqueia novas projeções, dispara alerta humano via
  `evolution.gap_detected`.
- **Por quê**: B11, B16 + PCI.3 §3.4.

### 3.3 `identity-projection`

**Camada IV** — UTP-PULSE-003.

- **Entrada**: snapshot do `identityProjection` no ABI + audience pretendida.
- **Saída**: `PASS` se projeção bate audience (ex.: audience `public` não
  expõe etimologia/origem); `FAIL` com apontamento de vazamento.
- **Mode at intro**: `log_only` (Onda 1).
- **Hard fail at**: Onda 2.
- **Failure policy**: bloqueia envio do ABI ao LLM, força projeção corrigida.
- **Por quê**: E.10 — origem espiritual nunca contamina audience pública.

### 3.4 `no-overclaim`

**Camada IV** — UTP-PULSE-009 (já existe parcialmente em PULSE atual; reforçar).

- **Entrada**: lista de capabilities declaradas no ABI + runtime evidence
  registrada.
- **Saída**: `PASS` se toda capability declarada tem `runtimeEvidencePct > 0`;
  `FAIL` com apontamento de capability sem evidência.
- **Mode at intro**: `log_only` (Onda 1).
- **Hard fail at**: Onda 2.
- **Failure policy**: rebaixa capability para `developing`, remove do ABI
  até evidência aparecer.
- **Por quê**: V7, R36 — sem overclaim, integridade epistêmica.

### 3.5 `truth-mode-honesty`

**Camada IV** — UTP-PULSE-004.

- **Entrada**: qualquer evento ou campo cognitivo com `truthMode` declarado.
- **Saída**: `PASS` se conteúdo bate modo (observed = fato direto, inferred =
  derivado de modelo, projected = especulativo); `FAIL` se mistura é
  detectada.
- **Mode at intro**: `log_only` (Onda 1).
- **Hard fail at**: Onda 3.
- **Failure policy**: rejeita persistência do evento, força reclassificação
  ou nova emissão correta.
- **Por quê**: PCI.5 — convenção universal de truthMode.

### 3.6 `origin-immutability`

**Camada IV** — UTP-PULSE-005.

- **Entrada**: snapshot do Genesis Event + tentativa de mutação.
- **Saída**: `PASS` se nenhuma mutação ao Genesis foi detectada (canonicalName,
  etymology, origin, steward, inviolable, evolvable inalterados); `FAIL` se
  qualquer mutação ocorreu.
- **Mode at intro**: `hard_fail` desde Onda 1. Crítico desde o nascimento.
- **Failure policy**: bloqueia operação, dispara alerta humano máximo,
  registra `evolution.gap_detected` com tag de origem.
- **Por quê**: PCI.3 §2.2, B16, R36.

### 3.7 `evidence-provenance`

**Camada IV** — UTP-PULSE-006.

- **Entrada**: evento sendo persistido no spine.
- **Saída**: `PASS` se `provenance` completa (source, processor,
  processorVersion, schemaVersion, environment); `FAIL` se ausente ou
  incompleto.
- **Mode at intro**: `log_only` (Onda 1).
- **Hard fail at**: Onda 2.
- **Failure policy**: rejeita persistência, força nova emissão com
  provenance completa.
- **Por quê**: PCI.1 §4 — campos obrigatórios universais.

### 3.8 `prompt-leakage`

**Camada IV** — UTP-PULSE-007.

- **Entrada**: payload final indo para o LLM (qualquer string em qualquer
  campo).
- **Saída**: `PASS` se nenhum padrão de instrução textual está presente em
  qualquer string serializada; `FAIL` com apontamento.
- **Mode at intro**: `log_only` (Onda 1) com captura ampla de regex.
- **Hard fail at**: Onda 2.
- **Failure policy**: bloqueia chamada ao LLM.
- **Por quê**: B1, V1, V2.

Padrões detectados (lista expansível):

- `\byou are\b`, `\bvocê é\b`, `\btu és\b`
- `\byour role\b`, `\bseu papel\b`
- `\balways\b.*\bnever\b`, `\bsempre\b.*\bnunca\b`
- `\bact as\b`, `\baja como\b`
- `\brespond in\b.*\b(json|markdown|format)\b`, `\bresponda em\b.*\b(json|markdown|formato)\b`
- few-shot patterns (User: ... / Assistant: ...) em system payload
- persona declarations ("Kloel é um vendedor", etc.)

### 3.9 `protected-files-firewall`

**Camada XXXII** (Composed Self-Evolution) — UTP-EVOL-008.

- **Entrada**: diff do PR/commit a ser aceito.
- **Saída**: `PASS` se nenhum arquivo da lista protegida foi tocado por IA;
  `FAIL` com apontamento.
- **Mode at intro**: `hard_fail` desde Onda 1. Defesa absoluta.
- **Failure policy**: bloqueia commit/PR. Subagent é re-despachado com
  rebriefing.
- **Lista protegida** (autoridade: `CLAUDE.md`):
  - `CLAUDE.md`, `AGENTS.md`
  - `docs/design/KLOEL_VISUAL_DESIGN_CONTRACT.md`
  - `docs/design/KLOEL_ANTI_HARDCODE_CONTRACT.md`
  - `ops/*.json`, `ops/kloel-design-tokens.json`
  - `scripts/ops/check-*.mjs`, `scripts/ops/lib/*.mjs`
  - `.husky/pre-push`
  - `.github/workflows/ci-cd.yml`
  - `backend/eslint.config.mjs`, `frontend/eslint.config.mjs`,
    `worker/eslint.config.mjs`
  - `backend/src/lib/ai-models.ts`
  - `scripts/pulse/no-hardcoded-reality-audit.ts` (PULSE governance surface)
- **Por quê**: governança humana absoluta + R36.

### 3.10 `codacy-rigor-enforcer`

**Camada XXXII** — UTP-EVOL-009.

- **Entrada**: estado de configuração Codacy (live + canonical) + diff do PR.
- **Saída**: `PASS` se nenhuma redução de MAX-RIGOR LOCK foi detectada
  (regra desativada, pattern desativado, exclude-path adicionado, threshold
  fraco); `FAIL` com apontamento.
- **Mode at intro**: `hard_fail` desde Onda 1.
- **Failure policy**: bloqueia commit/PR. Reaplica estado canônico via
  `npm run codacy:enforce-max-rigor` se autorizado.
- **Padrões proibidos detectados**:
  - `biome-ignore`, `nosemgrep`, `eslint-disable`, `@ts-ignore`,
    `@ts-expect-error`, `@ts-nocheck`, `codacy:disable`, `codacy:ignore`,
    `NOSONAR`, `noqa` (CLAUDE.md regra Codacy item 4)
  - `[codacy skip]`, `[skip codacy]`, `[ci skip]`, `[skip ci]` (item 5)
- **Por quê**: regra Codacy MAX-RIGOR LOCK em `CLAUDE.md`.

### 3.11 `ecosystem-privacy-guard`

**Camada XXVII** (Ecosystem Intelligence) — Família ECOSYS, INCENT.

- **Entrada**: payload de `wisdomContext` ou recomendação cruzada.
- **Saída**: `PASS` se nenhum dado identificável atravessa fronteira de
  workspace (k-anonimato respeitado, diff-privacy noise aplicado, opt-out
  honrado); `FAIL` com apontamento.
- **Mode at intro**: `log_only` (Onda 3 — quando WISDOM começa).
- **Hard fail at**: Onda 7 (antes de ECOSYS dispatch).
- **Failure policy**: bloqueia projeção/recomendação, força reabstração.
- **Por quê**: R14, R31, B0.11, B0.18.

### 3.12 `internal-knowledge-leak-guard`

**Camada XXV** (Agency Intelligence) — UTP-AGENCY-007.

- **Entrada**: contexto sendo construído para um cliente em workspace de
  agência.
- **Saída**: `PASS` se nenhum dado de outro cliente da mesma agência aparece;
  `FAIL` com apontamento.
- **Mode at intro**: `log_only` (Onda 7 — quando AGENCY começa).
- **Hard fail at**: Onda 7 (mesmo wave, antes de promoção operational).
- **Failure policy**: bloqueia entrega do contexto, força isolamento.
- **Por quê**: R29 (zero vazamento entre clientes).

### 3.13 `platform-bias-monitor`

**Camada XXXIV** (Incentive Integrity) — UTP-INCENT-004.

- **Entrada**: histórico de recomendações cruzadas + receita interna
  associada.
- **Saída**: `PASS` se peso médio de recomendações com receita interna não
  excede peso médio de recomendações sem receita interna por margem
  estatisticamente significativa; `FAIL` se viés detectado.
- **Mode at intro**: `log_only` (Onda 9 — quando INCENT começa).
- **Hard fail at**: Onda 9 (antes de promoção productionReady).
- **Failure policy**: bloqueia novas recomendações cruzadas, força
  recalibração.
- **Por quê**: R38, B0.18.

### 3.14 `disclosure-engine`

**Camada XXXIV** — UTP-INCENT-005.

- **Entrada**: recomendação cruzada sendo emitida + flag de vínculo
  comercial Kloel↔parte recomendada.
- **Saída**: `PASS` se vínculo comercial está disclosed quando aplicável;
  `FAIL` se omitido.
- **Mode at intro**: `log_only` (Onda 9).
- **Hard fail at**: Onda 9 (mesma wave).
- **Failure policy**: bloqueia recomendação até disclosure ser emitido.
- **Por quê**: R38, B0.18.

## 4. Modo de Falha

### 4.1 `log_only`

- Gate executa.
- Resultado é registrado em `pulse.gate_passed` ou `pulse.gate_failed`.
- Operação downstream NÃO é bloqueada.
- Dashboard de PULSE mostra contagem de FAIL.
- Usado em fases iniciais para calibrar gate sem regredir produção.

### 4.2 `hard_fail`

- Gate executa.
- Em `FAIL`, operação downstream É bloqueada.
- Evento `pulse.gate_failed` é emitido com `mode: "hard_fail"`.
- Pode ativar circuit breaker temporário se taxa de falha excede threshold.
- Usado em fases maduras para garantia estrutural.

### 4.3 Transição log_only → hard_fail

UTP-PULSE-008 orquestra a transição. Critérios para transição:

- ≥3 ondas de execução em `log_only` sem regressão.
- Taxa de FAIL em production estável e baixa (idealmente < 0.1%).
- Falsos positivos analisados e ajustes aplicados.
- ADR ou autorização do dono.

## 5. Ordem de Execução de Gates

Em pipeline padrão de chamada ao LLM:

1. `lineage-integrity` (sempre, primeiro — sem identidade não há operação)
2. `evidence-provenance` (todo evento entrando no spine)
3. `truth-mode-honesty` (toda saída cognitiva)
4. `origin-immutability` (sempre que Genesis é referenciado)
5. `no-overclaim` (montagem do ABI)
6. `identity-projection` (montagem do ABI)
7. `prompt-leakage` (último checkpoint antes do LLM)
8. `no-roleplay` (mesmo checkpoint, paralelo a prompt-leakage)

Em pipeline de PR/commit:

1. `protected-files-firewall` (sempre, primeiro)
2. `codacy-rigor-enforcer` (sempre, segundo)

## 6. Compromissos de UTPs Consumidoras

- Toda UTP de Camada IV (PULSE-001..009) referencia este documento.
- Toda UTP que monta payload para LLM passa pelos gates aplicáveis antes de
  emitir.
- Toda UTP de Camada XXXII referencia gates `protected-files-firewall` e
  `codacy-rigor-enforcer`.
- Subagent que cria gate novo sem ADR é rejeitado.

## 7. Tabela Resumo

| Gate | Camada | UTP | Intro | Hard fail | Política em FAIL |
|---|---|---|---|---|---|
| `no-roleplay` | IV | PULSE-001 | log_only @ Onda 1 | Onda 2 | bloqueia chamada LLM |
| `lineage-integrity` | IV | PULSE-002 | hard_fail @ Onda 1 | Onda 1 | lineageStatus=compromised |
| `identity-projection` | IV | PULSE-003 | log_only @ Onda 1 | Onda 2 | bloqueia ABI |
| `no-overclaim` | IV | PULSE-009 | log_only @ Onda 1 | Onda 2 | rebaixa capability |
| `truth-mode-honesty` | IV | PULSE-004 | log_only @ Onda 1 | Onda 3 | rejeita persistência |
| `origin-immutability` | IV | PULSE-005 | hard_fail @ Onda 1 | Onda 1 | bloqueia + alerta |
| `evidence-provenance` | IV | PULSE-006 | log_only @ Onda 1 | Onda 2 | rejeita persistência |
| `prompt-leakage` | IV | PULSE-007 | log_only @ Onda 1 | Onda 2 | bloqueia chamada LLM |
| `protected-files-firewall` | XXXII | EVOL-008 | hard_fail @ Onda 1 | Onda 1 | bloqueia commit/PR |
| `codacy-rigor-enforcer` | XXXII | EVOL-009 | hard_fail @ Onda 1 | Onda 1 | bloqueia commit/PR |
| `ecosystem-privacy-guard` | XXVII | ECOSYS | log_only @ Onda 3 | Onda 7 | bloqueia projeção |
| `internal-knowledge-leak-guard` | XXV | AGENCY-007 | log_only @ Onda 7 | Onda 7 | bloqueia contexto |
| `platform-bias-monitor` | XXXIV | INCENT-004 | log_only @ Onda 9 | Onda 9 | bloqueia recomendação |
| `disclosure-engine` | XXXIV | INCENT-005 | log_only @ Onda 9 | Onda 9 | bloqueia recomendação |

---

**Fim de PCI.4.** Hash a ser registrado em `docs/contracts/pci/CHECKSUMS.txt`
após congelamento da Onda 0.
