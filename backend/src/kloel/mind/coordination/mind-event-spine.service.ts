/**
 * MindEventSpine — canonical event spine bus (ADR-0013 Wave M1).
 *
 * The central nervous system that re-emits raw CRUD events
 * (`product.created`, `plan.created`, `channel.message.received`, …) as
 * canonical `mind.*` events for the unified Mind runtime.
 *
 * Cross-domain callers: products, plans, admin/pipeline, omnichannel,
 * unified-agent-actions-messaging, and ~17 more kloel internals.
 *
 * Legacy shim: `backend/src/kloel/brain-event-spine.service.ts` re-exports
 * `MindEventSpine` under the deprecated alias `BrainEventSpineService`.
 *
 * @cluster Mind/Coordination
 * @canonical backend/src/kloel/mind/coordination/mind-event-spine.service.ts
 * @see docs/adr/0013-kloel-mind-unification.md
 */
import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../../../logging/structured-logger';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { OpsAlertService } from '../../../observability/ops-alert.service';
import { PrismaService } from '../../../prisma/prisma.service';
import type { BrainEventName, CommercialEventPayload } from './mind-event-taxonomy';
import { expandEventNameAliasesAll } from './mind-event-taxonomy';
import {
  resolveEventIntent,
  resolveEventStatus,
  toInputJsonObject,
} from './mind-event-spine.helpers';

type AutopilotEventIdRow = { id: string } | null;

