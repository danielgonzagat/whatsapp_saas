# Kloel — Mercado de Entrada

> **Documento de design.** Define o conceito de "mercado de entrada" como
> combinacao dominante de (papel + estagio + tipo de negocio + jornada flagship).
> Identifica 5 candidatos, ranqueia por 5 dimensoes de atratividade, e recomenda
> UM como mercado ativo. Fundamenta-se nas Camadas XXIII (Role-Aware) e VIII
> (Maturity Recognition) do Plano de Organismo Cognitivo.
>
> **Proposito**: dar foco estrategico ao Kloel em sua fase atual de construcao.
> Um mercado de entrada bem escolhido concentra esforco de desenvolvimento,
> reduz desperdicio de funcionalidade dispersa, e maximiza a velocidade da
> primeira prova de valor real (N4+ no R-tier).

---

## 1. Definicao — O que e "Mercado de Entrada"

**Mercado de entrada** e a combinacao dominante de quatro dimensoes
independentes que, juntas, descrevem o perfil do usuario-cliente para quem o
Kloel entrega maximo valor com minima friccao no momento atual do produto.

As quatro dimensoes sao:

| Dimensao | Fonte cognitiva | Semantica |
|---|---|---|
| **Papel** (Role) | Camada XXIII — Role-Aware | Papel economico real do operador: produtor, afiliado, closer, gestor, etc. |
| **Estagio** (Stage) | Camada VIII — Maturity | Estagio comercial do negocio: validacao, tracao, crescimento, maturidade, otimizacao. |
| **Tipo de negocio** (Business Type) | Novo — Mercado de Entrada | Categoria do negocio: infoproduto, servico, consultoria, ecommerce, saas, agencia, educacao. |
| **Jornada flagship** (Flagship Journey) | Novo — Mercado de Entrada | Percurso principal de receita: checkout direto, whatsapp vendas, lancamento, afiliacao, etc. |

O **mercado ativo** e o unico mercado para o qual o Kloel otimiza seu motor
comercial neste momento. Nao significa que outros mercados sao proibidos —
significa que features, mensagens, defaults e esforco de prova priorizam o
mercado ativo.

### Por que essas quatro dimensoes?

- **Papel** define as alavancas que o usuario controla (B0.3). Recomendar algo
  fora do raio de controle do papel e falha grave.
- **Estagio** define as metas adequadas (R11). Recomendar automacao para quem
  ainda nao fez primeira venda e erro de fase.
- **Tipo de negocio** define a estrutura de oferta, precificacao, e expectativa
  de ciclo de venda. Um infoprodutor vende diferente de uma agencia.
- **Jornada flagship** define o fluxo principal de receita. E onde o Kloel
  precisa ser excelente primeiro.

### Relacao com Camadas existentes

A Camada XXIII (Role-Aware) ja classifica o papel do workspace por sinais do
spine. A Camada VIII (Maturity) ja classifica o estagio comercial. "Mercado de
entrada" combina essas duas camadas com duas novas dimensoes (tipo de negocio e
jornada flagship) para formar uma decisao estrategica de foco.

O MercadoEntradaDeclarator **nao classifica** workspaces individuais — ele
**declara** qual e o mercado ativo do produto Kloel como um todo, para guiar
roadmap, mensagens e defaults.

---

## 2. Metodologia de Ranqueamento

Cada candidato a mercado de entrada e pontuado em 5 dimensoes (0.0 a 1.0),
com pesos assimetricos que refletem a prioridade estrategica atual:

| Dimensao | Peso | Significado |
|---|---|---|
| **Tamanho da dor pagavel** | 0.25 | O quanto o cliente sente dor e esta disposto a pagar para resolve-la. |
| **Viabilidade de prova N4+ rapida** | 0.25 | O quao rapido o Kloel consegue entregar valor comprovavel (R-tier N4+). |
| **Adocao sem habito novo pesado** | 0.20 | O quanto o usuario ja opera assim e nao precisa aprender comportamento novo. |
| **Recomendacao espontanea** | 0.15 | O quao natural e o boca-a-boca ("use o Kloel para X"). |
| **Indispensabilidade** | 0.15 | O quanto o Kloel se torna insubstituivel apos adocao. |

### Formula do composite score

`compositeScore = payablePainSize * 0.25 + n4plusProofSpeed * 0.25 + adoptionFriction * 0.20 + spontaneousReferral * 0.15 + indispensability * 0.15`

Nota: `adoptionFriction` e pontuado como 1.0 = friccao zero (otimo), 0.0 =
friccao maxima. Quanto maior, melhor — assim como as outras dimensoes.

---

