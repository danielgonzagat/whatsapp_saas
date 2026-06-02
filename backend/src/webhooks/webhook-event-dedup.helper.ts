import { Prisma } from '@prisma/client';

/**
 * Canonical "insert-or-detect-duplicate" primitive for `WebhookEvent`.
 *
 * Several webhook receivers (Mercado Pago, billing/Stripe, generic providers)
 * re-implement the same idempotency claim inline: attempt to insert a
 * `WebhookEvent` row keyed by the `@@unique([provider, externalId])` constraint
 * and, on a duplicate delivery, treat the Prisma `P2002` unique-violation as
 * "already seen — skip". This helper extracts ONLY that single, behavior-exact
 * primitive so the call sites can share one well-tested implementation while
 * keeping their own provider string, externalId source, payload shape, and
 * post-claim flow unchanged.
 *
 * It deliberately does NOT subsume the richer claim-once state machine in
 * {@link WebhooksService.logWebhookEvent} (which additionally flips
 * `received → processing` atomically and returns the authoritative row). That
 * remains the canonical helper for the post-TTL replay-guarded providers.
 *
 * Semantics (matching the inline Mercado Pago implementation exactly):
 *  - First delivery: inserts a row with `status: 'received'` and returns
 *    `{ alreadyProcessed: false }`.
 *  - Duplicate delivery (P2002 on the unique constraint): returns
 *    `{ alreadyProcessed: true }` without mutating the existing row.
 *  - Any other error: re-thrown unchanged so the caller's retry signal is
 *    preserved.
 *
 * The optional `requireProcessedToDedup` flag mirrors the billing receiver's
 * stricter pre-check: when set, an existing row is only treated as a duplicate
 * if its `status === 'processed'`, so a row stuck mid-flight can be retried.
 */

/** Minimal Prisma surface this helper needs — accepts a client or a `$transaction` tx. */
export interface WebhookEventDedupClient {
  webhookEvent: {
    findFirst: (args: {
      where: { provider: string; externalId: string; status: string };
    }) => Promise<{ id: string } | null>;
    create: (args: {
      data: {
        provider: string;
        externalId: string;
        eventType: string;
        payload: Prisma.InputJsonValue;
        status: string;
        receivedAt?: Date;
      };
    }) => Promise<unknown>;
  };
}

export interface WebhookEventDedupInput {
  provider: string;
  externalId: string;
  eventType: string;
  /**
   * Pre-shaped Prisma JSON payload. The helper persists it verbatim and does NOT
   * transform it — each call site keeps its exact payload-shaping expression so
   * the stored row is byte-for-byte identical to the prior inline implementation.
   */
  payload: Prisma.InputJsonValue;
  /**
   * When true, an existing row is only a duplicate if `status === 'processed'`
   * (billing semantics). When false/omitted, any existing row (detected via the
   * unique-constraint violation) is a duplicate (Mercado Pago semantics).
   */
  requireProcessedToDedup?: boolean;
  /** Defaults to `new Date()` at call time, matching the inline implementations. */
  receivedAt?: Date;
}

export interface WebhookEventDedupResult {
  /** True when this delivery is a replay that must be skipped. */
  alreadyProcessed: boolean;
}

/**
 * Claim a webhook delivery against the `WebhookEvent` table.
 *
 * Returns `{ alreadyProcessed: true }` for a duplicate the caller should skip,
 * or `{ alreadyProcessed: false }` after inserting a fresh `received` row the
 * caller now owns and must finalise (e.g. via `markWebhookProcessed`).
 */
export async function claimWebhookEvent(
  client: WebhookEventDedupClient,
  input: WebhookEventDedupInput,
): Promise<WebhookEventDedupResult> {
  const { provider, externalId, eventType, requireProcessedToDedup } = input;

  if (requireProcessedToDedup) {
    const alreadyProcessed = await client.webhookEvent.findFirst({
      where: { provider, externalId, status: 'processed' },
    });
    if (alreadyProcessed) {
      return { alreadyProcessed: true };
    }
  }

  try {
    await client.webhookEvent.create({
      data: {
        provider,
        externalId,
        eventType,
        payload: input.payload,
        status: 'received',
        ...(input.receivedAt ? { receivedAt: input.receivedAt } : {}),
      },
    });
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { alreadyProcessed: true };
    }
    throw err;
  }

  return { alreadyProcessed: false };
}
