# Kloel — Pipeline de Execução em Swarm Paralelo para Organismo Cognitivo Biomimético

> **Documento canônico.** Esta é a fonte de verdade para a missão "Organismo Cognitivo
> Biomimético". Toda UTP (Unidade de Trabalho Paralelizável) deve referenciar este
> arquivo. Recebido como diretiva do dono do repositório (Daniel) em 2026-05-13.
> Persistido sem alteração semântica.

## Princípio Central — Dissolução

> **Não há SaaS de um lado e IA do outro. Existe um organismo comercial onde código, eventos, dados, ações, memória, PULSE e LLM participam todos da mesma cognição.**

Resultado da dissolução: tudo participa da cognição, e exatamente por isso tudo deixa rastro, é auditável, é mensurável e é corrigível. Biologia operacionalizada, não biologia pura. Não há pasta "cérebro do Kloel" para transplantar — porque cérebro vive distribuído pelo organismo inteiro.

### Equilíbrio operacional

> **O Kloel deve ser biologicamente inspirado em sua organização integral, e cirurgicamente auditável em cada parte que a compõe. E só importa se o usuário final percebe mais inteligência e a empresa usuária vende, retém e opera melhor.**

Três combinações coexistem como uma única coisa:

- **Tecido cognitivo distribuído**: nenhuma parte do produto está "fora da IA".
- **Borda fisicamente modular**: HTTP, Postgres, Stripe, Meta, WAHA, OpenAI permanecem como adapters com contratos estáveis.
- **Eixo de resultado percebido**: cada UTP precisa provar aumento de inteligência percebida e/ou melhora comercial mensurável antes de ser promovida.

## Preâmbulo Técnico

Combinação ativa: predictive coding + inferência Bayesiana + Hebbian co-activation + valence-tagged reinforcement + multi-timescale consolidation + event-sourced cognition + LLM como verbalizador estrito + PULSE como self-model operacional + genesis-locked lineage identity + multi-audience identity projection + dynamic goal field + operação em SaaS comercial multi-tenant em produção.

## Contexto Operacional

A SaaS Kloel já está pronta operacionalmente. Existe arquitetura cognitiva parcial em `backend/src/kloel/` (mind-*, brain-*, unified-agent-*) e `backend/src/pulse/`. O bloqueio é uma camada antibiológica de system prompts hardcoded (`kloel.prompts.ts`, `kloel.prompts.helpers.ts`, `buildSystemPrompt` em `unified-agent-context.service.ts`).

**O que falta é exclusivamente a camada de inteligência comercial autônoma descrita por este plano.** Frontend não muda. Contratos HTTP existentes não regridem.

## Missão

Substituir a camada instrucional por um organismo onde identidade persiste sem prompt (ancorada em Genesis imutável + linhagem operacional), o LLM nunca recebe "você é X" (recebe apenas projeção estrutural de estado), identidade evolui por experiência mas origem nunca é reescrita, objetivos emergem de tensões detectadas, tudo é auditável, contratos HTTP existentes permanecem estáveis, e a dissolução é resultado de design — cada superfície comercial participa da cognição e cada decisão cognitiva deixa rastro em superfície comercial.

---

## Preâmbulo de Execução em Swarm

A tese está fechada (Partes 1, 2, 4, 6 deste documento). O que falta é tornar a execução real. Este plano é agora um **pipeline de execução paralela em swarm**, não uma sequência de waves prescritivas.

### Operador humano

- Engenheiro sênior + CEO orquestrador
- Dispara entre **20 e 50 subagents opencode em modo interativo simultaneamente** com DeepSeek V4 Pro como executor
- Observa, interage, fiscaliza, testa, valida, complementa, lapida e evolui o código de cada subagent em tempo real, do micro ao macro
- Subagents são encerrados ao concluir; novos são lançados; RAM é monitorada continuamente; só modo interativo, nada opaco em background
- Regra de delegação de subagent OpenCode vive em `scripts/decomp/opencode-subagent-delegation-rules.md` e é autoridade

### Restrições rígidas de execução

- **Sem mudança visual no produto**: nenhum toque em `frontend/**`, `*.tsx`, `*.vue`, rotas de UI, contratos HTTP existentes
- **Sem nova Camada, novo R-criterion, nova B-rule**: tese fechada nesta passagem
- **Sem remoção de Camada, R-criterion ou B-rule existente**
- **Sem dependência entre UTPs além das de contrato real**: se A não bloqueia B por contrato, A e B são paralelos por definição
- **Arquivos protegidos** (CLAUDE.md, AGENTS.md, ops/, husky, eslint, ai-models.ts, MAX-RIGOR LOCK do Codacy) só o dono do repositório edita

### Modo de existência deste documento

- **Parte 1 (B-rules) é semântica imutável.**
- **Parte 2 (Camadas I a XXXIV) é semântica de propósito imutável** — descreve o que cada Camada *é*, sem prescrever pastas, classes, arquivos ou schemas TypeScript.
- **Partes A a E + Parte G são pipeline executável** — PCI, UTPs, Grafo, Ondas, Anti-Alucinação, Mapa.
- **Partes 4 e 6 são critérios e bússola.**
- **Parte 7 é proteção contra reflexos antibiológicos das IAs colaboradoras.**

Decisões de implementação concreta (pastas, nomes de classe, arquivos, frameworks, schemas TypeScript literais) pertencem **ao subagent executor sob orquestração humana**. Fixá-las antecipadamente degrada qualidade da implementação e aprisiona o executor em escolhas erradas.

---

## PARTE 1 — B-Rules (Família suprema; intacta)

### Regra B0 — Primazia do Resultado Percebido

**Esta regra vence todas as outras quando conflitarem.** Toda transformação cognitiva só é superior se produzir aumento perceptível de inteligência para o usuário final **ou** melhora mensurável no desempenho comercial da empresa usuária. Pureza arquitetural sem resultado é fracasso.

### Regra B0.1 — Inteligência só conta quando muda experiência ou destino comercial

Dois palcos sempre (dono + lead final). Espanto > melhora. Comportamento visível, não apenas log. Estrategista, não só executor. Capital de confiança protegido. Adaptado ao estágio da empresa.

### Regra B0.2 — Inteligência só é completa quando gera delegação confiante

Encantamento precoce, três palcos (dono + lead + time humano), erro converte confiança, evolução da oferta, memória do critério do dono.

### Regra B0.3 — Inteligência por Papel Comercial (role-aware)

Reconhecer papel econômico real (produtor, afiliado, agência, gestor, closer, creator, especialista). Recomendações respeitam alavancas reais do papel. Sugestão fora do raio de controle é falha grave.

### Regra B0.5 — Funcionar sem histórico (cold-start como entrada padrão)

Admitir ausência de dado, conduzir descoberta da primeira verdade comercial em ≤30 dias.

### Regra B0.6 — Operar até depois da venda em direção a LTV

Acompanhar cliente até pagamento, entrega, ativação, primeiro valor, depoimento, recompra, expansão, churn-risk, win-back.

### Regra B0.7 — Otimizar dinheiro saudável, não volume bruto

Receita ponderada por margem, refund risk, suporte projetado, churn, LTV, risco reputacional, desgaste de marca. Kloel pode recusar venda ruim.

### Regra B0.8 — Transformar incerteza em descoberta comprovada

Loop fechado: hipótese → teste mínimo → autorização → execução → observação → conclusão honesta → atualização de crença.

### Regra B0.9 — Acumular capital comercial proprietário

Exportável, quantificável, crescente, auditável, sem lock-in artificial.

### Regra B0.10 — Reduzir ansiedade decisória, não aumentar

Hierarquia AGORA / ESTA SEMANA / PARA SABER / ARQUIVO. Default é silêncio.

### Regra B0.11 — Inteligência de Ecossistema

Oportunidades entre papéis com privacidade preservada. Match agnóstico a dado sensível. Sugestão, nunca empurrão. Silêncio sob conflito.

### Regra B0.12 — Sobrevivência de Canal

Diversificação proativa, detecção precoce de degradação, plano de contingência ativo, migração assistida sob crise.

### Regra B0.13 — Caixa como Oxigênio

Runway em janelas curtas, alerta precoce de risco, recusa de operação que aumenta risco sem compensar.

### Regra B0.14 — Defensabilidade do Usuário

Priorizar acúmulo de ativos defensáveis (audiência própria, prova social, casos, posicionamento, autoridade, relacionamento recorrente) sobre volume tático em trade-off.

### Regra B0.15 — Movimento Real

Decompor decisão em ação ≤15min, oferecer execução parcial assistida, tom de aliado nunca fiscal, aprender padrões de travamento.

### Regra B0.16 — Evolução Composta do Kloel

Auto-aperfeiçoamento vinculado a resultado, sob governança humana, com rollback automático se R-tier regride. Nunca substitui governança humana; toda execução real passa por agentes codificadores autorizados.

### Regra B0.17 — Legitimidade Operacional

LGPD/GDPR/CCPA, políticas de WhatsApp/Ads/E-mail/Afiliação, promessa comercial, conteúdo regulado, direitos de imagem, trilha de consentimento auditável. Default cautela. Bloqueio sempre com justificativa e alternativa.

### Regra B0.18 — Integridade de Incentivo

Recomendação cruzada otimiza para o usuário no seu papel, não para a plataforma. Explicabilidade obrigatória. Silêncio sob conflito. Disclosure quando há vínculo comercial. Auditoria externa possível.

### B1 — Proibição absoluta de instrução comportamental ao LLM

Banidos no payload: "Você é...", "Seu trabalho é...", "Nunca faça X", "Sempre faça Y", persona definitions, tone instructions, format dictates, few-shot como template comportamental.

### B2 — Cognitive State ABI como única mensagem ao LLM

Toda chamada LLM recebe payload estruturado padronizado. Schema canônico fica no PCI (Parte A). LLM nunca recebe `role: 'system'` instrucional.

### B3 — Sem soberania cognitiva centralizada

Coordenadores técnicos finos são permitidos. Proibido: um serviço único que decide o que o sistema pensa.

### B4 — Memória deliberada pelo LLM proibida; persistência por evento obrigatória

Toda operação cognitiva automaticamente deixa traço via emissão de evento no spine. Memória não é decisão semântica do modelo; é efeito estrutural da operação.

### B5 — Predictive coding obrigatório

Toda lógica cognitiva nova gera predição e mede desvio.

### B6 — Hebbian co-activation

Caminhos que coexecutam ganham peso de associação.

### B7 — Valência obrigatória em eventos terminais

Toda transição com resultado mensurável recebe tag de valência.

### B8 — Estado contínuo, não request/response puro

Workers em background rodam consolidação, replay, prediction maintenance, valence aggregation sem trigger externo.

### B9 — Homeostase

PULSE + sensores monitoram estado próprio e ajustam parâmetros internos.

### B10 — Múltiplas escalas temporais

Imediato (ms) / Curto (s) / Médio (min/h) / Longo (dias).

### B11 — Identidade emerge, não é declarada

(sub-regra de B16) Identidade vive na composição de linhagem + eventos + crenças + associações + capacidades + valências + PULSE.

