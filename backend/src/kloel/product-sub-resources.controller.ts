/**
 * Barrel re-export for product sub-resources controllers.
 *
 * The original 2624-line monolith was decomposed into per-controller files
 * under `./product-sub-resources/` to satisfy the architecture guardrail
 * (max_touched_file_lines = 600). Helpers were grouped into
 * `./product-sub-resources/helpers/` by domain (common, plan, affiliate,
 * campaign, ai-config).
 *
 * Keeping this barrel preserves all existing import paths in
 * `kloel.module.ts` and the legacy spec file.
 */

export { ProductAIConfigController } from './product-sub-resources/product-ai-config.controller';
export { ProductAffiliateController } from './product-sub-resources/product-affiliate.controller';
export { ProductCampaignController } from './product-sub-resources/product-campaign.controller';
export { ProductCheckoutController } from './product-sub-resources/product-checkout.controller';
export { ProductCommissionController } from './product-sub-resources/product-commission.controller';
export { ProductCouponController } from './product-sub-resources/product-coupon.controller';
export { ProductPlanController } from './product-sub-resources/product-plan.controller';
export { ProductReviewController } from './product-sub-resources/product-review.controller';
export { ProductUrlController } from './product-sub-resources/product-url.controller';