@Injectable()
export class MindEventSpine {
  private readonly logger = StructuredLogger.from(MindEventSpine.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  async record(params: {
    action: BrainEventName;
    contactId?: string;
    intent: string;
    meta?: Prisma.InputJsonObject;
    reason?: string;
    responseText?: string;
    status: 'error' | 'executed' | 'skipped';
    workspaceId: string;
  }): Promise<void> {
    try {
      await this.prisma.autopilotEvent.create({
        data: {
          workspaceId: params.workspaceId,
          ...(params.contactId !== undefined ? { contactId: params.contactId } : {}),
          intent: params.intent,
          action: params.action,
          status: params.status,
          ...(params.reason !== undefined ? { reason: params.reason } : {}),
          ...(params.responseText !== undefined ? { responseText: params.responseText } : {}),
          ...(params.meta !== undefined ? { meta: params.meta } : {}),
        },
      });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'MindEventSpine.record');
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`Failed to record brain event: ${message}`);
    }
  }

  async recordCommercial(event: CommercialEventPayload): Promise<string | null> {
    try {
      const idempotencyKey =
        event.idempotencyKey ??
        `${event.eventType}:${event.subject}:${event.occurredAt.toISOString()}`;
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.mindOutboxEvent.upsert({
          where: {
            workspaceId_idempotencyKey: {
              workspaceId: event.workspaceId,
              idempotencyKey,
            },
          },
          update: {
            eventType: event.eventType,
            subject: event.subject,
            payload: toInputJsonObject(event.payload),
            occurredAt: event.occurredAt,
          },
          create: {
            id: randomUUID(),
            workspaceId: event.workspaceId,
            eventType: event.eventType,
            subject: event.subject,
            payload: toInputJsonObject(event.payload),
            idempotencyKey,
            occurredAt: event.occurredAt,
          },
        });

        // raw justified: PostgreSQL advisory transaction lock serializes AutopilotEvent
        // creation for JSONB idempotency keys, which Prisma cannot express as a unique index.
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtext(${`brain-spine:${event.workspaceId}:${idempotencyKey}`}))
        `;

        const existing = await this.checkIdempotency(tx, event.workspaceId, idempotencyKey);
        if (existing) {
          return existing;
        }

        return tx.autopilotEvent.create({
          data: {
            workspaceId: event.workspaceId,
            contactId: event.contactId ?? null,
            intent: resolveEventIntent(event.eventType),
            action: event.eventType,
            status: resolveEventStatus(event.eventType),
            meta: {
              commercial: true,
              subject: event.subject,
              occurredAt: event.occurredAt.toISOString(),
              idempotencyKey,
              payload: toInputJsonObject(event.payload),
            },
          },
          select: { id: true },
        });
      });

      return result.id;
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'MindEventSpine.recordCommercial');
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`Failed to record commercial event ${event.eventType}: ${message}`);
      return null;
    }
  }

  async recordMany(events: CommercialEventPayload[]): Promise<number> {
    let recorded = 0;
    for (const event of events) {
      const id = await this.recordCommercial(event);
      if (id) {
        recorded += 1;
      }
    }
    return recorded;
  }

  async dispatchPending(workspaceId: string, limit = 100): Promise<{ dispatched: number }> {
    const rows = await this.prisma.mindOutboxEvent.findMany({
      where: { workspaceId, status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true },
    });

    if (rows.length === 0) {
      return { dispatched: 0 };
    }

    const result = await this.prisma.mindOutboxEvent.updateMany({
      where: { id: { in: rows.map((row) => row.id) }, workspaceId, status: 'pending' },
      data: {
        status: 'processing',
        dispatchedAt: null,
        attempts: { increment: 1 },
        lastError: null,
      },
    });

    return { dispatched: result.count };
  }

  async claimPendingEvents(params: {
    workspaceId: string;
    eventType: string;
    limit?: number;
  }): Promise<{
    events: Array<{
      id: string;
      eventType: string;
      subject: string;
      payload: Prisma.JsonValue;
      idempotencyKey: string;
      occurredAt: Date;
      attempts: number;
      lastError: string | null;
    }>;
  }> {
    // ADR-0013 §4 / Wave 31 — claim under either legacy or canonical mind.*
    // spelling. Expansion is a no-op for event names without an alias mapping
    // (`agent.job.due`, sale.*, etc.), so existing callers are unaffected.
    const expandedTypes = expandEventNameAliasesAll([params.eventType as BrainEventName]);
    const eventTypeFilter =
      expandedTypes.length > 1
        ? { eventType: { in: expandedTypes } }
        : { eventType: params.eventType };

    const rows = await this.prisma.mindOutboxEvent.findMany({
      where: {
        workspaceId: params.workspaceId,
        ...eventTypeFilter,
        status: 'pending',
      },
      orderBy: { createdAt: 'asc' },
      take: Math.max(1, Math.min(params.limit ?? 25, 100)),
      select: { id: true },
    });

    if (rows.length === 0) {
      return { events: [] };
    }

    const ids = rows.map((row) => row.id);
    await this.prisma.mindOutboxEvent.updateMany({
      where: {
        id: { in: ids },
        workspaceId: params.workspaceId,
        ...eventTypeFilter,
        status: 'pending',
      },
      data: {
        status: 'processing',
        dispatchedAt: null,
        attempts: { increment: 1 },
        lastError: null,
      },
    });

    const events = await this.prisma.mindOutboxEvent.findMany({
      where: {
        id: { in: ids },
        workspaceId: params.workspaceId,
        ...eventTypeFilter,
        status: 'processing',
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        eventType: true,
        subject: true,
        payload: true,
        idempotencyKey: true,
        occurredAt: true,
        attempts: true,
        lastError: true,
      },
    });

    return { events };
  }

  async markDispatchSucceeded(eventId: string, workspaceId: string): Promise<void> {
    await this.prisma.mindOutboxEvent.updateMany({
      where: { id: eventId, workspaceId, status: 'processing' },
      data: {
        status: 'dispatched',
        dispatchedAt: new Date(),
        lastError: null,
      },
    });
  }

  async markDispatchFailed(eventId: string, workspaceId: string, error: string): Promise<void> {
    await this.prisma.mindOutboxEvent.updateMany({
      where: { id: eventId, workspaceId, status: { in: ['processing', 'dispatched'] } },
      data: {
        status: 'failed',
        lastError: error,
        dispatchedAt: null,
      },
    });
  }

  async readReplayEvents(params: {
    workspaceId: string;
    eventTypes?: BrainEventName[];
    since?: Date;
    limit?: number;
  }): Promise<{
    events: Array<{
      id: string;
      eventType: string;
      subject: string;
      payload: Prisma.JsonValue;
      idempotencyKey: string;
      occurredAt: Date;
      status: string;
    }>;
  }> {
    // ADR-0013 §4 / Wave 31 — accept BOTH legacy and canonical mind.* names
    // during the alias cutover window. A caller filtering on the canonical
    // `mind.product.observed` will also receive historical rows still tagged
    // `product.created`, and vice versa. See `MIND_EVENT_ALIASES` in
    // brain-event-taxonomy.ts and EVENT_TAXONOMY_KLOEL_TO_MIND_MIGRATION.md §E.
    const expandedEventTypes = params.eventTypes?.length
      ? expandEventNameAliasesAll(params.eventTypes)
      : undefined;

    const rows = await this.prisma.mindOutboxEvent.findMany({
      where: {
        workspaceId: params.workspaceId,
        ...(expandedEventTypes ? { eventType: { in: expandedEventTypes } } : {}),
        ...(params.since ? { occurredAt: { gte: params.since } } : {}),
        status: { in: ['dispatched', 'pending'] },
      },
      orderBy: { occurredAt: 'asc' },
      take: params.limit ?? 500,
      select: {
        id: true,
        eventType: true,
        subject: true,
        payload: true,
        idempotencyKey: true,
        occurredAt: true,
        status: true,
      },
    });

    return { events: rows };
  }

  async readPendingEvents(
    workspaceId: string,
    limit = 50,
  ): Promise<{
    events: Array<{
      id: string;
      eventType: string;
      subject: string;
      idempotencyKey: string;
      occurredAt: Date;
      attempts: number;
      lastError: string | null;
    }>;
  }> {
    const rows = await this.prisma.mindOutboxEvent.findMany({
      where: { workspaceId, status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true,
        eventType: true,
        subject: true,
        idempotencyKey: true,
        occurredAt: true,
        attempts: true,
        lastError: true,
      },
    });

    return { events: rows };
  }

  async getOutboxStatus(workspaceId: string): Promise<{
    pending: number;
    dispatched: number;
    failed: number;
    total: number;
  }> {
    const [pending, dispatched, failed, total] = await Promise.all([
      this.prisma.mindOutboxEvent.count({
        where: { workspaceId, status: 'pending' },
      }),
      this.prisma.mindOutboxEvent.count({
        where: { workspaceId, status: 'dispatched' },
      }),
      this.prisma.mindOutboxEvent.count({
        where: { workspaceId, status: 'failed' },
      }),
      this.prisma.mindOutboxEvent.count({
        where: { workspaceId },
      }),
    ]);

    return { pending, dispatched, failed, total };
  }

  private async checkIdempotency(
    prisma: Pick<PrismaService, '$queryRaw'> | Prisma.TransactionClient,
    workspaceId: string,
    idempotencyKey: string,
  ): Promise<AutopilotEventIdRow> {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "RAC_AutopilotEvent"
      WHERE "workspaceId" = ${workspaceId}
        AND "meta"->>'idempotencyKey' = ${idempotencyKey}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }
}

/**
 * @deprecated Use {@link MindEventSpine} instead. Retained as a class alias so
 * existing DI tokens (`@Inject(BrainEventSpineService)`, providers, and
 * `instanceof` checks) continue to resolve during the ADR-0013 alias window.
 */
export { MindEventSpine as BrainEventSpineService };
