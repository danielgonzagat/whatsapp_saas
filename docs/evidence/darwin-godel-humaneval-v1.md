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
