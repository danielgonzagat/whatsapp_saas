# KLOEL

[![Codacy Badge](https://app.codacy.com/project/badge/Grade/de45b0033ec04323b31a4a3ec49b1ce9)](https://app.codacy.com/gh/danielgonzagat/whatsapp_saas/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_grade)
[![Codacy Badge](https://app.codacy.com/project/badge/Coverage/de45b0033ec04323b31a4a3ec49b1ce9)](https://app.codacy.com/gh/danielgonzagat/whatsapp_saas/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_coverage)

Plataforma AI-native de marketing digital + checkout + WhatsApp + autopilot
comercial. Monorepo de produção: Next.js (Vercel), NestJS (Railway), BullMQ
worker (Railway), suite E2E Playwright, e a camada cognitiva unificada que
expõe LSP/MCP/CDP/OpenAPI/AsyncAPI/SARIF/SBOM/OpenTelemetry/Tree-sitter
sob duas MCPs (`cognitive-hub`, `lsp-mesh`) acessíveis a todos os agentes
(Claude / Codex / Hermes / OpenCode).

`main` é a fonte de verdade de release. Cada mudança passa por gates de
typecheck, lint, Codacy (max-rigor lock), Prettier, testes, build, segurança,
regressão visual, E2E e PULSE.

---

## Stack (medido em 2026-05-26)

```
Code            831,412 LOC  (4,121 TS + 902 TSX + outras)
Backend         455k LOC     163 controllers • 428 services • 173 modelos Prisma
                             580 paths OpenAPI / 663 ops em 60 tags
Frontend        195k LOC     110 pages • 557 components • 71 API proxy routes • 89 hooks
Worker          38k LOC      10 processors • 11 BullMQ queues
Scripts         166k LOC     scripts/pulse domina (governança)
Database        173 modelos / 39 enums / 63 migrations / 159 RAC_* tabelas live
Events          73 AsyncAPI channels (74% em commerce.*)
Codegraph       63.6k nodes / 137k edges (SQLite + FTS5, live-watched)
LSPs ativos     14 servers em 7 workspaces (typescript, eslint, prisma,
                tailwindcss, css, html, json, yaml, bash, marksman,
                taplo, sqls, dockerfile, docker-compose)
MCPs            22 servidores no .mcp.json + 13 globais em ~/.claude.json
```

A medição completa, com todas as variações (build health, top services por
tamanho, hotspots por dir, dependências, Sentry, hot clusters, etc.), vive em
**[docs/architecture/MACHINE_STATE.md](docs/architecture/MACHINE_STATE.md)**.

---

## Arquitetura de superfícies

```
frontend/ (Next.js 15 App Router, Vercel)
  ├─ Dashboard & Analytics
  ├─ Product Nerve Center (editor multi-tab)
  ├─ Checkout público (pay.kloel.com)
  ├─ WhatsApp Console (inbox + autopilot + flows)
  ├─ CRM Pipeline
  ├─ Kloel AI Assistant (SSE streaming)
  ├─ Billing / Wallet / KYC / Settings
  └─ Área de membros pós-compra + landing kloel.com

backend/ (NestJS 11, Railway)
  ├─ Multi-tenant Workspace (raiz; 103 campos, 184 @UseGuards)
  ├─ Auth (JWT + Google OAuth + Apple + Magic Link)
  ├─ Checkout (planos, Stripe Connect cards + MercadoPago PIX)
  ├─ Wallet prepaga + Connect ledger (append-only)
  ├─ Marketplace treasury (split de pagamentos)
  ├─ WhatsApp engine (WAHA + Meta Cloud API)
  ├─ Kloel cognitive stack (intent-router + mind-policy + cia +
  │   unified-agent + kloel-thinker + tool-dispatcher)
  ├─ Autopilot (segmentação + envio scheduler)
  ├─ PULSE governance (303 artifacts, locked auditor)
  └─ Sentry + Datadog + custom metrics

worker/ (BullMQ, Railway)
  ├─ autopilot-processor + cia + checkout-social-lead-enrichment
  ├─ crm + memory + decision-outcome + fact-extractor
  ├─ mind-lift-report + silent-24h-resolver
  └─ prepaid-wallet (errors + settlement) + webhook + media

tools/ (intelligence layer — consultable by all agents)
  ├─ cognitive-hub/protocol-hub.mjs   (6 tools — unified protocol query)
  ├─ lsp-mesh/lsp-router.mjs          (10 tools — 14 LSPs / 7 workspaces)
  ├─ openapi/openapi-spec.json        (580 paths gerados via AST estático)
  ├─ asyncapi/asyncapi-spec.json      (73 event channels)
  ├─ sbom/sbom-*.json                 (CycloneDX por workspace)
  ├─ sarif/<workspace>.sarif          (SARIF 2.1 per workspace)
  └─ canonicalize/                    (deduplication scanners)
```

---

## Quick-start

```sh
# 1. Instalar dependências
npm install
( cd backend && npm install )
( cd frontend && npm install )
( cd frontend-admin && npm install )
( cd worker && npm install )

# 2. Configurar secrets locais
cp backend/.env.example backend/.env   # editar
cp frontend/.env.example frontend/.env # editar

# 3. Subir banco + migrar Prisma
( cd backend && npx prisma migrate dev )

# 4. Rodar serviços
( cd backend && npm run start:dev )    # NestJS na 3001
( cd frontend && npm run dev )         # Next.js na 3000
( cd worker && npm run dev )           # BullMQ worker

# 5. Verificar saúde
npm run typecheck      # tsc em todos workspaces
npm run lint           # ESLint
npm run canonical:check # gates de canonização
( cd backend && npm test )
```

---

## Documentação canônica (fontes de verdade)

Comece sempre por estas três:

| Documento                                                                                            | O que contém                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[docs/architecture/MACHINE_STATE.md](docs/architecture/MACHINE_STATE.md)**                         | Estado real medido da máquina (tamanho, build health, runtime errors, hotspots, integrações, velocity). Atualizado via `scripts/cognitive/*.mjs`. |
| **[docs/architecture/TOOL_ARSENAL.md](docs/architecture/TOOL_ARSENAL.md)**                           | Referência completa das ferramentas: cada MCP, LSP, script, skill — o que faz, quando usar, exemplo concreto.                                     |
| **[docs/architecture/COGNITIVE_INTERFACE_LAYER.md](docs/architecture/COGNITIVE_INTERFACE_LAYER.md)** | Spec do protocolo-hub: 10 protocolos sob 2 MCPs (`cognitive-hub` + `lsp-mesh`); como cada CLI se conecta.                                         |

Filosofia e regras operacionais ficam em **[CLAUDE.md](CLAUDE.md)** (lido
automaticamente por Claude Code) e **[AGENTS.md](AGENTS.md)** (lido por
outros agentes).

Outras referências importantes:

- `docs/adr/` — Architecture Decision Records (12 ADRs ativos)
- `docs/architecture/CANONICAL_DOMAINS.md` — bounded contexts
- `docs/architecture/CANONICAL_VOCABULARY.md` — naming oficial
- `docs/architecture/CAPABILITY_MAP.md` — o que o sistema sabe fazer
- `docs/architecture/EVENT_TAXONOMY.md` — eventos canônicos
- `docs/architecture/SERVICE_CATALOG.md` — inventário de services
- `docs/architecture/ROUTES_CATALOG.md` — superfície HTTP
- `docs/architecture/QUEUES_CATALOG.md` — filas BullMQ
- `docs/architecture/PRISMA_USAGE.md` — uso por modelo
- `docs/architecture/DEPRECATION_MAP.md` — tracker de canonização
- `docs/architecture/ANTI_REGRESSION_GATES.md` — gates ativos
- `docs/architecture/CANONICALIZATION_DOD.md` — definição de pronto
- `CHANGELOG.md` — histórico de releases
- `SECURITY.md` — política de segurança
- `RUNBOOK.md` — operacional + runbooks
- `TESTING.md` — estratégia de testes
- `docs/runbooks/` — runbooks específicos
- `docs/contracts/` — contratos de domínio
- `docs/compliance/` — LGPD/GDPR/KYC
- `docs/deployment/` — deploy guides
- `docs/security/` — políticas

---

## Hooks de disciplina

```sh
# Após editar frontend
( cd frontend && npm run lint && npm run build )

# Após editar backend
( cd backend && npm run lint && npm run build )

# Após editar schema
( cd backend && npx prisma generate && npx prisma validate )

# Antes de push
npm run guard:db-push   # bloqueia prisma db push em CI/produção
npm run typecheck
npm test
```

Husky + lint-staged + commitlint são parte do contrato do repo. ESLint e
Prettier são fontes únicas de formatação.

---

## Para agentes (Claude / Codex / Hermes / OpenCode)

1. Leia [CLAUDE.md](CLAUDE.md) (rules e DAG do projeto)
2. Leia [docs/architecture/MACHINE_STATE.md](docs/architecture/MACHINE_STATE.md) (estado real)
3. Leia [docs/architecture/TOOL_ARSENAL.md](docs/architecture/TOOL_ARSENAL.md) (todas ferramentas)
4. Chame `cognitive-hub.protocol_hub_status` para verificar conectividade
5. Use o tool certo da seção "Quick recipes" do TOOL_ARSENAL

MCPs auto-carregam em cada nova sessão via `.mcp.json` (projeto) e
`~/.claude.json` (global, Claude) / `~/.codex/config.toml` (Codex) /
`~/.hermes/config.yaml` (Hermes).

---

## License

Proprietary — © Kloel
