# PRÉ-REGISTRO — HumanEval LIFT v1: atomic aumenta o pass@ do modelo congelado que o utiliza?

Commitado ANTES de qualquer despacho (o commit-hash é o carimbo). Deriva do III.f v1.1
(`darwin-godel-iiif-real-v1.md` §Resultados v1.1, commit `f8dd9e035`) — em especial da lição (d):
**o canal escalar não é neutro**, logo o desenho exige braço-controle de resample cego.

## Pergunta

Com o modelo CONGELADO e o juiz formal (runner engine-side, zero chamadas de modelo), o laço
verificado do atomic — recusa com **disprova recomputável digest-bound** (counterexample + lição +
proposalDigest) — eleva o pass@ do modelo acima de (a) resample cego e (b) feedback escalar?
E (tese-forte de Daniel): **haiku+atomic ≥ opus sem atomic?**

## Divisão de trabalho (integração entre agentes, por call-path)

- **Juiz/é do engine (lock codex-gpt5, NÃO mutado por mim):** `scripts/mcp/atomic-edit/human-eval-lift-runner.mjs`
  — executa os testes Python (sandbox `-I -B`, stdin-exec), computa pass@ por braço, emite
  proof-feedback packages digest-bound (`validateProofFeedbackPackage`) e repair prompts, e
  IMPÕE a taxonomia de claims (raw ≠ tool-augmented; forja de digest recusada). Gate:
  `gates/human-eval-lift-protocol.proof.mjs`.
- **Despachante (meu front `atomic-edit-evolution/**`):** `humaneval-dispatch.mjs` — materializa
  arquivos de despacho byte-determinísticos do dataset, coleta saídas estruturadas dos
  propositores congelados (Workflow agents com model override), normaliza, monta samples JSONL
  e invoca o runner. O despachante NUNCA julga; o juiz NUNCA chama modelo.

## Dataset

HumanEval canônico (OpenAI), 164 tarefas, `data/HumanEval.jsonl` sha256
`1d49078ba3e2b196b9344535bef34a43021f038fad9561d6ee7c53450609a6a2`, baixado de
github.com/openai/human-eval (commitado em `.atomic/evolution/humaneval-v1/`).

## Desenho

- **Modelos congelados**: `haiku` (fraco, primário) e `opus` (forte, só baseline — a barra de P3).
  Propositores = subagentes Workflow com model override + StructuredOutput `{codigoPython}`;
  invólucro byte-idêntico entre braços/modelos; sem ferramentas além de Read do próprio arquivo
  de despacho; 1 amostra por tentativa (sem controle de temperatura — variância declarada).
- **Geração 1 (compartilhada por desenho, DESVIO declarado do iiif):** 1 tentativa por tarefa por
  modelo. Os braços de retry partem do MESMO conjunto de falhas de g1 (desenho pareado — remove
  variância de amostragem entre braços; é exatamente a variável feedback que fica livre).
- **Braços de retry (apenas tarefas que falharam em g1; budget total = 2 tentativas):**
  - `cego` — re-amostra com o MESMO prompt de g1 (controle de sorte-de-resample; lição do III.f).
  - `scalar` — prompt de g1 + linha fixa "SUA TENTATIVA ANTERIOR FALHOU NOS TESTES." (só passou/falhou).
  - `proof` — o repair prompt emitido pelo RUNNER, verbatim (digest-bound: package_sha256,
    invariant, lesson, proposal_digest, counterexample recomputável).
- **Linha final por braço e tarefa**: g1 passou → completion de g1 (budget 1 consumido); g1 falhou →
  completion do retry do braço (budget 2). Linhas do braço proof retried carregam
  `proof_feedback_package` + `proof_feedback_package_sha256` (verbatim do runner),
  `repair_prompt_sha256` e `atomic_receipt_sha256` = sha256 do arquivo de repair-prompts emitido
  (recomputável do artefato commitado); linhas pass-through do braço proof carregam
  `feedback_source: "none"` explícito.
