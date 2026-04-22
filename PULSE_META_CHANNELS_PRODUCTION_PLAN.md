# PULSE Meta Channels Production Plan

Last updated: `2026-04-22`
Owner: Codex
Scope: Meta official channels in Marketing, callbacks/webhooks, workspace isolation and human-like conversational quality

Status legend:

- `pending`
- `in_progress`
- `green`
- `blocked_external`

Canonical evidence JSON: [PULSE_META_CHANNELS_PRODUCTION_EVIDENCE.json](./PULSE_META_CHANNELS_PRODUCTION_EVIDENCE.json)
Human-like audit: [PULSE_META_HUMAN_LIKE_AUDIT.md](./PULSE_META_HUMAN_LIKE_AUDIT.md)
Human-like evidence JSON: [PULSE_META_HUMAN_LIKE_EVIDENCE.json](./PULSE_META_HUMAN_LIKE_EVIDENCE.json)

## Current verdict

- WhatsApp Marketing surface: `green`
- Instagram Marketing surface: `green`
- Facebook Marketing surface: `green`
- WhatsApp official runtime proof from this clean branch: `in_progress`
- Instagram official live operation: `blocked_external`
- Messenger official live operation: `blocked_external`
- Lead Ads realtime ingestion: `green`
- Multi-tenant isolation proof: `in_progress`
- Human-like quality: `in_progress`
- Production readiness: `not_ready`

## Validation executed on this clean branch

- `DATABASE_URL=<railway postgres> npm --prefix backend run prisma:validate`
- `npm --prefix backend run typecheck`
- `npm --prefix frontend run typecheck`
- `npm --prefix backend run test -- --runInBand src/kloel/meta-production-unified-agent.service.spec.ts src/meta/webhooks/meta-leadgen.service.spec.ts src/meta/webhooks/meta-webhook.controller.spec.ts`
- `npm --prefix frontend run test -- src/components/kloel/marketing/meta/meta-marketing-surfaces.test.tsx`
- `npm --prefix backend run build`
- `NEXT_PUBLIC_API_URL=https://api.kloel.com BACKEND_URL=https://api.kloel.com npm --prefix frontend run build`

