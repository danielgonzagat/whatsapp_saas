-- Rollback: 20260331000000_add_webhook_event
-- Reverses: CreateTable WebhookEvent + indexes

DROP INDEX IF EXISTS "WebhookEvent_provider_externalId_key";
DROP INDEX IF EXISTS "WebhookEvent_status_idx";
DROP TABLE IF EXISTS "WebhookEvent";