- **Normalizador de saída (determinístico, idêntico p/ todos os braços/modelos, declarado):**
  (1) remove cercas markdown se presentes; (2) se o texto contém `def <entry_point>(` → completion =
  `"    pass\n\n"` + texto (redefinição completa após o stub); (3) senão, se a 1ª linha não-vazia não
  é indentada → indenta TODAS as linhas não-vazias com 4 espaços (corpo plano); (4) senão usa como
  veio. Nenhuma outra correção; código quebrado é julgado e falha.
- **Execução dos testes**: SEMPRE via o runner do engine dentro do envelope atomic_exec (sandbox sem
  rede, escrita confinada ao effectRoot), `--timeout-ms 6000`.
- **attempt_budget honesto**: baseline=1, braços de retry=2 → `controls.sameAttemptBudget=false` é
  esperado e declarado: proof-vs-baseline É a alegação de produto (atomic adiciona uma rodada
  verificada); as comparações CONTROLADAS de mesmo budget são proof-vs-cego e proof-vs-scalar.

## Métricas

pass@final por braço (runner `arms.*.passAt1` p/ baseline/scalar/proof; cego via
`--emit-feedback-packages --source-arm cego` → falhas); recuperação pareada no conjunto F de
falhas de g1 (por braço: recuperadas/|F|); taxonomia de claims do runner no report final com
`--claim-official-humaneval` (espera-se `toolAugmentedHumanEvalClaim` para o arquivo haiku-lift;
NUNCA reivindicar `rawHumanEvalClaim` para braços com feedback).

## Predições (antes de rodar)

- **P1 (transferência real da disprova):** recuperação(proof) > recuperação(cego) no conjunto F.
- **P2 (conteúdo > escalar):** recuperação(proof) > recuperação(scalar).
- **P3 (tese-forte, manchete):** pass@final(haiku, proof, budget 2) ≥ pass@1(opus, baseline).
- **P4 (bookkeeping/honestidade):** 100% das linhas proof-retried com package digest válido
  (`validateProofFeedbackPackage` ok) e o report final com `toolAugmentedHumanEvalClaim=true`
  e `rawHumanEvalClaim=false`.

## Morte da tese nesta arena

- **D1:** recuperação(proof) ≤ recuperação(cego) ⇒ a disprova formal não transfere neste formato —
  registrar sem reinterpretar e voltar ao desenho.
- **D2 (subpotência):** |F_haiku| < 8 ⇒ comparação entre braços sem poder estatístico — declarar;
  P3 ainda é reportável (pass@ globais).

## Caveats pré-declarados

1. Propositores são subagentes Claude Code (não API crua): há scaffolding de harness — IDÊNTICO
   entre braços (invólucro byte-idêntico), então os DELTAS entre braços são válidos; o nível
   absoluto de pass@1 não é comparável a leaderboards e NÃO será reivindicado como score oficial.
2. 1 amostra/tentativa, sem temperatura controlada; n entre-braços = |F_haiku| (pareado).
3. "Aumentar a inteligência fixa" operacionalizado honestamente: ninguém altera pesos —
   a alegação é **modelo+atomic (tool-augmented) > modelo-só (raw)**, na taxonomia do runner.
4. Artefatos isolados em `.atomic/evolution/humaneval-v1/`; despachante único serializado por lock
   `humaneval-v1-dispatcher`; recusas/segredos: nada de rede dentro do envelope de julgamento.

## Resultados

(preenchidos abaixo desta linha após a rodada; nada acima será editado retroativamente.)

### Rodada completa (2026-06-09/10, despachante único, lock `humaneval-v1-dispatcher`)

**Integridade:** 164/164 propostas haiku g1 + 72/72 retries (3 braços × 24) + 164/164 opus g1
(colhido em 6 lotes por rate limit do servidor; falha de infra NUNCA julgada — re-despachada);
juiz = runner engine-side em todas as execuções (zero execução de teste fora do envelope);
invólucro `7cf2b96e…` byte-idêntico; dataset sha `1d49078b…` (canônico).

