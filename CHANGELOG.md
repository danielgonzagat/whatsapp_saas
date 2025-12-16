# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0-rc1.1] - 2025-12-16

### Summary
- **Backend (Auth)**: Rate limiting obrigatório em endpoints de autenticação com fallback seguro quando Redis está indisponível.
- **Frontend (Auth)**: Login e cadastro unificados via **AuthModal** (rotas `/login` e `/register` viram deep-links para o modal).
- **Prisma/Migrations**: Harden do startup e tratamento claro para cenários de banco não inicializado; deploy com execução automática de migrations.
- **OAuth (Google/Apple)**: Fluxo estabilizado (erros explícitos, redirecionamento consistente para `/login`, pós-login padronizado em `/`).
- **Legado**: Rotas antigas eliminadas/neutralizadas (ex.: `/dashboard` redireciona para `/`).
- **Configuração**: Documentação reforçada para `NEXTAUTH_URL`/`AUTH_URL` e Redirect URIs do Google/Apple.

### Validation (Go-Live Gate)
Executado em 2025-12-16:

- `npm --prefix /workspaces/whatsapp_saas/backend test` → **PASS** (19/19 suites, 106/106 tests)
- `npm --prefix /workspaces/whatsapp_saas/backend run test:e2e` → **PASS** (10/10 suites; 22 passed; 1 skipped já era do suite)
- `npm --prefix /workspaces/whatsapp_saas/frontend run build` → **SUCESSO**
- `npm --prefix /workspaces/whatsapp_saas/frontend run lint` → **SUCESSO**

### Fixed
- OAuth: erros do backend agora redirecionam para `/login` com `authError` detalhado (sem fallback genérico).
- Prisma: erro de “Database not initialized” passa a retornar **503** com mensagem clara (em vez de falhar com erro genérico).

### Documentation
- Variáveis de ambiente e configuração de produção consolidadas (Auth + OAuth + migrations) em `.env.example`, `backend/.env.example`, `README.md` e `CHECKLIST_DE_LANÇAMENTO.md`.

## [1.0.0-rc1] - 2025-12-09

### Added
- **Autopilot**: Full autonomous sales agent with "Ghost Closer" and "Lead Unlocker" modes.
- **Flow Engine**: Visual flow builder with support for Media, Voice, and CRM actions.
- **WhatsApp Connection**: Multi-provider support (WPPConnect, Meta Cloud API, Evolution API).
- **Kloel Brain**: AI-powered workspace admin capable of creating flows, campaigns, and managing products via chat.
- **Frontend**: "Chat Prime" interface with history persistence, markdown support, and real-time streaming.

### Changed
- **Worker Architecture**: Unified worker for all job types (flow, campaign, autopilot, media, voice).
- **Database**: Optimized Prisma schema with indices for high-volume message processing.
- **Security**: Enforced `workspaceId` scoping on all critical queries.
- **Configuration**: Standardized `providerSettings` JSON structure for all integrations.
- **Frontend WhatsApp**: Connection page now surfaces live status/QR updates, handles already-connected sessions, and blocks duplicate connect attempts.

### Fixed
- **Worker Configs**: Removed hardcoded "auto" provider settings; now fetching real workspace configs.
- **Tool Responses**: Standardized JSON output for all AI tools.
- **Autopilot Toggle**: Fixed state persistence for enabling/disabling Autopilot.
- **WhatsApp Session**: Improved session restoration and QR code generation flow.
- **Meta OAuth**: Callback now HMAC-validates the `state` parameter and rejects tampering.
- **Autopilot Follow-up**: Respects billing suspension and delivery windows before rescheduling.

### Security
- **Rate Limiting**: Implemented daily limits for Autopilot contacts and workspaces.
- **Anti-Ban**: Added jitter and human-like delays to message sending.
- **Headers**: Added `helmet` and removed `x-powered-by` to harden HTTP responses.
- **Secrets**: `docker-compose` now uses environment placeholders (DB/JWT) instead of hardcoded secrets.