## 3. Os 5 Candidatos

### Candidato 1 — Produtor de Infoproduto em Validacao via Checkout Direto

- **marketId**: `produtor-infoproduto-validacao-checkout`
- **Papel**: produtor
- **Estagio**: validacao
- **Tipo de negocio**: infoproduto
- **Jornada flagship**: checkout_direto
- **Payable pain**: 0.90 (precisa vender produto digital e receber — a necessidade mais basica e universal)
- **N4+ proof speed**: 0.95 (checkout 85% funcional, product CRUD existe, pagamento Stripe integrado)
- **Adoption friction**: 0.95 (o usuario ja quer vender — nao precisa aprender habito novo, so precisa de uma pagina de checkout)
- **Spontaneous referral**: 0.85 ("usa o Kloel pra vender teu curso" — frase natural e frequente)
- **Indispensability**: 0.90 (sem checkout = sem negocio; depois de integrado, trocar de plataforma tem custo de migracao de produto, clientes, links)
- **Composite**: 0.92

**Por que lidera**: E o caminho mais curto entre "entrei no Kloel" e "ganhei
dinheiro". O produtor cria um produto, define preco, compartilha link de
checkout, recebe pagamento. O fluxo e linear, a dor e aguda, a prova e rapida.
Nao depende de WhatsApp, nao depende de campanha, nao depende de time.

**Riscos**: Mercado lotado de concorrentes (Hotmart, Kiwify, etc.). Precisa de
diferenciacao via IA como operador, nao como plataforma de checkout generica.

---

### Candidato 2 — Closer em Tracao via WhatsApp Vendas

- **marketId**: `closer-tracao-whatsapp`
- **Papel**: closer
- **Estagio**: tracao
- **Tipo de negocio**: servico
- **Jornada flagship**: whatsapp_vendas
- **Payable pain**: 0.85 (perder lead quente por falta de follow-up; falta de memoria de contexto entre sessoes; volume alto de conversas manuais)
- **N4+ proof speed**: 0.90 (WhatsApp core 95% funcional, inbox real, autopilot 90%)
- **Adoption friction**: 0.70 (o closer ja usa WhatsApp; a friccao esta em adotar inbox do Kloel como ferramenta primaria em vez do app nativo)
- **Spontaneous referral**: 0.65 ("usa o Kloel que ele responde lead pra voce no WhatsApp" — bom, mas menos generico que "vender curso")
- **Indispensability**: 0.75 (depois de treinar IA no tom do closer, migrar perde memoria de conversa e configuracao)
- **Composite**: 0.79

**Por que e 2o**: WhatsApp e o canal de maior engajamento comercial no Brasil.
O closer sente dor real de follow-up. Mas o habito de usar WhatsApp nativo e
forte, e o Kloel compete com o app que o closer ja tem na mao.

---

### Candidato 3 — Afiliado em Tracao via Afiliacao

- **marketId**: `afiliado-tracao-afiliacao`
- **Papel**: afiliado
- **Estagio**: tracao
- **Tipo de negocio**: infoproduto
- **Jornada flagship**: afiliacao
- **Payable pain**: 0.75 (rastrear link de afiliado, otimizar comissao, testar criativos sem perder verba)
- **N4+ proof speed**: 0.60 (affiliate module em TIER 2 parcial; depende de checkout produtor funcionando primeiro)
- **Adoption friction**: 0.75 (afiliado ja usa links; a friccao e menor que WhatsApp)
- **Spontaneous referral**: 0.70 ("usa o Kloel pra divulgar como afiliado")
- **Indispensability**: 0.65 (ferramentas de afiliacao sao mais substituiveis que checkout)
- **Composite**: 0.69

**Por que e 3o**: Afiliado depende de produtor — sem produto no Kloel, nao ha
o que afiliar. O ecossistema de afiliacao so funciona depois que produtores
estao ativos. Faz mais sentido como segundo mercado, nao como primeiro.

---

### Candidato 4 — Gestor em Crescimento via Checkout Direto

- **marketId**: `gestor-crescimento-checkout`
- **Papel**: gestor
- **Estagio**: crescimento
- **Tipo de negocio**: ecommerce
- **Jornada flagship**: checkout_direto
- **Payable pain**: 0.70 (gerenciar time, pipeline, metricas de forma integrada)
- **N4+ proof speed**: 0.55 (team module, pipeline, dashboard — varios modulos em TIER 2/3)
- **Adoption friction**: 0.60 (migrar time inteiro para nova plataforma e friccao alta)
- **Spontaneous referral**: 0.55 ("usa o Kloel pra gerenciar sua operacao")
- **Indispensability**: 0.65 (CRM + checkout + time integrados criam lock-in)
- **Composite**: 0.61