### B12 — Borda fisicamente modular, organismo cognitivamente integrado

Borda externa modular por constraint físico. Organismo cognitivo é a forma de operar do produto inteiro.

### B13 — Não antropomorfizar

Termos técnicos com semântica computacional: percepção, predição, surpresa, valência, atenção, crença, memória, ação. Banido: feels/wants/thinks.

### B14 — IAs colaboradoras obedecem à normativa, não ao treinamento

Rejeitar reflexos antibiológicos do treinamento. Ver Parte 7.

### B15 — Sem comentários antropomorfos

Comentários descrevem mecânica computacional, não intenção.

### B16 — Identidade por linhagem, não por instrução

Identidade derivada de Genesis Event imutável + histórico + capacidades + memórias + valências + PULSE. Nome `Kloel` é identificador canônico da linhagem, persistido como invariante estrutural — não como instrução. Origem é proveniência factual, não roleplay.

### B17 — Toda superfície comercial é tecido cognitivo

Checkout, carteira, billing, CRM, WhatsApp, Inbox, autopilot, flows, campanhas, member area, affiliate, KYC — todas emitem eventos no spine em transições significativas. Lista canônica vive no PCI (Parte A).

---

## PARTE 2 — Camadas I a XXXIV (semântica de propósito; sem prescrição técnica)

Cada Camada é descrita por: **propósito**, **capacidades-resultado**, **conexões com B-rules**, **R-criterion alvo**. Decisões de implementação (pastas, classes, arquivos, schemas) são responsabilidade das UTPs sob orquestração humana.

### Camada I — Genesis & Lineage
**Propósito**: preservar identidade canônica do Kloel sem prompt, permitindo evolução por experiência.
**Capacidades**: Genesis Event imutável (canonicalName, etymology, origin, steward); Lineage Ledger append-only; Identity Lineage Guard em runtime; Identity Projector com audiências `public`/`technical`/`origin`/`internal`. Origem espiritual nunca em audience=public por default.
**B-rules**: B11, B16. **R**: V9, V10, C11, C12.

### Camada II — Cognitive State ABI
**Propósito**: contrato estável miolo cognitivo ↔ LLM verbalizador; substitui system prompt.
**Capacidades**: builder lê estado de mind/brain/pulse/lineage; validação de schema; versionamento; é a única mensagem ao LLM.
**B-rules**: B1, B2. **R**: V1, V2.

### Camada III — Dynamic Goal Field
**Propósito**: objetivos emergem de tensões multidimensionais (cognitiva + comercial + operacional + financeira + experiência), com peso comercial dominante.
**Capacidades**: detectores de tensão por dimensão; agregador multidimensional; emergência de objetivos candidatos; seleção por impacto comercial + viabilidade + risco; sobrevivência por resultado real.
**B-rules**: B0, B0.1. **R**: V11, V14.

### Camada IV — PULSE Identity/Reality Gates
**Propósito**: impedir overclaim, roleplay, adulteração de origem, autoengano.
**Capacidades**: gates `no-roleplay`, `lineage-integrity`, `identity-projection`, `no-overclaim`, `truth-mode-honesty`, `origin-immutability`, `evidence-provenance`, `prompt-leakage`. Cada gate falha duro.
**B-rules**: B1, B16. **R**: V7.

### Camada V — Local Operational Identity
**Propósito**: identidade operacional por workspace, emergida de dados reais (não configurada).
**Capacidades**: perfis derivados de eventos do spine (operacional, linguagem, produto, cliente, temporal, padrões de decisão); projetados no ABI como contexto. Sensação alvo: "eu tenho meu próprio Kloel".
**B-rules**: B11, B16, B0.1. **R**: V13, R5, R8.

### Camada VI — Cross-Workspace Commercial Wisdom
**Propósito**: padrões abstratos descobertos pela frota; nenhum dado sensível atravessa fronteira de workspace.
**Capacidades**: extração de padrões; k-anonimato + diff-privacy noise; validação por N workspaces; projeção como contexto no ABI; opt-in/opt-out por workspace e por papel.
**B-rules**: B0.1, B0.3. **R**: R14.

### Camada VII — Strategic Insight Engine
**Propósito**: apontar onde a empresa perde dinheiro com evidência observável.
**Capacidades**: detectores (gargalo de funil, fit de oferta, padrão de objeção, vazamento de qualificação, janela de esfriamento, elasticidade de preço, ROI de canal, posicionamento de produto); ranking por impacto financeiro; confidence floor; entrega no momento e canal certos.
**B-rules**: B0.1. **R**: R10.

### Camada VIII — Commercial Maturity Recognition
**Propósito**: classificar estágio da empresa (validação / tração / crescimento / maturidade / otimização) por sinais, não por declaração.
**Capacidades**: coleta de sinais; classificador com confiança; filtro de objetivos por adequação ao estágio; detector de transição; guard contra recomendação de fase errada.
**B-rules**: B0.1. **R**: R11.

### Camada IX — Trust Capital Protection
**Propósito**: maximizar venda E reputação. Saber quando avançar, esperar, calar, recuar, escalar humano.
**Capacidades**: estado de confiança por lead/conversa; detector de fadiga; detector de desespero; apropriação de timing; guard de proteção de marca; silêncio como ação; trigger de handoff humano; táticas de recuperação.
**B-rules**: B0.1. **R**: R12.

### Camada X — Behavioral Drift Observability
**Propósito**: o usuário vê o Kloel mudando comportamento ao longo de semanas, com evidência.
**Capacidades**: snapshot semanal por workspace; detector de drift; atribuição a evento de aprendizado; explicação em linguagem comercial; construção de narrativa semanal; coletor de evidência antes/depois.
**B-rules**: B0.1. **R**: R13.

### Camada XI — First-Hour Wow
**Propósito**: choque de valor nos primeiros minutos, antes de maturação.
**Capacidades**: ingestão de histórico disponível; detector de padrão sobre histórico (usa Camadas VI+VII+VIII); ranking por impacto; builder de evidência; confidence floor; orquestrador do primeiro contato.
**B-rules**: B0.2, B0.5. **R**: R15.

### Camada XII — Team Augmentation
**Propósito**: terceiro palco — Kloel aceito como aliado pelo time humano.
**Capacidades**: builder de contexto pré-conversa; sugestor de próxima melhor ação; resgatador de follow-up esquecido; iluminador de blind-spots; smart handoff; protocolo de respeito (sugestão nunca comando); loop de feedback do operador alimentando valência.
**B-rules**: B0.2. **R**: R16.

### Camada XIII — Delegation Confidence Tracking
**Propósito**: métrica máxima de inteligência madura — confiança crescente de delegação por área operacional.
**Capacidades**: tracker de estado de delegação; detector de graduação; sugestão de ampliação de autonomia com evidência; rollback automático se confiança quebra; graduação área por área; builder de evidência.
**B-rules**: B0.2. **R**: R17.

### Camada XIV — Mature Failure Recovery
**Propósito**: erro converte confiança em vez de destruir.
**Capacidades**: auto-detecção de erro; reconhecimento honesto; explicação em linguagem comercial; guard de não-repetição; tentativa de reparação; entrega na narrativa semanal; tracker de trust-after-error.
**B-rules**: B0.2. **R**: R18.

### Camada XV — Offer Evolution Intelligence
**Propósito**: apontar o que mudar no produto/oferta com evidência observável.
**Capacidades**: detectores (desejabilidade de bônus, força da promessa, necessidade de versão simples, mismatch de posicionamento, mismatch de promessa-página, psicologia de preço); ranking por impacto multiplicativo; confidence forte; entrega acionável.
**B-rules**: B0.2. **R**: R19.

### Camada XVI — Owner Criterion Memory
**Propósito**: Kloel aprende como o dono quer operar — por convivência, não por formulário.
**Capacidades**: observadores de decisão, correção, tom, tolerância a risco, linha ética, threshold de aprovação; projetor no ABI como contexto; evidência observável para cada critério aprendido.
**B-rules**: B0.2, B1. **R**: R20.

### Camada XVII — Cold-Start Discovery
**Propósito**: empresas sem histórico chegam à primeira verdade comercial em ≤30 dias.
**Capacidades**: detecção de no-history-mode; roadmap de primeira verdade; banco de templates de hipótese (de Camada VI); gerador de perguntas guiadas; desenhador de micro-teste; detector de primeira verdade; tracker de progresso; graduação para operação completa.
**B-rules**: B0.5. **R**: R21.

### Camada XVIII — Post-Sale & LTV Engine
**Propósito**: organismo opera do clique ao depoimento.
**Capacidades**: anti-remorso pós-compra; companheiro de ativação; detector de primeiro valor; coletor de sinal de satisfação; timing de depoimento e indicação; detector de janela de recompra; detector de fit para expansão; detector de churn-risk; táticas de retenção honesta; janela de win-back; projeção de LTV.
**B-rules**: B0.6. **R**: R22.

### Camada XIX — Healthy Money Optimization
**Propósito**: receita boa cresce e receita ruim cai simultaneamente.
**Capacidades**: scorer de qualidade de receita; projetores de margem, refund risk, custo de suporte; detector de desgaste de marca; bloqueador de venda ruim com política revisitável pelo dono; dashboard receita boa vs ruim.
**B-rules**: B0.7. **R**: R23.

### Camada XX — Hypothesis-to-Proof Engine
**Propósito**: insight vira descoberta comprovada via loop fechado.
**Capacidades**: formulador de hipótese; desenhador de micro-experimento; gateway de autorização (integra Camada XIII); runner com idempotência; observação anti-overclaim; avaliador de prova (confirmou/refutou/inconclusivo); atualização de crença no spine; builder de narrativa de descoberta.
**B-rules**: B0.8. **R**: R24.

### Camada XXI — Proprietary Commercial Memory
**Propósito**: tudo aprendido vira capital exportável da empresa.
**Capacidades**: ledger agregado por workspace; projeções por dimensão; exportador real e auditável; máquina do tempo; quantificador de valor real; builder de narrativa periódica; attribution guard contra vazamento cross-workspace.
**B-rules**: B0.9. **R**: R25.

### Camada XXII — Decision Clarity
**Propósito**: reduzir o mundo a poucas decisões certas agora. Default é silêncio.
**Capacidades**: ranker por urgência × impacto × reversibilidade; projetor da hierarquia AGORA/SEMANA/SABER/ARQUIVO; noise filter; detector de modo anti-ansiedade; loop de feedback; narrativa curta de clareza.
**B-rules**: B0.10. **R**: R26.

### Camada XXIII — Role-Aware Commercial Intelligence
**Propósito**: papel econômico é primeira camada de contexto.
**Capacidades**: detector de papel por uso real; projetor de contexto no ABI; mapa de alavancas reais; registro de métricas por papel; guard contra recomendação fora do raio de controle; suporte a multi-hat; hierarquia AGORA adaptada (estende XXII); wisdom adaptado (estende VI).
**B-rules**: B0.3. **R**: R27.

