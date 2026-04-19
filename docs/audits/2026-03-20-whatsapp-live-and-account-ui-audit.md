# Auditoria Técnica: WhatsApp ao Vivo + Conta Completa na Tela Principal

Data: `2026-03-20`

## Escopo auditado

Esta auditoria cruza:

- shell principal do frontend em
  [`frontend/src/components/kloel/chat-container.tsx`](/workspaces/whatsapp_saas/frontend/src/components/kloel/chat-container.tsx)
- drawer de configurações em
  [`frontend/src/components/kloel/settings/settings-drawer.tsx`](/workspaces/whatsapp_saas/frontend/src/components/kloel/settings/settings-drawer.tsx)
- seções de configuração em
  [`frontend/src/components/kloel/settings/account-settings-section.tsx`](/workspaces/whatsapp_saas/frontend/src/components/kloel/settings/account-settings-section.tsx),
  [`frontend/src/components/kloel/settings/billing-settings-section.tsx`](/workspaces/whatsapp_saas/frontend/src/components/kloel/settings/billing-settings-section.tsx),
  [`frontend/src/components/kloel/settings/brain-settings-section.tsx`](/workspaces/whatsapp_saas/frontend/src/components/kloel/settings/brain-settings-section.tsx),
  [`frontend/src/components/kloel/settings/crm-settings-section.tsx`](/workspaces/whatsapp_saas/frontend/src/components/kloel/settings/crm-settings-section.tsx)
  e
  [`frontend/src/components/kloel/settings/analytics-settings-section.tsx`](/workspaces/whatsapp_saas/frontend/src/components/kloel/settings/analytics-settings-section.tsx)
- página de conexão do WhatsApp em
  [`frontend/src/app/(main)/whatsapp/page.tsx`](/workspaces/whatsapp_saas/frontend/src/app/(main)/whatsapp/page.tsx)
- stream operacional do backend em
  [`backend/src/whatsapp/controllers/whatsapp-api.controller.ts`](/workspaces/whatsapp_saas/backend/src/whatsapp/controllers/whatsapp-api.controller.ts)
- registries e runtime de conta em
  [`backend/src/whatsapp/account-agent.registry.ts`](/workspaces/whatsapp_saas/backend/src/whatsapp/account-agent.registry.ts)
  e
  [`backend/src/whatsapp/account-agent.service.ts`](/workspaces/whatsapp_saas/backend/src/whatsapp/account-agent.service.ts)

## O que já foi materializado agora

### Painel direito

- O `AgentConsole` mockado foi substituído, no shell principal, por um `WhatsAppConsole` em
  [`frontend/src/components/kloel/WhatsAppConsole.tsx`](/workspaces/whatsapp_saas/frontend/src/components/kloel/WhatsAppConsole.tsx).
- O handle colapsado agora usa um ícone dedicado de WhatsApp em
  [`frontend/src/components/icons/WhatsAppIcon.tsx`](/workspaces/whatsapp_saas/frontend/src/components/icons/WhatsAppIcon.tsx).
- Quando desconectado, o painel exibe QR Code, instruções, status, botão de conectar e reset.
- Quando conectado, o painel exibe:
  - cabeçalho com status
  - ação de fechar
  - ação de desconectar
  - ação de pausar/retomar IA
  - simulação de smartphone
  - lista de conversas sincronizadas
  - feed vivo das ações do agente

### Reuso do fluxo de conexão

- A lógica de sessão foi extraída para
  [`frontend/src/hooks/useWhatsAppSession.ts`](/workspaces/whatsapp_saas/frontend/src/hooks/useWhatsAppSession.ts).
- O hook concentra:
  - status
  - QR
  - conexão
  - reset
  - pausa da autonomia
  - retomada da autonomia

### Painel esquerdo

- O `SettingsDrawer` agora suporta ancoragem à esquerda e handle lateral colapsado.
- O shell principal continua central; o usuário não precisa sair da página para abrir configurações.
- As tabs operacionais hoje já incluem:
  - Conta
  - Métodos de pagamento
  - Configurar Kloel
  - CRM e pipeline
  - Analytics
  - Atividade

### Conta, pagamentos e Kloel

- [`account-settings-section.tsx`](/workspaces/whatsapp_saas/frontend/src/components/kloel/settings/account-settings-section.tsx)
  já carrega e persiste dados reais de conta, provider, jitter e canais.
- [`billing-settings-section.tsx`](/workspaces/whatsapp_saas/frontend/src/components/kloel/settings/billing-settings-section.tsx)
  já opera saldo, Asaas, resumo de vendas, links externos, tracking e credenciais de plataforma.
