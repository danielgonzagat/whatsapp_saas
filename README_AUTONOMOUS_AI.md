## KLOEL SaaS Autônomo – Validação Rápida

Use estes passos para provar fim-a-fim que a IA é o próprio SaaS.

### 1) Chat com tool-calling (backend)
- Rota: `POST /kloel/think` com SSE.
- Peça: “crie um produto X com preço Y, crie um fluxo de vendas e conecte meu WhatsApp”.
- Esperado (eventos SSE): `tool_call`/`tool_result` para `save_product`, `create_flow_template`, `connect_whatsapp`; QR em base64.
- Verifique no DB: tabela `product` contém X; tabela `flow` contém fluxo ativo; `kloelMemory` guarda brand_voice/produtos.

### 2) Conexão WhatsApp
- Front: página `/whatsapp` (usa `frontend/src/lib/api.ts`).
- Checar status/QR com credenciais (cookies/JWT). QR deve aparecer após `initiate`.

### 3) Inbound → Flow Engine + Autopilot
- Envie mensagem real via sessão Baileys/WPPConnect.
- Checar DB: `Message` salvo, `Contact` upsert.
- Checar filas: job em `flow-engine` (`resume-flow`), job em `autopilot-jobs` (`scan-message`).

### 4) Fluxos criados pela IA
- Após step 1, confirme `flow.triggerType`/`triggerCondition` e `isActive=true`.
- Simule palavra-chave (“comprar”) para acionar `flow-engine`; ver execução e logs em Redis/DB.

### 5) Autopilot
- Habilite `providerSettings.autopilot.enabled=true` no workspace.
- Envie mensagem com intenção de compra; veja `autopilot-jobs` processar; métricas em `worker/metrics`.

### 6) Pagamento inteligente (opcional)
- `KloelService.processWhatsAppMessageWithPayment` pode gerar link quando detectar intenção alta e produto conhecido.

### 7) Smoke scripts
- Backend: `cd backend && npm test` (unit), `npm run start:dev`.
- E2E Playwright (flows): `cd e2e && npm test`.

### 8) Riscos abertos
- Índices Prisma podem divergir; se `product` não tiver unique por (workspaceId, name), já tratamos com `findFirst`. Ajuste schema depois.
- SSE retorna chunks de tokens após tools; se precisar compat, trate eventos `tool_call`/`tool_result` no frontend.
