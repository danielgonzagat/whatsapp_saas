# Organism Layers Mapping — Organismo Delivery

> Conferencia agentica 2026-05-12. Tabela que mapeia cada modulo tocado nesta
> entrega a uma das 7 camadas do organismo (corpo, sentidos, memoria, politica,
> linguagem, acao, aprendizado). Modulos que nao encaixam limpo tem nota <100 chars.

## Layers Table

| Layer | Modules | Notes |
|-------|---------|-------|
| **corpo** | `ChannelSetupService` (M4), `BrainRuntimeService` (M10) | Infraestrutura de configuracao e coordenacao. M4 define o que cada canal PODE fazer; M10 coordena o fluxo cerebral. |
| **sentidos** | `WhatsAppBrainController` (M7), `MetaAuthController` (M8) | Portas de entrada para eventos externos. M7: webhooks Meta. M8: OAuth Meta. |
| **memoria** | `MindService` (M2), `mind-commercial-decision-resolvers` (M3) | Cerebro estatistico. M2: crencas, casos, surpresas, politicas. M3: resolvers bayesianos que consultam `MindPolicyService.choose()`. |
| **politica** | `BrainCapabilityRegistryService` (M9), `channel-repertoire.config.ts` (M11), `brain-capability-policy.ts` (M9-policy), `PipelineService` (M12) | Contratos e gates. M9: o que cada source pode fazer. M11: o que cada canal pode fazer. M12: qual cerebro decide em producao. |
| **linguagem** | `UnifiedAgentService` (M5) | Traduz contexto em linguagem natural via LLM. Comp oe mensagens, processa tool calls, faz fallback de modelo. |
| **acao** | `CommercialDecisionOrchestratorService` (M1), `UnifiedAgentActionsMessagingService` (M6), `cia-action-dispatch.ts` (M15), `cia-cycle-workspace.ts` (M16), `BrainCapabilityExecutorService` (M10-executor) | Execucao concreta. M1 decide o que fazer. M6 envia ao transport. M15 despacha acoes CIA. M16 planeja e enfileira acoes. |
| **aprendizado** | `global-learning.ts` (M13), `self-improvement.ts` (M14) | Extrai padroes e reforca variantes. M13: cross-workspace. M14: bandit arms bayesianos por workspace. |

## Cross-Cutting Notes

| Module | Why cross-cutting |
|--------|-------------------|
| `UnifiedAgentService` (M5) | `linguagem` + `acao`: produz texto e executa tool calls. Layer primaria: linguagem. |
| `CommercialDecisionOrchestratorService` (M1) | `acao` + `politica`: decide acoes MAS tambem aplica gates de repertorio e agressividade. Layer primaria: acao. |
| `BrainCapabilityRegistryService` (M9) | `politica` pura: registry de capacidades + policy de permissao. |
| `PipelineService` (M12) | `politica` pura: controla transicao entre cerebros (legacy/shadow/active). |

## Untouched by This Delivery

- `backend/src/kloel/mind-catalog-decision-resolvers.ts` — catalog resolvers (tone, format, coupon, etc.). Read but not assigned a separate module slot; lives inside `MindService` scope.
- `backend/src/kloel/brain-capability-executor.service.ts` — executor de capabilities de operador. Read but folded into `BrainRuntimeService` (M10).
- `backend/src/kloel/brain-capability-policy.ts` — policy de risco. Read but folded into `BrainCapabilityRegistryService` (M9).
- `worker/providers/mind-client.ts` — `resolveBestVariantViaHttp()`. Ponte HTTP entre worker e MindService. Nao lido diretamente.
- `backend/src/kloel/unified-agent-predecided-actions.part.ts` — executa acoes pre-decididas. Referenciado mas nao lido como modulo independente.