- [`brain-settings-section.tsx`](/workspaces/whatsapp_saas/frontend/src/components/kloel/settings/brain-settings-section.tsx)
  já persiste:
  - identidade da empresa
  - personas
  - tom de voz
  - regras
  - FAQ
  - mensagem de abertura
  - modo de emergência
  - toggle/config de autopilot
  - knowledge base por texto e URL
- A parte de produto/oferta do drawer já conversa com produto real e links externos reais.

### CRM, pipeline e analytics

- [`crm-settings-section.tsx`](/workspaces/whatsapp_saas/frontend/src/components/kloel/settings/crm-settings-section.tsx)
  já materializa:
  - leitura de contatos
  - criação de contato
  - presets de segmentação
  - estatísticas de segmentação
  - auto-segmentação
  - leitura/criação de pipelines
  - leitura/criação de deals
  - movimentação de deals entre estágios
- [`analytics-settings-section.tsx`](/workspaces/whatsapp_saas/frontend/src/components/kloel/settings/analytics-settings-section.tsx)
  já puxa dashboard, atividade e analytics avançadas reais.

## Diagnóstico exaustivo do frontend atual

### 1. Configurações de conta

Estado atual:

- [`account-settings-section.tsx`](/workspaces/whatsapp_saas/frontend/src/components/kloel/settings/account-settings-section.tsx)
  já carrega `workspace/me`, canais, provider e jitter.
- Os dados de conta são persistidos via endpoints reais de workspace/account.
- O maior gap remanescente nesta área deixou de ser persistência básica e passou a ser cobertura de
  webhooks, domínio, API keys e time/permissões.

Conclusão:

- A seção deixou de ser mock primário.
- Ainda não cobre todos os ativos estruturais de conta expostos no backend.

### 2. Configurações do cérebro/Kloel

Estado atual:

- [`brain-settings-section.tsx`](/workspaces/whatsapp_saas/frontend/src/components/kloel/settings/brain-settings-section.tsx)
  já grava `providerSettings.kloelProfile`.
- Persona, tom, regras, FAQ, opening message e emergency mode já persistem no backend.
- O drawer já lê/grava knowledge base por texto e URL.
- Produto, plano e link deixaram de ser puramente visuais.

Conclusão:

- A área já saiu do estado majoritariamente mockado.
- O gap principal agora é upload dedicado de arquivo e cobertura de todos os fluxos de
  mídia/conhecimento.

### 3. Pagamentos

Estado atual:

- [`billing-settings-section.tsx`](/workspaces/whatsapp_saas/frontend/src/components/kloel/settings/billing-settings-section.tsx)
  já opera saldo, pendências, Asaas, PIX, boleto, relatório de vendas, links externos, tracking e
  credenciais por plataforma.
- O módulo ainda precisa ser expandido se a meta for paridade total com todos os cenários de
  plataforma, mas não está mais fragmentado como antes.

Conclusão:

- Existe um painel real de pagamento no shell principal.
- Ainda faltam refinamentos e cenários mais avançados, não a base operacional.

### 4. Atividade

Estado atual:

- [`activity-section.tsx`](/workspaces/whatsapp_saas/frontend/src/components/kloel/settings/activity-section.tsx)
  já consome atividade real.
- A barra de pensamento/trace no shell principal mostra reasoning/action trace vivo do dia.

Conclusão:

- O usuário já enxerga atividade real, mas ainda falta unificar todos os domínios de conta no mesmo
  stream.

### 5. WhatsApp

Estado atual antes do patch:

- A página dedicada
  [`frontend/src/app/(main)/whatsapp/page.tsx`](/workspaces/whatsapp_saas/frontend/src/app/(main)/whatsapp/page.tsx)
  já possuía QR/status/reset/desconexão.
- O painel lateral direito não reaproveitava isso; usava
  [`AgentConsole.tsx`](/workspaces/whatsapp_saas/frontend/src/components/kloel/AgentConsole.tsx),
  que era um monitor mockado.

Estado atual depois do patch:

- O painel lateral direito agora já conversa com a sessão WhatsApp real.
- O feed do agente e da prova ao vivo já passa por
  [`backend/src/whatsapp/controllers/whatsapp-api.controller.ts`](/workspaces/whatsapp_saas/backend/src/whatsapp/controllers/whatsapp-api.controller.ts)
  em `GET /whatsapp-api/live`.
- As conversas/mensagens são sincronizadas via `whatsappApi.getChats()` e
  `whatsappApi.getChatMessages()`.

Conclusão:

- O painel vivo do WhatsApp deixou de ser só uma ideia de UX e passou a ter base operacional real.

## Diagnóstico exaustivo: capacidades do backend ainda sem cobertura completa no frontend

### A. Workspace/Conta

O backend expõe, diretamente ou por serviços associados:

- provedor/canal
- jitter
- settings de atendimento
- dados de conta
- canais adicionais
- webhooks
- ativos estruturais da conta

Situação atual do frontend:

