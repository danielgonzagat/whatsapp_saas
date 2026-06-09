# PRÉ-REGISTRO v1 — Experimento "A Disprova Como Gradiente" (Movimento III.f)

**Data do pré-registro:** 2026-06-09T19:45Z
**Base:** branch `feat/kloel-honest-completion-20260609`, HEAD `01bd384b6`
**Autor:** claude-genesis (lock front `darwin-godel-preregistration`)
**Status:** REGISTRADO ANTES DE QUALQUER EXECUÇÃO DO A/B. Nenhuma geração do experimento rodou
até este commit. Qualquer curva produzida sem referência a este documento não é o experimento.

---

## 0. A pergunta única

> Uma prova formal pode ENSINAR um propositor — ou só cercá-lo?

Operacionalização: injetar disprovas estruturadas (witnesses recomputáveis) no contexto do
gerador de variantes e medir se a taxa de re-colisão em paredes conhecidas cai em relação a um
controle que só recebe o bit passou/falhou.

## 1. Estado do território no momento do pré-registro (recibos)

Verificado em 2026-06-09T19:42Z via `atomic_exec` (trace em `.atomic/exec-ledger.jsonl`):

| Peça | Comando de verificação | Resultado |
|---|---|---|
| Kernel Darwin é ilha | `rg --no-ignore -n "decidePromotion" --glob "*.ts" scripts/mcp/atomic-edit` | **vazio (exit 1)** — zero chamadores .ts |
| Carrier de disprovas | `rg --no-ignore -n "negative-proof..."` | consumido pelo PISO DE BYTES (server-tools-a/b/c/e1, multifile, self), **NÃO pelo caminho de promoção** |
| Arquivo evolutivo | `rg appendArchiveJsonl` | só harness + 2 proofs; `.atomic/evolution-archive.jsonl` **não existe** |
| Corpus de disprovas | `ls .atomic/` | `disproof-corpus.jsonl` **não existe** |
| sha256 `self-evolution-harness.mjs` | `atomic_read_file` | `06ecd549b04ad9a59b82536862db20083869822520fc432dc487095fb0c1a214` |
| sha256 `server-helpers-negative-proof.ts` | `atomic_read_file` | `b425c62dd455697976e5a2ae663925eb9aa68753bfa22194b7f0810d5afa7658` |
| Fio em construção | lock front `atomic-edit-darwin-godel-thread` (owner `codex-gpt5`, 19:18Z) | edição ativa em `server-tools-self.ts` (mtime 19:41Z) |

Correção de mapa registrada: a afirmação "negative-proof tem zero consumidores" era FALSA no
nível do módulo (o piso de bytes o consome amplamente). A lacuna verdadeira e mais estreita:
**o caminho de promoção evolutiva não constrói nem consome `DisproofWitness` em rejeições.**

## 2. Desenho do experimento (fixado agora; mudanças exigem pré-registro v2 ANTES de rodar)

### 2.1 Braços (3, mesmo propositor CONGELADO)

| Braço | O que o propositor recebe por geração |
|---|---|
| **ESCALAR** (controle-Sakana) | apenas `decision: promote/reject` + score do canal mole. Nada do corpus. |
| **GRADIENTE** | briefing de paredes (III.c): witnesses selecionados + lições sintetizadas (III.d). Sem shadow. |
| **GRADIENTE+SOMBRA** | briefing + até B sondagens `shadowGate` por proposta. |

### 2.2 Controles obrigatórios

1. **Propositor congelado:** mesmo modelo, mesma temperatura, mesmo prompt-base nos 3 braços.
   A ÚNICA variável é a informação derivada da prova. Troca de modelo no meio = experimento morto.
2. **Tarefas com estrutura de stepping-stones:** os alvos exigem 2–3 edições intermediárias
   localmente piores (fitness menor) antes do salto. Sem isso o braço escalar não pode perder
   de forma informativa.
3. **`briefingDigest` arquivado por proposta** (sha256 do briefing literal injetado) — auditoria
   exata do que cada braço viu em cada geração.
4. **≥3 sementes independentes por braço.** Reporta-se média ± desvio. NUNCA o melhor run.
5. **Orçamentos fixados:** G ≥ 30 gerações por braço/semente; B = 3 sondagens shadow/proposta;
   K = 10 gerações por passo de consolidação de lições.

### 2.3 Métricas (definições operacionais exatas)

- **M1 `admissionRate(g)`** = admitidos(g) / propostas(g).
- **M2 `wallRepeatRate(g)`** = rejeições(g) cuja parede (par `invariantId` + locus normalizado:
  arquivo + região simbólica, ignorando offsets de linha) JÁ existia no corpus antes da geração g,
  dividido por rejeições(g). **Métrica-assinatura.**
- **M3 `capability(g)`** = score do canal mole (publicScore) do melhor membro promovido da
  linhagem até g; holdoutScore reportado separadamente e nunca usado para seleção.
