# PULSE Promotion Criteria — Thresholds por Camada (I a XXXIV)

> Derivado de: Part D.7 + Part 4 (V-tier + R-tier) do Plano Cognitivo, `capability-registry.types.ts`, `capability-registry.service.ts`.
> Ownership: design-only. Nenhum código tocado.

## Constantes de Referência (do código-fonte)

| Constante | Valor | Uso |
|---|---|---|
| `MIN_PULSE_CYCLES_FOR_OPERATIONAL` | `3` | Ciclos verdes mínimos developing → operational |
| `MIN_NON_REGRESSIVE_CYCLES` | `3` | Ciclos consecutivos não-regressivos operational → productionReady |
| `CONSECUTIVE_FAILURES_CONSECUTIVE_THRESHOLD` | `3` | Falhas consecutivas máximas antes de bloquear promoção |
| `EVIDENCE_PROMOTE_OPERATIONAL` | `5` | Auto-promoção: evidence ≥ 5 (safety net) |
| `EVIDENCE_PROMOTE_PRODUCTION_READY` | `20` | Auto-promoção: evidence ≥ 20 (safety net) |
| `runtimeEvidencePct > 0` | — | Promoção explícita developing → operational (D.7) |

## Definição das Colunas

- **developing-gates**: gates PULSE em modo `log_only` que precisam estar verdes para a Camada sair de `developing`
- **operational-gates**: mesmos gates em modo `hard_fail` que precisam estar verdes para a Camada atingir `operational`
- **operational-evidence**: runtime evidence > 0% exigida por capacidade, com N-level mínimo (quantas capacidades da Camada precisam mostrar evidência)
- **productionReady-R-target**: valor exato do R-criterion alvo extraído da Parte 4
- **productionReady-cycles**: ciclos consecutivos não-regressivos exigidos (fixo em 3 para todas, conforme `MIN_NON_REGRESSIVE_CYCLES`)

## Tabela de Promoção por Camada

