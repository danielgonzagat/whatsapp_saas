-- Rollback: 20251211193956_add_external_payment_links
-- Reverses: CreateTable ExternalPaymentLink

ALTER TABLE "ExternalPaymentLink" DROP CONSTRAINT IF EXISTS "ExternalPaymentLink_workspaceId_fkey";
DROP TABLE IF EXISTS "ExternalPaymentLink";