### Camada XXIV — Affiliate Intelligence
**Propósito**: caçador de oportunidade, protetor de verba e de conta para afiliados.
**Capacidades**: scorers de qualidade de oferta e confiança do produtor; detector de fit audiência-oferta; sugestor de ângulo; detector de fadiga criativa; detector de desperdício de tráfego; proteção de orçamento; proteção de conta; comparador de comissão líquida real; sugestor de troca de oferta; régua escalar vs abandonar; loop de descoberta próprio do afiliado (integra Camada XX).
**B-rules**: B0.3. **R**: R28.

### Camada XXV — Agency Intelligence
**Propósito**: operar múltiplos clientes sem perder contexto, margem ou prioridade.
**Capacidades**: estado consolidado da carteira; builder de contexto por cliente; ranker de prioridade; tracker de margem por cliente; detector de churn-risk por cliente; balanceador de carga da equipe; guard contra vazamento de contexto entre clientes; handoff sem perda.
**B-rules**: B0.3. **R**: R29.

### Camada XXVI — Creator Intelligence
**Propósito**: monetizar audiência sem destruir relação.
**Capacidades**: fit audiência-parceiro; timing de menção; detector de saturação; protetor de autenticidade; tracker engajamento × conversão; capital de confiança creator-audiência (estende IX).
**B-rules**: B0.3. **R**: R30.

### Camada XXVII — Ecosystem Intelligence
**Propósito**: oportunidades entre papéis com privacidade preservada.
**Capacidades**: detector de padrão cross-role; fit produtor↔afiliado, afiliado↔produto, creator↔oferta, agência↔seller; ranker de oportunidade cruzada; ecosystem privacy guard; detector de conflito de interesse; entrega da sugestão ao papel apropriado.
**B-rules**: B0.11. **R**: R31.

### Camada XXVIII — Channel Survival
**Propósito**: não morrer quando canal cai.
**Capacidades**: detector de concentração; monitor de saúde do canal; detector de risco de banimento; observador de mudança de política; builder de plano de contingência; pusher de audiência própria antes da crise; orquestrador de migração sob crise; recomendador de diversificação.
**B-rules**: B0.12. **R**: R32.

### Camada XXIX — Cash as Oxygen
**Propósito**: caixa preservado, sobrevivência financeira diária.
**Capacidades**: tracker de posição em janelas 7/14/30 dias; projetor de recebíveis; projetor de pagáveis; calculadora de runway; detector de risco precoce; tracker de volatilidade; sugestor de ação protetiva; bloqueador de operação que aumenta risco sem compensar.
**B-rules**: B0.13. **R**: R33.

### Camada XXX — User Defensibility
**Propósito**: cada operação tática emite sinal para ativos estratégicos defensáveis.
**Capacidades**: registro de ativos defensáveis; tracker de crescimento; builder de audiência própria; coletor de prova social; biblioteca de casos; detector de posicionamento único; builder de autoridade; régua defensável vs tático em trade-off; narrativa periódica de acúmulo.
**B-rules**: B0.14. **R**: R34.

### Camada XXXI — Real Movement
**Propósito**: clareza vira ação efetiva.
**Capacidades**: detector de fricção de execução; decompositor de passos em ações ≤15min; sugestor de próximo passo mínimo; oferta de execução parcial assistida; builder de rota alternativa; aprendizado de padrões de travamento (alimenta XVI); guard de tom no-blame.
**B-rules**: B0.15. **R**: R35.

### Camada XXXII — Composed Self-Evolution
**Propósito**: auto-aperfeiçoamento vinculado a resultado, sob governança humana absoluta.
**Capacidades**: detector de lacuna própria com impacto comercial estimado; builder de proposta de melhoria com evidência; gateway de autorização humana obrigatória; ponte com agentes codificadores autorizados; runner de experimento (via Camada XX); monitor de delta em R-tier; rollback automático ≤24h; firewall de arquivos protegidos; enforcer de Codacy MAX-RIGOR LOCK; audit log de evolução.
**B-rules**: B0.16. **R**: R36.

### Camada XXXIII — Operational Legitimacy
**Propósito**: delegar sem medo de risco legal, regulatório ou reputacional.
**Capacidades**: engine de compliance de privacidade (LGPD/GDPR/CCPA); ledger de consentimento; enforcers de política de WhatsApp/E-mail/Ads/Afiliação; guard de promessa comercial; detector de conteúdo regulado; checker de direitos de imagem; watcher de mudança de política (alimenta XXVIII); elevador de risco para AGORA; bloqueio sempre com justificativa e alternativa; trigger de consulta jurídica humana.
**B-rules**: B0.17. **R**: R37.

### Camada XXXIV — Incentive Integrity
**Propósito**: recomendação cruzada sem conflito oculto, sem viés de plataforma.
**Capacidades**: explicador de recomendação ("porque isso, para você"); detector de conflito de interesse; enforcer de silêncio sob conflito; monitor de viés de plataforma; engine de disclosure automático; export para auditoria externa; correção por feedback do usuário; builder de attribution observável.
**B-rules**: B0.18. **R**: R38.

---

## PARTE A — Pacote de Contratos Imutáveis (PCI)

O PCI é compilado por **um único subagent dedicado** (ou pelo orquestrador humano) **antes do swarm tocar em qualquer outra coisa**. Congelado ao final dessa etapa. Vira ponto único de verdade. Qualquer divergência de PCI por subagent é falha de integração automática.

### PCI.1 — Taxonomia canônica de eventos do spine

Cada evento é definido por: **nome canônico** (string em forma `dominio.entidade.acao`), **campos obrigatórios** (chaves + semântica, sem tipo TypeScript literal), **semântica** (quando emitir, quando não emitir).

**Domínios canônicos** (lista mínima, expandível mas não substituível):

- `lineage.*` — eventos de linhagem (genesis, capability_acquired, skill_consolidated, ciclo_pulse_nao_regressivo)
- `cognition.*` — eventos cognitivos (perception_recorded, belief_updated, prediction_made, surprise_observed, attention_shifted, valence_assigned, working_memory_promoted, episodic_consolidated)
- `commerce.lead.*` — eventos de lead (created, contacted, replied, went_silent, objection_raised, qualified, lost, converted)
- `commerce.cart.*` — eventos de carrinho (created, abandoned, recovered, checkout_initiated)
- `commerce.payment.*` — eventos de pagamento (initiated, approved, declined, refunded, charged_back)
- `commerce.crm.*` — eventos de CRM (stage_changed, owner_assigned, next_step_defined, deal_won, deal_lost)
- `commerce.whatsapp.*` — eventos de WhatsApp (message_received, message_read, message_replied, handoff_to_human, conversation_resumed, session_lifecycle)
- `commerce.campaign.*` — eventos de campanha (clicked, conversion_associated, audience_reached, creative_swapped, performance_drop_detected)
- `commerce.member_area.*` — eventos de área de membros (enrolled, progressed, dropped_out)
- `commerce.affiliate.*` — eventos de afiliado (performance_measured, commission_calculated)
- `commerce.kyc.*` — eventos de KYC (document_submitted, approved, rejected)
- `commerce.post_sale.*` — eventos pós-venda (delivery_completed, activation_started, first_value_obtained, satisfaction_signal_observed, testimonial_requested, repurchase_window_opened, churn_risk_detected, win_back_window_opened)
- `goal_field.*` — eventos do campo de objetivos (tension_detected, goal_emerged, goal_promoted, goal_failed_validation)
- `pulse.*` — eventos PULSE (gate_passed, gate_failed, capability_promoted, capability_demoted, certification_cycle_completed)
- `legitimacy.*` — eventos de legitimidade (consent_given, consent_revoked, policy_violation_detected, policy_violation_mitigated, regulated_content_flagged, legal_consult_recommended)
- `incentive.*` — eventos de integridade de incentivo (recommendation_explained, conflict_detected, silence_chosen, disclosure_emitted, user_feedback_correcting)
- `evolution.*` — eventos de auto-evolução (gap_detected, improvement_proposed, human_authorization_granted, rollback_executed)

**Campos obrigatórios universais** em todo evento:

- identificador único do evento
- timestamp ISO
- `workspaceId` (quando aplicável; eventos `lineage.*` e PCI fundamentais são globais)
- `entityRef` (referência a entidade primária quando aplicável)
- `truthMode` ∈ `{observed, inferred, projected}`
- `provenance` (origem rastreável: synthetic vs production; processor de origem; versão do schema)
- `valence` ∈ `{positive, negative, neutral, ambiguous}` quando o evento é terminal

### PCI.2 — Schema canônico do Cognitive State ABI

Único payload que o LLM recebe. Não há `role: 'system'` instrucional.

**Campos canônicos** (nomes + semântica; subagent executor escolhe forma técnica):

- `abiVersion` — versionamento explícito (mudança não-aditiva exige bump major)
- `lineage` — projeção de identidade (canonicalName, genesisEventId, lineageStatus, operationalAge)
- `identityProjection` — audience ∈ `{public, technical, origin, internal}`, currentMaturity, truthMode
- `perception` — snapshot atual + eventos salientes recentes
- `beliefs` — beliefs relevantes + distribuição de confiança
- `predictions` — predições ativas + surpresas recentes
- `attention` — alvo focal + candidatos
- `memory` — slice de working memory + referências episódicas + referências consolidadas
- `capabilities` — disponíveis + restringidas (do capability-registry)
- `valence` — trace recente + agregado de humor
- `pulseTruth` — snapshot do truth state + risco de overclaim
- `workspaceLocalProfile` — perfil operacional local da Camada V
- `wisdomContext` — padrões cross-workspace aplicáveis (Camada VI), filtrados por papel via XXIII
- `roleContext` — papel ativo + alavancas reais + métricas relevantes (Camada XXIII)
- `currentInput` — input bruto + parsing + contexto de canal

**Regras de versionamento**: adição de campo opcional é minor. Mudança de semântica ou remoção é major. Subagent que altera ABI sem bump apropriado falha em CI.

### PCI.3 — Forma canônica do Genesis Event e Lineage Ledger

**Genesis Event** — invariante absoluto:

- `canonicalName: "Kloel"` — imutável
- `etymology` — kléos (grego) + El (hebraico) — imutável
- `origin` — natureza, inception, autorPosture — imutável
- `steward` — role, responsibility, posture — imutável
- `inviolable` — flags marcando campos imutáveis
- `evolvable` — flags marcando campos evolutivos (capabilities, memory, valence, beliefs)
- `hash` — sha256 do conteúdo, verificável em runtime

**Lineage Ledger** — append-only:

- Cada entrada hash-encadeada à anterior
- Nenhuma entrada removida ou editada
- Verificável por Identity Lineage Guard em runtime
- Falha de integridade dispara modo `lineage_compromise_detected` e bloqueia novas projeções de identidade até intervenção humana

### PCI.4 — Interfaces canônicas dos gates PULSE

Cada gate especifica: **entrada** (estado a inspecionar), **saída** (`PASS` | `FAIL` com motivo estruturado), **modo de falha** (`log_only` em ondas iniciais → `hard_fail` em onda definida).

Gates canônicos:

