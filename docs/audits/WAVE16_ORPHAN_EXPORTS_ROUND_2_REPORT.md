# Wave 16 — Orphan Exports Cleanup Round 2

> Authored by PI atomic subagent `w16-orphan-exports-round2` (DeepSeek V4 Pro). Materialized 2026-05-26.


> Authored by PI subagent `wt-w16-orphan-exports-round2`
> Run date: 2026-05-26

## Summary

| Category | Count | Action |
|---|---|---|
| Deleted (full files) | 5 | 🗑 5 dead files removed |
| Deleted (individual exports) | 6 | 🗑 6 dead exports removed from live file |
| Preserved (planned activation) | 4 | ⏸ NestJS modules kept per Wave 7 |

**Total orphans processed: 11**

## Methodology

1. **Re-audit**: The Wave 2 audit (`docs/audits/WAVE2_ORPHAN_EXPORTS.md`) had 67 candidates. Wave 7 cleared backend/worker. The frontend candidates (18) had ALL become stale — symbol names had changed (e.g., `gerencieFeatures` → `GERENCIE_CAPABILITIES`) or files had been refactored (e.g., `canvasPalette` instead of `CANVAS_DEFAULT_PALETTE`).

2. **Fresh scan**: Used `search` to find files with zero import references across the entire frontend codebase, then verified each candidate had zero test references.

3. **Deletion safety**: Every deleted file/export was confirmed: zero importers in source, zero references in tests, not re-exported via barrel files, not dynamically imported.

---

## Per-Orphan Inventory

### Full file deletions (🗑 DELETE)

| # | File | Exports | Decision | Reason |
|---|---|---|---|---|
| 1 | `frontend/src/components/webinarios/page-styles.ts` | 19 CSSProperties exports | 🗑 DELETE | All 19 styles (`centerPageStyle`, `authInnerStyle`, …, `gridStyle`) are duplicated as local `const` definitions in `page.tsx`. The file is never imported. |
| 2 | `frontend/src/hooks/useBrainDecide.ts` | `useBrainDecide`, `UseBrainDecideResult` | 🗑 DELETE | Zero importers, zero tests. Brain decide functionality is accessed via `@/lib/api/brain` directly. |
| 3 | `frontend/src/hooks/useCapabilities.ts` | `useCapabilities`, type re-exports | 🗑 DELETE | Zero importers, zero tests. Capabilities are now loaded via `@/lib/frontend-capabilities` (static data) or `@/lib/capability-data` barrel. |
| 4 | `frontend/src/hooks/useMarketing.ts` | `useMarketingStats`, `useMarketingChannels`, `useMarketingLiveFeed` | 🗑 DELETE | Zero importers, zero tests. Marketing hooks were refactored into individual files under `frontend/src/components/kloel/marketing/`. |
| 5 | `frontend/src/hooks/useAnunciosCampaigns.ts` | `MetaSyncStatus`, `MetaMarketingSyncStatus`, `useAnunciosCampaigns`, `useMetaMarketingSyncStatus`, `useMetaMarketingConnectUrl` | 🗑 DELETE | Abandoned duplicate of `useAnuncios.ts`. The live file `useAnuncios.ts` already contains the active version of `useAnunciosCampaigns`. Zero importers. |

### Individual export deletions from live files (🗑 DELETE)

| # | File | Exports removed | Decision | Reason |
|---|---|---|---|---|
| 6–11 | `frontend/src/hooks/useAnuncios.ts` | `AnunciosAccount`, `AnunciosConnectUrl`, `useAnunciosAccounts`, `useAnunciosConnectUrl`, `useSyncAnunciosAccounts`, `useSyncAnunciosCampaigns` | 🗑 DELETE | Zero importers outside own file, zero test references. Also removed dead imports (`useSWRMutation`, `swrMutator`) that only these functions depended on. |

---

## Files Modified

| File | Change |
|---|---|
| `frontend/src/components/webinarios/page-styles.ts` | 🗑 Deleted (128 lines) |
| `frontend/src/hooks/useBrainDecide.ts` | 🗑 Deleted (78 lines) |
| `frontend/src/hooks/useCapabilities.ts` | 🗑 Deleted (30 lines) |
| `frontend/src/hooks/useMarketing.ts` | 🗑 Deleted (78 lines) |
| `frontend/src/hooks/useAnunciosCampaigns.ts` | 🗑 Deleted (68 lines) |
| `frontend/src/hooks/useAnuncios.ts` | ✂️ 6 dead exports + 2 dead imports removed (−63 lines) |

---

## Verification

```
backend tsc:  0 errors ✅
worker tsc:   0 errors ✅
frontend tsc: 0 errors ✅
```

---

## Remaining from Wave 2 Audit

- **Backend**: All 37 original candidates processed by Wave 7 (1 deleted, 17 false-positive/already-gone, 19 kept as contract surface or planned activation).
- **Worker**: All 12 original candidates were false positives (stale symbol names).
- **Frontend**: All 18 original candidates were stale — names had changed or files had been refactored. The 5 dead files identified in this wave are newly-discovered orphans not in the original audit.

### NestJS modules preserved (⏸ per Wave 7)

| Module | File | Reason |
|---|---|---|
| `EmailModule` | `backend/src/email/email.module.ts` | Planned-future-activation per DEPRECATION_MAP |
| `PostSaleModule` | `backend/src/post-sale/post-sale.module.ts` | Same |
| `ChannelSurvivalModule` | `backend/src/kloel/channel-survival/channel-survival.module.ts` | Same |
| `EventEmitAuditEmitterModule` | `backend/src/kloel/event-emit-audit-emitter/event-emit-audit-emitter.module.ts` | Same |
