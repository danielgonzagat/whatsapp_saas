-- Rollback: 20260328040000_add_missing_product_member_affiliate_tables
-- Reverses: FollowUp, ProductPlan, ProductCheckout, ProductCoupon, ProductReview,
--           ProductCommission, ProductUrl, ProductAIConfig, MemberArea, MemberModule,
--           MemberLesson, AffiliateProduct, AffiliateRequest, AffiliateLink

-- Drop foreign keys
ALTER TABLE "AffiliateLink" DROP CONSTRAINT IF EXISTS "AffiliateLink_affiliateProductId_fkey";
ALTER TABLE "AffiliateRequest" DROP CONSTRAINT IF EXISTS "AffiliateRequest_affiliateProductId_fkey";
ALTER TABLE "MemberLesson" DROP CONSTRAINT IF EXISTS "MemberLesson_moduleId_fkey";
ALTER TABLE "MemberModule" DROP CONSTRAINT IF EXISTS "MemberModule_memberAreaId_fkey";
ALTER TABLE "ProductAIConfig" DROP CONSTRAINT IF EXISTS "ProductAIConfig_productId_fkey";
ALTER TABLE "ProductUrl" DROP CONSTRAINT IF EXISTS "ProductUrl_productId_fkey";
ALTER TABLE "ProductCommission" DROP CONSTRAINT IF EXISTS "ProductCommission_productId_fkey";
ALTER TABLE "ProductReview" DROP CONSTRAINT IF EXISTS "ProductReview_productId_fkey";
ALTER TABLE "ProductCoupon" DROP CONSTRAINT IF EXISTS "ProductCoupon_productId_fkey";
ALTER TABLE "ProductCheckout" DROP CONSTRAINT IF EXISTS "ProductCheckout_productId_fkey";
ALTER TABLE "ProductPlan" DROP CONSTRAINT IF EXISTS "ProductPlan_productId_fkey";
ALTER TABLE "FollowUp" DROP CONSTRAINT IF EXISTS "FollowUp_flowId_fkey";
ALTER TABLE "FollowUp" DROP CONSTRAINT IF EXISTS "FollowUp_contactId_fkey";
ALTER TABLE "FollowUp" DROP CONSTRAINT IF EXISTS "FollowUp_workspaceId_fkey";

-- Drop tables (reverse dependency order)
DROP TABLE IF EXISTS "AffiliateLink";
DROP TABLE IF EXISTS "AffiliateRequest";
DROP TABLE IF EXISTS "AffiliateProduct";
DROP TABLE IF EXISTS "MemberLesson";
DROP TABLE IF EXISTS "MemberModule";
DROP TABLE IF EXISTS "MemberArea";
DROP TABLE IF EXISTS "ProductAIConfig";
DROP TABLE IF EXISTS "ProductUrl";
DROP TABLE IF EXISTS "ProductCommission";
DROP TABLE IF EXISTS "ProductReview";
DROP TABLE IF EXISTS "ProductCoupon";
DROP TABLE IF EXISTS "ProductCheckout";
DROP TABLE IF EXISTS "ProductPlan";
DROP TABLE IF EXISTS "FollowUp";
