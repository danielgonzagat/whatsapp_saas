-- Rollback: 20260327200000_add_kloel_sites_designs_subscriptions_orders
-- Reverses: KloelSite, KloelDesign, CustomerSubscription, PhysicalOrder

DROP TABLE IF EXISTS "PhysicalOrder";
DROP TABLE IF EXISTS "CustomerSubscription";
DROP TABLE IF EXISTS "KloelDesign";
DROP TABLE IF EXISTS "KloelSite";
