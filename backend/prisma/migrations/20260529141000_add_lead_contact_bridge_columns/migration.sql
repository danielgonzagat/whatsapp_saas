-- Lead → Contact provenance bridge: nullable pointer columns on RAC_Contact.
-- Preserves lead lineage when a lead is promoted into a Contact, from any of
-- the three lead sources (OmniScraper ScrapingJob, KloelLead, CheckoutSocialLead).
--
-- ADDITIVE migration. Adds four nullable columns + three nullable FKs to
-- RAC_Contact. NO destructive change — no column drops, no type changes, no
-- change to the existing CheckoutSocialLead.contactId relation (which is the
-- forward lead→contact link; the new checkoutSocialLeadId is the reverse
-- provenance pointer and is a separate, named relation).
--
-- NOT YET APPLIED — left for human review. Do NOT run
-- `prisma db push` / `prisma migrate deploy` from autonomous execution.

-- ============================================================
-- New nullable bridge columns on RAC_Contact.
-- ============================================================
ALTER TABLE "RAC_Contact" ADD COLUMN IF NOT EXISTS "scrapingJobId" TEXT;
ALTER TABLE "RAC_Contact" ADD COLUMN IF NOT EXISTS "scrapedFrom" TEXT;
ALTER TABLE "RAC_Contact" ADD COLUMN IF NOT EXISTS "kloelLeadId" TEXT;
ALTER TABLE "RAC_Contact" ADD COLUMN IF NOT EXISTS "checkoutSocialLeadId" TEXT;

-- ============================================================
-- Nullable FKs (ON DELETE SET NULL) so deleting a source lead never deletes
-- the promoted Contact — it only clears the provenance pointer.
-- Guarded for idempotency / out-of-order safety.
-- ============================================================
DO $$
BEGIN
    IF to_regclass('"RAC_ScrapingJob"') IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'RAC_Contact_scrapingJobId_fkey'
        ) THEN
            ALTER TABLE "RAC_Contact"
            ADD CONSTRAINT "RAC_Contact_scrapingJobId_fkey"
            FOREIGN KEY ("scrapingJobId") REFERENCES "RAC_ScrapingJob"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
    END IF;

    IF to_regclass('"RAC_KloelLead"') IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'RAC_Contact_kloelLeadId_fkey'
        ) THEN
            ALTER TABLE "RAC_Contact"
            ADD CONSTRAINT "RAC_Contact_kloelLeadId_fkey"
            FOREIGN KEY ("kloelLeadId") REFERENCES "RAC_KloelLead"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
    END IF;

    IF to_regclass('"RAC_CheckoutSocialLead"') IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'RAC_Contact_checkoutSocialLeadId_fkey'
        ) THEN
            ALTER TABLE "RAC_Contact"
            ADD CONSTRAINT "RAC_Contact_checkoutSocialLeadId_fkey"
            FOREIGN KEY ("checkoutSocialLeadId") REFERENCES "RAC_CheckoutSocialLead"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
    END IF;
END $$;

-- ============================================================
-- Indexes for the new lookup columns (provenance queries by source lead).
-- ============================================================
CREATE INDEX IF NOT EXISTS "RAC_Contact_scrapingJobId_idx"
    ON "RAC_Contact"("scrapingJobId");
CREATE INDEX IF NOT EXISTS "RAC_Contact_kloelLeadId_idx"
    ON "RAC_Contact"("kloelLeadId");
CREATE INDEX IF NOT EXISTS "RAC_Contact_checkoutSocialLeadId_idx"
    ON "RAC_Contact"("checkoutSocialLeadId");