**Por que e 4o**: Gestor em crescimento e um mercado maior em ticket, mas exige
multi-modulos maduros simultaneamente (checkout + CRM + time + dashboard). A
prova N4+ e mais lenta porque depende de varias integracoes.

---

### Candidato 5 — Creator em Validacao via Assinatura

- **marketId**: `creator-validacao-assinatura`
- **Papel**: creator
- **Estagio**: validacao
- **Tipo de negocio**: educacao
- **Jornada flagship**: assinatura
- **Payable pain**: 0.65 (monetizar audiencia com conteudo pago sem destruir relacao)
- **N4+ proof speed**: 0.40 (member area TIER 2 parcial; assinatura/billing recorrente complexo)
- **Adoption friction**: 0.50 (creator precisa mudar habitos de publicacao e monetizacao)
- **Spontaneous referral**: 0.60 ("usa o Kloel pra vender sua comunidade paga")
- **Indispensability**: 0.50 (conteudo e audiencia sao portateis; plataforma e substituivel)
- **Composite**: 0.53

**Por que e 5o**: Creator economy e um mercado grande, mas o Kloel ainda nao
tem member area robusta nem billing recorrente maduro. A prova N4+ depende de
construcao longa de funcionalidades novas.

---

## 4. Analise Comparativa

```
POS  SCORE  MERCADO                                    DIFERENCIAL
1    0.92   Produtor Infoproduto Validacao Checkout     Prova mais rapida. Menor friccao.
2    0.79   Closer Tracao WhatsApp                       Maior engajamento. Canal dominante.
3    0.69   Afiliado Tracao Afiliacao                    Depende de ecossistema produtor.
4    0.61   Gestor Crescimento Checkout                  Maior ticket. Multi-modulo.
5    0.53   Creator Validacao Assinatura                 Mercado grande. Infra pendente.
```

A diferenca de 0.13 entre o 1o e o 2o lugar e significativa (> 16% de vantagem
relativa), justificando focar exclusivamente no primeiro ate que ele atinja
maturidade operacional comprovada.

---

## 5. Recomendacao — Mercado Ativo

**Mercado ativo**: `produtor-infoproduto-validacao-checkout`

**Fundamentacao**:

1. **Caminho minimo para valor**. O fluxo "criar produto → checkout → receber"
   e o percurso mais curto entre signup e primeira receita. Cada passo ja existe
   no Kloel com maturidade funcional (product CRUD, Stripe checkout, payment
   webhook).

2. **Friccao de adocao minima**. O produtor de infoproduto ja quer vender — o
   Kloel nao precisa convence-lo a mudar comportamento, so precisa mostrar que
   funciona. Nao ha habito estabelecido competindo (diferente do WhatsApp, onde
   o closer ja tem o app nativo).

3. **Prova de valor medivel em horas**. Um produtor pode criar produto, conectar
   Stripe, gerar link de checkout e receber primeiro pagamento em menos de uma
   hora. Isso gera o "choque de valor" da Camada XI (First-Hour Wow, R15).

4. **Base para ecossistema**. Produtores ativos atraem afiliados (Candidato 3)
   naturalmente. E o efeito de rede mais organico: produtor → checkout →
   afiliado → mais produtores.

5. **Indispensabilidade por lock-in de dados**. Uma vez que o produtor tem
   produtos, clientes, historico de pagamentos e links de checkout espalhados,
   migrar de plataforma tem custo real — aumentando retencao e LTV (Camada
   XVIII).

### O que NAO significa

- Nao significa que closers, afiliados, gestores ou creators nao podem usar o
  Kloel.
- Nao significa que features para outros papeis sao proibidas.
- Significa que: **defaults de onboarding, mensagens de marketing, prioridade de
  bugfix, esforco de prova N4+, e narrativa de valor concentram-se neste
  mercado.**

---

## 6. Implementacao — MercadoEntradaDeclarator

O `MercadoEntradaDeclaratorService` e um servico NestJS que:

1. **Declara o mercado ativo** como constante imutavel em codigo.
2. **Expoe os 5 candidatos ranqueados** com scores e justificativas.
3. **Permite mudanca de mercado ativo** via `declareMarket()`, emitindo evento
   `mercado_entrada.declared` no spine cognitivo.
4. **Mantem historico de declaracoes** em memoria (ring buffer) para auditoria.
5. **Serve como contrato canonico** para outros modulos consultarem o mercado
   ativo sem acoplamento direto.

### API do servico

