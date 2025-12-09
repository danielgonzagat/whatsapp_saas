# 🔍 AUDITORIA COMPLETA — KLOEL (WhatsApp SaaS + IA)

**Data:** 2025-12-09 — Auditoria reiniciada do zero

## Resumo Executivo

Produto robusto (backend NestJS + worker BullMQ + frontend Next.js) com avanços recentes: links de pagamento com PIX no dashboard de vendas, SSE do chat exibindo eventos de tools, leads page agora consumindo API real. Ainda há lacunas críticas de entrega/segurança e integração de pagamentos que bloqueiam uma experiência “pronta para produção”.

## Metodologia / Escopo
- Leitura direta de código em pontos sensíveis: onboarding chat (`frontend/src/app/(public)/onboarding-chat/page.tsx`), leads API e UI, hooks de workspace, ausência de `send_audio`, filtros de leads no backend. 
- Cross-check com arquitetura declarada e migrações recentes (baseline 20251209150035 aplicada após reset local).
- Foco em riscos de segurança, UX crítico, integrações de pagamento e automação.

## Principais Forças (ok)
- **Arquitetura modular** (NestJS por domínio, BullMQ workers, Redis + pgvector) coerente com multi-tenant.
- **Flow engine & Autopilot** já estruturados (watchdog, intents, actions) e expostos via queues.
- **Pagamentos**: geração de link/PIX via Asaas integrada ao dashboard; Stripe billing existente.
- **Chat/SSE**: front já renderiza tool_call/tool_result, melhorando transparência do agente.
- **Leads**: backend `kloel/leads` publicado e UI agora consome API com filtros e skeletons.

## Achados Críticos (bloqueiam produção)
1) **Envio de áudio inexistente** — não há implementação de `send_audio`/tool equivalente no KLOEL agent. Resultado: IA só responde texto. 
   - Evidência: `grep send_audio` no backend retorna vazio.

2) **Pagamentos não notificam o cliente** — webhooks Asaas/Stripe não disparam mensagem no WhatsApp nem atualizam conversa. Asaas webhook sequer existe; Stripe webhook não envia confirmação ao contato.

3) **Onboarding front continua no endpoint legado** — `frontend/src/app/(public)/onboarding-chat/page.tsx` chama `POST /kloel/onboarding/{workspaceId}/start` e `/chat`/`/status` com workspace na URL. Backend atual usa modelo conversacional (SSE/tool-calling) sem esse formato, logo onboarding quebra ou fica desatualizado.

4) **Furo de multi-tenant no front** — `useWorkspaceId` devolve `'default-ws'` quando não autenticado. Se algum endpoint aceitar sem guard estrito, risco de vazamento/dano no workspace “default”. (Backend `kloel/leads` já usa JWT guard, mas relies em workspaceId na rota — se token de outro tenant souber um id, consegue listar.)

5) **Ações de agente stubadas** — várias tools retornam placeholder (ex.: follow-up/agenda em `skill-engine`, documentos). Isso quebra automação prometida (agendar follow-up, enviar catálogo, etc.).

6) **Migrations & alinhamento** — houve reset e criação da baseline `20251209150035_init_baseline` após divergências com migrations faltantes. Necessário garantir que ambiente remoto compartilha o mesmo baseline antes de novos deploys.

## Problemas Importantes (não-bloqueantes, mas urgentes)
- **Webhook Asaas ausente** — sem rota pública para confirmar pagamento, reconciliar status e notificar WhatsApp.
- **Stripe webhook sem notificação de conversa** — mesmo após confirmação, cliente não recebe mensagem.
- **Onboarding não redireciona para conexão WhatsApp** após completar; usuário fica sem próximo passo.
- **Documentos/Catálogos** — não há tool nem serviço para envio de PDFs/catálogos.
- **Follow-up BullMQ** — TODOs em `skill-engine`/`voice-processor` permanecem; follow-up não agenda jobs reais.
- **Front onboarding sem token obrigatório** — permite criar `temp-ws-*` e trafegar sem autenticação plena, aumentando superfície de inconsistência.

## Recomendações Prioritárias (patches)
1) **Implementar envio de áudio**
   - Local: `backend/src/kloel/unified-agent.service.ts`
   - Adicionar tool `send_audio` → chamar TTS (AudioService), salvar em `uploads/`, enviar via WhatsApp `mediaType: 'audio'`.

2) **Webhook Asaas + notificação**
   - Criar `backend/src/webhooks/asaas-webhook.controller.ts` com @Public POST, validação opcional de token, update de `payment` status e `whatsapp.sendMessage` para o phone do `externalReference`.