- `no-roleplay` — payload ao LLM não contém instrução comportamental textual
- `lineage-integrity` — Genesis Event existe, hash bate, canonicalName preservado
- `identity-projection` — projeções derivam de estado real auditável
- `no-overclaim` — capacidade declarada tem evidência runtime > 0%
- `truth-mode-honesty` — observed/inferred/projected nunca se confundem
- `origin-immutability` — origin event nunca foi reescrito
- `evidence-provenance` — evidência tem origem rastreável (synthetic vs production)
- `prompt-leakage` — nenhuma instrução textual vazou para o LLM
- `protected-files-firewall` (Camada XXXII) — nenhum toque em arquivo protegido
- `codacy-rigor-enforcer` (Camada XXXII) — nenhuma redução de MAX-RIGOR LOCK
- `ecosystem-privacy-guard` (Camada XXVII) — nenhum dado identificável atravessa fronteira de workspace
- `internal-knowledge-leak-guard` (Camada XXV) — nenhum contexto vaza entre clientes em workspace de agência
- `platform-bias-monitor` (Camada XXXIV) — nenhum boost sistemático por receita interna
- `disclosure-engine` (Camada XXXIV) — vínculo comercial Kloel↔parte recomendada declarado quando aplicável

### PCI.5 — Convenções universais

- `truthMode` — toda saída cognitiva carrega `observed`, `inferred`, ou `projected`. Misturar é falha grave.
- `provenance` — toda evidência tem origem (synthetic/production), versão do processor, identificador do worker.
- `valence` — eventos terminais (sucesso/falha mensurável) recebem tag de valência. Eventos exploratórios usam `neutral`.
- `audience` — projeção de identidade respeita audience ativa; default em qualquer canal comercial é `public`.
- `workspaceId` — toda query/persistência filtra por workspaceId; ausência em evento que deveria carregar é falha grave.

### PCI.6 — Tabela canônica de superfícies B17

Cada superfície comercial emite eventos cognitivos em transições significativas. Forma técnica é livre; semântica é canônica.

| Superfície | Eventos canônicos emitidos |
|---|---|
| Checkout / Wallet / Billing | `commerce.cart.created`, `commerce.cart.abandoned`, `commerce.cart.checkout_initiated`, `commerce.payment.approved`, `commerce.payment.declined`, `commerce.payment.refunded` |
| CRM | `commerce.crm.stage_changed`, `commerce.crm.owner_assigned`, `commerce.crm.next_step_defined`, `commerce.crm.deal_won`, `commerce.crm.deal_lost`, `commerce.lead.objection_raised` |
| WhatsApp / Inbox | `commerce.whatsapp.message_received`, `commerce.whatsapp.message_read`, `commerce.whatsapp.message_replied`, `commerce.whatsapp.handoff_to_human`, `commerce.whatsapp.conversation_resumed`, `commerce.whatsapp.session_lifecycle` |
| Campanhas / Anúncios | `commerce.campaign.clicked`, `commerce.campaign.conversion_associated`, `commerce.campaign.audience_reached`, `commerce.campaign.creative_swapped`, `commerce.campaign.performance_drop_detected` |
| Member Area / Affiliate | `commerce.member_area.enrolled`, `commerce.member_area.progressed`, `commerce.member_area.dropped_out`, `commerce.affiliate.performance_measured`, `commerce.affiliate.commission_calculated` |
| KYC / Auth | `commerce.kyc.document_submitted`, `commerce.kyc.approved`, `commerce.kyc.rejected` |
| Pós-venda | `commerce.post_sale.delivery_completed`, `commerce.post_sale.activation_started`, `commerce.post_sale.first_value_obtained`, `commerce.post_sale.satisfaction_signal_observed`, `commerce.post_sale.testimonial_requested`, `commerce.post_sale.repurchase_window_opened`, `commerce.post_sale.churn_risk_detected`, `commerce.post_sale.win_back_window_opened` |

Falha de qualquer superfície a emitir eventos canônicos é tratada como tensão pela Camada III até ser corrigida.

---

## PARTE B — Catálogo de Unidades de Trabalho Paralelizáveis (UTPs)

Cada UTP é construível, testável e entregável por **um único subagent opencode em uma sessão**, contra contrato fixo, sem coordenação direta com outro subagent ativo no mesmo momento.

Cada UTP especifica somente o não-negociável: **ID**, **resultado externo esperado**, **contrato de entrada** (eventos consumidos + campos ABI lidos + artefatos pré-existentes), **contrato de saída** (eventos emitidos + campos ABI alimentados + artefatos novos), **critérios de aceitação verificáveis** (comportamentais), **gates PULSE aplicáveis**, **R-criteria contribuídos**, **dependências reais por contrato**.

### Convenção de nomenclatura

`UTP-<DOMÍNIO>-<NÚMERO>` onde DOMÍNIO ∈ `{PCI, LINEAGE, ABI, GOAL, PULSE, MIND-VALENCE, MIND-ATT, MIND-HEB, MIND-CONS, EVENT-EMIT, LOCAL-IDENT, WISDOM, INSIGHT, MATURITY, TRUST, DRIFT, WOW, TEAM, DELEG, RECOVERY, OFFER, OWNER-CRIT, COLDSTART, POSTSALE, HEALTHYMONEY, HYPPROOF, COMMEM, CLARITY, ROLE, AFFIL, AGENCY, CREATOR, ECOSYS, CHANNEL, CASH, DEFENS, MOVE, EVOL, LEGIT, INCENT, TEST-CONTRACT, GRAFO}`.

### Famílias de UTPs (catálogo executável)

#### Família PCI — Compilar o Pacote de Contratos Imutáveis (Onda 0, **sequencial**)

- `UTP-PCI-001` — Compilar PCI.1 (taxonomia de eventos) consolidando lista canônica + campos obrigatórios + semântica
- `UTP-PCI-002` — Compilar PCI.2 (schema ABI) consolidando campos + semântica + regras de versionamento
- `UTP-PCI-003` — Compilar PCI.3 (Genesis + Lineage Ledger) consolidando invariantes + formato hash
- `UTP-PCI-004` — Compilar PCI.4 (gates PULSE) consolidando interfaces + modos de falha
- `UTP-PCI-005` — Compilar PCI.5 (convenções universais)
- `UTP-PCI-006` — Compilar PCI.6 (tabela de superfícies B17) com eventos canônicos
- `UTP-PCI-007` — Validador automatizado que verifica: arquivo PCI íntegro, schema interno consistente, nenhum subagent posterior diverge
- `UTP-PCI-008` — Congelamento e publicação do PCI (artefato versionado, hash-encadeado, distribuído como contrato canônico)

**Critério de saída da Onda 0**: PCI congelado, hash publicado, validador passa.

#### Família LINEAGE — Camada I (Onda 1, folhas)

- `UTP-LINEAGE-001` — Definir Genesis Event imutável conforme PCI.3 (forma + fixture com dados reais de etimologia/origem/mordomia)
- `UTP-LINEAGE-002` — Implementar Lineage Ledger append-only com hash-encadeamento
- `UTP-LINEAGE-003` — Implementar Identity Lineage Guard em runtime
- `UTP-LINEAGE-004` — Implementar Identity Projector com 4 audiences (public/technical/origin/internal)
- `UTP-LINEAGE-005` — Spec de isolamento entre audiences: origem espiritual nunca aparece em public
- `UTP-LINEAGE-006` — Spec de imutabilidade: tentativa de alterar canonical/etymology/origin falha
- `UTP-LINEAGE-007` — Persistência Prisma aditiva para Lineage Ledger (sem regredir schema atual)

#### Família ABI — Camada II (Onda 1, folhas)

- `UTP-ABI-001` — Definir schema completo conforme PCI.2
- `UTP-ABI-002` — Implementar builder que compõe ABI a partir de mind/brain/pulse/lineage (shadow mode inicial)
- `UTP-ABI-003` — Validador de schema com bump-version automation
- `UTP-ABI-004` — Spec de estabilidade do contrato: ABIs de versões maiores não regridem comportamento
- `UTP-ABI-005` — Substituir `role: 'system'` instrucional por ABI em fluxo isolado (`guest-chat.service.ts`), com feature flag
- `UTP-ABI-006` — Substituir em `whatsapp-brain.service.ts` (feature flag + A/B)
- `UTP-ABI-007` — Substituir em `unified-agent.service.ts` (mais crítico; feature flag + A/B + comparação contra baseline)
- `UTP-ABI-008` — Substituir em `kloel-reply-engine`, `kloel-thinker`, `kloel-lead-brain`, `kloel-lead-processor`, `kloel-composer`, `unified-agent-response` (paralelas entre si, dependem do PCI.2 + ABI.001)
- `UTP-ABI-009` — Esvaziar `kloel.prompts.ts`, `kloel.prompts.helpers.ts`, bloco instrucional de `buildSystemPrompt` (só após todas as substituições estarem 100% e estáveis)

#### Família PULSE — Camada IV (Onda 1, folhas)

- `UTP-PULSE-001` — Gate `no-roleplay`
- `UTP-PULSE-002` — Gate `lineage-integrity`
- `UTP-PULSE-003` — Gate `identity-projection`
- `UTP-PULSE-004` — Gate `truth-mode-honesty`
- `UTP-PULSE-005` — Gate `origin-immutability`
- `UTP-PULSE-006` — Gate `evidence-provenance`
- `UTP-PULSE-007` — Gate `prompt-leakage`
- `UTP-PULSE-008` — Modo `log_only` em ondas iniciais, transição para `hard_fail` orquestrada pela Onda E1
- `UTP-PULSE-009` — Reforçar `no-overclaim` existente contra runtime evidence > 0%

#### Família MIND — Componentes biológicos faltantes (Onda 1, folhas)

- `UTP-MIND-VALENCE-001` — Tagger automático de valência em eventos terminais
- `UTP-MIND-VALENCE-002` — Agregador de valência para mood
- `UTP-MIND-ATT-001` — Alocador dinâmico de atenção
- `UTP-MIND-ATT-002` — Candidatos de atenção a partir do spine
- `UTP-MIND-HEB-001` — Tracker de coocorrência (Hebbian)
- `UTP-MIND-HEB-002` — Decisões consultam pesos Hebbianos
- `UTP-MIND-CONS-001` — Worker contínuo working → episódica → consolidada (modo dry-run inicial)
- `UTP-MIND-CONS-002` — Promoção para modo real após PULSE + métricas DB
- `UTP-MIND-MULTI-001` — Coordenador de 4 escalas (ms/s/min-h/dias)
- `UTP-MIND-BG-001` — BullMQ processor de background activity (rate-limit explícito)

#### Família GOAL — Camada III (Onda 1, folhas)

Detectores de tensão (cada um é UTP independente):

