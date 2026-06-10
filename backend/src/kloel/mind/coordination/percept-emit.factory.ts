import { randomUUID } from 'node:crypto';
import type { Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Canonical percept-emit factory — the ONE try/catch/upsert that every
 * subsystem percept helper (CIA, Autopilot, Flows, Voice, Money) delegates to.
 *
 * Before this factory each of those 5 helpers carried a byte-identical copy of:
 *   - a private `formatUnknownError`
 *   - the `RAC_MindOutboxEvent` idempotent upsert wrapped in try/catch + warn-log
 * This module is the single owner of that machinery. The per-subsystem helpers
 * keep their public signatures + event-type consts + flag gates and now reduce
 * to: "is the flag on + workspace present? → build {eventType, subject,
 * idempotencyKey, payload} and hand it to {@link emitPerceptToMindSpine}".
 *
 * Behavior is byte-identical to the inlined copies: same `update`/`create`
 * upsert shape (id=randomUUID, occurredAt=new Date(), the unique
 * `(workspaceId, idempotencyKey)` constraint), same best-effort try/catch that
 * can NEVER break the caller, same `warn` log on failure.
 */

/** Minimal Prisma surface this factory needs — only the outbox delegate. */
export interface OutboxPrismaDelegate {
  mindOutboxEvent: PrismaClient['mindOutboxEvent'];
}

/** The canonical, subsystem-agnostic percept payload the factory upserts. */
export interface PerceptEmitInput {
  /** Canonical `cognition.*` event type (e.g. `cognition.flow.node_completed`). */
  readonly eventType: string;
  /** The workspace this percept belongs to (also half the unique constraint). */
  readonly workspaceId: string;
  /** The percept subject (e.g. `flow:flow_1`, `cia:run:run_1`). */
  readonly subject: string;
  /** Stable idempotency anchor — the other half of the unique constraint. */
  readonly idempotencyKey: string;
  /** The percept payload (best-effort context the Mind learns against). */
  readonly payload: Prisma.InputJsonObject;
  /**
   * Builds the warn-log line when the best-effort upsert throws. Receives the
   * already-stringified error so each subsystem can keep its exact failure
   * wording (e.g. "...the autonomy write succeeded and is unaffected: ...").
   */
  readonly failureLog: (formattedError: string) => string;
}

/**
 * Convert an unknown thrown value into a stable, human-readable string. This is
 * the SINGLE canonical implementation that replaces the 5 near-identical private
 * copies that used to live in each percept helper.
 *
 * Most of the old copies were the full Error → string → JSON.stringify →
 * Object.prototype.toString ladder; Flows/Money used the shorter
 * `err instanceof Error ? err.message : String(err)`. The ladder is a strict
 * superset (it produces the same output for the Error and string cases the
 * specs exercise) so consolidating onto it preserves observable behavior.
 */
export function formatUnknownError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  try {
    const serialized: unknown = JSON.stringify(err);
    if (typeof serialized === 'string') {
      return serialized;
    }
  } catch {
    // fall through to Object.prototype.toString
  }
  const fallback: unknown = Object.prototype.toString.call(err);
  return typeof fallback === 'string' ? fallback : 'unknown error';
}

/**
 * Emit ONE canonical cognition percept into the durable spine outbox
 * (`RAC_MindOutboxEvent`) via an idempotent upsert on the unique
 * `(workspaceId, idempotencyKey)` constraint.
 *
 * Best-effort: the write is wrapped in try/catch with a `warn` log so it can
 * NEVER break the caller's legacy write/dispatch or alter its outputs. Callers
 * own the flag gate + `workspaceId` presence check and only reach here once they
 * intend to attempt a write — so this always attempts the upsert.
 */
export async function emitPerceptToMindSpine(
  prisma: OutboxPrismaDelegate,
  logger: Pick<Logger, 'warn'>,
  input: PerceptEmitInput,
): Promise<void> {
  const occurredAt = new Date();

  try {
    await prisma.mindOutboxEvent.upsert({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: input.workspaceId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      update: {
        eventType: input.eventType,
        subject: input.subject,
        payload: input.payload,
        occurredAt,
      },
      create: {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        eventType: input.eventType,
        subject: input.subject,
        payload: input.payload,
        idempotencyKey: input.idempotencyKey,
        occurredAt,
      },
    });
  } catch (err: unknown) {
    logger.warn(input.failureLog(formatUnknownError(err)));
  }
}
