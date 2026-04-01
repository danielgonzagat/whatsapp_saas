-- Rollback: 20260328050000_add_checkout_system
-- Reverses: Checkout enums + tables (PhysicalProduct, CheckoutProductPlan,
--           CheckoutConfig, OrderBump, Upsell, CheckoutCoupon, CheckoutPixel,
--           CheckoutOrder, CheckoutPayment, UpsellOrder)

-- Drop foreign keys first (reverse order of creation)
ALTER TABLE "UpsellOrder" DROP CONSTRAINT IF EXISTS "UpsellOrder_orderId_fkey";
ALTER TABLE "CheckoutPayment" DROP CONSTRAINT IF EXISTS "CheckoutPayment_orderId_fkey";
ALTER TABLE "CheckoutOrder" DROP CONSTRAINT IF EXISTS "CheckoutOrder_planId_fkey";
ALTER TABLE "CheckoutPixel" DROP CONSTRAINT IF EXISTS "CheckoutPixel_checkoutConfigId_fkey";
ALTER TABLE "Upsell" DROP CONSTRAINT IF EXISTS "Upsell_planId_fkey";
ALTER TABLE "OrderBump" DROP CONSTRAINT IF EXISTS "OrderBump_planId_fkey";
ALTER TABLE "CheckoutConfig" DROP CONSTRAINT IF EXISTS "CheckoutConfig_planId_fkey";
ALTER TABLE "CheckoutProductPlan" DROP CONSTRAINT IF EXISTS "CheckoutProductPlan_productId_fkey";
ALTER TABLE "PhysicalProduct" DROP CONSTRAINT IF EXISTS "PhysicalProduct_workspaceId_fkey";

-- Drop tables (reverse dependency order)
DROP TABLE IF EXISTS "UpsellOrder";
DROP TABLE IF EXISTS "CheckoutPayment";
DROP TABLE IF EXISTS "CheckoutOrder";
DROP TABLE IF EXISTS "CheckoutPixel";
DROP TABLE IF EXISTS "CheckoutCoupon";
DROP TABLE IF EXISTS "Upsell";
DROP TABLE IF EXISTS "OrderBump";
DROP TABLE IF EXISTS "CheckoutConfig";
DROP TABLE IF EXISTS "CheckoutProductPlan";
DROP TABLE IF EXISTS "PhysicalProduct";

-- Drop enums
DROP TYPE IF EXISTS "PaymentStatus";
DROP TYPE IF EXISTS "OrderStatus";
DROP TYPE IF EXISTS "PaymentMethod";
DROP TYPE IF EXISTS "PixelType";
DROP TYPE IF EXISTS "DiscountType";
DROP TYPE IF EXISTS "UpsellChargeType";
DROP TYPE IF EXISTS "TimerType";
DROP TYPE IF EXISTS "CheckoutTheme";
DROP TYPE IF EXISTS "ProductStatus";