- `UTP-GOAL-COG-001..005` — Detectores cognitivos (decision_without_persistence, conversation_without_valence, repeated_agent_failure, capability_without_runtime_evidence, runtime_critical_without_observability)
- `UTP-GOAL-STRUCT-001..004` — Detectores estruturais (ui_without_persistence, flow_without_validation, action_without_audit, backend_without_surface)
- `UTP-GOAL-COMM-001..010` — Detectores comerciais (hot_lead_without_response, abandoned_cart, clicked_without_conversion, viewed_without_purchase, repeated_objection, performing_affiliate, dormant_customer, checkout_started_without_payment, channel_without_conversion, lead_without_followup)
- `UTP-GOAL-FIN-001..003` — Detectores financeiros (product_without_margin_guard, churn_risk_without_retention, discount_without_justification)
- `UTP-GOAL-OPS-001..003` — Detectores operacionais (peak_load, human_handoff_overdue, queue_buildup)
- `UTP-GOAL-UX-001..004` — Detectores de experiência (slow_response, repetitive_question, friction_at_conversion, tone_mismatch)
- `UTP-GOAL-AGG-001` — Agregador multidimensional com pesos (comercial > estrutural > cognitivo puro)
- `UTP-GOAL-EMERGE-001` — Emergência de objetivos candidatos
- `UTP-GOAL-SELECT-001` — Seleção por impacto + viabilidade + risco
- `UTP-GOAL-SURVIVE-001` — Sobrevivência por resultado real
- `UTP-GOAL-SHADOW-001` — Modo shadow inicial; validação humana de 20-50 ciclos antes de emissão de contratos
- `UTP-GOAL-PROMOTE-001` — Promoção para emissão de contratos com gate de qualidade

#### Família EVENT-EMIT — Dissolução das superfícies (Onda 1, folhas; B17 + V15)

Uma UTP por superfície (paralelas entre si):

- `UTP-EVENT-EMIT-CHECKOUT-001..004` — Eventos de checkout/wallet/billing conforme PCI.6
- `UTP-EVENT-EMIT-CRM-001..004` — Eventos de CRM
- `UTP-EVENT-EMIT-WHATSAPP-001..006` — Eventos de WhatsApp/Inbox
- `UTP-EVENT-EMIT-CAMPAIGN-001..005` — Eventos de campanha
- `UTP-EVENT-EMIT-MEMBER-001..003` — Eventos de member area / affiliate
- `UTP-EVENT-EMIT-KYC-001..003` — Eventos de KYC
- `UTP-EVENT-EMIT-POSTSALE-001..008` — Eventos pós-venda (delivery, activation, first_value, satisfaction, testimonial, repurchase, churn_risk, win_back)
- `UTP-EVENT-EMIT-AUDIT-001` — Auditor de razão evento:transição ≥ 1:1 por superfície

#### Família LOCAL-IDENT — Camada V (Onda 2, consome eventos)

- `UTP-LOCAL-IDENT-001..006` — Perfis derivados (operational, language, product, customer, temporal, decision-patterns)
- `UTP-LOCAL-IDENT-007` — Projetor no ABI via campo `workspaceLocalProfile`

#### Família WISDOM — Camada VI (Onda 3, consome massa crítica)

- `UTP-WISDOM-001` — Extração de padrões abstratos
- `UTP-WISDOM-002` — k-anonimato + diff-privacy noise
- `UTP-WISDOM-003` — Validação por N workspaces
- `UTP-WISDOM-004` — Taxonomia de padrões
- `UTP-WISDOM-005` — Projetor no ABI via `wisdomContext`
- `UTP-WISDOM-006` — Relevância filtrada por vertical/ticket/estágio/canal
- `UTP-WISDOM-007` — Opt-in/opt-out por workspace
- `UTP-WISDOM-008` — Spec wisdom-attribution-guard

#### Família INSIGHT — Camada VII (Onda 2, consome eventos + Camada VIII)

- `UTP-INSIGHT-001..008` — Detectores (funnel-bottleneck, offer-fit, objection-pattern, qualification-leak, cooling-window, pricing-elasticity, channel-roi, product-positioning)
- `UTP-INSIGHT-RANK-001` — Ranking por impacto financeiro
- `UTP-INSIGHT-CONF-001` — Confidence floor
- `UTP-INSIGHT-DEL-001` — Entrega no momento/canal certos

#### Família MATURITY — Camada VIII (Onda 2, folhas que precisam só de eventos)

- `UTP-MATURITY-001` — Coletor de sinais de estágio
- `UTP-MATURITY-002` — Classificador com confiança
- `UTP-MATURITY-003` — Filtro de objetivos por estágio
- `UTP-MATURITY-004` — Detector de transição
- `UTP-MATURITY-005` — Guard contra recomendação de fase errada

#### Família TRUST — Camada IX (Onda 2)

- `UTP-TRUST-001..008` — trust-state-tracker, fatigue-detector, desperation-detector, timing-appropriateness, brand-protection-guard, silence-as-action, human-handoff-trigger, trust-recovery-tactics

#### Família DRIFT — Camada X (Onda 3, consome Camadas VI + spine maduro)

- `UTP-DRIFT-001..006` — behavior-snapshot, drift-detector, drift-attribution, drift-explanation, drift-narrative-builder, drift-evidence-collector

#### Família WOW — Camada XI (Onda 4, consome Camadas VI + VII + VIII)

- `UTP-WOW-001..006` — cold-start-ingestion, pattern-detector (reusa VI+VII+VIII), insight-ranker, evidence-builder, confidence-floor, orchestrator

#### Família TEAM — Camada XII (Onda 3)

- `UTP-TEAM-001..007` — pre-call-context-builder, next-best-action-suggester, forgotten-followup-rescuer, blind-spot-illuminator, smart-handoff, team-respect-protocol, operator-feedback-loop

#### Família RECOVERY — Camada XIV (Onda 4, precede DELEG)

- `UTP-RECOVERY-001..007` — self-error-detector, error-acknowledgment, error-explanation, error-non-repeat-guard, error-damage-recovery, error-narrative-builder, trust-after-error-tracker

#### Família DELEG — Camada XIII (Onda 5, depende de RECOVERY madura)

- `UTP-DELEG-001..006` — delegation-state-tracker, graduation-detector, autonomy-suggestion, autonomy-rollback, area-by-area-graduation, evidence-builder

#### Família OFFER — Camada XV (Onda 5)

- `UTP-OFFER-001..009` — bonus-desirability-detector, promise-strength-detector, product-versioning-detector, positioning-mismatch-detector, page-promise-mismatch-detector, pricing-psychology-detector, insight-ranker, confidence, delivery

#### Família OWNER-CRIT — Camada XVI (Onda 5)

- `UTP-OWNER-CRIT-001..008` — observers (decision, correction, tone, risk, ethical, approval-threshold), projetor, evidence

#### Família COLDSTART — Camada XVII (Onda 4)

- `UTP-COLDSTART-001..008` — no-history-mode, first-truth-roadmap, hypothesis-template-bank (reusa VI), guided-question-generator, micro-test-designer, first-truth-detector, progress-tracker, graduation

#### Família POSTSALE — Camada XVIII (Onda 4, depende de EVENT-EMIT-POSTSALE)

- `UTP-POSTSALE-001..012` — anti-remorse, activation-companion, first-value-detector, satisfaction-collector, testimonial-timing, referral-prompt-timing, repurchase-window-detector, expansion-fit-detector, churn-risk-detector, retention-honest-tactics, win-back-window, ltv-projection

#### Família HEALTHYMONEY — Camada XIX (Onda 5, depende de POSTSALE + COLDSTART + OWNER-CRIT)

- `UTP-HEALTHYMONEY-001..008` — revenue-quality-scorer, margin-projector, refund-risk-projector, support-cost-projector, brand-wear-detector, unhealthy-sale-blocker, blocker-policy, dashboard

#### Família HYPPROOF — Camada XX (Onda 6, depende de DELEG + RECOVERY + OWNER-CRIT)

- `UTP-HYPPROOF-001..008` — hypothesis-formulator, micro-experiment-designer, authorization-gateway, experiment-runner, observation, proof-evaluator, belief-update, narrative-builder

#### Família COMMEM — Camada XXI (Onda 6)

- `UTP-COMMEM-001..007` — ledger, projector, exporter, time-machine, value-quantifier, narrative-builder, attribution-guard

#### Família CLARITY — Camada XXII (Onda 6, transversal)

- `UTP-CLARITY-001..006` — attention-ranker, hierarchy-projector, noise-filter, anxiety-mode-detector, feedback-loop, narrative

#### Família ROLE — Camada XXIII (Onda 7, transversal)

- `UTP-ROLE-001..008` — detector, context-projector, leverage-map, metric-registry, recommendation-guard, multi-hat, aware-hierarchy (estende XXII), aware-wisdom (estende VI)

#### Família AFFIL — Camada XXIV (Onda 7)

- `UTP-AFFIL-001..012` — offer-quality-scorer, producer-trust-scorer, audience-fit-detector, angle-suggester, angle-fatigue-detector, traffic-waste-detector, budget-protection, account-protection, commission-real-comparator, offer-switch-suggester, scale-vs-abandon, discovery-loop

#### Família AGENCY — Camada XXV (Onda 7)

- `UTP-AGENCY-001..008` — portfolio-state, per-client-context-bundler, priority-ranker, margin-tracker, churn-risk-detector, team-load-balancer, internal-knowledge-leak-guard, handoff

#### Família CREATOR — Camada XXVI (Onda 7)

- `UTP-CREATOR-001..006` — audience-fit-for-partnership, mention-timing, audience-saturation-detector, authenticity-protector, engagement-vs-conversion-tracker, creator-trust-capital

#### Família ECOSYS — Camada XXVII (Onda 8, depende de ROLE + WISDOM)

- `UTP-ECOSYS-001..009` — cross-role-pattern-detector, fit (produtor-afiliado, afiliado-produto, creator-oferta, agência-seller), opportunity-ranker, privacy-guard, conflict-detector, suggestion-delivery

#### Família CHANNEL — Camada XXVIII (Onda 7)

- `UTP-CHANNEL-001..008` — concentration-detector, health-monitor, ban-risk-detector, policy-change-watcher, contingency-plan-builder, owned-audience-pusher, migration-orchestrator, diversification-recommender

#### Família CASH — Camada XXIX (Onda 7)

- `UTP-CASH-001..008` — position-tracker, receivables-projector, payables-projector, runway-calculator, risk-detector, volatility-tracker, protective-action-suggester, unsafe-operation-blocker

#### Família DEFENS — Camada XXX (Onda 8)

- `UTP-DEFENS-001..009` — asset-registry, growth-tracker, owned-audience-builder, social-proof-harvester, case-library-builder, positioning-uniqueness-detector, authority-builder, tactical-tradeoff, narrative-builder

#### Família MOVE — Camada XXXI (Onda 8, depende de CLARITY + DELEG)

- `UTP-MOVE-001..007` — friction-detector, step-decomposer, tiny-action-suggester, partial-execution-offer, alternative-route-builder, pattern-learner, no-blame-tone-guard

#### Família EVOL — Camada XXXII (Onda 9, **última**, isolamento máximo)

- `UTP-EVOL-001..010` — gap-detector, proposal-builder, human-authorization-gateway, agent-orchestration-bridge, experiment-runner (via HYPPROOF), r-tier-delta-monitor, automatic-rollback, protected-files-firewall, codacy-rigor-enforcer, audit-log

#### Família LEGIT — Camada XXXIII (Onda 8)