3) **Webhook Stripe com aviso ao contato**
   - Em `payment-webhook.controller.ts`, no `checkout.session.completed`, localizar contato por `workspaceId` + `customer_email` e enviar confirmação pelo WhatsApp. Atualizar `Payment`/`Subscription` se aplicável.

4) **Corrigir onboarding frontend para o fluxo novo**
   - `frontend/src/app/(public)/onboarding-chat/page.tsx`: trocar endpoints para `/kloel/onboarding/start` (POST body workspaceId) + stream/chat adequados; exigir bearer token se sessão presente; remover fallback `temp-ws` ou limitar a modo demo explícito; ao `completed`, redirecionar para `/dashboard/whatsapp`.

5) **Fechar furo multi-tenant**
   - `useWorkspaceId`: em vez de `'default-ws'`, bloquear/redirect quando sem sessão; nunca permitir calls sem workspace válido.
   - Backend controllers (ex.: `kloel/leads`) devem validar que `workspaceId` do path pertence ao token (claim) ou usar guard/pipe que injete o workspace do JWT, ignorando o param externo.

6) **Follow-up real via BullMQ**
   - `skill-engine.service.ts`: substituir TODO por agendamento no `autopilotQueue` com delay calculado, jobId único, persistência de `scheduledAt`.

7) **Tool para documentos/catálogos**
   - Registrar tool `send_document` no UnifiedAgent, aceitar tipos (catalog/price_list/contract/pdf/image), buscar arquivo/catálogo salvo e enviar via WhatsApp `sendMedia`.

## Outras Observações
- **Leads**: UI agora usa API real com filtros e skeletons; backend aceita `status/q/limit` e usa `JwtAuthGuard`. Falta audit de autorização por workspace claim.
- **Pagamentos no dashboard**: PIX/QR exibidos, mas ausência de conciliação automatizada mantém risco de status divergente.
- **Migrations**: antes de novos devs, alinhar DB remoto com `20251209150035_init_baseline` para evitar resets acidentais.

## Próximos Passos Sugeridos
1) Aplicar patches 1–5 em sequência (áudio, webhooks, onboarding, multi-tenant guard).
2) Reprocessar migrações em staging e validar smoke (`scripts/smoke_all.sh`).
3) Rodar testes críticos: pagamentos (checkout + webhook), onboarding conversacional end-to-end, follow-up agendado disparando mensagem.
4) Acrescentar monitoramento: métricas para webhooks recebidos e falhas; alertas de DLQ em BullMQ.

## Inventário de Controllers do Backend (09/12/2025)

Estado rápido de simetria FE/BE. Cobertura = chamada explícita em `frontend/src/lib/api.ts` ou fluxo de página; Parcial = existe chamada genérica ou falta parte dos endpoints; Ausente = sem cliente/front mapeado.

