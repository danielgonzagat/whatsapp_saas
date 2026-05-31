/**
 * @cluster whatsapp_saas/backend/autopilot
 * Pure helpers extracted from {@link AutopilotAnalyticsInsightsService}.
 *
 * These helpers are deliberately Prisma-client-free (they accept plain row
 * shapes) so they can be unit-tested in isolation, kept under a single
 * responsibility, and reused without dragging in DI.
 *
 * Behavior preserved 1:1 with the original inline implementation. Every
 * extraction here was a direct cut/paste of a pure block — no business-logic
 * tweaks, no rounding changes, no key renames.
 */

/**
 * Portuguese keywords used to detect inbound messages that look like a
 * customer confirming a purchase / payment. Case-insensitive matching is the
 * caller's responsibility (the original Prisma query used `mode: 'insensitive'`).
 */
export const PAYMENT_KEYWORDS = Object.freeze([
  'paguei',
  'pago',
  'pix',
  'pague',
  'comprei',
  'compre',
  'boleto',
  'assinatura',
] as const);

export type PaymentKeyword = (typeof PAYMENT_KEYWORDS)[number];

/** Minimal Prisma row shape consumed by the impact aggregation. */
export type ImpactEventRow = {
  contactId: string | null;
  createdAt: Date;
  action: string | null;
  status: string | null;
};

/**
 * Filter `autopilotEvent` rows to the subset whose status counts as
 * "impactable" — i.e. the cohort the reply/conversion math runs against.
 *
 * Mirrors the original predicate: `status ?? 'executed'` must be either
 * `executed`, or the row must be a `CONVERSION` action regardless of status.
 */
export const filterImpactableEvents = <T extends ImpactEventRow>(events: T[]): T[] =>
  events.filter((event) => {
    const status = event.status || 'executed';
    return status === 'executed' || event.action === 'CONVERSION';
  });

/**
 * For each contact, keep the timestamp (in ms) of their most recent action.
 *
 * Returns a `Map<contactId, latestActionMs>`. Rows without a `contactId`
 * are silently skipped — matching the original behavior.
 */
export const buildLatestContactActionMap = <T extends ImpactEventRow>(
  events: T[],
): Map<string, number> => {
  const contactActions = new Map<string, number>();
  for (const ev of events) {
    if (!ev.contactId) {
      continue;
    }
    const ts = ev.createdAt.getTime();
    const current = contactActions.get(ev.contactId);
    if (!current || ts > current) {
      contactActions.set(ev.contactId, ts);
    }
  }
  return contactActions;
};

/** Minimal inbound-message shape used for reply bucketing. */
export type InboundMessageRow = {
  contactId: string | null;
  createdAt: Date;
};

/**
 * Group inbound messages by `contactId`, ignoring rows with a null contact.
 *
 * The returned map preserves insertion order; callers that depend on
 * "first reply after action" must pre-sort the input by `createdAt asc`.
 */
export const groupInboundByContact = <T extends InboundMessageRow>(
  messages: T[],
): Map<string, Date[]> => {
  const inboundByContact = new Map<string, Date[]>();
  for (const msg of messages) {
    if (!msg.contactId) {
      continue;
    }
    const list = inboundByContact.get(msg.contactId) || [];
    list.push(msg.createdAt);
    inboundByContact.set(msg.contactId, list);
  }
  return inboundByContact;
};

/** Reply-delay aggregate produced by {@link computeReplyAggregates}. */
export interface ReplyAggregates {
  repliedContacts: number;
  totalReplies: number;
  replyDelays: number[];
  samples: Array<{
    contactId: string;
    contact: string;
    replyAt: Date;
    delayMinutes: number;
  }>;
}

/**
 * Compute the per-contact reply aggregates used by the Autopilot impact
 * dashboard.
 *
 * - `delayMinutes` is `Math.round((firstReply - actionTs) / 60000)`.
 * - At most 5 samples are emitted, matching the original UI cap.
 * - A contact is counted as "replied" only if at least one inbound message
 *   exists with `createdAt > actionTs`.
 */
