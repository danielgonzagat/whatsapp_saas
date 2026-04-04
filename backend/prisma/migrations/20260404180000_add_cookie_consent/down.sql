ALTER TABLE "CookieConsent" DROP CONSTRAINT "CookieConsent_agentId_fkey";

DROP INDEX "CookieConsent_agentId_key";

DROP TABLE "CookieConsent";
