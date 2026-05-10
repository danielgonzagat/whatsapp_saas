import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import type { BrainEventName, CommercialEventPayload } from './brain-event-taxonomy';

type AutopilotEventIdRow = { id: string } | null;
type UnsupportedJsonType = 'bigint' | 'function' | 'symbol' | 'undefined';

const UNSUPPORTED_JSON_VALUE_READERS: Record<UnsupportedJsonType, (value: unknown) => string> = {
  bigint: (value) => String(value),
  function: (value) => (value as { name?: string }).name || 'function',
  symbol: (value) => (value as symbol).description ?? 'symbol',
  undefined: () => 'undefined',
};

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toUnsupportedJsonValue(value: unknown): string {
  const reader = UNSUPPORTED_JSON_VALUE_READERS[typeof value as UnsupportedJsonType];
  return reader ? reader(value) : 'unsupported';
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === null) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => toInputJsonValue(item));
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (isJsonRecord(value)) {
    return toInputJsonObject(value);
  }
  return toUnsupportedJsonValue(value);
}

function toInputJsonObject(payload: Record<string, unknown>): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, toInputJsonValue(value)]),
  );
}

@Injectable()
export class BrainEventSpineService {
  private readonly logger = new Logger(BrainEventSpineService.name);

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
          contactId: params.contactId,
          intent: params.intent,
          action: params.action,
          status: params.status,
          reason: params.reason,
          responseText: params.responseText,
          meta: params.meta,
        },
      });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'BrainEventSpineService.record');
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
            intent: this.resolveIntent(event.eventType),
            action: event.eventType,
            status: this.resolveStatus(event.eventType),
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
      void this.opsAlert?.alertOnCriticalError(error, 'BrainEventSpineService.recordCommercial');
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`Failed to record commercial event ${event.eventType}: ${message}`);
      return null;
    }
  }

  async recordMany(events: CommercialEventPayload[]): Promise<number> {
    let recorded = 0;
    for (const event of events) {
      const id = await this.recordCommercial(event);
      if (id) recorded += 1;
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
    const rows = await this.prisma.mindOutboxEvent.findMany({
      where: {
        workspaceId: params.workspaceId,
        ...(params.eventTypes?.length ? { eventType: { in: params.eventTypes } } : {}),
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

  private resolveIntent(eventType: BrainEventName): string {
    if (eventType.startsWith('sale.')) return 'sale_lifecycle';
    if (eventType.startsWith('checkout.')) return 'checkout_lifecycle';
    if (eventType.startsWith('message.')) return 'message_lifecycle';
    if (eventType.startsWith('lead.')) return 'lead_lifecycle';
    if (eventType.startsWith('campaign.')) return 'campaign_lifecycle';
    if (eventType.startsWith('product.')) return 'product_lifecycle';
    if (eventType.startsWith('brain.')) return 'brain_lifecycle';
    if (eventType.startsWith('mind.')) return 'mind_lifecycle';
    if (eventType.startsWith('capability.')) return 'capability_lifecycle';
    if (eventType.startsWith('contact.')) return 'contact_lifecycle';
    if (eventType.startsWith('channel.')) return 'channel_lifecycle';
    if (eventType.startsWith('identity.')) return 'identity_lifecycle';
    if (eventType.startsWith('concept.')) return 'concept_lifecycle';
    return 'commercial_lifecycle';
  }

  private resolveStatus(eventType: BrainEventName): string {
    if (
      eventType.endsWith('.cancelled') ||
      eventType.endsWith('.refunded') ||
      eventType.endsWith('.abandoned') ||
      eventType.endsWith('.disconnected')
    ) {
      return 'skipped';
    }
    if (eventType.endsWith('.failed') || eventType.endsWith('.externally_blocked')) {
      return 'error';
    }
    return 'executed';
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