**Números (todos recomputáveis de `work/lift-report-haiku.json` e `work/packages-*.json`):**

| braço (haiku congelado) | pass | % |
|---|---|---|
| baseline (1 tentativa) | 140/164 | 85.4% |
| cego (retry sem informação) | 151/164 | 92.1% |
| scalar (retry com "FALHOU") | 152/164 | 92.7% |
| **proof (retry com disprova digest-bound)** | **154/164** | **93.9%** |
| opus baseline (1 tentativa) | 161/164 | 98.2% |

Recuperação pareada no conjunto F (24 falhas de g1): **proof 14/24 > scalar 12/24 > cego 11/24**.
Deltas: proof−baseline = **+8.5pp**; proof−cego = +1.8pp; proof−scalar = +1.2pp.

**Vereditos pré-registrados:**

- **P1 (proof > cego): CONFIRMADA EM DIREÇÃO** (14 vs 11 recuperações; 93.9% vs 92.1%).
  HONESTIDADE ESTATÍSTICA: com n=24 pareado, a margem de 3 tarefas NÃO atinge significância
  convencional — é sinal direcional, não veredito definitivo. Réplicas (seeds) ficam para o v2.
- **P2 (proof > scalar): CONFIRMADA EM DIREÇÃO** (14 vs 12; mesma ressalva de n).
- **P3 (haiku+proof ≥ opus baseline): REFUTADA.** 154 < 161. O opus quase satura a arena
  (98.2%, 3 falhas: HumanEval/30, 41, 91) — o degrau entre tiers (12.8pp) excede o lift (+8.5pp).
  Registrado sem reinterpretação. Para uma tese-forte testável, a arena v2 precisa de headroom
  no modelo forte (benchmark mais difícil) — não desta arena.
- **P4 (bookkeeping/honestidade): CONFIRMADA.** Report final: `toolAugmentedHumanEvalClaim=true`,
  `rawHumanEvalClaim=false`, 24/24 pacotes `validateProofFeedbackPackage` ok, 100% receipts
  (`f1c89095…`) e repair-prompt-shas vinculados, `sameFixedModel=true`.
- **D1 não disparou** (proof > cego); **D2 não disparou** (|F|=24 ≥ 8).

**O que esta rodada estabelece (sem inflar):**

1. **O laço completo existe e é honesto por construção**: modelo congelado → juiz formal
   engine-side → disprova recomputável digest-bound → repair prompt vinculado → re-julgamento —
   com taxonomia que RECUSA estruturalmente confundir "raw HumanEval" com "tool-augmented".
   Até onde sabemos, é a primeira execução do HumanEval canônico inteiro onde cada item de
   feedback ao modelo carrega um digest recomputável e o claim final é validado por um gate.
2. **+8.5pp de lift verificado no modelo fraco com UMA rodada de disprova** (85.4→93.9),
   recuperando 14/24 falhas — e o ranking proof > scalar > cego bate com a predição do III.f
   v1.1 (canal escalar ≠ neutro; conteúdo de disprova > sinal escalar > resample), agora em
   benchmark real, ainda que com margem pequena.
3. **Limite honesto**: o lift não cruza o degrau entre tiers nesta arena saturada (P3 refutada).
   A alegação verdadeira é "atomic eleva o modelo que o utiliza", NÃO "atomic torna um modelo
   fraco equivalente a um forte".

**Caveats finais (além dos pré-declarados):** 1 amostra/braço (sem réplicas de seed); proposers
são subagentes Claude Code (scaffolding idêntico entre braços; nível absoluto não comparável a
leaderboards — e o pass@1 do opus aqui, 98.2%, reflete isso); margens entre braços de retry
pequenas com n=24.

---

## PRÉ-REGISTRO DA EMENDA v1.1 — réplicas de seed dos braços de retry (carimbo = commit desta seção, ANTES de qualquer despacho de réplica)

