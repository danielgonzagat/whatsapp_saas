/**
 * Canonical BullMQ queue-name registry for the backend package.
 *
 * Single source of truth for the string names used to construct BullMQ
 * queues/workers in this package. Previously these names were inlined as
 * string literals in `queue.ts` and again in individual feature services
 * (`new Queue('media-jobs', ...)`, `new Worker('ads-sync-meta', ...)`,
 * etc.). Repointing every call site here removes the duplication while
 * keeping the on-the-wire queue names byte-identical (pure de-dup, zero
 * behavior change).
 *
 * NOTE: the `worker/` package is a separate deployable with its own
 * independent queue registry; it intentionally does NOT import from this
 * file (no cross-package coupling). Names that exist in both packages are
 * kept identical by convention.
 */
export const QUEUE_NAMES = {
  FLOW: 'flow-jobs',
  CAMPAIGN: 'campaign-jobs',
  SCRAPER: 'scraper-jobs',
  MEDIA: 'media-jobs',
  VOICE: 'voice-jobs',
  AUTOPILOT: 'autopilot-jobs',
  MEMORY: 'memory-jobs',
  CRM: 'crm-jobs',
  WEBHOOK: 'webhook-jobs',
  GOOGLE_ADS_SYNC: 'google-ads-sync-jobs',
  META_ADS_SYNC: 'ads-sync-meta',
  MASS_SEND: 'mass-send',
} as const;

/** Union of all canonical backend queue names. */
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
