/**
 * Feature flag for the canonical `ProductAIConfig` READER preference.
 *
 * Per-product AI config duplication family: the per-product AI config is split
 * across the typed Prisma model `ProductAIConfig` (table `RAC_ProductAIConfig`,
 * the DECLARED CANONICAL home — keyed unique on `productId`, carrying
 * `customerProfile` / `positioning` / `objections` / `salesArguments` / tone /
 * persistence, etc.) and a per-plan JSON blob `ProductPlan.aiConfig`
 * (`RAC_ProductPlan.aiConfig Json?`). The chat-tool read path
 * `getProductAIConfig` (companion in `unified-agent-actions-billing.helpers.ts`)
 * already reads the canonical typed table via `prisma.productAIConfig.findUnique`
 * and returns `{ config }` — but when a product has NO `ProductAIConfig` row yet
 * (config still living only in the per-plan JSON blob) it surfaces
 * `{ config: null }`, hiding AI config that exists.
 *
 * When this flag is set to `'true'`, the reader PREFERS the canonical typed
 * table exactly as today, and ONLY on a MISSING canonical row (typed lookup
 * resolves to `null`) FALLS BACK to the first non-empty per-plan `aiConfig`
 * JSON blob for the product, surfacing it under the same `{ config }` contract
 * so a not-yet-migrated product still exposes its AI config:
 *   - the canonical typed row, when present, is ALWAYS preferred and returned
 *     verbatim — the JSON blob is never consulted in that case;
 *   - the fallback reads `prisma.productPlan.findMany` scoped to the same
 *     `productId`, returning the first plan whose `aiConfig` is a non-null
 *     object; if no plan carries one, the result stays `{ config: null }`;
 *   - flag OFF (default) is BYTE-IDENTICAL to today — the canonical typed read
 *     only, with NO per-plan query issued at all and NO fallback branch entered.
 *
 * This is an ADDITIVE READER ONLY. It performs NO migration of the per-plan
 * JSON data into the typed table — that is a separate, supervised step. The two
 * shapes are reconcilable read-side because the consumer
 * (`unified-agent-tool-executor` → `get_product_ai_config`) passes the `config`
 * value through to the LLM tool result as opaque JSON, tolerating either the
 * typed row object or the per-plan JSON object under the same key.
 *
 * DEFAULT OFF. No backfill is performed by this flag.
 *
 * @see backend/src/kloel/unified-agent-actions-billing.helpers.ts (getProductAIConfig)
 */
export function isProductAiConfigReadCanonicalEnabled(): boolean {
  return process.env.KLOEL_PRODUCT_AICONFIG_READ_CANONICAL === 'true';
}
