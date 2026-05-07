import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CommercialEventPayload } from './brain-event-taxonomy';

const IDEMPOTENCY_WINDOW_MS = 5000;

type AutopilotEventIdRow = { id: string } | null;

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  if (value === null) {
    return 'null';
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
  if (typeof value === 'undefined') {
    return 'undefined';
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'symbol') {
    return value.description ?? 'symbol';
  }
  if (typeof value === 'function') {
    return value.name || 'function';
  }
  return 'unsupported';
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
    action: string;
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
      if (event.idempotencyKey) {
        const existing = await this.checkIdempotency(event.idempotencyKey);
        if (existing) {
          return existing.id;
        }
      }

      const created = await this.prisma.autopilotEvent.create({
        data: {
          workspaceId: event.workspaceId,
          contactId: event.contactId ?? null,
          intent: this.resolveIntent(event.eventType),
          action: event.eventType,
          status: this.resolveStatus(event.eventType),
          createdAt: event.occurredAt,
          meta: {
            commercial: true,
            subject: event.subject,
            idempotencyKey: event.idempotencyKey ?? null,
            payload: toInputJsonObject(event.payload),
          },
        },
        select: { id: true },
      });

      return created.id;
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

  private resolveIntent(eventType: string): string {
    if (eventType.startsWith('sale.')) return 'sale_lifecycle';
    if (eventType.startsWith('checkout.')) return 'checkout_lifecycle';
    if (eventType.startsWith('message.')) return 'message_lifecycle';
    if (eventType.startsWith('lead.')) return 'lead_lifecycle';
    return 'commercial_lifecycle';
  }

  private resolveStatus(eventType: string): string {
    if (
      eventType.endsWith('.created') ||
      eventType.endsWith('.sent') ||
      eventType.endsWith('.completed') ||
      eventType.endsWith('.paid') ||
      eventType.endsWith('.qualified') ||
      eventType.endsWith('.converted')
    ) {
      return 'executed';
    }
    if (
      eventType.endsWith('.cancelled') ||
      eventType.endsWith('.refunded') ||
      eventType.endsWith('.abandoned')
    ) {
      return 'skipped';
    }
    return 'executed';
  }

  private async checkIdempotency(idempotencyKey: string): Promise<AutopilotEventIdRow> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "RAC_AutopilotEvent"
      WHERE "meta"->>'idempotencyKey' = ${idempotencyKey}
        AND "createdAt" > NOW() - (${IDEMPOTENCY_WINDOW_MS} * INTERVAL '1 millisecond')
      LIMIT 1
    `;
    return rows[0] ?? null;
  }
}