export const computeReplyAggregates = (
  contactActions: ReadonlyMap<string, number>,
  inboundByContact: ReadonlyMap<string, Date[]>,
  contactMap: ReadonlyMap<string, { id: string; phone: string; name: string | null }>,
  sampleLimit = 5,
): ReplyAggregates => {
  let repliedContacts = 0;
  let totalReplies = 0;
  const replyDelays: number[] = [];
  const samples: ReplyAggregates['samples'] = [];

  for (const [contactId, actionTs] of contactActions.entries()) {
    const replies = (inboundByContact.get(contactId) || []).filter((d) => d.getTime() > actionTs);
    if (replies.length === 0) {
      continue;
    }
    const firstReply = replies[0];
    if (!firstReply) {
      continue;
    }
    repliedContacts += 1;
    totalReplies += replies.length;
    const delay = Math.round((firstReply.getTime() - actionTs) / 60000);
    replyDelays.push(delay);
    const contact = contactMap.get(contactId);
    if (samples.length < sampleLimit && contact) {
      samples.push({
        contactId,
        contact: contact.name || contact.phone,
        replyAt: firstReply,
        delayMinutes: delay,
      });
    }
  }

  return { repliedContacts, totalReplies, replyDelays, samples };
};

/**
 * Mean of a numeric array, rounded to the nearest integer.
 *
 * Returns `null` for an empty array — used as the "no reply data yet"
 * sentinel by the impact endpoint.
 */
export const averageRoundedOrNull = (values: readonly number[]): number | null => {
  if (values.length === 0) {
    return null;
  }
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round(sum / values.length);
};

/**
 * Safe ratio that returns `0` when the denominator is non-positive.
 * Mirrors the original `actionsAnalyzed > 0 ? x / actionsAnalyzed : 0` guard.
 */
export const safeRate = (numerator: number, denominator: number): number =>
  denominator > 0 ? numerator / denominator : 0;

/** Bucketed counts produced by {@link aggregateEventTaxonomy}. */
export interface EventTaxonomy {
  executed: number;
  errors: number;
  intents: Record<string, number>;
  actions: Record<string, number>;
}

/** Minimal row shape for taxonomy aggregation. */
export type TaxonomyEventRow = {
  intent: string | null;
  action: string | null;
  status: string | null;
};

/**
 * Aggregate counts of intents, actions, and terminal statuses across a
 * batch of autopilot events. `null` intent/action fall back to `'UNKNOWN'`,
 * preserving the original key.
 */
export const aggregateEventTaxonomy = <T extends TaxonomyEventRow>(events: T[]): EventTaxonomy => {
  let executed = 0;
  let errors = 0;
  const intents: Record<string, number> = {};
  const actions: Record<string, number> = {};

  for (const e of events) {
    const intent = e.intent || 'UNKNOWN';
    const action = e.action || 'UNKNOWN';
    intents[intent] = (intents[intent] || 0) + 1;
    actions[action] = (actions[action] || 0) + 1;
    if (e.status === 'error' || e.status === 'failed') {
      errors += 1;
    }
    if (e.status === 'executed') {
      executed += 1;
    }
  }

  return { executed, errors, intents, actions };
};

/**
 * Build a deterministic "topN intents" string like `"BUY:42, ASK:13, GREET:9"`.
 * Sort order: count desc. Ties fall back to insertion order (Object.entries).
 */
export const summarizeTopIntents = (intents: Readonly<Record<string, number>>, top = 3): string =>
  Object.entries(intents)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([intent, count]) => `${intent}:${count}`)
    .join(', ');

/** Single bucket of the daily-events timeline. */
export type TimelineBucket = {
  createdAt: unknown;
  _count?: { _all?: unknown } | null;
};

/**
 * Render a Prisma `groupBy({ by: ['createdAt'] })` result as a sorted, comma-
 * separated `iso:count` string. Non-array inputs collapse to `'n/a'` so the
 * caller can safely chain a Prisma `.catch(() => [])`.
 */
export const summarizeDailyTimeline = (timeline: unknown): string => {
  if (!Array.isArray(timeline)) {
    return 'n/a';
  }
  return (timeline as TimelineBucket[])
    .map((entry) => {
      const raw = entry?.createdAt;
      let createdAt: string;
      if (raw instanceof Date) {
        createdAt = raw.toISOString();
      } else if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'bigint') {
        createdAt = String(raw);
      } else {
        createdAt = 'unknown';
      }
      const rawCount = entry?._count?._all;
      const count = typeof rawCount === 'number' ? rawCount : 0;
      return `${createdAt}:${count}`;
    })
    .sort((left, right) => left.localeCompare(right))
    .join(', ');
};
