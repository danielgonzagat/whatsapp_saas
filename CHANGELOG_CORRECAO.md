# CHANGELOG DE CORRECAO — Kloel Platform

**Data:** 28 de Março de 2026
**Escopo:** Eliminacao de mentiras visuais, dados falsos, codigo morto e refatoracao estrutural
**Resultado:** 36 arquivos alterados, +4.011/-4.226 linhas

---

## FASE 1A — AnunciosView: UI Fake Eliminada

**Commit:** `db92185` — refactor(anuncios): substituir UI fake por empty state "Em Breve"

- **AnunciosView.tsx** reescrito de 627 para 75 linhas
- Removidos: dados hardcoded de 3 plataformas (Meta/Google/TikTok), 10 campanhas fictitcias, 5 regras de IA fake, 6 acoes de IA simuladas, profit ticker animado, canvas NeuralPulse
- Substituido por `ContextualEmptyState` com contexto "anuncios"
- Navegacao de 6 tabs mantida funcional para uso futuro
- Adicionado contexto 'anuncios' em EmptyStates.tsx

**Arquivos:** `AnunciosView.tsx`, `EmptyStates.tsx`

---

## FASE 3A — Marketing: Dados Reais de Vendas

**Commit:** `c1e2e83` — fix(marketing): usar vendas reais ao inves de contagem de produtos

- **Antes:** `totalSales = products.length` (contava produtos, nao vendas)
- **Antes:** `totalRevenue = soma de precos de tabela` (nao receita real)
- **Depois:** `kloelSale.count({ status: 'paid' })` para vendas reais
- **Depois:** `kloelSale.aggregate({ _sum: { amount: true } })` para receita real

**Arquivo:** `marketing.controller.ts`

---

## FASE 2B — FunnelsModule Deletado

**Commit:** `702670b` — chore: deletar FunnelsModule (stub in-memory) e launchpad (duplicata)

- Deletado `backend/src/funnels/` (5 arquivos, 153 linhas)
- FunnelsService mantinha funis num array in-memory — morria a cada restart
- POST /funnels/register nunca era chamado pelo frontend
- Frontend /funnels/page.tsx usa APIs de conversations/flows, nao o backend de funnels
- Removido import do FunnelsModule no app.module.ts

---

## FASE 2C — Launchpad Orfao Deletado

**Mesmo commit:** `702670b`

- Deletado `backend/src/launchpad/launch.service.ts` (49 linhas)
- Arquivo solto, nunca importado por nenhum modulo
- Duplicata do `backend/src/launch/` (LaunchModule funcional)

---

## FASE 1B — Settings: Verificacao (NO-OP)

- A autopsia afirmava que TODOS os 14 settings components tinham "0 API calls"
- **FALSO.** Verificacao confirma que a maioria ja tem integracao API completa:
  - account-settings-section: workspaceApi, authApi
  - billing-settings-section: billingApi, legacy-payment, external payments
  - brain-settings-section: productApi, autopilotApi, knowledgeBaseApi
  - crm-settings-section: crmApi, segmentationApi
  - analytics-settings-section: analytics APIs
- Cards menores (kloel-status, realtime-usage, etc.) recebem props dos pais - funcional
- **Nenhuma mudanca necessaria**

---

## FASE 1C — Ferramentas: Badges "Em Breve"

**Commit:** `787adcc` — feat(ferramentas): adicionar badge "Em Breve" em tools sem backend

- `ToolCard.tsx`: nova prop `disabled` (opacity 0.5, cursor not-allowed, badge "Em Breve" cor Ember)
- `ver-todas/page.tsx`: 32 tools sem rota real agora marcadas disabled automaticamente
- 10 tools com rotas reais continuam funcionais (WhatsApp Marketing, Afiliados, Funnels, etc.)
- Paginas gerencie/ e impulsione/ ja tinham banner "Em desenvolvimento"

**Arquivos:** `ToolCard.tsx`, `ver-todas/page.tsx`

