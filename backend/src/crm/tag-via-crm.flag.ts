/**
 * Feature flag for routing the CRM "deal-won → tag contact 'cliente'" write
 * through the canonical {@link CrmService.addTag} surface (census P2-13).
 *
 * The deal-won path in {@link moveDeal} (crm.deals.helpers.ts) tags the
 * contact via a local `addTagInline` helper that DUPLICATES the Tag
 * upsert-by-`workspaceId_name` + Contact connect-by-`workspaceId_phone`
 * persistence already implemented canonically in `CrmService.addTag`.
 *
 * When this flag is set to `'true'` AND a canonical `addTag` callback was
 * threaded into `moveDeal` (it is, from `CrmService.moveDeal`), the deal-won
 * branch DELEGATES the tag write to `CrmService.addTag(workspaceId, phone,
 * 'cliente')` — the single canonical tagging surface (canonical phone keying).
 *
 * DEFAULT OFF. When OFF — or when no canonical callback is available — the
 * deal-won branch runs its EXISTING `addTagInline(prisma, ...)` transaction
 * byte-for-byte unchanged. The single env read short-circuits BEFORE the
 * canonical callback is touched, so flag-OFF is byte-identical to today: zero
 * behavior change, zero added latency on the deal-won critical path.
 *
 * The keying MAY differ between the two surfaces in the future (the canonical
 * `CrmService.addTag` is the place where phone normalization can evolve),
 * which is precisely why the canonicalization is flag-gated rather than
 * applied unconditionally.
 *
 * Mirrors the repo's established `process.env.X === 'true'` flag idiom
 * (e.g. `KLOEL_TRANSPORT_CANONICAL_DELEGATE`, `KLOEL_MINDMEMORY_DUALWRITE`).
 *
 * @see backend/src/crm/crm.deals.helpers.ts
 * @see backend/src/crm/crm.service.ts
 */
export function isTagViaCrmEnabled(): boolean {
  return process.env.KLOEL_TAG_VIA_CRM === 'true';
}