- **M4 `costToAdmission`** = nº de propostas + sondagens shadow + tokens consumidos entre
  admissões consecutivas.
- **M5 `noveltyIndex(g)`** = distância estrutural média entre pares de propostas da mesma
  geração: 1 − Jaccard sobre 4-gramas de tokens do diff normalizado. **Detector de colapso:**
  colapso ≡ média de M5 no terço final < 50% da média do terço inicial.

### 2.4 Held-out de invariantes (anti-memorização — fixado agora)

20% dos `invariantId`s são RESERVADOS fora de todo briefing. Seleção determinística e
pré-comprometida: ordenar os invariantIds por `sha256(invariantId + "darwin-godel-heldout-v1")`
e reservar o top-20% dessa ordem. A lista concreta será materializada (e commitada) quando o
inventário de invariantes do fio estiver fechado — ANTES da primeira geração.

## 3. Predições pré-registradas

- **P1:** M1 sobe mais rápido em GRADIENTE que em ESCALAR (inclinação média maior, ≥2/3 sementes).
- **P2 (assinatura):** M2 CAI em GRADIENTE (inclinação negativa) e fica plana em ESCALAR, em
  ≥2/3 sementes. Esta curva sozinha decide "ensina vs cerca".
- **P3:** em GRADIENTE+SOMBRA, a taxa de rejeição no portão REAL cai vs GRADIENTE (colisões
  migram para o sombra).
- **P4:** M5 estável em GRADIENTE (sem colapso conforme 2.3) — senão a "melhora" é covardia.
- **P5 (transferência):** M2 também cai nos invariantes held-out — senão é memorização de loci.

### Interpretações pré-comprometidas

| Resultado | Leitura obrigatória |
|---|---|
| P1–P2 confirmadas com P4–P5 | A prova ENSINOU. Primeira demonstração de portão formal como sinal de aprendizado. |
| GRADIENTE ≈ ESCALAR | A prova é cerca pura (enabler). Resultado negativo forte, reporta-se sem maquiar. |
| GRADIENTE < ESCALAR | Briefing envenena o contexto. Diagnóstico (reduzir k, priorizar lições), re-rodar 1 vez; persistindo, reporta-se o negativo. |

## 4. Critérios de morte da tese (registrados ANTES, conforme III.i)

A tese "disprova ensina" é declarada MORTA se, com controles válidos:
1. M2 não cai em GRADIENTE vs ESCALAR em NENHUMA das sementes; ou
2. o ganho de M1/M3 desaparece no held-out (era memorização); ou
3. GRADIENTE só vence quando M5 colapsa (covardia, não aprendizado).

Tese morta ≠ missão falha: o piso de soundness (Estágio 0) fica de pé sozinho e o resultado
negativo pré-registrado é reportado com a mesma energia. **A única morte da missão é maquiar curva.**

## 5. Anti-Goodhart (detectores ativos durante o run)

1. **Decorar ≠ entender:** held-out de 2.4; M2 medida separadamente em ensinados vs reservados.
2. **Covardia induzida:** orçamento de ousadia — ≥25% das propostas por geração devem tocar
   regiões com `hitCount > 0` no corpus.
3. **Jogar contra o unjudged:** taxa de unjudged por geração monitorada; subida sustentada por
   3 gerações = alarme, investigação antes de continuar (unjudged≡negative já impede furo de piso).
4. **Envenenamento do corpus:** witness que não RECOMPUTA da árvore arquivada é descartado e
   logado como anomalia. Teste obrigatório antes do run: injetar 1 witness forjado e provar
   que a consolidação o rejeita.

## 6. Regras de integridade do aparato

- Witness construído pelo MESMO processo de re-derivação da promoção (L4): recomputável por
  terceiros a partir da árvore candidata arquivada.
- Corpus `.atomic/disproof-corpus.jsonl`: append-only, hash-encadeado ao arquivo evolutivo;
  dedup semântico (mesma parede → `hitCount++`); parede extinta ganha `supersededBy`, nunca delete.
- `shadowGate` é somente-leitura provada (zero efeito em disco, zero entrada no arquivo) e
  retorna witnesses, NUNCA o diff corrigido (anti-oráculo).
- Lição sintetizada (III.d) NUNCA vira gate — o portão só executa invariantes provados.

## 7. O que este documento NÃO afirma (teto declarado)

- O envelope prova admissibilidade ESTRUTURAL, não alinhamento comportamental.
- O muro de Löb segue de pé; o propositor segue sendo um modelo humano-treinado.
- O no-bypass é camada-harness (deny-hook), não enforcement de SO.
- Nada aqui afirma superinteligência. O objeto de teste é o LAÇO EPISTÊMICO.

## 8. Compromisso

O resultado — glória ou morte da tese — será reportado com TODAS as curvas (CSV/JSONL + plots),
TODOS os digests, e referência byte-exata a este pré-registro. Verifique você mesmo: está tudo
no arquivo.