---

## FASE 3B — Payment: Fallback Fake Removido

**Commit:** `498f158` — fix(payment): remover fallback que criava registros falsos no banco

- **Antes:** Quando legacy payment provider indisponivel, gerava ID fake `pay_${timestamp}`, criava KloelSale real no banco com URL inexistente
- **Depois:** Lanca erro claro "Provedor de pagamento nao configurado"
- Evita poluicao da tabela de vendas com dados falsos

**Arquivo:** `payment.service.ts` (-24 linhas de fallback fake)

---

## FASE 4A — api.ts Quebrado em 19 Modulos

**Commits:** `851432c`, `aefed19`, `1fb03a9` — refactor(api): quebrar api.ts em modulos

- **Antes:** 3.368 linhas em 1 arquivo, 15 namespaces, 40+ interfaces
- **Depois:** 19 modulos em `frontend/src/lib/api/`:

| Modulo              | Conteudo                                                  |
| ------------------- | --------------------------------------------------------- |
| `core.ts`           | apiFetch, tokenStorage, tipos base, wallet, memory, leads |
| `whatsapp.ts`       | Funcoes WhatsApp + templates + messaging                  |
| `analytics.ts`      | Dashboard stats, daily activity, advanced                 |
| `kloel.ts`          | KloelHealth, uploadPdf, createPaymentLink                 |
| `campaigns.ts`      | CRUD de campanhas                                         |
| `legacy-payment.ts` | legacy payment provider + external payment links          |
| `autopilot.ts`      | Todas funcoes de autopilot                                |
| `flows.ts`          | CRUD de flows + execucoes                                 |
| `conversations.ts`  | Inbox, mensagens, agentes                                 |
| `auth.ts`           | authApi object                                            |
| `whatsapp-api.ts`   | whatsappApi object                                        |
| `cia.ts`            | ciaApi + autostartCia                                     |
| `kloel-api.ts`      | kloelApi (SSE streaming)                                  |
| `billing.ts`        | billingApi object                                         |
| `workspace.ts`      | workspaceApi + settings + API keys                        |
| `products.ts`       | productApi, externalPaymentApi, knowledgeBaseApi          |
| `crm.ts`            | crmApi, segmentationApi                                   |
| `misc.ts`           | memberAreaApi, affiliateApi, calendar, dashboard, etc.    |
| `index.ts`          | Barrel re-export de tudo                                  |

- `api.ts` original agora e um shim de 4 linhas
- Todos os 42+ imports existentes continuam funcionando sem mudanca

---

## FASE 2A — Paginas para Backends Orfaos

**Commit:** `fc38984` — feat: criar paginas minimas para backends orfaos (scrapers + video)

- `scrapers/page.tsx`: Lista jobs de scraping via GET /scrapers/jobs
- `video/page.tsx`: Lista video jobs via GET /video/jobs
- `useScrapers.ts`: Hook SWR seguindo padrao de useSales/useProducts
- Ambas usam design system Terminator (SectionPage + Card)

**Arquivos novos:** 3 (2 paginas + 1 hook)

---

## VALIDACAO FINAL

- `npx tsc --noEmit` backend: **0 erros**
- `npx tsc --noEmit` frontend: **0 erros**
- Grep por referencias a funnels/launchpad: **0 imports orfaos**
- Total: **36 arquivos alterados, +4.011/-4.226 linhas**

---

## RESUMO DE IMPACTO

| Acao                               | Quantidade |
| ---------------------------------- | ---------- |
| Linhas de codigo fake removidas    | ~800       |
| Linhas de codigo morto removidas   | ~200       |
| Linhas refatoradas (api.ts split)  | ~3.400     |
| Novas paginas funcionais           | 2          |
| Novos hooks SWR                    | 1          |
| Modulos backend deletados          | 2          |
| Queries fake corrigidas para reais | 2          |
| Commits atomicos                   | 8          |