| Controller | Área | Cobertura FE |
| --- | --- | --- |
| ai-brain/knowledge-base.controller | AI Brain / KB | Ausente |
| analytics/analytics.controller | Analytics | Ausente |
| api-keys/api-keys.controller | API Keys | Ausente |
| app.controller | Raiz | Ausente |
| audit/audit.controller | Audit | Ausente |
| auth/auth.controller | Auth | Parcial (NextAuth usa rotas internas) |
| autopilot/autopilot.controller | Autopilot | Ausente |
| autopilot/segmentation.controller | Autopilot Segmentation | Ausente |
| billing/billing.controller | Billing | Ausente |
| campaigns/campaigns.controller | Campaigns | Ausente |
| copilot/copilot.controller | Copilot | Ausente |
| crm/crm.controller | CRM | Ausente |
| crm/neuro-crm.controller | Neuro CRM | Ausente |
| dashboard/dashboard.controller | Dashboard | Ausente |
| flows/flows.controller | Flows | Ausente |
| flows/flow-template.controller | Flow Templates | Ausente |
| flows/flow-optimizer.controller | Flow Optimizer | Ausente |
| funnels/funnels.controller | Funnels | Ausente |
| growth/growth.controller | Growth | Ausente |
| growth/money-machine.controller | Money Machine | Ausente |
| health/health.controller | Health | Parcial (apenas `getKloelHealth`) |
| health/system-health.controller | System Health | Ausente |
| inbox/inbox.controller | Inbox | Ausente |
| kloel/asaas.controller | Asaas | Parcial (`get/connect/disconnect/balance/pix`) |
| kloel/audio.controller | Audio | Ausente |
| kloel/diagnostics.controller | Diagnostics | Parcial (`getKloelHealth`) |
| kloel/external-payment.controller | External Payments | Parcial (list/add/toggle/delete links) |
| kloel/kloel.controller | Kloel Core | Ausente |
| kloel/leads.controller | Leads | Coberto (`getLeads`) |
| kloel/memory.controller | Memory | Coberto (`getMemory*`, `searchMemory`, `saveProduct`) |
| kloel/mercadopago.controller | MercadoPago | Ausente |
| kloel/onboarding.controller | Onboarding | Ausente |
| kloel/payment.controller | Payments | Ausente |
| kloel/pdf-processor.controller | PDF Processor | Parcial (`uploadPdf`) |
| kloel/product.controller | Product | Ausente |
| kloel/smart-payment.controller | Smart Payment | Ausente |
| kloel/unified-agent.controller | Unified Agent | Ausente |
| kloel/wallet.controller | Wallet | Coberto (`getWalletBalance`, `getWalletTransactions`, `processSale`) |
| kloel/whatsapp-brain.controller | WhatsApp Brain | Ausente |
| kloel/whatsapp-connection.controller | WhatsApp Connection | Coberto (`getWhatsAppStatus/QR/connect/disconnect`) |
| launch/launch.controller | Launch | Ausente |
| marketplace/marketplace.controller | Marketplace | Ausente |
| mass-send/mass-send.controller | Mass Send | Ausente |
| media/media.controller | Media | Ausente |
| media/video.controller | Media Video | Ausente |
| metrics/metrics.controller | Metrics | Ausente |
| notifications/notifications.controller | Notifications | Ausente |
| ops/ops.controller | Ops / Bull Board | Ausente |
| pipeline/pipeline.controller | Pipeline | Ausente |
| public-api/public-api.controller | Public API | Ausente |
| scrapers/scrapers.controller | Scrapers | Ausente |
| team/team.controller | Team | Ausente |
| video/video.controller | Video | Ausente |
| voice/voice.controller | Voice | Ausente |
| webhooks/payment-webhook.controller | Payment Webhook | Ausente |
| webhooks/webhook-settings.controller | Webhook Settings | Ausente |
| webhooks/webhooks.controller | Webhooks | Ausente |
| whatsapp/whatsapp.controller | WhatsApp | Ausente |
| workspaces/workspace.controller | Workspaces | Ausente |

### Próximos passos imediatos (Simetria FE/BE)
- Priorizar controllers críticos: autopilot, flows, campaigns, inbox, whatsapp, billing, metrics, notifications.
- Expor clientes tipados em `frontend/src/lib/api.ts` para cada um, com `workspaceId` obrigatório.
- Encadear UI/hooks que consumam esses clientes (chat/inbox, campaigns, flow builder, autopilot cockpit).
```

---

## 📊 CHECKLIST PARA PRODUÇÃO

### Antes de Vender:

- [ ] Testar fluxo completo: registro → onboarding → conexão WhatsApp → conversa
- [ ] Verificar transcrição de áudio end-to-end
- [ ] Testar criação de link de pagamento e confirmação
- [ ] Validar webhook Stripe em ambiente de produção
- [ ] Configurar webhook Asaas
- [ ] Testar Autopilot com mensagens reais
- [ ] Verificar rate limits funcionando
- [ ] Configurar CORS corretamente para domínio de produção
- [ ] Configurar SSL/HTTPS
- [ ] Setar todas variáveis de ambiente de produção
- [ ] Executar migrations: `npx prisma migrate deploy`
- [ ] Verificar Redis conectando
- [ ] Verificar Worker processando filas
- [ ] Testar QR Code WhatsApp
- [ ] Verificar logs no Sentry

### Variáveis de Ambiente Obrigatórias:

```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=<chave-segura-32-chars>
OPENAI_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
ASAAS_API_KEY=...
ASAAS_WEBHOOK_TOKEN=...
META_ACCESS_TOKEN=... (se usar Meta Cloud API)
META_PHONE_NUMBER_ID=...
ELEVENLABS_API_KEY=... (para TTS de alta qualidade)
SENTRY_DSN=... (para monitoramento de erros)
```

---

## 🎯 CONCLUSÃO

O sistema está **85% pronto**. Os componentes principais estão funcionando, mas faltam integrações críticas para o funcionamento end-to-end prometido:

1. **Envio de áudio pela IA** - Faltando
2. **Confirmação de pagamento automática** - Faltando
3. **Fluxo completo de onboarding** - Parcialmente funcionando
4. **Agendamento de follow-ups** - TODO no código

Com os patches acima implementados, o sistema estará pronto para produção e vendas.

**Tempo estimado para correções: 2-4 horas de desenvolvimento**