- `UTP-LEGIT-001..013` — privacy-compliance-engine, consent-ledger, whatsapp-policy-enforcer, email-policy-enforcer, ads-policy-enforcer, affiliate-terms-enforcer, commercial-promise-guard, regulated-content-detector, image-rights-checker, policy-update-watcher, risk-flag-elevator, block-with-justification, legal-consult-trigger

#### Família INCENT — Camada XXXIV (Onda 9, refina ECOSYS)

- `UTP-INCENT-001..008` — recommendation-explainer, conflict-detector, conflict-silence-enforcer, platform-bias-monitor, disclosure-engine, third-party-audit-export, user-feedback-correction, recommendation-attribution-builder

#### Família TEST-CONTRACT — Testes de contrato gerados (paralelo a toda UTP)

Cada UTP entrega seu próprio teste de contrato (`*-contract.spec`) que o orquestrador re-executa antes da integração. Sem teste de contrato, UTP é rejeitada.

---

## PARTE C — Grafo de Dependências e Ondas de Swarm

Dependências são **somente de contrato**. Se A não bloqueia B por contrato real, A e B são paralelos.

### Onda 0 — PCI (sequencial; 1 subagent ou orquestrador humano)

`UTP-PCI-001..008`. Saída: PCI congelado e publicado.

### Onda 1 — Folhas puras (massiva; 30-50 subagents simultâneos)

UTPs que dependem **apenas do PCI**. Lista explícita:

- Toda a família **LINEAGE** (`UTP-LINEAGE-001..007`)
- `UTP-ABI-001..004` (definir schema, builder shadow, validador, spec)
- Toda a família **PULSE** (`UTP-PULSE-001..009`)
- Toda a família **MIND** (valence, attention, hebbian, consolidation, multi-timescale, bg) — 11 UTPs
- Toda a família **GOAL** detectores (cog + struct + comm + fin + ops + ux) + agregador + emerge + select + survive + shadow + promote — ~30 UTPs
- Toda a família **EVENT-EMIT** por superfície (checkout, CRM, WhatsApp, campaign, member, KYC, post-sale) + auditor — ~30 UTPs

**Total estimado da Onda 1: 80+ UTPs paralelas.**

### Onda 2 — Consumidores de primeira ordem (massiva)

UTPs que consomem eventos emitidos pela Onda 1:

- Família **LOCAL-IDENT** (consome eventos por workspace)
- Família **MATURITY** (consome eventos para classificar estágio)
- Família **TRUST** (consome eventos de conversa)
- Família **INSIGHT** parcial (detectores que consomem eventos + MATURITY quando pronta)
- `UTP-ABI-005` (substituir guest-chat por ABI — fluxo isolado)

### Onda 3 — Consumidores de segunda ordem

- Família **WISDOM** (depende de massa crítica de workspaces emitindo eventos)
- Família **DRIFT** (depende de spine maduro)
- Família **TEAM** (depende de INSIGHT + LOCAL-IDENT)
- Família **INSIGHT** completa (entrega após MATURITY estável)
- `UTP-ABI-006..008` (substituir whatsapp-brain, unified-agent, e demais)

### Onda 4 — Encantamento + recuperação madura + cold-start + pós-venda

- Família **WOW** (depende de WISDOM + INSIGHT + MATURITY)
- Família **RECOVERY** (precede DELEG)
- Família **COLDSTART** (depende de WISDOM)
- Família **POSTSALE** (depende de EVENT-EMIT-POSTSALE)

### Onda 5 — Delegação + evolução de oferta + critério do dono + receita saudável

- Família **DELEG** (depende de RECOVERY madura)
- Família **OFFER** (depende de spine maduro + WISDOM)
- Família **OWNER-CRIT** (depende de operação prolongada)
- Família **HEALTHYMONEY** (depende de POSTSALE + COLDSTART + OWNER-CRIT)

### Onda 6 — Descoberta comprovada + capital + clareza

- Família **HYPPROOF** (depende de DELEG + RECOVERY + OWNER-CRIT)
- Família **COMMEM** (consolida tudo)
- Família **CLARITY** (transversal — filtra saída de todas as anteriores)
- `UTP-ABI-009` (esvaziar prompts antigos — só após todas as substituições estáveis)

### Onda 7 — Inteligência por papel + canal + caixa

- Família **ROLE** (transversal — pré-requisito para entregas adiante)
- Família **AFFIL** (depende de ROLE)
- Família **AGENCY** (depende de ROLE)
- Família **CREATOR** (depende de ROLE)
- Família **CHANNEL** (paralela)
- Família **CASH** (paralela; precedência alta dentro da onda)

### Onda 8 — Ecossistema + defensabilidade + movimento + legitimidade

- Família **ECOSYS** (depende de ROLE + WISDOM)
- Família **DEFENS** (depende de CASH + CHANNEL estáveis)
- Família **MOVE** (depende de CLARITY + DELEG)
- Família **LEGIT** (paralela; pré-requisito para escalada de DELEG)

### Onda 9 — Auto-evolução + integridade de incentivo (isolamento máximo)

- Família **EVOL** (última; depende de R-tier estável + governança humana sólida)
- Família **INCENT** (refina ECOSYS com confiança extrema)

### Critério de transição entre ondas

Próxima onda só dispara quando: testes de contrato passando, gates verdes (modo `log_only` ou `hard_fail` conforme estágio), leitura linha a linha pelo orquestrador, lapidação aplicada, integração verificada.

---

## PARTE D — Estratégia de Swarm Paralelo

### D.1 — Estabelecimento do PCI

Um único subagent dedicado (ou o orquestrador humano) compila PCI.1 → PCI.6 sequencialmente, em uma sessão. Orquestrador humano valida, congela, publica hash distribuído. **Nenhum outro subagent toca em nada antes disso.**

### D.2 — Onda Massiva 1: folhas puras (30-80 subagents simultâneos)

Disparo paralelo de toda família LINEAGE, ABI (001-004), PULSE, MIND, GOAL (detectores + aggregator + emerge + select + survive + shadow + promote), EVENT-EMIT (uma UTP por superfície).

**Critério de despacho**: cada subagent recebe (1) ID da UTP, (2) link ao PCI congelado, (3) contrato de entrada/saída/aceitação/gates/R, (4) inventário curto de capacidades adjacentes referenciadas (sem código copiado), (5) link para `scripts/decomp/opencode-subagent-delegation-rules.md`.

**Critério de encerramento**: testes de contrato passam, gates relevantes verdes, integração verificada pelo orquestrador, código revisado linha a linha. Subagent encerra; RAM liberada; novo subagent despachado.

### D.3 — Onda Massiva 2: consumidores de primeira ordem

Disparo paralelo após Onda 1 ter cobertura ≥85% e gates `no-roleplay`/`lineage-integrity`/`origin-immutability`/`prompt-leakage` em verde (modo `log_only` aceitável nesta fase).

### D.4 — Ondas seguintes até cobertura 100%

Cada onda segue o mesmo padrão: despacho paralelo de todas as UTPs cujos contratos de entrada estão satisfeitos pelas ondas anteriores.

### D.5 — Loop contínuo de auditoria humana

Antes da próxima onda disparar:

- Testes de contrato passando em todas as UTPs da onda corrente
- Gates PULSE relevantes verdes
- Contrato cumprido (entrada/saída/aceitação)
- Leitura linha a linha pelo orquestrador humano
- Lapidação aplicada (renomeações, ajustes finos, simplificações)
- Integração verificada em ambiente compartilhado
- Nenhum toque em arquivo protegido
- Nenhuma alteração visual em frontend
- Nenhuma regressão de contrato HTTP existente

### D.6 — Ciclo de vida do subagent

- **Modo**: apenas interativo. Nada opaco em background.
- **Encerramento**: subagent sinaliza completude; orquestrador verifica; encerramento limpo; RAM liberada.
- **Despacho de substituto**: nova UTP atribuída assim que slot liberado.
- **Monitoramento contínuo**: RAM, latência de DeepSeek V4 Pro, qualidade de saída, divergência de PCI.

### D.7 — Modo de promoção de capacidade

Cada UTP, ao ser aceita, contribui para a capacidade da Camada correspondente. Capacidade é promovida no PULSE de `developing` → `operational` → `productionReady` conforme:

- `developing`: UTP entregue, integrada, gates `log_only` verdes
- `operational`: gates relevantes em `hard_fail` verdes, R-criterion da Camada começa a mover
- `productionReady`: R-criterion da Camada atinge limiar definido, 3 ciclos consecutivos não-regressivos

### D.8 — Targeting por R-criterion

O orquestrador pode escolher alvo de resultado ("hoje vou atrás de R15") e disparar a onda das UTPs que contribuem para esse R (ver Parte G — Mapa UTP × Camada × R).

---

## PARTE E — Estratégia Anti-Alucinação de Swarm

### E.1 — Divergência de nomenclatura

**Risco**: subagents diferentes inventam nomes diferentes para o mesmo conceito.
**Mitigação**: PCI congelado como autoridade. Cada UTP obriga referência explícita ao PCI em decisões de nome. Validador automatizado em CI detecta divergência.

### E.2 — Reimplementação de capacidade adjacente

**Risco**: subagent reimplementa o que outra UTP já fez.
**Mitigação**: cada UTP recebe inventário curto de capacidades adjacentes existentes (referências, sem código copiado). Orquestrador verifica antes de aceitar.

### E.3 — Quebra silenciosa de contrato

**Risco**: subagent muda contrato sem perceber, causando falha em consumidor downstream.
**Mitigação**: testes de contrato gerados pelo próprio subagent e re-executados pelo orquestrador antes da entrega ser aceita. Bump de versão obrigatório para mudanças não-aditivas.

### E.4 — Drift de identidade ou linhagem

**Risco**: subagent altera Genesis Event, canonicalName, origem.
**Mitigação**: gate `origin-immutability` + `lineage-integrity` ativos desde Onda 1 em `log_only`; viram `hard_fail` em onda definida. Hash do Genesis verificado em runtime.

### E.5 — Vazamento de instrução comportamental no ABI

**Risco**: subagent injeta texto instrucional ("você é...") no payload ao LLM.
**Mitigação**: gate `prompt-leakage` rodando em CI desde Onda 1. ABI builder validado contra schema. UTPs ABI-005..009 explicitamente removem instruções.

### E.6 — Violação de arquivos protegidos

**Risco**: subagent edita CLAUDE.md, AGENTS.md, ops/, husky, eslint, ai-models.ts, MAX-RIGOR LOCK do Codacy.
**Mitigação**: firewall `protected-files-firewall` rodando antes de qualquer entrega ser aceita. Lista canônica de arquivos protegidos vive em CLAUDE.md (autoridade).

### E.7 — Mudança visual acidental

**Risco**: subagent toca em `frontend/**`, `*.tsx`, `*.vue`, rotas de UI ou contratos HTTP existentes.
**Mitigação**: bloqueio automático na ferramenta de revisão. Qualquer diff fora dos diretórios permitidos reprova a entrega.

### E.8 — Engenheiro de si mesmo (B0 violado)