- já existe formulário consolidado e persistente para conta básica
- ainda não há editor operacional de webhook
- ainda não há UI de domínio
- ainda não há UI de API keys
- ainda não há UI de time/permissões no shell principal

### B. Produtos, planos e links de venda

O backend cobre:

- produto
- planos de checkout
- links externos
- integrações de checkout
- enriquecimento comercial de produto

Situação atual do frontend:

- o drawer já saiu do zero em produto + checkout
- ainda falta uma seção dedicada e mais completa de catálogo/ofertas
- o usuário ainda não tem uma experiência total de catálogo no shell principal

### C. Pagamentos e plataformas externas

O backend cobre:

- Asaas
- payment links
- wallet
- relatório de vendas
- configurações de plataformas externas

Situação atual do frontend:

- a maior parte da operação já foi trazida para o drawer
- ainda faltam refinamentos e alguns cenários avançados, não mais a ausência total de UI

### D. Segmentação, pipeline e CRM

O backend cobre:

- segmentos
- score
- leads
- pipeline
- deals

Situação atual do frontend:

- já existe um drawer esquerdo cobrindo CRM, segmentação e pipeline básicos
- ainda não existe builder avançado de segmentos personalizados
- ainda faltam tags inline, scoring profundo e CRM expandido no shell principal

### E. Flows, campanhas e marketplace

O backend cobre:

- flows
- versões
- logs
- templates
- instalador de marketplace
- otimização de flow
- campanhas

Situação atual do frontend:

- páginas dedicadas existem
- não existe acesso consolidado no painel lateral de conta
- não existe catálogo de template integrado ao shell principal

### F. Mídia, catálogos e conhecimento

O backend cobre:

- upload
- mídia
- PDF processor
- áudio
- memória

Situação atual do frontend:

- já existe módulo real de knowledge base dentro das configurações
- ainda falta upload de arquivo dedicado e cobertura completa de mídia/catalogação

## O que precisa ser feito para a conta ficar realmente completa na tela principal

### Fase 1: consolidar o shell principal

1. Manter o `WhatsAppConsole` como painel direito oficial.
2. Manter `SettingsDrawer` como painel esquerdo oficial.
3. Remover dependência do usuário em páginas isoladas para setup primário.

### Fase 2: transformar o drawer esquerdo em centro operacional da conta

Completar as tabs reais, persistidas e carregadas do backend:

- Conta
- Canais
- Pagamentos
- Produtos e ofertas
- Catálogos e arquivos
- Kloel/Autonomia
- Segmentação e CRM
- Pipeline
- Flows e campanhas
- Analytics

### Fase 3: matar estados locais mockados

Substituir `useState` local isolado por:

- carregamento inicial do backend
- formulários controlados
- persistência por `POST`/`PUT`
- feedback de loading/erro/sucesso

### Fase 4: fechar lacunas críticas para operação comercial

Prioridade máxima:

1. seção dedicada de catálogo/ofertas completa
2. knowledge base com upload de arquivo
3. flows/campanhas/marketplace no shell principal
4. webhooks, domínio, API keys e team/permissões
5. controle de pausa/retomada do agente por canal com cobertura total da conta

### Fase 5: levar tudo para o universo formal de agência/prova

Cada ação de conta precisa convergir para:

- capability registry
- work item canônico
- proof snapshot
- execution ledger

Isso vale para:

- billing
- domínio
- webhook
- API keys
- team/permissões
- flow
- campanha
- catálogo

## Limites honestos depois deste patch

O que já ficou operacional:

- painel direito do WhatsApp vivo
- handle esquerdo de configurações
- hook compartilhado de sessão
- QR/status/pause/disconnect no painel direito
- simulação móvel com conversas e ações do agente
- conta básica persistida
- pagamentos reais no drawer
- Kloel profile persistido
- autopilot real no drawer
- knowledge base por texto/URL
- CRM, segmentação e pipeline básicos no drawer
- analytics reais no drawer
- trace vivo de pensamento/ação no shell principal

O que ainda não ficou completo:

- o backend rico da conta ainda não está totalmente exposto no shell principal
- faltam fluxos/campanhas/marketplace no drawer
- faltam webhooks, domínio, API keys e team/permissões
- falta upload de arquivo dedicado na base de conhecimento
- o painel direito ainda combina stream live com polling de chats/mensagens
- o frontend ainda não cobre exaustivamente todo o backend de conta

## Próxima implementação recomendada

1. Criar uma seção dedicada de catálogo/ofertas completa no drawer.
2. Adicionar upload de arquivo real na knowledge base.
3. Trazer flows/campanhas/marketplace para o shell principal.
4. Expor webhooks, domínio, API keys e team/permissões no drawer.
5. Evoluir `whatsapp/live` para reduzir ainda mais o polling de chats/mensagens.
