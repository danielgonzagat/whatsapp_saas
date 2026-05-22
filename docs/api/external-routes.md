# External Routes — PULSE Triage Registry

> Registro de rotas backend invocadas por webhooks, curl, CLI scripts, ou
> integracao externa — nao se espera caller frontend para estas rotas.
>
> Parte 9 do triage de lacunas (L8).

Ultima atualizacao: 2026-05-13

---

## Mecanismo de deteccao PULSE

PULSE classifica uma rota como `route_caller_unobserved` quando:

1. A rota backend tem guard de autenticacao (JwtAuthGuard, AdminAuthGuard, etc.),
2. Nenhum `apiCall` do frontend (rastreado via `apiCalls` do parser de UI handlers)
   faz match com o path normalizado da rota,
3. A rota NAO e `isPublic` — rotas publicas (sem guards) sao inferidas como
   externas por `inferRouteHasExternalCaller` em
   `scripts/pulse/graph/graph-part1-core.ts:160`.

### Limitacao (L13)

Nao existe mecanismo de accept-list explicito para declarar que uma rota
com guard de autenticacao deve ser considerada externa. Rotas com
`JwtAuthGuard` ou `AdminAuthGuard` que recebem chamadas apenas de
webhooks/stripe/meta/WAHA/curl serao falsamente reportadas como orphan.

PULSE infere rotas externas apenas via `route.isPublic` (ausencia de guard).
Rotas com guard que sao chamadas exclusivamente por integracoes externas
precisam de um mecanismo de aceitacao explicito (ex: config JSON de
`externalRoutes`). Este gap esta documentado como L13 em
`docs/audit/lacunas-identificadas.md`.

---

## Rotas Externas Conhecidas (nao-orphan, detectadas por `isPublic`)

Estas rotas NAO aparecem como orphan no PULSE porque sao publicas (sem
auth guard). Estao listadas aqui para referencia.

| Metodo | Path | Controller | Caller | Justificativa |
|--------|------|-----------|--------|---------------|
| POST | `/webhooks/stripe` | payment-webhook-stripe.controller.ts | Stripe | Webhook receiver |
| POST | `/webhooks/payment` | payment-webhook.controller.ts | MercadoPago | Webhook receiver |
| POST | `/webhooks/meta` | meta-webhook.controller.ts | Meta | Webhook receiver |
| POST | `/webhooks/whatsapp` | whatsapp-api-webhook.controller.ts | WAHA | Webhook receiver |
| POST | `/webhooks/tiktok` | tiktok-webhook.controller.ts | TikTok | Webhook receiver |
| GET | `/unsubscribe` | unsubscribe.controller.ts | Email client | Link publico em emails |
| POST | `/checkout/webhook/mercadopago` | mercado-pago-webhook.controller.ts | MercadoPago | Webhook receiver |

---

## Rotas em Triagem (P9/L8 — 15 rotas `route_caller_unobserved`)

Nenhuma das 15 rotas marcadas como `route_caller_unobserved` e externa.
Todas possuem auth guard (JwtAuthGuard ou AdminAuthGuard) e sao parte de
controladores ativos com outras rotas que ja tem callers frontend.

Classificacao final: **todas sao FRONTEND_INCOMPLETE** — registradas em
`docs/audit/lacunas-identificadas.md` com concrete next steps.

| Metodo | Rota | Controller | Classificacao |
|--------|------|-----------|---------------|
| DELETE | `/settings/webhooks/:id` | webhook-settings.controller.ts | FRONTEND_INCOMPLETE |
| GET | `/admin/mind/:workspaceId/state` | admin-mind.controller.ts | FRONTEND_INCOMPLETE |
| GET | `/admin/mind/:workspaceId/surprise` | admin-mind.controller.ts | FRONTEND_INCOMPLETE |
| GET | `/admin/mind/:workspaceId/lift` | admin-mind.controller.ts | FRONTEND_INCOMPLETE |
| GET | `/admin/mind/:workspaceId/concepts` | admin-mind.controller.ts | FRONTEND_INCOMPLETE |
| GET | `/admin/mind/:workspaceId/health` | admin-mind.controller.ts | FRONTEND_INCOMPLETE |
| GET | `/admin/mind/:workspaceId/briefing` | admin-mind.controller.ts | FRONTEND_INCOMPLETE |
| GET | `/admin/mind/lift` | admin-mind.controller.ts | FRONTEND_INCOMPLETE |
| GET | `/admin/pipeline/state` | pipeline.controller.ts | FRONTEND_INCOMPLETE |
| GET | `/admin/pipeline/health` | pipeline.controller.ts | FRONTEND_INCOMPLETE |
| GET | `/api/anuncios/status` | anuncios.controller.ts | FRONTEND_INCOMPLETE |
| GET | `/api/anuncios/sync-status/google` | anuncios.controller.ts | FRONTEND_INCOMPLETE |
| GET | `/api/anuncios/accounts` | anuncios.controller.ts | FRONTEND_INCOMPLETE |
| GET | `/api/anuncios/campaigns` | anuncios.controller.ts | FRONTEND_INCOMPLETE |
| GET | `/api/anuncios/connect/:platform` | anuncios.controller.ts | FRONTEND_INCOMPLETE |

---

## Como este arquivo evolui

- Quando uma nova rota externa com guard for adicionada, registrar aqui.
- Quando o gap L13 for resolvido (accept-list), atualizar a secao "Limitacao".
- Rotas que sairem de FRONTEND_INCOMPLETE (frontend for wired) sao removidas.
