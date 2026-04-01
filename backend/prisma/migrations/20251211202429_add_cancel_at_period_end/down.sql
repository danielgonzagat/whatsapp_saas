-- Rollback: 20251211202429_add_cancel_at_period_end
-- Reverses: Adding cancelAtPeriodEnd column to Subscription

ALTER TABLE "Subscription" DROP COLUMN IF EXISTS "cancelAtPeriodEnd";