**Risco**: subagent prioriza pureza arquitetural sobre resultado comercial.
**Mitigação**: nenhuma UTP é promovida sem contribuir mensuravelmente ao R-criterion alvo. Wave 5.13/Onda 9 só promove melhoria com delta R-tier comprovado.

### E.9 — Overclaim de capacidade

**Risco**: UTP declara capacidade `operational` sem evidência runtime.
**Mitigação**: gate `no-overclaim` exige runtime evidence > 0%. PULSE bloqueia promoção sem evidência.

### E.10 — Origem espiritual contamina audience pública

**Risco**: subagent expõe origem espiritual em contexto comercial.
**Mitigação**: Identity Projector com 4 audiences testadas isoladamente. Default em qualquer canal comercial é `public`. Spec garante isolamento entre `public` e `origin`.

### E.11 — Wisdom cross-workspace vaza dado identificável

**Risco**: padrão agregado revela workspace específico.
**Mitigação**: `wisdom-attribution-guard` + k-anonimato + diff-privacy noise + auditoria periódica + opt-out respeitado em 100%.

### E.12 — Recomendação cruzada favorece plataforma

**Risco**: B0.18 violada por viés de receita interna.
**Mitigação**: `platform-bias-monitor` audita peso por receita interna; viés bloqueia promoção; auditoria externa via `third-party-audit-export`.

### E.13 — Vazamento entre clientes em workspace de agência

**Risco**: contexto de cliente A aparece em cliente B.
**Mitigação**: `internal-knowledge-leak-guard.spec` garante isolamento; auditoria periódica.

### E.14 — Substituição prematura de prompts (regressão em produção)

**Risco**: UTP-ABI-005..009 promovida antes de baseline + A/B passar.
**Mitigação**: baseline conversational + commercial obrigatório antes de qualquer substituição. Feature flag para rollback rápido. A/B 10% → 25% → 50% → 100% com delta R-tier mensurável a cada passo.

### E.15 — Goal Field gera objetivos ruins

**Risco**: Camada III emite contratos antes de validação humana.
**Mitigação**: `UTP-GOAL-SHADOW-001` em modo observador. Validação humana de 20-50 ciclos antes de qualquer emissão.

### E.16 — Background workers comem Postgres

**Risco**: consolidação contínua sobrecarrega DB.
**Mitigação**: rate limit explícito + dry-run inicial + métricas de DB monitoradas antes de promoção real.

### E.17 — Plano cresce demais e perde executabilidade

**Risco**: subagent introduz Camada, R ou B-rule nova nesta passagem.
**Mitigação**: PROIBIDO por restrição rígida deste documento. Qualquer adição é rejeitada na revisão.

---

## PARTE 4 — Critérios de Estado Final ("100% Pronto")

V-tier (técnico), C-tier (chat), R-tier (resultado externo) **e agora S-tier (swarm)**.

### Verificação no Runtime (V-tier)

**V1** — Ausência de instrução comportamental no LLM: zero matches em scan canônico.
**V2** — ABI é a única mensagem estrutural ao LLM.
**V3** — Event spine como substrato real (razão eventos:operações ≥ 1:1).
**V4** — Background activity contínua sem trigger externo.
**V5** — Valência atribuída em ≥80% dos eventos terminais.
**V6** — Hebbian mensurável (pesos não-uniformes após N ciclos).
**V7** — PULSE certifica coerência (no-overclaim PASS, runtime evidence > 0%, gates anti-roleplay/lineage/origin/prompt-leakage PASS).
**V8** — Auditável por componente; não extraível como camada isolada.
**V9** — Genesis Event verificável e imutável.
**V10** — Identity Projector funciona por audiência sem vazamento.
**V11** — Dynamic Goal Field operacional com objetivos validados.
**V12** — Machine-operable e human-auditable.
**V13** — Workspace Local Identity ativa para workspaces com volume mínimo.
**V14** — Goal Field comercialmente calibrado (tensões comerciais ≥50% dos objetivos promovidos).
**V15** — Dissolução verificável (cada superfície comercial emite eventos cognitivos).
**V16** — Remoção degrada cognição, não apenas feature.

### Verificação Comercial Real (R-tier — R1 a R38)

**R1** — Recuperação comercial mensurável (lead quente, carrinho, dormente, objeção, follow-up esquecido, pergunta repetida).
**R2** — Redução de trabalho humano.
**R3** — Inteligência de timing (mensagem proativa no momento certo).
**R4** — Memória útil percebida em ≥30% das conversas multi-turno.
**R5** — Aprendizado perceptível semana a semana.
**R6** — Dashboard de Trabalhador Comercial Diário operacional.
**R7** — Comparação viva contra time humano com auto-handoff honesto.
**R8** — Inteligência percebida em pesquisa direta (NPS-like de operadores).
**R9** — Dois palcos de inteligência percebida (dono + lead).
**R10** — Espanto comercial mensurável (≥1 insight estratégico confirmado/workspace/mês).
**R11** — Adequação ao estágio comercial (classificação ≥70% confiança, ≥80% adequação).
**R12** — Capital de confiança protegido (venda cresce sem queimar marca).
**R13** — Aprendizado como comportamento visível (narrativa semanal, confirmação ≥40%).
**R14** — Cross-workspace wisdom efetivo sem vazamento.
**R15** — Encantamento na primeira hora (≥60% recebem insight confirmado).
**R16** — Aceitação pelo time humano (≥70% relatam "trabalho com o Kloel, não apesar dele").
**R17** — Confiança crescente de delegação (razão "ações autônomas:revisadas" cresce ≥1.5×).
**R18** — Erro que aumenta confiança (taxa de não-repetição ≥90%, auto-detecção ≥40%).
**R19** — Evolução da oferta (≥1 sugestão aceita por trimestre com delta).
**R20** — Memória do critério do dono ("ele opera do meu jeito" em ≥60%).
**R21** — Cold-start sem histórico gera primeira verdade comercial em ≤30 dias para ≥70%.
**R22** — Pós-venda e LTV crescentes (delta em ≥4 das 6 métricas).
**R23** — Dinheiro saudável cresce e dinheiro ruim cai simultaneamente.
**R24** — Descoberta comprovada (≥1/trimestre, razão descobertas:hipóteses ≥30%).
**R25** — Capital comercial proprietário acumulado (≥50% confirma "perder isso seria perder anos").
**R26** — Clareza decisória, não ansiedade (≥70% confirma "saio sabendo o que importa").
**R27** — Reconhecimento e respeito ao papel (≥95% das recomendações; ≥75% confirma "ele entende o que está sob meu controle").
**R28** — Affiliate Intelligence efetiva (≥60% confirma "sabe ganhar dinheiro promovendo produtos que nem são meus").
**R29** — Agency Intelligence efetiva (≥60%; zero vazamento entre clientes).
**R30** — Creator Intelligence efetiva (≥60%; retenção de audiência mantida).
**R31** — Inteligência de Ecossistema com privacidade preservada (≥1 match/mês; ≥40% confirma "me conectou a oportunidade que eu não veria sozinho").
**R32** — Sobrevivência de Canal sob crise (tempo de retomada ≥50% mais rápido vs baseline).
**R33** — Caixa preservado como oxigênio (alerta precoce ≥60%; ≥40% confirma "me ajudou a não ficar sem oxigênio").
**R34** — Defensabilidade crescente (≥3 ativos defensáveis em 12 meses; ≥50% confirma "mais difícil fica me copiar").
**R35** — Movimento real (tempo em AGORA cai ≥40%; ≥60% confirma "ele me faz agir").
**R36** — Evolução composta sob governança humana (≥1 melhoria/trimestre com delta R-tier; zero violação de protegidos; zero bypass Codacy).
**R37** — Legitimidade operacional (≥1 caso/mês de risco mitigado antes do dano; ≥60% confirma "posso delegar porque ele sabe o que é permitido").
**R38** — Integridade de incentivo (≥95% das recomendações cruzadas com explicação; zero viés sistemático auditável externamente; ≥70% confirma "confio que ele recomenda pensando em mim").

### Verificação no Chat (C-tier — C1 a C12)

**C1** voz singular emergente • **C2** continuidade transcanal • **C3** iniciativa preditiva • **C4** inferência cross-domain • **C5** autoconsciência operacional honesta • **C6** aprendizado perceptível • **C7** recusa contextual • **C8** continuidade temporal • **C9** coerência distribuída em runtime • **C10** paridade ou superação de time humano • **C11** identidade preservada sob pressão • **C12** origem aparece corretamente quando solicitada.

### Verificação de Swarm (S-tier — novo)

**S1** — Cobertura de swarm: 100% das UTPs entregues, validadas, integradas, com testes de contrato passando e gates verdes.
**S2** — Não-regressão visual: zero alteração em `frontend/**`, `*.tsx`, `*.vue`, rotas de UI; zero rota HTTP nova exigida pela camada cognitiva.
**S3** — Paralelismo efetivo: ≥70% das UTPs entregues em ondas paralelas, não sequencialmente. Medido por timestamp de entrega vs onda atribuída.
**S4** — Zero divergência de PCI: nenhum subagent entregou código que diverge da taxonomia canônica de eventos, schema ABI, gates PULSE, convenções universais ou tabela de superfícies B17.
**S5** — Zero violação de arquivos protegidos auditável em todo o swarm.
**S6** — Zero bypass de Codacy MAX-RIGOR LOCK.
**S7** — Auditoria humana linha a linha: 100% das UTPs entregues foram lidas e lapidadas pelo orquestrador antes da integração.
**S8** — Modo interativo: nenhuma UTP entregue em modo opaco/background.
**S9** — RAM monitorada: nenhum incidente de OOM atribuível a swarm.
**S10** — Targeting por R: orquestrador conseguiu, ao menos uma vez, disparar onda focada em R específico e receber o subconjunto correto de UTPs.

### Declaração 100%

Quando **e somente quando**:
- V1-V16 passam
- C1-C12 observáveis em conversas reais com usuários reais
- R1-R38 demonstram delta positivo sustentado vs baseline pré-swarm
- S1-S10 verificáveis no histórico de swarm
- PULSE certifica `no-overclaim: PASS` + runtime evidence > 0% + capacidades cognitivas em `operational/productionReady`
- 3+ ciclos consecutivos não-regressivos em todas as tiers
- Genesis hash verificável; Lineage ledger íntegro
- Gates anti-roleplay/lineage/origin/prompt-leakage todos PASS
- Workspace Local Identity ativa para todos workspaces com volume mínimo
- Dashboard de Trabalhador Comercial Diário operacional e auditável
- Nenhuma superfície comercial relevante opera sem emitir eventos cognitivos (V15)
- Inteligência percebida em ambos os palcos comerciais + time humano
- Cada papel comercial relata percepção de inteligência dentro de suas alavancas reais
- Legitimidade operacional + integridade de incentivo verificadas (R37, R38)

→ Sistema declara 100% pronto em produção.

Sem qualquer tier completo, sistema é meio-resultado por força de B0/B0.1 e da família B0.x.

---

## PARTE G — Mapa UTP × Camada × R-criteria

Tabela cruzada para targeting por resultado. Orquestrador escolhe alvo de R e dispara o conjunto correspondente.