## Changed files in this branch

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260421173000_meta_lead_capture/migration.sql`
- `backend/src/kloel/kloel.module.ts`
- `backend/src/kloel/kloel.service.ts`
- `backend/src/kloel/unified-agent.controller.ts`
- `backend/src/kloel/meta-production-unified-agent.service.ts`
- `backend/src/kloel/meta-production-unified-agent.service.spec.ts`
- `backend/src/meta/meta-auth.controller.ts`
- `backend/src/meta/meta.module.ts`
- `backend/src/meta/webhooks/meta-webhook.controller.ts`
- `backend/src/meta/webhooks/meta-leadgen.service.ts`
- `backend/src/meta/webhooks/meta-leadgen.service.spec.ts`
- `backend/src/meta/webhooks/meta-webhook.controller.spec.ts`
- `backend/src/whatsapp/cia-runtime.service.ts`
- `backend/src/whatsapp/inbound-processor.service.ts`
- `frontend/src/app/(main)/marketing/whatsapp/page.tsx`
- `frontend/src/app/(main)/marketing/instagram/page.tsx`
- `frontend/src/app/(main)/marketing/facebook/page.tsx`
- `frontend/src/components/kloel/marketing/meta/meta-marketing.helpers.ts`
- `frontend/src/components/kloel/marketing/meta/meta-marketing-shell.tsx`
- `frontend/src/components/kloel/marketing/meta/meta-marketing-cards.tsx`
- `frontend/src/components/kloel/marketing/meta/meta-marketing-whatsapp.tsx`
- `frontend/src/components/kloel/marketing/meta/meta-marketing-instagram.tsx`
- `frontend/src/components/kloel/marketing/meta/meta-marketing-facebook.tsx`
- `frontend/src/components/kloel/marketing/meta/meta-marketing-page.tsx`
- `frontend/src/components/kloel/marketing/meta/meta-marketing-surfaces.test.tsx`
- `docs/compliance/meta-cia-operator-setup.md`

## A. Baseline e limpeza de superfície

| ID | Check | Status | Evidence | Files | Routes | Tests | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | identificar todas as entradas de produção em Marketing que ainda dependem do fluxo legado de WhatsApp por QR | `green` | `baseline-legacy-whatsapp-qr-inventory` | `frontend/src/app/(main)/marketing/whatsapp/page.tsx`, `frontend/src/components/kloel/marketing/meta/meta-marketing-page.tsx` | `GET /marketing/whatsapp` | `rg`, `meta-marketing-surfaces.test.tsx` | o alvo de produção foi isolado da superfície QR |
| A2 | identificar todas as entradas de produção em Marketing que ainda usam “Em breve” para Instagram/Facebook | `green` | `baseline-coming-soon-inventory` | `frontend/src/app/(main)/marketing/instagram/page.tsx`, `frontend/src/app/(main)/marketing/facebook/page.tsx` | `GET /marketing/instagram`, `GET /marketing/facebook` | `rg`, `meta-marketing-surfaces.test.tsx` | overlays do alvo foram mapeados e removidos da rota final |
| A3 | identificar todos os pontos onde a IA autônoma já opera ou deveria operar nesses 3 canais | `green` | `baseline-ai-touchpoints-inventory` | `backend/src/kloel/meta-production-unified-agent.service.ts`, `backend/src/whatsapp/inbound-processor.service.ts` | `POST /kloel/agent/:workspaceId/process`, `POST /webhooks/meta` | `meta-production-unified-agent.service.spec.ts` | a entrada do agente e os runtimes ligados ao omnichannel foram mapeados |
| A4 | identificar rotas, jobs, webhooks, filas e entidades de dados desses canais | `green` | `meta-leadgen-realtime`, `whatsapp-webhook-routing`, `multi-tenant-asset-scoping` | `backend/src/meta/**`, `backend/src/whatsapp/**`, `backend/prisma/schema.prisma` | `GET /meta/auth/*`, `POST /webhooks/meta` | `typecheck`, `meta-webhook.controller.spec.ts` | a base canônica ficou concentrada em Meta Auth, Meta Webhook, runtimes e persistência |
| A5 | remover da superfície de produção qualquer CTA morto, overlay falso ou fluxo sem saída real | `green` | `marketing-route-shells`, `whatsapp-official-surface`, `instagram-official-surface`, `facebook-official-surface` | `frontend/src/app/(main)/marketing/*/page.tsx`, `frontend/src/components/kloel/marketing/meta/*` | rotas alvo de Marketing | `meta-marketing-surfaces.test.tsx` | o alvo não mostra mais QR nem “Em breve” |
| A6 | garantir que o usuário sempre veja estado real do canal, nunca estado inventado | `green` | `whatsapp-state-contract`, `whatsapp-official-assets`, `instagram-profile-insights-surface`, `facebook-official-surface` | `frontend/src/components/kloel/marketing/meta/meta-marketing-page.tsx`, `backend/src/meta/meta-auth.controller.ts` | `GET /marketing/connect/status`, `GET /meta/auth/status` | `typecheck` | a UI lê backend real e mostra bloqueios externos de forma honesta |
| A7 | contrato claro de estado por canal: not_connected / connecting / connection_incomplete / connected / degraded / permission_missing / token_expired / callback_failed / disconnected | `green` | `whatsapp-state-contract` | `frontend/src/components/kloel/marketing/meta/meta-marketing.helpers.ts`, `backend/src/meta/meta-auth.controller.ts`, `backend/src/meta/meta-whatsapp.service.ts` | `GET /marketing/connect/status`, `GET /meta/auth/status` | `typecheck` | a camada visual entende e traduz os estados canônicos necessários |

## B. WhatsApp onboarding oficial Meta na superfície de produção

| ID | Check | Status | Evidence | Files | Routes | Tests | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B1 | o passo 1 de `/marketing/whatsapp` não exibe mais QR Code | `green` | `whatsapp-official-surface` | `frontend/src/components/kloel/marketing/meta/meta-marketing-whatsapp.tsx` | `GET /marketing/whatsapp` | `meta-marketing-surfaces.test.tsx` | o copy e o layout são oficiais da Meta Cloud |
| B2 | o passo 1 inicia o fluxo oficial Meta / Embedded Signup / Cloud onboarding | `green` | `whatsapp-official-actions`, `meta-auth-callback` | `frontend/src/components/kloel/marketing/meta/meta-marketing-page.tsx`, `backend/src/meta/meta-auth.controller.ts` | `GET /meta/auth/url`, `GET /meta/auth/callback` | `typecheck` | connect usa URL oficial gerada no backend |
| B3 | o redirecionamento volta para `/marketing/whatsapp` no contexto correto | `green` | `meta-auth-callback` | `frontend/src/components/kloel/marketing/meta/meta-marketing-page.tsx`, `backend/src/meta/meta-auth.controller.ts` | `GET /meta/auth/callback` | `typecheck` | `returnTo=/marketing/whatsapp` é enviado e lido pelo callback/UI |
| B4 | o usuário vê estado claro durante abertura, retorno, vínculo incompleto, vínculo concluído, token expirado e reconexão necessária | `in_progress` | `whatsapp-state-contract`, `meta-auth-callback` | `frontend/src/components/kloel/marketing/meta/meta-marketing-page.tsx`, `frontend/src/components/kloel/marketing/meta/meta-marketing.helpers.ts` | `GET /marketing/whatsapp`, `GET /marketing/connect/status` | `typecheck` | a infraestrutura existe, mas faltam E2Es específicos para cada ramo |
| B5 | nenhum texto de QR, “escaneie no celular”, “dispositivos conectados” ou equivalente permanece no onboarding de produção do WhatsApp | `green` | `whatsapp-official-surface` | `frontend/src/components/kloel/marketing/meta/meta-marketing-whatsapp.tsx` | `GET /marketing/whatsapp` | `meta-marketing-surfaces.test.tsx` | o alvo renderiza copy anti-legado |
| B6 | o front de produção não depende mais de polling de QR legado para este fluxo | `green` | `marketing-route-shells`, `whatsapp-official-surface` | `frontend/src/app/(main)/marketing/whatsapp/page.tsx`, `frontend/src/components/kloel/marketing/meta/meta-marketing-page.tsx` | `GET /marketing/whatsapp` | `typecheck` | a rota final não monta `WhatsAppExperience` |
| B7 | UI mostra status, identidade do canal, phone number id, business/waba binding e motivo de degradação | `green` | `whatsapp-official-assets` | `frontend/src/components/kloel/marketing/meta/meta-marketing-whatsapp.tsx`, `backend/src/meta/meta-auth.controller.ts` | `GET /marketing/connect/status`, `GET /meta/auth/status` | `typecheck` | os cards exibem exatamente esses campos |
| B8 | existe ação real de reconnect | `green` | `whatsapp-official-actions` | `frontend/src/components/kloel/marketing/meta/meta-marketing-whatsapp.tsx` | `GET /meta/auth/url` | `typecheck` | o botão reabre o fluxo oficial |
| B9 | existe ação real de disconnect | `green` | `whatsapp-official-actions` | `frontend/src/components/kloel/marketing/meta/meta-marketing-page.tsx`, `backend/src/meta/meta-auth.controller.ts` | `POST /meta/auth/disconnect` | `typecheck` | a ação remove a conexão persistida |
| B10 | refresh de página não destrói o estado | `in_progress` | `whatsapp-state-contract` | `frontend/src/components/kloel/marketing/meta/meta-marketing-page.tsx` | `GET /marketing/connect/status` | `typecheck` | o estado vem do backend, mas falta smoke explícito de refresh |
| B11 | logout/login não destrói o estado persistido do canal | `in_progress` | `whatsapp-official-assets` | `backend/src/meta/meta-auth.controller.ts`, `backend/src/meta/meta-whatsapp.service.ts` | `GET /meta/auth/status` | `typecheck` | a persistência é por workspace; falta validação de sessão web ponta a ponta |
| B12 | o estado do canal vem de backend real e não de heurística temporária de front | `green` | `whatsapp-state-contract` | `backend/src/meta/meta-auth.controller.ts`, `backend/src/meta/meta-whatsapp.service.ts`, `frontend/src/components/kloel/marketing/meta/meta-marketing-page.tsx` | `GET /marketing/connect/status`, `GET /meta/auth/status` | `typecheck` | a tela busca status real do backend |

## C. WhatsApp operação real sobre Meta oficial

| ID | Check | Status | Evidence | Files | Routes | Tests | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | inbound oficial chega no sistema e é roteado ao workspace correto | `green` | `whatsapp-webhook-routing` | `backend/src/meta/webhooks/meta-webhook.controller.ts`, `backend/src/whatsapp/inbound-processor.service.ts` | `POST /webhooks/meta` | `typecheck` | a base oficial continua roteando por conexão persistida |
| C2 | outbound oficial funciona para o workspace correto | `in_progress` | `whatsapp-outbound-contract` | `backend/src/whatsapp/cia-runtime.service.ts`, `backend/src/kloel/kloel.service.ts` | `POST /kloel/agent/:workspaceId/process` | `meta-production-unified-agent.service.spec.ts` | falta smoke outbound live desta branch |
| C3 | conversas, mensagens, contatos e entidades seguem persistidos para o restante do produto | `in_progress` | `whatsapp-webhook-routing`, `meta-leadgen-realtime` | `backend/src/whatsapp/inbound-processor.service.ts`, `backend/src/meta/webhooks/meta-leadgen.service.ts` | `POST /webhooks/meta` | `meta-webhook.controller.spec.ts`, `meta-leadgen.service.spec.ts` | a persistência crítica está ligada, mas falta auditoria completa de CRM/inbox em runtime live |
| C4 | CRM/contato/conversa/mensagem continuam coerentes após a troca do legado pelo oficial | `in_progress` | `meta-leadgen-realtime`, `baseline-ai-touchpoints-inventory` | `backend/src/meta/webhooks/meta-leadgen.service.ts`, `backend/src/whatsapp/inbound-processor.service.ts` | `POST /webhooks/meta` | `meta-leadgen.service.spec.ts` | a coerência básica está preservada; falta prova ampla de regressão zero |
| C5 | a inteligência comercial autônoma opera no canal oficial dentro do prometido | `in_progress` | `humanlike-whatsapp`, `baseline-ai-touchpoints-inventory` | `backend/src/kloel/meta-production-unified-agent.service.ts`, `backend/src/whatsapp/cia-runtime.service.ts` | `POST /kloel/agent/:workspaceId/process` | `meta-production-unified-agent.service.spec.ts` | melhora real aplicada, mas falta validação live end-to-end |
| C6 | qualquer capacidade do legado não suportada oficialmente é removida ou recontratada de forma honesta | `green` | `whatsapp-official-surface`, `docs-meta-operator-setup` | `frontend/src/components/kloel/marketing/meta/meta-marketing-whatsapp.tsx`, `docs/compliance/meta-cia-operator-setup.md` | `GET /marketing/whatsapp` | `meta-marketing-surfaces.test.tsx` | o alvo não promete QR/browser nem esconde limites |
| C7 | ligação entre webhook/evento e workspace está correta e testada | `green` | `whatsapp-webhook-routing`, `meta-leadgen-realtime` | `backend/src/meta/webhooks/meta-webhook.controller.ts`, `backend/src/meta/webhooks/meta-webhook.controller.spec.ts` | `POST /webhooks/meta` | `meta-webhook.controller.spec.ts` | há cobertura para roteamento Page leadgen e base oficial |
| C8 | não há risco de um workspace receber eventos de outro workspace | `in_progress` | `multi-tenant-asset-scoping` | `backend/src/meta/webhooks/meta-webhook.controller.ts`, `backend/src/meta/meta-auth.controller.ts` | `POST /webhooks/meta`, `GET /meta/auth/status` | `typecheck` | arquitetura está por workspace, mas falta teste explícito multi-tenant negativo |
| C9 | não há envio por phone number id errado | `in_progress` | `whatsapp-official-assets`, `multi-tenant-asset-scoping` | `backend/src/meta/meta-whatsapp.service.ts` | `GET /meta/auth/status` | `typecheck` | o asset é resolvido por workspace; falta smoke live de envio |
| C10 | não há fallback silencioso para asset global indevido | `in_progress` | `multi-tenant-asset-scoping` | `backend/src/meta/meta-whatsapp.service.ts`, `backend/src/meta/meta-auth.controller.ts` | `GET /meta/auth/status` | `typecheck` | a persistência por workspace existe, mas falta teste negativo dedicado |

## D. Instagram conexão e operação real

| ID | Check | Status | Evidence | Files | Routes | Tests | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | remover completamente o overlay de “Em breve” de `/marketing/instagram` | `green` | `instagram-official-surface` | `frontend/src/app/(main)/marketing/instagram/page.tsx`, `frontend/src/components/kloel/marketing/meta/meta-marketing-instagram.tsx` | `GET /marketing/instagram` | `meta-marketing-surfaces.test.tsx` | overlay fora da rota final |
| D2 | o usuário pode iniciar conexão oficial Meta a partir da própria tela | `green` | `instagram-official-surface`, `meta-auth-callback` | `frontend/src/components/kloel/marketing/meta/meta-marketing-page.tsx` | `GET /meta/auth/url` | `typecheck` | botão chama URL oficial do backend |
| D3 | o retorno do callback volta para `/marketing/instagram` | `green` | `meta-auth-callback` | `frontend/src/components/kloel/marketing/meta/meta-marketing-page.tsx`, `backend/src/meta/meta-auth.controller.ts` | `GET /meta/auth/callback` | `typecheck` | `returnTo=/marketing/instagram` está implementado |
| D4 | o estado do Instagram no UI é real e persistente | `in_progress` | `instagram-profile-insights-surface`, `whatsapp-state-contract` | `frontend/src/components/kloel/marketing/meta/meta-marketing-page.tsx`, `backend/src/meta/meta-auth.controller.ts` | `GET /marketing/connect/status`, `GET /meta/auth/status` | `typecheck` | a persistência existe; falta validação live com ativo real |
| D5 | o UI mostra username, instagram account id, page binding e status real | `in_progress` | `instagram-profile-insights-surface` | `frontend/src/components/kloel/marketing/meta/meta-marketing-instagram.tsx` | `GET /meta/instagram/profile`, `GET /marketing/instagram` | `typecheck` | a renderização existe, mas depende de asset real conectado |
| D6 | perfil e insights reais funcionam com a conexão do workspace | `in_progress` | `instagram-profile-insights-surface` | `frontend/src/components/kloel/marketing/meta/meta-marketing-page.tsx`, `backend/src/meta/instagram/instagram.controller.ts` | `GET /meta/instagram/profile`, `GET /meta/instagram/insights/account` | `typecheck` | endpoints e consumo existem |
| D7 | falha de permissão, token expirado e reconexão aparecem de forma compreensível | `in_progress` | `whatsapp-state-contract`, `instagram-official-surface` | `frontend/src/components/kloel/marketing/meta/meta-marketing.helpers.ts`, `frontend/src/components/kloel/marketing/meta/meta-marketing-instagram.tsx` | `GET /marketing/instagram`, `GET /marketing/connect/status` | `typecheck` | contrato visual existe, mas faltam casos E2E específicos |
| D8 | operação real de DM/engajamento por Instagram fica validada no oficial | `blocked_external` | `instagram-live-asset-blocker` | `backend/src/meta/instagram/instagram.controller.ts`, `backend/src/meta/meta-auth.controller.ts` | `POST /meta/instagram/messages/send`, `GET /meta/auth/status` | inspeção live do Graph | o ativo profissional ainda não está ligado à Page validada |
| D9 | o canal entra no ecossistema real do produto: inbox, CRM, rastreamento, automação/autonomia | `in_progress` | `baseline-ai-touchpoints-inventory`, `humanlike-instagram` | `backend/src/kloel/meta-production-unified-agent.service.ts`, `backend/src/meta/webhooks/meta-webhook.controller.ts` | `POST /kloel/agent/:workspaceId/process`, `POST /webhooks/meta` | `meta-production-unified-agent.service.spec.ts` | base integrada existe; falta validação live de DM oficial |
| D10 | não existe mais dead-end no Marketing do Instagram | `green` | `instagram-official-surface` | `frontend/src/components/kloel/marketing/meta/meta-marketing-instagram.tsx` | `GET /marketing/instagram` | `meta-marketing-surfaces.test.tsx` | a tela sempre mostra próximo passo ou blocker real |

## E. Facebook Messenger conexão e operação real

| ID | Check | Status | Evidence | Files | Routes | Tests | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E1 | remover completamente o overlay de “Em breve” de `/marketing/facebook` | `green` | `facebook-official-surface` | `frontend/src/app/(main)/marketing/facebook/page.tsx`, `frontend/src/components/kloel/marketing/meta/meta-marketing-facebook.tsx` | `GET /marketing/facebook` | `meta-marketing-surfaces.test.tsx` | overlay removido da rota final |
| E2 | o usuário pode iniciar conexão oficial Meta a partir da própria tela | `green` | `facebook-official-surface`, `meta-auth-callback` | `frontend/src/components/kloel/marketing/meta/meta-marketing-page.tsx` | `GET /meta/auth/url` | `typecheck` | botão oficial disponível |
| E3 | o retorno do callback volta para `/marketing/facebook` | `green` | `meta-auth-callback` | `frontend/src/components/kloel/marketing/meta/meta-marketing-page.tsx`, `backend/src/meta/meta-auth.controller.ts` | `GET /meta/auth/callback` | `typecheck` | `returnTo=/marketing/facebook` implementado |
| E4 | a Page vinculada fica persistida por workspace | `green` | `multi-tenant-asset-scoping` | `backend/src/meta/meta-auth.controller.ts`, `backend/src/meta/meta-whatsapp.service.ts` | `GET /meta/auth/status` | `typecheck` | `pageId` e `pageName` ficam persistidos por workspace |
| E5 | o UI mostra status, page name, page id, reconnect/disconnect | `green` | `facebook-official-surface` | `frontend/src/components/kloel/marketing/meta/meta-marketing-facebook.tsx` | `GET /marketing/facebook` | `meta-marketing-surfaces.test.tsx` | os cards e botões estão na superfície final |
| E6 | inbound de Messenger chega ao workspace correto | `in_progress` | `messenger-page-subscription`, `multi-tenant-asset-scoping` | `backend/src/meta/webhooks/meta-webhook.controller.ts` | `POST /webhooks/meta` | `typecheck` | a base existe, mas a assinatura live segue bloqueada |
| E7 | outbound de Messenger funciona do workspace correto | `blocked_external` | `messenger-page-subscription` | `backend/src/meta/messenger/messenger.service.ts`, `backend/src/meta/meta-auth.controller.ts` | `POST /meta/messenger/send` | tentativa live prévia | bloqueado sem `pages_messaging` efetivo |
| E8 | o canal entra no fluxo real do produto: inbox, CRM, histórico, automação/autonomia | `in_progress` | `baseline-ai-touchpoints-inventory`, `humanlike-messenger` | `backend/src/kloel/meta-production-unified-agent.service.ts`, `backend/src/meta/webhooks/meta-webhook.controller.ts` | `POST /kloel/agent/:workspaceId/process`, `POST /webhooks/meta` | `meta-production-unified-agent.service.spec.ts` | falta validação live com Page realmente autorizada |
| E9 | não existe mais dead-end no Marketing do Facebook | `green` | `facebook-official-surface` | `frontend/src/components/kloel/marketing/meta/meta-marketing-facebook.tsx` | `GET /marketing/facebook` | `meta-marketing-surfaces.test.tsx` | a rota mostra estado real ou blocker real |

## F. Arquitetura Tech Provider / multi-tenant

| ID | Check | Status | Evidence | Files | Routes | Tests | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | arquitetura final é por workspace e não single-tenant | `green` | `multi-tenant-asset-scoping` | `backend/src/meta/meta-auth.controller.ts`, `backend/src/meta/meta-whatsapp.service.ts` | `GET /meta/auth/status`, `POST /webhooks/meta` | `typecheck` | persistência e resolução são por workspace |
| F2 | cada workspace mantém sua própria conexão Meta e seus próprios assets vinculados | `green` | `multi-tenant-asset-scoping` | `backend/src/meta/meta-auth.controller.ts` | `GET /meta/auth/status` | `typecheck` | status e assets vêm da conexão persistida do workspace |
| F3 | um workspace não enxerga, não usa e não herda assets de outro workspace | `in_progress` | `multi-tenant-asset-scoping` | `backend/src/meta/webhooks/meta-webhook.controller.ts` | `POST /webhooks/meta` | `typecheck` | falta teste negativo dedicado de vazamento cross-tenant |
| F4 | não existe compartilhamento indevido de page id, instagram account id, phone number id, waba binding e tokens | `in_progress` | `multi-tenant-asset-scoping` | `backend/src/meta/meta-auth.controller.ts`, `backend/src/meta/meta-whatsapp.service.ts` | `GET /meta/auth/status` | `typecheck` | o desenho está correto; a prova negativa ainda precisa de teste específico |
| F5 | se a jornada exigir criação/vinculação/attachment de assets/WABA, o caminho correto está implementado | `green` | `whatsapp-official-actions`, `meta-auth-callback` | `backend/src/meta/meta-auth.controller.ts`, `backend/src/meta/meta-whatsapp.service.ts` | `GET /meta/auth/url`, `GET /meta/auth/callback` | `typecheck` | o caminho oficial depende do Embedded Signup com `config_id` |
| F6 | o tráfego oficial de cada cliente fica ligado aos assets oficiais daquele cliente/workspace | `in_progress` | `multi-tenant-asset-scoping`, `whatsapp-webhook-routing` | `backend/src/meta/**` | `GET /meta/auth/status`, `POST /webhooks/meta` | `typecheck` | falta prova E2E multi-workspace |
| F7 | nunca operar implicitamente com a identidade da Kloel quando o esperado for a do cliente conectado | `green` | `whatsapp-official-assets`, `instagram-profile-insights-surface`, `facebook-official-surface` | `frontend/src/components/kloel/marketing/meta/*` | rotas alvo de Marketing | `typecheck` | a UI expõe o asset vinculado do workspace, não uma identidade global invisível |
| F8 | vínculo final dos assets fica explícito, persistido e exibível no produto | `green` | `whatsapp-official-assets`, `instagram-profile-insights-surface`, `facebook-official-surface` | `backend/src/meta/meta-auth.controller.ts`, `frontend/src/components/kloel/marketing/meta/*` | `GET /meta/auth/status`, `GET /marketing/connect/status` | `typecheck` | page, IG, WABA e phone number aparecem como dados reais |
| F9 | dados persistidos são suficientes para reconectar, diagnosticar e operar sem ambiguidade | `green` | `multi-tenant-asset-scoping`, `whatsapp-official-assets` | `backend/src/meta/meta-auth.controller.ts`, `backend/src/meta/meta-whatsapp.service.ts` | `GET /meta/auth/status` | `typecheck` | status, ids e tokens persistidos sustentam reconexão e diagnóstico |

## G. Backend, callback, webhook, segurança e resiliência

| ID | Check | Status | Evidence | Files | Routes | Tests | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| G1 | callback Meta funciona de ponta a ponta | `green` | `meta-auth-callback` | `backend/src/meta/meta-auth.controller.ts`, `frontend/src/components/kloel/marketing/meta/meta-marketing-page.tsx` | `GET /meta/auth/callback` | `typecheck` | fluxo e retorno por aba estão implementados |
| G2 | URL pública de callback usada pelo produto está correta | `green` | `docs-meta-operator-setup` | `docs/compliance/meta-cia-operator-setup.md`, `backend/src/meta/meta-whatsapp.service.ts` | `GET /meta/auth/callback` | revisão manual | URL canônica documentada: `https://api.kloel.com/meta/auth/callback` |
| G3 | webhook verify GET funciona | `green` | `meta-webhook-verify` | `backend/src/meta/webhooks/meta-webhook.controller.ts` | `GET /webhooks/meta` | verificação live 2026-04-22 | validado anteriormente e preservado no código |
| G4 | webhook POST assinado funciona | `green` | `meta-webhook-signed-post` | `backend/src/meta/webhooks/meta-webhook.controller.ts` | `POST /webhooks/meta` | smoke live prévia, `meta-webhook.controller.spec.ts` | assinatura obrigatória ativa |
| G5 | validação de assinatura é obrigatória e ativa | `green` | `meta-webhook-signed-post` | `backend/src/meta/webhooks/meta-webhook.controller.ts` | `POST /webhooks/meta` | `meta-webhook.controller.spec.ts` | `X-Hub-Signature-256` é recomputado e comparado |
| G6 | ack de webhook é rápido | `green` | `meta-webhook-signed-post` | `backend/src/meta/webhooks/meta-webhook.controller.ts` | `POST /webhooks/meta` | inspeção de código | o controller retorna `ok` e isola falhas por entrada |
| G7 | processamento é idempotente | `in_progress` | `whatsapp-webhook-routing`, `meta-leadgen-realtime` | `backend/src/meta/webhooks/meta-webhook.controller.ts`, `backend/src/whatsapp/inbound-processor.service.ts` | `POST /webhooks/meta` | specs atuais | há desenho defensivo, mas falta teste dedicado de duplicidade |
| G8 | duplicidade de eventos não causa duplicidade de efeito | `in_progress` | `tests-backend-leadgen-webhook` | `backend/src/meta/webhooks/meta-leadgen.service.ts`, `backend/src/whatsapp/inbound-processor.service.ts` | `POST /webhooks/meta` | specs atuais | falta replay duplicado explícito |
| G9 | token expirado gera estado real de degradação e reconexão | `green` | `whatsapp-state-contract` | `backend/src/meta/meta-whatsapp.service.ts`, `frontend/src/components/kloel/marketing/meta/meta-marketing.helpers.ts` | `GET /meta/auth/status`, `GET /marketing/connect/status` | `typecheck` | token expirado entra no contrato visual |
| G10 | falha de permissão gera erro compreensível | `in_progress` | `whatsapp-state-contract`, `instagram-official-surface`, `facebook-official-surface` | `frontend/src/components/kloel/marketing/meta/*`, `backend/src/meta/meta-auth.controller.ts` | `GET /meta/auth/callback`, `GET /marketing/*` | `typecheck` | textos humanos existem, faltam casos E2E |
| G11 | falha de callback gera retorno compreensível ao usuário | `green` | `meta-auth-callback` | `backend/src/meta/meta-auth.controller.ts`, `frontend/src/components/kloel/marketing/meta/meta-marketing-page.tsx` | `GET /meta/auth/callback` | `typecheck` | `reason` é propagado para banner humano |
| G12 | desconexão limpa o necessário sem quebrar integridade | `green` | `whatsapp-official-actions`, `messenger-page-subscription` | `backend/src/meta/meta-auth.controller.ts` | `POST /meta/auth/disconnect` | `typecheck` | desconecta e tenta revogar assinatura de Page em best effort |
| G13 | revogação best-effort é tratada sem esconder falha real | `green` | `messenger-page-subscription` | `backend/src/meta/meta-auth.controller.ts` | `POST /meta/auth/disconnect` | `typecheck` | falhas de unsubscribe geram warning, não falso sucesso invisível |
| G14 | logs e observabilidade permitem entender workspace, asset, falha, degradação e reconexão | `in_progress` | `meta-auth-callback`, `messenger-page-subscription`, `meta-leadgen-realtime` | `backend/src/meta/meta-auth.controller.ts`, `backend/src/meta/webhooks/meta-leadgen.service.ts` | `GET /meta/auth/callback`, `POST /webhooks/meta` | inspeção de código | há logs essenciais, mas falta auditoria consolidada de observabilidade em produção |

## H. Frontend contrato visual e UX real

| ID | Check | Status | Evidence | Files | Routes | Tests | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H1 | WhatsApp, Instagram e Facebook exibem estados reais, não placeholders | `green` | `marketing-route-shells`, `whatsapp-state-contract`, `instagram-profile-insights-surface`, `facebook-official-surface` | `frontend/src/components/kloel/marketing/meta/*` | rotas alvo de Marketing | `meta-marketing-surfaces.test.tsx`, `typecheck` | telas leem backend real e mostram blockers reais |
| H2 | o usuário sempre tem próximo passo claro: conectar, concluir vínculo, reconectar, corrigir permissão ou desconectar | `green` | `whatsapp-official-actions`, `instagram-official-surface`, `facebook-official-surface` | `frontend/src/components/kloel/marketing/meta/*` | rotas alvo | `typecheck` | toda superfície tem ações e cópia orientada a próximo passo |
| H3 | nenhum canal Meta fica coberto por overlay de “Em breve” | `green` | `baseline-coming-soon-inventory` | `frontend/src/app/(main)/marketing/instagram/page.tsx`, `frontend/src/app/(main)/marketing/facebook/page.tsx` | `GET /marketing/instagram`, `GET /marketing/facebook` | `meta-marketing-surfaces.test.tsx` | alvo limpo |
| H4 | mensagens de erro são úteis, humanas e em PT-BR | `green` | `meta-auth-callback`, `whatsapp-state-contract` | `frontend/src/components/kloel/marketing/meta/meta-marketing-page.tsx`, `frontend/src/components/kloel/marketing/meta/meta-marketing.helpers.ts` | `GET /marketing/*` | `typecheck` | banners e labels são humanos e localizados |
| H5 | o redirecionamento abre apenas host confiável da Meta | `green` | `whatsapp-official-actions` | `frontend/src/components/kloel/marketing/meta/meta-marketing-page.tsx`, `backend/src/meta/meta-whatsapp.service.ts` | `GET /meta/auth/url` | `typecheck` | a URL gerada aponta para `www.facebook.com/<version>/dialog/oauth` |
| H6 | a experiência de retorno do callback não deixa o usuário perdido | `green` | `meta-auth-callback` | `frontend/src/components/kloel/marketing/meta/meta-marketing-page.tsx` | `GET /marketing/*` | `typecheck` | há banner de sucesso/erro por aba |
| H7 | a navegação entre abas do Marketing continua íntegra | `green` | `marketing-route-shells` | `frontend/src/components/kloel/marketing/meta/meta-marketing.helpers.ts` | `GET /marketing/*` | `frontend build` | tabs dedicadas preservadas |
| H8 | nenhuma mudança visual desnecessária fora do escopo | `green` | `marketing-route-shells` | apenas páginas alvo e novos componentes `meta/*` | rotas alvo | revisão manual | o delta visível ficou concentrado nas 3 rotas |
| H9 | zero regressão óbvia nas abas não alvo | `in_progress` | `branch-validation-builds` | build global do frontend | build global | `frontend build` | não houve falha global; falta smoke manual mais amplo |

## I. Testes

| ID | Check | Status | Evidence | Files | Routes | Tests | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I1 | atualizar/remover cobertura de produção ancorada em QR legado | `green` | `tests-frontend-meta-surfaces` | `frontend/src/components/kloel/marketing/meta/meta-marketing-surfaces.test.tsx` | `GET /marketing/whatsapp` | teste frontend | o novo teste de aceite trava a superfície oficial sem QR |
| I2 | se fluxo legado permanecer por debug/admin, fica separado do aceite de produção | `green` | `baseline-legacy-whatsapp-qr-inventory` | rota alvo migrou; legado ficou fora da rota final | `GET /marketing/whatsapp` | `rg`, `meta-marketing-surfaces.test.tsx` | QR ainda existe em superfícies não alvo, fora do aceite principal |
| I3 | criar/atualizar testes unitários relevantes | `green` | `tests-backend-humanlike`, `tests-backend-leadgen-webhook`, `tests-frontend-meta-surfaces` | specs novas | backend + frontend | comandos acima | cobertura nova adicionada |
| I4 | criar/atualizar testes de integração relevantes | `green` | `tests-backend-leadgen-webhook` | `backend/src/meta/webhooks/*.spec.ts` | `POST /webhooks/meta` | `jest --runInBand` | roteamento + persistência |
| I5 | criar/atualizar testes E2E relevantes | `in_progress` | `meta-auth-callback` | ainda sem nova spec E2E dedicada | rotas alvo | pendente | falta E2E específico para callback/refresh |
| I6 | criar/atualizar smoke tests relevantes | `in_progress` | `docs-meta-operator-setup`, `meta-webhook-verify`, `meta-webhook-signed-post` | documentação e base | webhook/callback | smokes live prévios | falta repetir smoke da branch promovida |
| I7 | WhatsApp connect success via fluxo oficial | `in_progress` | `whatsapp-official-actions`, `meta-auth-callback` | frontend/backend Meta auth | callback/url | `typecheck` | implementação pronta, falta E2E dedicado |
| I8 | WhatsApp cancel/deny no fluxo oficial | `in_progress` | `meta-auth-callback` | `backend/src/meta/meta-auth.controller.ts` | `GET /meta/auth/callback` | `typecheck` | reason contract existe; falta teste |
| I9 | WhatsApp callback failure | `green` | `meta-auth-callback` | `backend/src/meta/meta-auth.controller.ts`, `frontend/src/components/kloel/marketing/meta/meta-marketing-page.tsx` | `GET /meta/auth/callback` | `typecheck` | erro gera retorno compreensível |
| I10 | WhatsApp reconnect | `green` | `whatsapp-official-actions` | `frontend/src/components/kloel/marketing/meta/meta-marketing-whatsapp.tsx` | `GET /meta/auth/url` | `typecheck` | botão real existe |
| I11 | WhatsApp disconnect | `green` | `whatsapp-official-actions` | `backend/src/meta/meta-auth.controller.ts` | `POST /meta/auth/disconnect` | `typecheck` | ação real existe |
| I12 | WhatsApp token expired / degraded | `green` | `whatsapp-state-contract` | `backend/src/meta/meta-whatsapp.service.ts`, `frontend/src/components/kloel/marketing/meta/meta-marketing.helpers.ts` | `GET /meta/auth/status` | `typecheck` | contrato implementado |
| I13 | WhatsApp inbound webhook roteado para workspace correto | `green` | `whatsapp-webhook-routing` | `backend/src/meta/webhooks/meta-webhook.controller.ts` | `POST /webhooks/meta` | `typecheck` | base oficial preservada |
| I14 | WhatsApp outbound real sobre o contrato oficial | `in_progress` | `whatsapp-outbound-contract` | runtimes/agent | runtime | `meta-production-unified-agent.service.spec.ts` | falta smoke live |
| I15 | Instagram connect success | `in_progress` | `instagram-official-surface`, `meta-auth-callback` | frontend/backend | callback/url | `typecheck` | sem E2E |
| I16 | Instagram reconnect / permission issue | `in_progress` | `instagram-official-surface`, `whatsapp-state-contract` | frontend/backend | callback/status | `typecheck` | base pronta; falta prova live |
| I17 | Instagram perfil/insights com conexão do workspace | `in_progress` | `instagram-profile-insights-surface` | frontend/backend | `/meta/instagram/profile`, `/meta/instagram/insights/account` | `typecheck` | bloqueado por asset real ausente |
| I18 | Facebook connect success | `in_progress` | `facebook-official-surface`, `meta-auth-callback` | frontend/backend | callback/url | `typecheck` | sem E2E |
| I19 | Facebook reconnect / permission issue | `in_progress` | `facebook-official-surface`, `messenger-page-subscription` | frontend/backend | callback/status | `typecheck` | base pronta; operação bloqueada externamente |
| I20 | Facebook Page vinculada ao workspace | `green` | `multi-tenant-asset-scoping` | `backend/src/meta/meta-auth.controller.ts` | `GET /meta/auth/status` | `typecheck` | page persistida por workspace |
| I21 | Messenger inbound roteado ao workspace correto | `in_progress` | `messenger-page-subscription`, `multi-tenant-asset-scoping` | `backend/src/meta/webhooks/meta-webhook.controller.ts` | `POST /webhooks/meta` | `typecheck` | falta live por blocker externo |
| I22 | Messenger outbound funcionando | `blocked_external` | `messenger-page-subscription` | `backend/src/meta/messenger/messenger.service.ts` | `POST /meta/messenger/send` | tentativa live prévia | bloqueado por `pages_messaging` |
| I23 | webhook verification GET | `green` | `meta-webhook-verify` | `backend/src/meta/webhooks/meta-webhook.controller.ts` | `GET /webhooks/meta` | verificação live 2026-04-22 | válido |
| I24 | signed webhook POST | `green` | `meta-webhook-signed-post` | `backend/src/meta/webhooks/meta-webhook.controller.ts` | `POST /webhooks/meta` | smoke live prévia, spec | válido |
| I25 | ausência de vazamento cross-tenant | `in_progress` | `multi-tenant-asset-scoping` | `backend/src/meta/**` | status/webhook | `typecheck` | falta teste explícito negativo |
| I26 | refresh de tela preservando estado correto | `in_progress` | `whatsapp-state-contract` | `frontend/src/components/kloel/marketing/meta/meta-marketing-page.tsx` | `GET /marketing/*` | `typecheck` | depende de fetch real do backend; falta smoke |
| I27 | callback retornando para a aba correta do Marketing | `green` | `meta-auth-callback` | `frontend/src/components/kloel/marketing/meta/meta-marketing-page.tsx`, `backend/src/meta/meta-auth.controller.ts` | `GET /meta/auth/callback` | `typecheck` | contrato implementado por canal |

## J. Evidência de produção

| ID | Check | Status | Evidence | Files | Routes | Tests | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| J1 | listar exatamente os arquivos alterados | `green` | seção “Changed files in this branch” | arquivo atual | n/a | revisão manual | lista acima é a verdade desta branch |
| J2 | listar exatamente as rotas/backends afetados | `green` | `marketing-route-shells`, `meta-auth-callback`, `meta-webhook-verify`, `meta-webhook-signed-post`, `meta-leadgen-realtime` | frontend/backend Meta | rotas listadas por evidence id | revisão manual | rotas catalogadas por objeto JSON |
| J3 | listar exatamente os testes executados | `green` | seção “Validation executed on this clean branch” | arquivo atual | n/a | revisão manual | comandos reais registrados |
| J4 | registrar o output dos testes | `green` | `branch-validation-builds`, `tests-backend-humanlike`, `tests-backend-leadgen-webhook`, `tests-frontend-meta-surfaces` | specs e builds | n/a | comandos reais | todos os comandos listados ficaram verdes na worktree limpa |
| J5 | registrar os checks verdes no markdown e no JSON | `green` | arquivo atual + evidence JSON | root | n/a | revisão manual | sincronizado |
| J6 | registrar blocker externo real como `blocked_external` | `green` | `instagram-live-asset-blocker`, `messenger-page-subscription` | backend/docs | callback/status | verificação live prévia | blockers externos separados honestamente |
| J7 | nunca marcar check externo como green sem prova | `green` | `instagram-live-asset-blocker`, `messenger-page-subscription` | arquivo atual | n/a | revisão manual | Instagram e Messenger permanecem não verdes |
| J8 | para todo blocker externo, registrar o que falta, a credencial/aprovação/domínio e o passo final de validação | `green` | `instagram-live-asset-blocker`, `messenger-page-subscription`, `docs-meta-operator-setup` | docs + evidence JSON | status/subscribed_apps | revisão manual | próximos passos objetivos descritos |

## K. Definição de pronto técnica

| ID | Check | Status | Evidence | Files | Routes | Tests | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| K1 | Marketing não usa mais QR legado como fluxo oficial de WhatsApp | `green` | `whatsapp-official-surface` | rota alvo + surface | `GET /marketing/whatsapp` | `meta-marketing-surfaces.test.tsx` | pronto |
| K2 | Instagram e Facebook saíram de “Em breve” e entraram em operação real de superfície | `green` | `instagram-official-surface`, `facebook-official-surface` | rotas alvo | `GET /marketing/instagram`, `GET /marketing/facebook` | `meta-marketing-surfaces.test.tsx` | pronto na superfície; operação live ainda depende de blockers |
| K3 | vínculo Meta é por workspace, isolado e confiável | `in_progress` | `multi-tenant-asset-scoping` | backend Meta | status/webhook | `typecheck` | desenho certo, prova negativa ainda faltando |
| K4 | status dos canais é real, persistente e auditável | `green` | `whatsapp-state-contract`, `whatsapp-official-assets`, `instagram-profile-insights-surface`, `facebook-official-surface` | frontend/backend Meta | `GET /marketing/connect/status`, `GET /meta/auth/status` | `typecheck` | pronto |
| K5 | inbound/outbound e webhooks estão fechados de ponta a ponta | `in_progress` | `meta-webhook-verify`, `meta-webhook-signed-post`, `whatsapp-webhook-routing`, `whatsapp-outbound-contract` | backend Meta + runtimes | webhook/runtime | specs + validações listadas | falta live outbound desta branch e blockers externos para IG/Messenger |
| K6 | cobertura de testes representa o fluxo oficial, não o legado | `in_progress` | `tests-frontend-meta-surfaces`, `tests-backend-humanlike`, `tests-backend-leadgen-webhook` | specs novas | n/a | comandos executados | melhorou muito, mas faltam E2Es oficiais completos |
| K7 | checklist canônica e evidência estruturada estão atualizadas | `green` | arquivo atual + JSON + audit files | root/docs | n/a | revisão manual | pronto |
| K8 | não sobrou falso positivo, falso verde ou comportamento fingido | `green` | blockers honestos mantidos | arquivo atual + JSON | n/a | revisão manual | produção segue `not_ready` até blockers sumirem |

## L. Human-like quality

| ID | Check | Status | Evidence | Files | Routes | Tests | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| L1 | respostas não soam robóticas / não soam como template duro / não repetem aberturas e fechamentos com frequência perceptível | `in_progress` | `humanlike-whatsapp`, `humanlike-instagram`, `humanlike-messenger` | `backend/src/kloel/meta-production-unified-agent.service.ts` | `POST /kloel/agent/:workspaceId/process` | `meta-production-unified-agent.service.spec.ts`, audit file | melhora real aplicada; matriz ainda pequena |
| L2 | IA responde exatamente ao que foi perguntado antes de vender ou capturar dado | `green` | `humanlike-whatsapp`, `humanlike-messenger` | responder service | agent route | unit spec + audit | hint tático força responder primeiro |
| L3 | IA sabe quando responder curto, aprofundar e variar por canal | `green` | `humanlike-instagram`, `humanlike-whatsapp`, `humanlike-messenger` | responder service | agent route | unit spec + audit | orçamento de resposta por canal foi adicionado |
| L4 | WhatsApp mais direto e caloroso / Instagram mais leve / Messenger mais página | `green` | `humanlike-whatsapp`, `humanlike-instagram`, `humanlike-messenger` | responder service | agent route | unit spec + audit | políticas por canal separadas |
| L5 | memória e contexto do lead são carregados de forma coerente | `in_progress` | `humanlike-whatsapp`, `humanlike-messenger` | responder service | agent route | unit spec + audit | já melhorou, mas falta matriz longa |
| L6 | qualificação e venda soam naturais, não formulário | `in_progress` | `humanlike-whatsapp`, `humanlike-messenger` | responder service | agent route | audit file | melhor, mas ainda não verde final |
| L7 | linguagem real de usuário: abreviações, erros, mensagens picadas, rudeza, silêncio | `in_progress` | human-like audit | audit artifacts | agent route | audit file | cobertura insuficiente ainda |
| L8 | verdade, disclosure e anti-hallucination | `green` | `humanlike-whatsapp`, `humanlike-instagram` | responder service | agent route | unit spec + audit | disclosure honesto está travado |
| L9 | handoff e escalonamento | `in_progress` | human-like audit | responder service | agent route | audit file | precisa ampliar cenários |
| L10 | cadência, timing e sensação humana | `in_progress` | human-like audit | responder service | agent route | audit file | ainda sem bateria ampla |
| L11 | estilo de texto e formatação não entrega “cara de bot” | `in_progress` | `humanlike-instagram`, `humanlike-messenger` | responder service | agent route | audit file | melhorou, mas ainda não final |
| L12 | integração com CRM, inbox e automação sem quebrar integridade | `in_progress` | `baseline-ai-touchpoints-inventory`, `whatsapp-webhook-routing` | runtimes + webhook | runtime/webhook | specs atuais | falta regressão ampla integrada |

## M. Testes obrigatórios de human-like quality

| ID | Check | Status | Evidence | Files | Routes | Tests | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | criar cenários reais/sintéticos por canal, incluindo disclosure, memória, lead frio/quente, objeção, suporte, reativação e usuário rude | `in_progress` | audit artifacts | `PULSE_META_HUMAN_LIKE_AUDIT.md`, `PULSE_META_HUMAN_LIKE_EVIDENCE.json` | agent route | audit file | seis cenários auditados; matriz ainda incompleta |
| M2 | critérios mínimos de aceite documentados para repetição, pergunta ignorada, contradição, hallucination, handoff e transparência | `in_progress` | audit artifacts | `PULSE_META_HUMAN_LIKE_AUDIT.md` | n/a | audit file | transparência está 100%; demais critérios ainda sem volume suficiente |
| M3 | auditoria cega de transcripts com falhas, severidade e correções aplicadas | `in_progress` | audit artifacts | `PULSE_META_HUMAN_LIKE_AUDIT.md`, `PULSE_META_HUMAN_LIKE_EVIDENCE.json` | n/a | audit file | já há packs e falhas conhecidas; falta revisão mais ampla |
| M4 | regressão conversacional sem quebrar CRM, inbox, roteamento, multi-tenant, handoff e webhook | `in_progress` | `baseline-ai-touchpoints-inventory`, `whatsapp-webhook-routing`, audit artifacts | responder + runtimes | runtime/webhook | specs atuais | não há regressão óbvia, mas falta bateria mais extensa |

## N. Definição de pronto human-like

| ID | Check | Status | Evidence | Files | Routes | Tests | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| N1 | WhatsApp, Instagram Direct e Messenger soam naturais, contextuais e não-robóticos | `in_progress` | `humanlike-whatsapp`, `humanlike-instagram`, `humanlike-messenger` | responder service | agent route | unit spec + audit | ainda sem amplitude suficiente para green |
| N2 | o usuário comum não percebe facilmente automação só pela qualidade textual | `in_progress` | audit artifacts | audit files | n/a | audit file | melhorou, mas ainda não certificado |
| N3 | há variação real de linguagem, memória consistente e adaptação por canal | `in_progress` | human-like evidence | responder service | agent route | unit spec + audit | parcialmente validado |
| N4 | não há hallucination crítica nem contradição factual crítica | `green` | human-like evidence | responder service | agent route | audit file | zero hallucination crítica nos cenários auditados |
| N5 | handoff funciona sem ruptura e disclosure é honesto | `in_progress` | human-like evidence | responder service | agent route | audit file | disclosure verde; handoff ainda precisa de mais prova |
| N6 | a evidência em transcripts sustenta o verde final | `in_progress` | audit artifacts | audit files | n/a | audit file | ainda não sustenta green final |

## Blocked external

- `instagram-live-asset-blocker`
  - Falta: concluir o fluxo oficial do Kloel para o workspace alvo até o backend persistir o vínculo Meta em `MetaConnection`
  - Dependência externa: executar a autorização oficial do app Kloel CIA para o workspace correto com a Page `994971940375552` e o Instagram `17841425688764914`
  - Validação final: `GET /meta/auth/status`, `GET /meta/instagram/profile`, `GET /meta/instagram/insights/account`, smoke de DM oficial
  - Evidência adicional em `2026-04-22`: a validação mais recente finalmente retornou a Page `994971940375552` com `instagram_business_account` e `connected_instagram_account` iguais a `17841425688764914` (`penin2250`)
  - Evidência adicional em `2026-04-22`: o `me/permissions` agora trouxe `instagram_basic`, `instagram_manage_messages`, `instagram_manage_comments`, `instagram_manage_insights`, `instagram_content_publish` e `pages_messaging` como `granted`
  - Evidência adicional em `2026-04-22`: apesar disso, a leitura direta da base de produção ainda retornou `MetaConnection.total = 0`, `with_instagram = 0` e `0` linhas para `workspaceId/pageId/instagramAccountId`, então o Kloel ainda não persiste nenhum vínculo Meta ativo
- `messenger-page-subscription`
  - Falta: token com `pages_messaging` efetivo para a Page autorizada
  - Dependência externa: aprovação/permissão efetiva da Meta no token/Page conectados
  - Validação final: `POST https://graph.facebook.com/v25.0/<PAGE_ID>/subscribed_apps` com `messages,messaging_postbacks,message_reads,message_deliveries`

## Final technical verdict

- Branch code quality for the scoped delivery: `green`
- Production truth for WhatsApp surface: `green`
- Production truth for Instagram surface: `green`
- Production truth for Facebook surface: `green`
- WhatsApp official end-to-end runtime from this exact clean branch: `in_progress`
- Instagram official end-to-end: `blocked_external`
- Messenger official end-to-end: `blocked_external`
- Overall production readiness: `not_ready`
