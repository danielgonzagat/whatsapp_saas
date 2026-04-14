# KLOEL — CLAUDE.md

> Este arquivo é lido automaticamente pelo Claude Code no início de toda sessão.
> Ele contém: identidade do projeto, filosofia de construção, ordem de dependências,
> padrões de qualidade, e definição de "pronto" para cada módulo.
> NÃO precisa ser colado como prompt. Ele é contexto permanente.

---

## IDENTIDADE

KLOEL é uma plataforma AI-native de marketing digital e vendas. Monorepo com:

- **Frontend**: Next.js (Vercel) — `frontend/`
- **Backend**: NestJS + Prisma (Railway) — `backend/`
- **Worker**: BullMQ — `worker/` (WhatsApp via WAHA + Meta Cloud API providers, see `docs/adr/0001-whatsapp-source-of-truth.md`)
- **Design System**: Terminator — void black (#0A0A0C), Ember (#E85D30), Sora font, JetBrains Mono para números, sem gradientes, sem emojis, sem border-radius > 6px, SVG icons only

**Estado atual**: 184k linhas, 812 arquivos, 107 models Prisma, 89 controllers.
~40-50% funcionalidade real, resto é shell visual com dados fake.

**NÃO há global prefix** no NestJS. Rotas são como declaradas nos controllers.

---

## REGRA MESTRA — PRESERVAR A CASCA, CONVERTER EM MÁQUINA

NÃO remover telas, tabs, fluxos, componentes, rotas, copy, navegação, affordances.
NÃO reescrever uma tela inteira sem necessidade.
NÃO inventar especificações que não estejam no código existente.

A casca visual é o **contrato de UX**. A missão é fazer a realidade obedecer ao contrato.

**SIM converter**: dado fake → dado real, handler placebo → handler real, integração simulada → integração real ou estado honesto.

### Estados Honestos (substituem dados fake)

| Ao invés de...                    | Exibir...                                     |
| --------------------------------- | --------------------------------------------- |
| Math.random() gerando números     | `empty` com "Nenhuma venda ainda" ou `0` real |
| Array hardcoded de dados fake     | `empty-state` com CTA de setup                |
| Integração simulada               | `setup-required` com wizard de conexão        |
| setInterval incrementando valores | Valor real do backend ou `--` com tooltip     |
| FALLBACK_RESPONSES no chat        | `degraded` com "IA indisponível"              |
| localStorage como banco de dados  | Backend real ou `offline-cache` explícito     |

---

## ORDEM DE CONSTRUÇÃO (DAG)

Um módulo só avança quando TODAS as dependências estão a 100%.
100% = PULSE mostra zero desconexões nesse módulo.

```
FASE 0 — INFRAESTRUTURA
├── Auth (JWT + refresh + Google OAuth — completar Magic Link)
├── Workspaces (validar CRUD completo)
├── Settings (conectar sections ao backend)
└── KYC (validar fluxo end-to-end)

FASE 1 — MOTOR COMERCIAL
├── Products CRUD (plans, URLs, coupons, commissions, AI config)
├── Checkout (produto → plano → pagamento → confirmação via Asaas)
├── Wallet/Carteira (saldo real, transações, saques, antecipações)
└── Billing (assinaturas da plataforma)

FASE 2 — COMUNICAÇÃO
├── WhatsApp Core (WAHA / Meta Cloud → backend → frontend)
├── Inbox (chat real, não localStorage)
├── Autopilot (IA com dados reais)
└── Flows (builder + engine)

FASE 3 — INTELIGÊNCIA
├── CIA / Unified Agent (cognitive state → LLM prompt)
├── CRM (conectar CRMPipelineView às API calls existentes)
├── Dashboard (dados reais agregados)
├── Analytics (queries reais)
└── Reports (hooks useReports conectados)

FASE 4 — CRESCIMENTO
├── Vendas (pipeline, assinaturas, físicos)
├── Affiliate/Partnerships (service layers + frontend)
├── Member Area (service layer + enrollment via checkout)
├── Campaigns (page + controller conectados)
└── FollowUps (validar conexão)

FASE 5 — PLATAFORMA AVANÇADA
├── Marketing (channels reais ou setup honesto)
├── Anúncios (Meta/Google APIs ou setup honesto)
├── Sites/Builder (CRUD + domínios + publicação)
├── Canvas (fabric.js + save/load backend)
├── Funnels (criar backend)
├── Webinários (validar profundidade)
└── Leads Scraper (validar flow)

FASE 6 — OPERACIONAL
├── Team, API Keys, Webhooks, Audit Log
├── Notifications, Marketplace
└── Video/Voice
```

---

## CLASSIFICAÇÃO ATUAL DOS MÓDULOS

### TIER 1 — Funcional

Auth (90%), WhatsApp Core (95%), Autopilot (90%), Flows (90%), Checkout (85%), Billing (85%), KYC (85%), Inbox (85%), Wallet (80%), Unified Agent (75%), CRM (80%), Dashboard (75%), Analytics (75%), Reports (75%)

### TIER 2 — Parcialmente Funcional

Products (70%), Partnerships, Member Area, Affiliate, Campaigns

### TIER 3 — Fachada

Anuncios, Marketing, Sites, Vendas, Canvas, Funnels, Webinarios, Leads

### TIER 4 — Shell Vazio

47 rotas com < 15 linhas (stubs de redirect)

---

## PADRÕES DE ROBUSTEZ

Todo módulo que lida com dinheiro, dados de usuário, ou integração externa:

- **DTOs com class-validator** no NestJS
- **Workspace isolation** — toda query filtra por workspaceId
- **Transações** — operações multi-tabela usam `prisma.$transaction`
- **Idempotência** — endpoints de pagamento/webhook aceitam replay sem duplicar
- **Retries com backoff** — chamadas a Asaas, Meta, Google
- **Timeouts explícitos** — toda chamada externa
- **Audit trail** — operações financeiras logadas no AuditLog
- **Rate limiting** — endpoints públicos
- **Error states honestos** — frontend mostra erro real
- **Logs estruturados** — Logger do NestJS com context

---

## SPEC — QUANDO UM MÓDULO ESTÁ "PRONTO"

1. Zero pages stub (toda rota > 50 linhas de lógica real)
2. Zero hardcoded data (nenhum Math.random/array literal exibindo dados)
3. Zero dead handlers (todo botão chama API real)
4. Zero dead API calls (toda chamada tem endpoint real)
5. Zero empty returns (backend retorna dados Prisma, não `[]`)
6. Service layer existe (controllers não fazem Prisma direto)
7. prismaAny → prisma tipado (models migrados)
8. Shell preservada (UX coerente com contrato original)
9. Estados honestos (setup/gate onde falta integração)
10. PULSE health = 100% para esse módulo

---

## REGRA DE AUTO-CORRECAO DO PULSE

Cada false positive ou ponto cego do PULSE que for encontrado → **corrigir o PULSE imediatamente** para nunca mais errar naquele tipo. O PULSE nao e um scanner estatico — ele evolui a cada erro descoberto. Se o PULSE disse que algo estava quebrado e nao estava → fix no parser. Se o PULSE nao viu algo que deveria ter visto → fix no detector. Zero tolerancia para erros repetidos.

---

## FERRAMENTAS

### PULSE (Sistema Nervoso)

- `npx ts-node --project scripts/pulse/tsconfig.json scripts/pulse/index.ts` — scan unico
- `npx ts-node scripts/pulse/index.ts --watch` — daemon vivo
- `npx ts-node scripts/pulse/index.ts --report` — gera PULSE_REPORT.md

### Artefatos de Controle

- `AUDIT_FEATURE_MATRIX.md` — estado de cada rota (READY/PARTIAL/SHELL_ONLY/MOCKED/BROKEN)
- `VALIDATION_LOG.md` — evidência de cada validação
- `SHELL_PRESERVATION_NOTES.md` — o que mudou visualmente e porquê
- `PULSE_REPORT.md` — output do scanner

### Segredos Locais de Operação

- Antes de inspecionar Railway/Vercel/runtime real, verificar `.env.pulse.local` na raiz do repo.
- Esse arquivo é **local e gitignored**. Pode conter tokens e endpoints de inspeção para PULSE e agentes.
- Nunca imprimir os valores em respostas. Usar apenas em memória para queries, logs e diagnósticos.

### Hooks de Disciplina

- Após editar frontend → `cd frontend && npm run lint && npm run build`
- Após editar backend → `cd backend && npm run lint && npm run build`
- Após editar schema → `npx prisma generate && npx prisma validate`
- Não declarar conclusão com erros de build não documentados
- Antes de push → `npm run guard:db-push && npm run typecheck && npm test`
- Nunca reintroduzir `prisma db push` em scripts de produção, CI, Docker ou automação

### Enforcement Local

- Husky + lint-staged + commitlint são parte do contrato do repo
- `.claude/settings.json` deve continuar com hooks de `PreToolUse`, `PostToolUse` e `Stop`
- `.editorconfig` e `.prettierrc.json` são a fonte única de formatação do monorepo

## ARQUIVOS PROTEGIDOS — SOMENTE O DONO DO REPOSITORIO PODE EDITAR

Os seguintes arquivos e diretorios sao infraestrutura de qualidade e governanca.
Nenhuma IA CLI tem permissao de editar, deletar, mover ou renomear estes arquivos.
Se uma regra precisa mudar, a IA deve pedir ao dono do repositorio para fazer a mudanca.

Arquivos protegidos:

- `CLAUDE.md`
- `AGENTS.md`
- `docs/design/KLOEL_VISUAL_DESIGN_CONTRACT.md`
- `docs/design/KLOEL_ANTI_HARDCODE_CONTRACT.md`
- `ops/*.json`
- `ops/kloel-design-tokens.json`
- `scripts/ops/check-*.mjs`
- `scripts/ops/lib/*.mjs`
- `.husky/pre-push`
- `.github/workflows/ci-cd.yml`
- `backend/eslint.config.mjs`
- `frontend/eslint.config.mjs`
- `worker/eslint.config.mjs`
- `backend/src/lib/ai-models.ts`

Qualquer tentativa de editar estes arquivos para contornar uma validacao e considerada gambiarra e sera revertida.

### GitHub Hardening

- `CI`, `CodeQL`, `Deploy Staging`, `Deploy Production` e `Nightly Ops Audit` são guardrails obrigatórios
- `Dependabot` deve permanecer ativo para root, backend, frontend, worker, e2e e GitHub Actions
- Settings manuais obrigatórias vivem em `docs/GITHUB_REPOSITORY_SETTINGS.md`

---

## CICLO DE EXECUÇÃO

```
1. Rodar PULSE (ou consultar último PULSE_REPORT.md)
2. Escolher próximo módulo respeitando o DAG acima
3. Preservar a casca visual existente
4. Conectar motor real por trás da shell
5. Rodar testes (lint + build + unit + smoke)
6. Rodar PULSE de novo
7. Atualizar artefatos de controle
8. Confirmar zero regressões visuais
9. Próximo módulo
```

---

## ANTI-PATTERNS (NÃO FAZER)

- NÃO criar dados fake para "completar" a UI — usar empty state
- NÃO usar `prismaAny` em código novo — sempre usar Prisma tipado
- NÃO usar `localStorage` para dados de negócio
- NÃO usar `Math.random()` para dados exibidos ao usuário
- NÃO usar `console.log` como corpo de event handler
- NÃO pular fases do DAG — se Products não está 100%, não iniciar Affiliate
- NÃO destruir shell existente para reconstruir — refatorar por baixo
- NÃO marcar nada como pronto sem evidência (PULSE clean + testes passando)

---

## NOTAS TÉCNICAS ESPECÍFICAS

### prismaAny

O codebase tem 133 usos de `this.prismaAny.` (bypass de tipos). Funciona mas é frágil.
Em código novo, SEMPRE usar `this.prisma.` tipado. Migrar `prismaAny` progressivamente.

### Proxy Routes (Next.js → Backend)

Frontend calls a `/api/whatsapp-api/*`, `/api/auth/*`, `/api/kyc/*`, `/api/workspace/*`
passam por route handlers Next.js que fazem proxy pro backend.
O PULSE sabe resolver essas rotas.

### API Layer

Toda chamada API do frontend usa `apiFetch()` de `frontend/src/lib/api/core.ts`.
19 módulos de API em `frontend/src/lib/api/`.
SWR hooks usam `swrFetcher` que wrapa `apiFetch`.

### Design Tokens

Importar de `@/lib/design-tokens`: `colors`, `motion`, `radius`, `spacing`.
Usar `colors.ember.primary` (#E85D30) para accent, `colors.text.silver` para texto.
Toggle components em `frontend/src/components/kloel/Forms.tsx`.

---

## SEGURANCA (implementado)

### Webhook Verification

- Asaas: header `asaas-access-token` verificado contra `ASAAS_WEBHOOK_TOKEN` (asaas-webhook.controller.ts + checkout-webhook.controller.ts)
- Webhooks sem token valido: rejeitados com 403

### Idempotencia

- Checkout webhooks verificam `externalId` antes de processar — duplicatas ignoradas
- Asaas webhooks verificam status do Payment — ja processado = skip

### Rate Limiting

- `@nestjs/throttler` global: 100 req/min
- Auth login: 5 req/min por IP
- Webhook endpoints: 200 req/min (rajadas do Asaas)

### Wallet Protection

- Saque usa `$transaction` com verificacao de saldo atomica
- Race condition de saque duplo: protegido

### WebhookEvent Model

- Audit trail para todos os webhooks recebidos
- `@@unique([provider, externalId])` previne duplicatas
- Status tracking: received → processed / failed

### ENV VARS necessarias para producao

- `ASAAS_WEBHOOK_TOKEN` — token de verificacao de webhooks Asaas