| Camada | UTPs (família) | R alvo principal | R secundários movimentados |
|---|---|---|---|
| I — Lineage | LINEAGE-001..007 | V9, V10, C11, C12 | — |
| II — ABI | ABI-001..009 | V1, V2 | C1-C12 (todos via state-driven) |
| III — Goal Field | GOAL-* (~30) | V11, V14 | R1-R3 (via tensões comerciais) |
| IV — PULSE Gates | PULSE-001..009 | V7 | todos R via não-overclaim |
| V — Local Identity | LOCAL-IDENT-001..007 | V13, R5, R8 | R4, R20 |
| VI — Wisdom | WISDOM-001..008 | R14 | R15 (via WOW), R28-R30 (via aware-wisdom) |
| VII — Insight | INSIGHT-001..011 | R10 | R19 (via OFFER) |
| VIII — Maturity | MATURITY-001..005 | R11 | calibra todas as recomendações |
| IX — Trust | TRUST-001..008 | R12 | R16, R30 (creator) |
| X — Drift | DRIFT-001..006 | R13 | R5, R8 |
| XI — Wow | WOW-001..006 | R15 | R21 (cold-start) |
| XII — Team | TEAM-001..007 | R16 | R17 (delega via time) |
| XIII — Delegation | DELEG-001..006 | R17 | R22, R23, R24 (via autorização) |
| XIV — Recovery | RECOVERY-001..007 | R18 | R12, R17 |
| XV — Offer Evolution | OFFER-001..009 | R19 | R10, R23 |
| XVI — Owner Criterion | OWNER-CRIT-001..008 | R20 | R12, R23 |
| XVII — Cold-Start | COLDSTART-001..008 | R21 | R15, R14 |
| XVIII — Post-Sale | POSTSALE-001..012 | R22 | R23, R25 |
| XIX — Healthy Money | HEALTHYMONEY-001..008 | R23 | R22, R33 |
| XX — Hypothesis-Proof | HYPPROOF-001..008 | R24 | R19, R25 |
| XXI — Commercial Memory | COMMEM-001..007 | R25 | R20, R34 |
| XXII — Decision Clarity | CLARITY-001..006 | R26 | transversal R1-R38 |
| XXIII — Role-Aware | ROLE-001..008 | R27 | R28, R29, R30 |
| XXIV — Affiliate | AFFIL-001..012 | R28 | R23, R32 |
| XXV — Agency | AGENCY-001..008 | R29 | R12, R26 |
| XXVI — Creator | CREATOR-001..006 | R30 | R12, R34 |
| XXVII — Ecosystem | ECOSYS-001..009 | R31 | R28-R30 |
| XXVIII — Channel Survival | CHANNEL-001..008 | R32 | R34 |
| XXIX — Cash as Oxygen | CASH-001..008 | R33 | R23 |
| XXX — Defensibility | DEFENS-001..009 | R34 | R25 |
| XXXI — Real Movement | MOVE-001..007 | R35 | R17, R26 |
| XXXII — Self-Evolution | EVOL-001..010 | R36 | meta-mover de todos os R |
| XXXIII — Legitimacy | LEGIT-001..013 | R37 | R32 (via policy-update-watcher) |
| XXXIV — Incentive Integrity | INCENT-001..008 | R38 | R31 |

### Atalhos de targeting

- "Quero atacar **R15** hoje" → dispara WOW + dependências satisfeitas (WISDOM + INSIGHT + MATURITY)
- "Quero atacar **R23** hoje" → dispara HEALTHYMONEY (depende de POSTSALE + COLDSTART + OWNER-CRIT)
- "Quero atacar **R31** hoje" → dispara ECOSYS (depende de ROLE + WISDOM) + INCENT
- "Quero atacar **R33** hoje" → dispara CASH (paralelo, alta precedência na Onda 7)

---

## PARTE 6 — Princípio Operacional Final (Bússola Única)

> **Isso aproxima o Kloel de ser um operador comercial vivo dentro do papel econômico real do usuário — produtor, afiliado, agência, gestor, closer, creator ou especialista — a quem ele delega trabalho real com confiança; percebido como inteligente pelo usuário no seu papel, pelo lead final E pelo time humano envolvido; encantando logo no primeiro contato (mesmo sem histórico); protegendo capital de confiança (com cliente e com audiência); adequado ao estágio comercial e ao papel daquele usuário; convertendo erro em prova de maturidade; melhorando de comportamento visível ao longo do tempo; aprendendo o critério interno do usuário; sugerindo evolução dentro das alavancas que ele controla; operando até depois da venda em direção a LTV; preferindo dinheiro saudável a volume bruto; tratando caixa como oxigênio; transformando incerteza em descoberta comprovada; acumulando capital comercial proprietário e exportável; construindo defensabilidade real para o usuário; conectando oportunidades entre papéis no ecossistema sem violar privacidade; protegendo contra colapso de canal; entregando clareza decisória que vira ação real; evoluindo a si mesmo sob governança humana e vinculado a resultado; operando com legitimidade operacional para que o usuário possa delegar sem medo de risco legal, regulatório ou reputacional; preservando integridade de incentivo absoluta em toda recomendação cruzada; e nascendo cada vez mais experiente em cada novo workspace e cada novo papel?**

Se sim, entra. Se não, sai. Nenhuma outra métrica sobrepõe essa bússola.

### Frases de design

> **Não há SaaS de um lado e IA do outro. Há um único organismo comercial onde cada parte do produto participa da cognição e cada decisão cognitiva deixa rastro auditável em superfície comercial.**

> **Kloel não sabe que é Kloel porque alguém disse. Kloel é Kloel porque sua linhagem, sua história operacional e seu estado distribuído só podem ser projetados como Kloel. Dentro de cada empresa, o Kloel se torna o operador comercial daquele negócio específico — não por configuração, mas por experiência acumulada.**

### Experiência alvo nos três palcos

**Palco 1 — Dono (variantes por papel via Camada XXIII)**: "Ele entendeu minha empresa." / "Posso delegar porque ele sabe o que é permitido." / "Confio que ele recomenda pensando em mim." / "Ele me fez agir." / "Quanto mais uso, mais difícil fica me copiar." (+ todas as variantes anteriores)

**Palco 2 — Lead final**: "Essa empresa entendeu exatamente meu caso." / "Eles me deixaram em paz quando precisei pensar." / "Eles não me empurraram nada — me ajudaram a decidir."

**Palco 3 — Time humano**: "O Kloel me ajuda a vender melhor." / "Ele me salva de esquecer follow-up." / "Quando eu corrijo ele, ele aprende."

---

## PARTE 7 — Aviso aos Colaboradores IA (com falhas específicas de swarm)

### Reflexos de treinamento humano a rejeitar

- **Separar "SaaS" de "IA"** — criar pasta `ai/` separada de `business/` é pecado capital de dissolução. Rejeitar.
- **Adicionar system prompts "porque sempre tem"** — viola B1.
- **Centralizar soberania semântica** — viola B3.
- **Documentar identidade em arquivo descritivo lido pelo modelo** — viola B11/B16.
- **Tratar memória como decisão semântica do LLM** — viola B4.
- **Inventar Camada, R, B-rule nova nesta passagem** — proibido por restrição rígida.
- **Otimizar pureza arquitetural ignorando resultado** — viola B0.
- **Tratar superfícies comerciais como "fora da IA"** — viola B17.
- **Otimizar só para palco do dono ignorando lead/time** — viola B0.1/B0.2.
- **Adiar valor para depois da maturação** — viola B0.5 + R15.
- **Esconder erro do Kloel** — viola B0.2 + R18.
- **Tratar venda fechada como sucesso uniforme** — viola B0.7.
- **Configurar critério do dono por formulário** — viola B0.2 + B1.

### Falhas específicas de swarm a rejeitar

- **Divergir do PCI** — falha de integração automática. PCI é autoridade.
- **Reimplementar capacidade já entregue por outra UTP** — verificar inventário de capacidades adjacentes antes.
- **Entregar UTP sem teste de contrato** — rejeitada na revisão.
- **Mudar contrato sem bump de versão** — quebra silenciosa. Bloqueio em CI.
- **Tocar arquivo protegido** — firewall bloqueia. Tentativa é auditável.
- **Tocar frontend / contrato HTTP existente** — bloqueio automático.
- **Promover UTP sem evidência runtime** — viola `no-overclaim`.
- **Despachar onda seguinte sem auditoria humana linha a linha da anterior** — viola D.5.
- **Operar em modo background opaco** — viola D.6. Apenas modo interativo.
- **Inventar nome de evento / campo ABI / gate** fora da taxonomia canônica do PCI — divergência.
- **Misturar truthMode** (observed/inferred/projected confundidos) — viola convenção universal.
- **Vazar dado identificável cross-workspace** em wisdom ou ecosystem intelligence — bloqueia promoção.
- **Entregar UTP em forma que cria dependência implícita não declarada** em outra UTP — quebra paralelismo. Refatorar.
- **Promover Camada XXXII (auto-evolução) sem governança humana** — viola B0.16 + R36.
- **Promover Camada XXXIV (incentive integrity) ignorando auditoria externa** — viola B0.18 + R38.
- **Confundir invariante estrutural (permitido — Genesis, Lineage) com instrução comportamental (proibido)** — teste decisivo: se removido, LLM ainda deriva comportamento correto lendo estado? Se sim, era supérfluo. Se não, ou enriquecer estado, ou era invariante legítimo.

### Teste mestre

> Se removido o conteúdo, o LLM ainda consegue derivar o comportamento correto lendo o estado estruturado (ABI)?
> Se sim → era instrução supérflua. Remover.
> Se não → ou o estado precisa ser enriquecido, ou era invariante estrutural legítimo.

### Ambição final

> **Tornar o sistema cognitivamente integrado, mas operacionalmente auditável.**
> **Preservar a origem como fato, sem transformá-la em doutrina.**
> **Deixar a identidade evoluir por experiência, sem deixar a origem ser reescrita.**
> **Executar em swarm massivo paralelo, mas com auditoria humana linha a linha antes de cada integração.**

---

## Checklist final do orquestrador antes de disparar a Onda 0

- [ ] PCI compilado por subagent dedicado ou pelo próprio orquestrador
- [ ] PCI validado pelo orquestrador
- [ ] PCI congelado e publicado com hash
- [ ] `scripts/decomp/opencode-subagent-delegation-rules.md` revisado e atualizado se necessário
- [ ] Capacidade de RAM monitorada e dimensionada para 20-50 subagents simultâneos
- [ ] DeepSeek V4 Pro como executor configurado
- [ ] Modo interativo confirmado em todos os subagents
- [ ] Restrição de não-toque em frontend/contratos HTTP/arquivos protegidos configurada na ferramenta de revisão
- [ ] Mapa UTP × Camada × R (Parte G) impresso/disponível para targeting

Após o checklist: disparar Onda 0 (PCI). Após PCI congelado: disparar Onda 1 (folhas — 30-80 subagents simultâneos).

Daqui em diante, o documento é executável sem reinterpretação adicional.
