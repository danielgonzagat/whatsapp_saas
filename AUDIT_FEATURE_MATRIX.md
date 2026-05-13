# KLOEL — AUDIT FEATURE MATRIX

> Updated: 2026-05-13 | PULSE Triage P9/L8 applied

## PULSE Route Caller Triage (P9/L8)

15 `route_caller_unobserved` findings triaged. All classified as
FRONTEND_INCOMPLETE — zero removed, zero external.

| Module | Surface | Routes Unobserved | Status | Action |
|--------|---------|-------------------|--------|--------|
| Webhook Settings | Settings | DELETE /settings/webhooks/:id | PARTIAL | Add delete button to WebhookSettings UI |
| Admin Mind | CIA/Agent | 7 GET routes (state, surprise, lift, concepts, health, briefing, global-lift) | PARTIAL | Build admin `/admin/mind` dashboard tabs |
| Admin Pipeline | CIA/Agent | 2 GET routes (state, health) | PARTIAL | Build admin `/admin/pipeline` status view |
| Anuncios/Ads | Ads | 5 GET routes (status, sync-google, accounts, campaigns, connect) | PARTIAL | Build Ads dashboard read views |

### Module Status Delta

| Module | Before P9 | After P9 | Delta |
|--------|-----------|----------|-------|
| CIA/Agent | READY | PARTIAL (admin queries unwired) | -1 tier |
| Ads | PARTIAL | PARTIAL (5 GET reads unwired) | unchanged |
| Settings | READY | PARTIAL (DELETE unwired) | -1 tier |

### PULSE Score

- Before: 58/100, NOT_CERTIFIED, NOT_READY
- After: 58/100 (score unchanged — PULSE score sobe quando frontend for wired)
- `route_caller_unobserved` findings now have documented `needs_context` resolution

### Full Triage

See `docs/api/external-routes.md` for the external classification framework
and `docs/audit/lacunas-identificadas.md` L8 + L13 for next steps per route.