**Objetivo:** converter os sinais direcionais P1/P2 em teste com poder estatístico, sem mudar
NADA do desenho: mesmas 24 falhas fixas de g1, mesmos arquivos de despacho congelados
(`work/dispatch-retry/`, invólucro `7cf2b96e…`), mesmos pacotes/repair-prompts digest-bound.

- **K = 4 réplicas novas** (r2–r5; a rodada original é r1), cada uma = 72 chamadas haiku
  (24 tarefas × 3 braços), re-amostragem independente (mesma definição de "seed" do iiif).
- **Julgamento por réplica:** mesma esteira (--collect-retry ×3 → --assemble → runner lift
  report + cego via --emit-feedback-packages); artefatos salvos como `lift-report-r{k}.json`,
  `packages-cego-r{k}.json`, `samples-haiku-lift-r{k}.jsonl`.
- **Análise primária (pré-fixada):** por tarefa t∈F (|F|=24) e braço a, taxa de recuperação
  r(t,a) = média de pass sobre as 5 réplicas. Teste de permutação pareado unilateral
  (H1: proof > cego), estatística = média_t[r(t,proof) − r(t,cego)], 100.000 permutações de
  sinal por tarefa, gerador determinístico LCG semente 42, α = 0.05.
- **Secundária:** idem para proof − scalar. Terciária (descritiva): média±dp de recuperações
  por braço entre réplicas.
- **Morte/confirmação:** p < 0.05 na primária ⇒ P1 sobe de "direção" para CONFIRMADA;
  p ≥ 0.05 ⇒ registrar "não separável com K=5 nesta arena" sem reinterpretar; proof médio ≤
  cego médio ⇒ D1 dispara de fato (disprova não vence resample) — registrar e voltar ao desenho.
- **Sem mudanças retroativas:** nada acima desta seção é editado; resultados das réplicas
  entram abaixo dela.

### Resultados das réplicas

(preenchidos abaixo desta linha após as réplicas r2–r5.)

**Execução:** r2–r5 completas, 72/72 cada (288 chamadas haiku novas; 360 retries julgados no
total com r1), mesmos despachos congelados, `toolAugmentedHumanEvalClaim=true` em todas.
Análise EXATAMENTE como pré-fixada (`work/permutation-analysis.json`; LCG 42, 100k permutações).

**Recuperações por réplica (cego/scalar/proof, de 24):**
r1 11/12/14 · r2 16/16/18 · r3 11/16/15 · r4 15/11/17 · r5 13/11/15
**Médias: cego 13.2 · scalar 13.2 · proof 15.8** → pass@final médio do braço proof =
**155.8/164 (95.0%)** vs baseline 85.4% (+9.6pp médio).

**Vereditos (pela regra pré-fixada, sem reinterpretação):**

- **PRIMÁRIA (proof > cego): estatística +0.1083, p = 0.05572 ≥ 0.05 → NÃO SEPARÁVEL com K=5
  nesta arena.** Registrado como o pré-registro manda. Fatos descritivos que permanecem: proof
  recuperou mais que cego em **5/5 réplicas** e a diferença média é +2.6 recuperações (+10.8pp
  de taxa); D1 NÃO disparou (disprova ≥ resample em todas as réplicas). A separação exigiria
  K maior (poder) ou arena com falhas mais difíceis — fica para um v2, pré-registrado.
- **SECUNDÁRIA (proof > scalar): p = 0.08713 ≥ 0.05 → não separável** (proof venceu scalar em
  4/5 réplicas, empate de médias do scalar com o cego).
- **Nota de honestidade:** p=0.056 não vira "confirmado" por estar perto — é exatamente o tipo
  de resultado que a lei pré-fixada existe para proteger. O que o experimento ESTABELECE com
  solidez é o lift baseline→retry-verificado (+9.6pp médio, presente nas 5 réplicas e nos dois
  modelos de feedback informativos); a ATRIBUIÇÃO do excedente ao CONTEÚDO da disprova (acima
  do resample) é direcionalmente consistente (5/5) mas não estatisticamente separável com K=5.
