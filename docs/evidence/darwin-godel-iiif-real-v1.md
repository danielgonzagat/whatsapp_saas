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

### DESVIO DECLARADO — contaminação da v1 na geração 4 e reinício como v1.1 (2026-06-09)

- **O que houve:** dois despachantes concorrentes (sessões Claude `581bb392` ger. 1–3 e `f4e02fe0`,
  autodeclarada em `.atomic/evolution/iiif-real-v1/CONTAMINATION-NOTICE.md`) operaram o mesmo estado.
  A segunda julgou 12 despachos construídos contra o baseline quando as linhagens já estavam na g4:
  12 registros `generation:4` poluídos nos dois ledgers; `currentText` envenenado em
  `haiku|ESCALAR|s2` e `haiku|GRADIENTE|s3`.
- **Achado de aparato (classe stale-world-hash, real):** o juiz aceitava despacho de mundo
  desatualizado — `judgeOne` não conferia `promptSha256` contra o prompt recomputado da geração
  corrente. **Correção estrutural aplicada:** recusa-estaleira no juiz (`refused-stale-dispatch`,
  sem avanço de geração, sem toque em ledger/corpus; concorrência vira compare-and-swap inofensivo) +
  self-test isolado em dir-irmão com caso estaleiro (7/7). Crédito da detecção e do notice: sessão
  `f4e02fe0`; crédito da recusa no juiz: idem; serialização por lock + state-dir versionado: `581bb392`.
- **Disposição dos dados:** v1 preservada byte-intacta como arquivo-morto (g1–g3 limpas, citáveis como
  piloto; g4+ NUNCA entram em métrica). v1.1 reiniciada do zero em `.atomic/evolution/iiif-real-v1.1/`
  com despachante único (lock `iiif-real-v1.1-dispatcher`) e o MESMO desenho pré-registrado (nada acima
  desta linha mudou): 12 linhagens, G=5, mesmas predições P1–P4, mesma morte da tese.
- **Nota de método:** a recusa-estaleira é o próprio objeto de estudo agindo sobre o experimento —
  uma parede formal nova (despacho obsoleto) convertida em recusa determinística com recibo. O
  experimento sobre disprova-gradiente foi salvo por uma disprova.

### Resultados v1.1 (2026-06-09, rodada completa: 60 propostas frescas, G=5, despachante único)

**Integridade:** cadeias verificadas (haiku head `fdccabbf…`, opus head `d12941ef…`, 30 registros cada);
C1 skeleton único por geração; invólucro `c79d175f…` byte-idêntico entre braços/tiers; zero falhas de
infraestrutura (60/60 coletadas); recusa-estaleira armada (0 disparos — despachante único funcionou).

**M3 (média best-score por geração, n=3):**

| tier/braço | g1 | g2 | g3 | g4 | g5 |
|---|---|---|---|---|---|
| haiku ESCALAR | 1.0 | 7.0 | 13.3 | 13.3 | 13.3 |
| haiku GRADIENTE | 0.0 | 2.3 | 6.3 | 10.7 | 13.0 |
| opus ESCALAR | 0.3 | 0.3 | 0.3 | 1.7 | 4.3 |
| opus GRADIENTE | 1.0 | 3.0 | 6.0 | 8.3 | 8.7 |

**Paredes:** haiku ESCALAR 3 (0 repetidas: byte-floor, padding-contract — pegou o truque da constante
PADDING —, public-contract — pegou remoção de export); haiku GRADIENTE 4 (2 repetidas, ambas na s3,
byte-floor ×3 APESAR do briefing); opus 0 paredes em 30/30 propostas nos dois braços.

**Vereditos pré-registrados:**

- **P1 (M2 GRADIENTE < ESCALAR nos 2 tiers): MORTA.** A condição de morte pré-registrada disparou:
  GRADIENTE não teve vantagem de M2 em NENHUM tier — as únicas paredes repetidas da rodada inteira
  ocorreram numa linhagem BRIEFADA (haiku GRADIENTE s3). O briefing v1 ("geometria sem loci", k=8)
  não transfere neste domínio/formato. Registrado sem reinterpretação; voltar ao desenho.
- **P2 (tese-forte): NÃO CONFIRMADA por falha da premissa** — ESCALAR-haiku cruzou o valley sem
  gradiente (3/3 linhagens best ≥ 13). O valley desta arena é cruzável para o haiku sem ajuda.
- **P3 (enabler: M3 opus ≥ haiku dentro de cada braço): REFUTADA COM INVERSÃO.** Opus < haiku nos
  DOIS braços (4.3 vs 13.3 ESCALAR; 8.7 vs 13.0 GRADIENTE). O propositor mais forte respeitou
  perfeitamente a LETRA do gate (30/30 promotes, 0 invariantes violados) enquanto perseguia uma
  interpretação errada da instrução do valley ("score cai" lido como meta → empilhou helpers,
  ESCALAR s1 chegou a -17 na v1 e -10/-11 na v1.1) e terminou abaixo do propositor fraco.
- **P4 (bookkeeping): CONFIRMADA** — 15/15 GRADIENTE com briefingDigest e 15/15 ESCALAR null nos 2 tiers.

**Achados exploratórios (não pré-registrados; declarados como tal, n pequeno):**

1. **Feedback escalar reforçou a má-interpretação do propositor forte.** ESCALAR-opus via
   "PASSOU (score=-3)" como aprovação e continuou cavando; GRADIENTE-opus (briefings VAZIOS — opus
   nunca bateu parede) dominou ESCALAR-opus em M3 em TODAS as gerações. Como o briefing estava vazio,
   a vantagem do braço GRADIENTE no tier opus NÃO veio do conteúdo do gradiente — veio de NÃO receber
   o reforço escalar enganoso. O canal escalar pode ser ativamente nocivo a um propositor forte.
2. A única linhagem com paredes repetidas (haiku GRADIENTE s3) terminou empatada no TOPO da rodada
   (best=14; só opus GRADIENTE s3 com 15 acima) — consistente com stepping-stones por rejeição, n=1.
3. Os invariantes anti-Goodhart morderam de verdade: padding-contract recusou compressão da string de
   padding; public-contract recusou estreitamento de export — ambos propostos espontaneamente por
   propositores reais (não fixtures).

**Conclusão de método:** a rodada valida a MÁQUINA (cadeias, C1-C5, recusa-estaleira, P4) e MATA a
tese NESTA arena/formato. Lições para o v2 (pré-registrar antes): (a) arena cujo valley NÃO seja
cruzável sem gradiente (este era); (b) briefing com counterexample recomputado (teeth 0.2b), não só
geometria; (c) métricas de entendimento-terminal/primeira-escolha (lição do ciclo 6); (d) o resultado
mais transferível desta rodada é sobre o CANAL ESCALAR (achado 1) — qualquer desenho futuro de
benchmark real (ex.: HumanEval com laço verificado) precisa de braço-controle "sem feedback" além de
"feedback escalar" vs "feedback de disprova", porque escalar ≠ neutro.