```typescript
class MercadoEntradaDeclaratorService {
  getActiveMarket(): EntryMarket
  getActiveDeclaration(): EntryMarketDeclaration
  getCandidates(): readonly EntryMarketCandidate[]
  getDeclarationHistory(): readonly EntryMarketDeclaration[]
  declareMarket(marketId: string, declaredBy: string): DeclareResult
}
```

### Evento no spine

Toda declaracao (incluindo a inicializacao) emite:

```
mercado_entrada.declared
  workspaceId: undefined (evento global)
  truthMode: 'observed'
  provenance: { source: 'synthetic' inicial, 'production' apos cutover }
  payload: {
    marketId, label, role, stage, businessType, flagshipJourney,
    previousMarketId, declaredBy
  }
```

### Historico de mudancas

O servico mantem um array em memoria com todas as declaracoes. A declaracao
inicial e feita no `onModuleInit()` do NestJS. Mudancas subsequentes sao
registradas com `previousMarketId` preenchido.

---

## 7. Integracao com o Organismo Cognitivo

| Camada | Como o mercado de entrada interage |
|---|---|
| **XXIII — Role-Aware** | O mercado ativo define o papel dominante esperado. O role detector (Camada XXIII) pode usar o mercado ativo como prior bayesiano. |
| **VIII — Maturity** | O mercado ativo define o estagio inicial esperado. O maturity classifier (Camada VIII) pode calibrar thresholds por mercado. |
| **III — Goal Field** | Tensoes e objetivos podem ser filtrados por relevancia ao mercado ativo. |
| **VII — Insight** | Insights estrategicos priorizam padroes do mercado ativo. |
| **XI — Wow** | O onboarding first-hour wow e desenhado para o mercado ativo. |
| **XXI — Commercial Memory** | Capital comercial acumulado e segmentado por mercado. |

### PCI event domain note

O evento `mercado_entrada.declared` introduz um novo dominio (`mercado_entrada.*`)
que nao esta na taxonomia canonica do PCI (Parte A, PCI.1). Os dominios
canonicos sao: `lineage.*`, `cognition.*`, `commerce.*`, `goal_field.*`,
`pulse.*`, `legitimacy.*`, `incentive.*`, `evolution.*`. Recomenda-se avaliar
se `mercado_entrada.*` deve ser incorporado ao PCI como dominio canonico ou
se o evento deve ser migrado para `goal_field.goal_promoted` (semanticamente
proximo: declarar um objetivo estrategico como ativo). Enquanto isso, o evento
e emitido com o nome especificado por diretiva do owner.

---

## 8. Riscos e Limitacoes

| Risco | Mitigacao |
|---|---|
| Mercado ativo vira dogma e ignora sinais reais do spine | O declarator registra historico auditavel; mudanca de mercado e suportada; o marketId atual e sempre verificavel |
| Candidatos foram definidos sem dados quantitativos de mercado | Os scores sao estimativas fundamentadas; devem ser recalibrados com dados reais de adocao, churn e NPS |
| Foco excessivo em um mercado atrasa funcionalidades para outros papeis | Features criticas cross-role (ex.: WhatsApp) continuam sendo desenvolvidas; mercado ativo afeta prioridade, nao exclusividade |
| Novo dominio de evento fora do PCI canonico | Reportado na secao 7; aguarda decisao do owner sobre incorporacao ao PCI ou migracao para dominio existente |

---

## 9. Criterios de Sucesso

O mercado de entrada e considerado bem-sucedido quando, para workspaces que
se encaixam no perfil `produtor + validacao + infoproduto + checkout_direto`:

1. **R1 atinge N4+**: recuperacao comercial mensuravel (carrinho abandonado,
   follow-up) em >= 30% dos casos detectaveis.
2. **R15 atinge N4+**: >= 60% dos produtores recebem insight confirmado na
   primeira hora apos signup.
3. **R11 atinge threshold**: classificacao de estagio >= 70% confianca para
   workspaces deste mercado.
4. **Churn em 30 dias < 40%** para produtores que configuraram checkout.
5. **Tempo ate primeira venda < 48h** para produtores que completaram setup.

---

## 10. Proximos Passos

1. Implementar `MercadoEntradaDeclaratorService` + spec (esta task).
2. Integrar com onboarding: tela de signup usa mercado ativo para escolher
   template de workspace, CTA e copy.
3. Integrar com Goal Field: tensoes relevantes ao mercado ativo ganham peso
   adicional no aggregator.
4. Integrar com Insight Engine: detectores priorizam padroes do mercado ativo.
5. Recalibrar candidatos com dados reais de 50+ workspaces ativos.
6. Decidir sobre incorporacao de `mercado_entrada.*` ao PCI canonico.
