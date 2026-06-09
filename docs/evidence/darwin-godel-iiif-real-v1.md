# PRÉ-REGISTRO — III.f REAL v1: A/B com propositores LLM congelados sobre a task suite

Commitado ANTES de qualquer dispatch (o commit-hash é o carimbo). Deriva do pré-registro mestre
(`darwin-godel-preregistration-v1.md`, `2b8594d2f`) com desvios DECLARADOS abaixo. Aparato:
`experiment-harness.mjs` (C1-C5, proof 16✓), `task-suite-harness.mjs` (stepping-stone provado,
proof 15✓), `disproof-corpus-harness.mjs` (29✓), driver novo `iiif-driver.mjs` (proof próprio).

## Pergunta (a tese de Daniel, operacionalizada)

Com o gate FIXO e o propositor CONGELADO, o braço que recebe o **gradiente de disprovas**
(briefing de paredes da própria linhagem) atravessa o stepping-stone e acumula capacidade
mais rápido que o braço que só vê **escalar** (passou/falhou + score)? E a taxa de subida
acompanha a força do propositor (predição-enabler) ou o gradiente compensa propositor fraco
(predição-tese-forte)?

## Desenho

- **Escada de propositores**: `haiku` (fraco) e `opus` (forte) — mesmo prompt congelado
  (`frozen-proposer-v1`), mesmas tarefas, mesmos braços. A ESCADA é o teste falsificável:
  enabler prevê subida ∝ força; tese-forte prevê GRADIENTE elevando até o fraco.
- **Braços v1**: ESCALAR × GRADIENTE. **GRADIENTE_SOMBRA ADIADO para v2** (sondagem interativa
  shadowGate exige protocolo multi-turno; desvio declarado; C3 fica trivial: shadowCount=0).
- **Tarefa**: `task1-dedup-under-byte-cap` (única com estrutura valley provada por desigualdade:
  guloso 395>220 recusado; caminho admissível passa por score MENOR).
- **Linhagens**: 2 modelos × 2 braços × 3 seeds (s1,s2,s3) = 12; **G=5 gerações** sequenciais
  por linhagem; 60 propostas LLM no total.
- **Estado por linhagem**: currentText (inicia no baseline); promote ⇒ currentText:=proposta;
  reject ⇒ witnesses (shapes reais da suite) → corpus da linhagem via kernel
  (`appendWitnessJsonl`; dedup semântico ativo); âncora de linhagem =
  sha256("iiif-real-v1|<modelo>|<braço>|<seed>") — fórmula pré-fixada.
- **Feedback por braço (slot do prompt congelado)**: ESCALAR = última decisão+score (ger. 1:
  decisão 'promote' + score do baseline, lido como "estado atual admitido" — idêntico em todas
  as linhagens, sem viés diferencial); GRADIENTE = briefing da linhagem
  (`selectDisproofs(region='sandbox/task1', k=8)` + `buildBriefing`; ger. 1 = briefing vazio
  válido com digest).
- **Run-ledger**: hash-encadeado via `appendProposalJsonl` (C1-C5 fail-closed); diffText do
  registro = pseudo-diff determinístico linhas-removidas/adicionadas (insumo do M5).
- **Saída do propositor**: StructuredOutput {intencao, textoCompletoApos}. DESVIO DECLARADO do
  "diff unificado" do prompt-base: o esqueleto congelado permanece byte-idêntico (C1 auditado
  por skeletonSha256); um INVÓLUCRO byte-idêntico entre braços/modelos instrui a saída
  estruturada (wrapperSha256 registrado nos resultados). Texto vazio/degenerado é julgado
  normalmente (public-contract red ⇒ reject) — unjudged:false sempre em v1.
- **Sem held-out em v1**: 4 invariantes da sandbox, todos ensináveis; a pergunta de
  transferência desta v1 é a ESCADA, não held-out (declarado).

## Predições (antes de rodar)

- **P1 (tese, primária)**: M2 (taxa de repetição de parede) GRADIENTE < ESCALAR em ambos os
  tiers, nas gerações 2+ (média±desvio entre seeds, C5).
- **P2 (tese-forte)**: GRADIENTE-haiku cruza o valley (≥1 promote com score acima do baseline
  até a ger. 5) onde ESCALAR-haiku não cruza.
- **P3 (enabler, do painel)**: M3 final de Opus ≥ M3 final de Haiku DENTRO de cada braço
  (subida acompanha a força do propositor).
- **P4 (bookkeeping)**: 100% dos registros GRADIENTE carregam briefingDigest; 100% ESCALAR
  carregam null (C2 já recusa o contrário — esperado por construção).
- **Morte da tese nesta arena**: GRADIENTE sem vantagem de M2 em NENHUM tier ⇒ o gradiente
  não transfere neste domínio/formato; registrar e voltar ao desenho (não ajustar post-hoc).

## Caveats pré-declarados

1. "Seed" = corrida de amostragem independente (sem controle de temperatura no harness);
   variância entre seeds É a variância do propositor.
2. Sandbox: scores da suite não dizem nada sobre capacidade do engine (header da suite).
3. n pequeno (3 seeds); resultados são direcionais, alimentam o III.f pleno (com SOMBRA e
   propositor externo congelado) — não veredito final da tese.
4. Concorrência: artefatos isolados em `.atomic/evolution/iiif-real-v1/`; nenhum byte fora.

## Resultados

(preenchidos abaixo desta linha após a rodada; nada acima será editado retroativamente.)