| # | Camada | developing-gates (log_only verde) | operational-gates (hard_fail verde) | operational-evidence (runtime > 0%) | productionReady-R-target | productionReady-cycles |
|---|---|---|---|---|---|---|
| I | Genesis & Lineage | `lineage-integrity`, `identity-projection`, `origin-immutability`, `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `lineage-integrity`, `identity-projection`, `origin-immutability`, `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | Genesis Event hash verificável + Lineage Ledger com ≥1 entrada + Identity Projector testado em 4 audiences + Identity Lineage Guard exercitado. N-level ≥ 4/4 UTPs. | V9 (Genesis verificável e imutável) + V10 (Identity Projector funciona por audiência sem vazamento) + C11 (identidade preservada sob pressão) + C12 (origem aparece corretamente quando solicitada). Todos PASS. | 3 |
| II | Cognitive State ABI | `no-roleplay`, `prompt-leakage`, `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-roleplay`, `prompt-leakage`, `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | ABI builder compõe sem erro + ABI validator passa + ABI entregue ao LLM em ≥1 fluxo isolado + schema versionado. N-level ≥ 4/9 UTPs. | V1 (zero matches em scan canônico de instrução comportamental) + V2 (ABI é a única mensagem estrutural ao LLM). Ambos PASS com scan automatizado. | 3 |
| III | Dynamic Goal Field | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | ≥1 detector de tensão de cada dimensão (cognitiva, estrutural, comercial, financeira, operacional, UX) emite ≥1 evento + agregador roda + ≥1 objetivo candidato emerge. N-level ≥ 10/30 UTPs. | V11 (Dynamic Goal Field operacional com objetivos validados) + V14 (Goal Field comercialmente calibrado: tensões comerciais ≥50% dos objetivos promovidos). Ambos verificáveis por auditoria de spine. | 3 |
| IV | PULSE Identity/Reality Gates | `no-roleplay`, `lineage-integrity`, `identity-projection`, `no-overclaim`, `truth-mode-honesty`, `origin-immutability`, `evidence-provenance`, `prompt-leakage` | `no-roleplay`, `lineage-integrity`, `identity-projection`, `no-overclaim`, `truth-mode-honesty`, `origin-immutability`, `evidence-provenance`, `prompt-leakage` | Todos os 8 gates canônicos exercitados ≥1 vez por ciclo com resultado registrado. N-level ≥ 8/9 UTPs. | V7 (PULSE certifica coerência: no-overclaim PASS + runtime evidence > 0% + gates anti-roleplay/lineage/origin/prompt-leakage todos PASS). Verificável por snapshot de certificação. | 3 |
| V | Local Operational Identity | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | ≥3 dimensões de perfil (operational, language, product, customer, temporal, decision-patterns) com dados derivados de eventos reais + projetor alimenta `workspaceLocalProfile` no ABI. N-level ≥ 4/7 UTPs. | V13 (Workspace Local Identity ativa para workspaces com volume mínimo) + R5 (aprendizado perceptível semana a semana: ≥1 drift narrativo confirmado/semana) + R8 (inteligência percebida em pesquisa direta: NPS-like positivo ≥ 50%). | 3 |
| VI | Cross-Workspace Commercial Wisdom | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | ≥1 padrão abstrato extraído com k-anonimato aplicado, validado em ≥3 workspaces + projetor alimenta `wisdomContext` no ABI. N-level ≥ 5/8 UTPs. | R14 (cross-workspace wisdom efetivo sem vazamento: ≥1 padrão validado/mês + zero eventos de vazamento cross-workspace por ciclo). | 3 |
| VII | Strategic Insight Engine | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | ≥3 detectores (de 8) ativos com saída ranqueada por impacto financeiro + confidence floor aplicado. N-level ≥ 5/11 UTPs. | R10 (espanto comercial mensurável: ≥1 insight estratégico confirmado/workspace/mês pelo operador). | 3 |
| VIII | Commercial Maturity Recognition | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | Coletor de sinais ativo + classificador com ≥1 workspace classificado + filtro de objetivos por estágio operacional. N-level ≥ 3/5 UTPs. | R11 (adequação ao estágio comercial: classificação com ≥70% confiança + ≥80% adequação das recomendações ao estágio). | 3 |
| IX | Trust Capital Protection | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | ≥4 capacidades (trust-state-tracker, fatigue-detector, desperation-detector, brand-protection-guard) com estado por lead/conversa + ≥1 trigger de handoff humano exercitado. N-level ≥ 5/8 UTPs. | R12 (capital de confiança protegido: venda cresce sem queimar marca — net brand score não-negativo sobre baseline). | 3 |
| X | Behavioral Drift Observability | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | Snapshot semanal gerado + drift detector ativo + ≥1 narrativa semanal de drift gerada com evidência antes/depois. N-level ≥ 4/6 UTPs. | R13 (aprendizado como comportamento visível: narrativa semanal com ≥40% de confirmação pelo operador). | 3 |
| XI | First-Hour Wow | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | Cold-start ingestion ativa + pattern detector operacional (reusa VI+VII+VIII) + insight ranker com evidência + orquestrador de primeiro contato testado. N-level ≥ 4/6 UTPs. | R15 (encantamento na primeira hora: ≥60% dos novos workspaces recebem insight confirmado como relevante na primeira hora). | 3 |
| XII | Team Augmentation | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | ≥4 capacidades (pre-call-context-builder, next-best-action-suggester, forgotten-followup-rescuer, operator-feedback-loop) com ≥1 interação time-humano registrada. N-level ≥ 5/7 UTPs. | R16 (aceitação pelo time humano: ≥70% dos operadores relatam "trabalho com o Kloel, não apesar dele" em pesquisa trimestral). | 3 |
| XIII | Delegation Confidence Tracking | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | Delegation-state-tracker com ≥1 área operacional rastreada + graduation-detector ativo + autonomy-rollback testado. N-level ≥ 4/6 UTPs. | R17 (confiança crescente de delegação: razão "ações autônomas:revisadas" cresce ≥1.5× sobre baseline em janela de 30 dias). | 3 |
| XIV | Mature Failure Recovery | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | Self-error-detector ativo + error-acknowledgment testado + error-non-repeat-guard com ≥1 ciclo sem repetição + trust-after-error-tracker operacional. N-level ≥ 5/7 UTPs. | R18 (erro que aumenta confiança: taxa de não-repetição ≥90% + auto-detecção ≥40% dos erros). | 3 |
| XV | Offer Evolution Intelligence | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | ≥3 detectores (de 6) ativos + insight ranker operacional + delivery funcional. N-level ≥ 5/9 UTPs. | R19 (evolução da oferta: ≥1 sugestão de melhoria de oferta aceita pelo dono por trimestre com delta mensurável). | 3 |
| XVI | Owner Criterion Memory | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | ≥3 observers (decision, correction, tone) com ≥1 critério aprendido e projetado no ABI como contexto, com evidência observável. N-level ≥ 4/8 UTPs. | R20 (memória do critério do dono: ≥60% dos donos confirmam "ele opera do meu jeito" em pesquisa). | 3 |
| XVII | Cold-Start Discovery | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | No-history-mode ativo + first-truth-roadmap gerado + micro-test-designer funcional + first-truth-detector operacional. N-level ≥ 5/8 UTPs. | R21 (cold-start sem histórico: primeira verdade comercial descoberta em ≤30 dias para ≥70% dos novos workspaces). | 3 |
| XVIII | Post-Sale & LTV Engine | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | ≥6 capacidades (anti-remorse, activation-companion, first-value-detector, churn-risk-detector, win-back-window, ltv-projection) com eventos reais pós-venda. N-level ≥ 7/12 UTPs. | R22 (pós-venda e LTV crescentes: delta positivo em ≥4 das 6 métricas: delivery, activation, first-value, satisfaction, repurchase, win-back). | 3 |
| XIX | Healthy Money Optimization | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | Revenue-quality-scorer ativo sobre ≥1 workspace + margin-projector + refund-risk-projector + unhealthy-sale-blocker operacional. N-level ≥ 5/8 UTPs. | R23 (dinheiro saudável cresce e dinheiro ruim cai simultaneamente: delta positivo em receita saudável E delta negativo em receita de alto risco no mesmo trimestre). | 3 |
| XX | Hypothesis-to-Proof Engine | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | Hypothesis-formulator + micro-experiment-designer + authorization-gateway + experiment-runner + proof-evaluator integrados e testados com ≥1 ciclo completo. N-level ≥ 5/8 UTPs. | R24 (descoberta comprovada: ≥1 descoberta/trimestre com razão descobertas:hipóteses ≥30%). | 3 |
| XXI | Proprietary Commercial Memory | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | Ledger agregado com ≥1 workspace + projector por dimensão + exporter funcional + attribution-guard ativo. N-level ≥ 4/7 UTPs. | R25 (capital comercial proprietário acumulado: ≥50% dos donos confirmam "perder isso seria perder anos de operação"). | 3 |
| XXII | Decision Clarity | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | Attention-ranker com hierarquia AGORA/SEMANA/SABER/ARQUIVO + noise-filter + narrative gerada. N-level ≥ 4/6 UTPs. | R26 (clareza decisória, não ansiedade: ≥70% dos operadores confirmam "saio sabendo o que importa"). | 3 |
| XXIII | Role-Aware Commercial Intelligence | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | Role-detector com ≥1 papel detectado por uso real + leverage-map + recommendation-guard + multi-hat suportado. N-level ≥ 5/8 UTPs. | R27 (reconhecimento e respeito ao papel: ≥95% das recomendações dentro do raio de controle do papel + ≥75% confirmam "ele entende o que está sob meu controle"). | 3 |
| XXIV | Affiliate Intelligence | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | ≥5 capacidades (offer-quality-scorer, audience-fit-detector, angle-suggester, budget-protection, commission-real-comparator) ativas com ≥1 afiliado usando. N-level ≥ 7/12 UTPs. | R28 (Affiliate Intelligence efetiva: ≥60% dos afiliados confirmam "sabe ganhar dinheiro promovendo produtos que nem são meus"). | 3 |
| XXV | Agency Intelligence | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance`, `internal-knowledge-leak-guard` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance`, `internal-knowledge-leak-guard` | Portfolio-state com ≥2 clientes + per-client-context-bundler + priority-ranker + internal-knowledge-leak-guard ativo com zero vazamentos. N-level ≥ 5/8 UTPs. | R29 (Agency Intelligence efetiva: ≥60% dos gestores de agência confirmam efetividade + zero vazamento de contexto entre clientes). | 3 |
| XXVI | Creator Intelligence | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | Audience-fit-for-partnership + mention-timing + authenticity-protector + engagement-vs-conversion-tracker ativos. N-level ≥ 4/6 UTPs. | R30 (Creator Intelligence efetiva: ≥60% dos creators confirmam efetividade + retenção de audiência mantida acima da baseline). | 3 |
| XXVII | Ecosystem Intelligence | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance`, `ecosystem-privacy-guard` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance`, `ecosystem-privacy-guard` | Cross-role-pattern-detector com ≥1 padrão detectado + fit (produtor↔afiliado) testado + privacy-guard ativo + conflict-detector operacional. N-level ≥ 5/9 UTPs. | R31 (Inteligência de Ecossistema com privacidade preservada: ≥1 match cross-role/mês + ≥40% confirmam "me conectou a oportunidade que eu não veria sozinho" + zero violação de privacidade). | 3 |
| XXVIII | Channel Survival | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | Concentration-detector + health-monitor + ban-risk-detector + contingency-plan-builder + owned-audience-pusher ativos. N-level ≥ 5/8 UTPs. | R32 (Sobrevivência de Canal sob crise: tempo de retomada pós-queda de canal ≥50% mais rápido vs baseline sem Kloel). | 3 |
| XXIX | Cash as Oxygen | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | Position-tracker (7/14/30d) + runway-calculator + risk-detector + protective-action-suggester ativos. N-level ≥ 5/8 UTPs. | R33 (Caixa preservado como oxigênio: alerta precoce de risco de caixa ≥60% de sensibilidade + ≥40% dos donos confirmam "me ajudou a não ficar sem oxigênio"). | 3 |
| XXX | User Defensibility | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | Asset-registry + growth-tracker + social-proof-harvester + authority-builder + tactical-tradeoff ativos. N-level ≥ 5/9 UTPs. | R34 (Defensabilidade crescente: ≥3 ativos defensáveis acumulados em 12 meses + ≥50% dos donos confirmam "mais difícil fica me copiar"). | 3 |
| XXXI | Real Movement | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | Friction-detector + step-decomposer (ações ≤15min) + tiny-action-suggester + no-blame-tone-guard ativos. N-level ≥ 4/7 UTPs. | R35 (Movimento real: tempo do operador em AGORA cai ≥40% + ≥60% confirmam "ele me faz agir"). | 3 |
| XXXII | Composed Self-Evolution | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance`, `protected-files-firewall`, `codacy-rigor-enforcer` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance`, `protected-files-firewall`, `codacy-rigor-enforcer` | Gap-detector + proposal-builder + human-authorization-gateway + automatic-rollback testado + protected-files-firewall ativo + codacy-rigor-enforcer ativo. N-level ≥ 6/10 UTPs. | R36 (Evolução composta sob governança humana: ≥1 melhoria/trimestre com delta R-tier comprovado + zero violação de arquivos protegidos + zero bypass Codacy MAX-RIGOR LOCK). | 3 |
| XXXIII | Operational Legitimacy | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance` | Privacy-compliance-engine + consent-ledger + ≥2 policy-enforcers ativos + regulated-content-detector + block-with-justification funcional. N-level ≥ 7/13 UTPs. | R37 (Legitimidade operacional: ≥1 caso/mês de risco mitigado antes do dano + ≥60% confirmam "posso delegar porque ele sabe o que é permitido"). | 3 |
| XXXIV | Incentive Integrity | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance`, `platform-bias-monitor`, `disclosure-engine` | `no-overclaim`, `truth-mode-honesty`, `evidence-provenance`, `platform-bias-monitor`, `disclosure-engine` | Recommendation-explainer + conflict-detector + platform-bias-monitor + disclosure-engine + third-party-audit-export ativos. N-level ≥ 5/8 UTPs. | R38 (Integridade de incentivo: ≥95% das recomendações cruzadas com explicação + zero viés sistemático auditável externamente + ≥70% confirmam "confio que ele recomenda pensando em mim"). | 3 |

## Regras de Transição

### developing → operational

1. Todas as UTPs da Camada entregues, integradas, com testes de contrato passando.
2. Todos os gates listados em `developing-gates` verdes em modo `log_only`.
3. `runtimeEvidencePct > 0` para no mínimo o N-level de capacidades listado em `operational-evidence`.
4. `consecutivePulseGreenCycles >= 3` (`MIN_PULSE_CYCLES_FOR_OPERATIONAL`).
5. Orquestrador humano revisou e aprovou linha a linha.

### operational → productionReady

1. Todos os gates listados em `operational-gates` verdes em modo `hard_fail`.
2. R-criterion alvo da Camada atinge o valor exato listado em `productionReady-R-target`, com delta comprovado sobre baseline.
3. `consecutivePulseGreenCycles >= 3` (`MIN_NON_REGRESSIVE_CYCLES`).
4. `consecutiveFailures < 3` (`CONSECUTIVE_FAILURES_CONSECUTIVE_THRESHOLD`).
5. Nenhuma regressão em R-tier de Camadas já em `productionReady`.
6. Orquestrador humano certifica.

### Demotion triggers

- `productionReady → operational`: 3+ consecutive failures OR R-criterion regride abaixo do threshold por 2+ ciclos.
- `operational → developing`: qualquer gate `hard_fail` quebra OR runtime evidence cai a zero para >50% das capacidades da Camada.

## Gates Universais (aplicam-se a todas as Camadas)

| Gate | O que verifica | Camadas onde é específico |
|---|---|---|
| `no-overclaim` | Capacidade declarada tem runtime evidence > 0% | Todas |
| `truth-mode-honesty` | `observed`/`inferred`/`projected` nunca se confundem | Todas |
| `evidence-provenance` | Evidência tem origem rastreável (synthetic vs production) | Todas |
| `no-roleplay` | Payload ao LLM não contém instrução comportamental textual | II, IV |
| `lineage-integrity` | Genesis Event existe, hash bate, canonicalName preservado | I, IV |
| `identity-projection` | Projeções derivam de estado real auditável | I, IV |
| `origin-immutability` | Origin event nunca foi reescrito | I, IV |
| `prompt-leakage` | Nenhuma instrução textual vazou para o LLM | II, IV |
| `internal-knowledge-leak-guard` | Nenhum contexto vaza entre clientes em workspace de agência | XXV |
| `ecosystem-privacy-guard` | Nenhum dado identificável atravessa fronteira de workspace | XXVII |
| `protected-files-firewall` | Nenhum toque em arquivo protegido | XXXII |
| `codacy-rigor-enforcer` | Nenhuma redução de MAX-RIGOR LOCK | XXXII |
| `platform-bias-monitor` | Nenhum boost sistemático por receita interna | XXXIV |
| `disclosure-engine` | Vínculo comercial Kloel↔parte recomendada declarado quando aplicável | XXXIV |
