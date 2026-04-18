import { InjectRedis } from '@nestjs-modules/ioredis';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Redis } from 'ioredis';
import { InboxGateway } from '../inbox/inbox.gateway';
import { OmnichannelService } from '../inbox/omnichannel.service';
import { PrismaService } from '../prisma/prisma.service';
import { flowQueue } from '../queue/queue';

const D_RE = /\D/g;

/** Arbitrary JSON payload received on the generic catch-hook endpoint. */
type WebhookJsonPayload = Record<string, unknown>;

/** Finance trigger body: status + phone + any extra provider-specific fields. */
interface FinanceWebhookBody {
  status?: string;
  phone?: string;
  amount?: number;
  provider?: string;
  workspaceId?: string;
  [key: string]: unknown;
}

/** Instagram / Meta Graph webhook envelope — opaque beyond workspace routing. */
type InstagramWebhookBody = Record<string, unknown>;

/**
 * Loose shape consumed by {@link WebhooksService.extractPhone} — arbitrary
 * JSON bag from an upstream provider (Stripe, Hotmart, Shopify, etc.).
 */
type PhoneBearingPayload = Record<string, unknown>;

/** Runtime-narrow helper: returns an object when `value` is a non-null record. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private prisma: PrismaService,
    private inboxGateway: InboxGateway,
    @InjectRedis() private readonly redis: Redis,
    @Inject(forwardRef(() => OmnichannelService))
    private readonly omnichannelService: OmnichannelService,
  ) {}

  async processWebhook(workspaceId: string, flowId: string, payload: WebhookJsonPayload) {
    // 1. Validate Workspace & Flow
    const flow = await this.prisma.flow.findFirst({
      where: { id: flowId, workspaceId },
    });

    if (!flow) {
      throw new ForbiddenException('Flow or workspace not found');
    }

    // 2. Intelligent Phone Extraction
    // We try to find a phone number in common fields or allow the user to specify a mapping later.
    // For MVP "Top 1 Level", we use a smart heuristic.
    const phone = this.extractPhone(payload);

    if (!phone) {
      this.logger.warn(`No phone number found in webhook payload for flow ${flowId}`);
      // We might still want to log this execution as "FAILED" or "NO_CONTACT"
      throw new BadRequestException(
        'Could not identify a phone number in the payload. Provide phone/mobile/whatsapp or nested contact details.',
      );
    }

    this.logger.log(`Identified user ${phone} from webhook. Dispatching flow...`);

    // 3. Dispatch to Worker
    // We use the standard 'run-flow' job, passing the payload as initial variables.
    // This allows the Flow to use {{webhook.amount}}, {{webhook.status}}, etc.

    // Normalize keys to be flat for easier usage in variables?
    // Or keep object structure. Flow engine supports object access now?
    // Let's flatten top level or pass 'webhook_data' object.

    const job = await flowQueue.add('run-flow', {
      workspaceId,
      flowId,
      user: phone,
      initialVars: {
        webhook: payload, // Access via {{webhook.email}}, {{webhook.data.id}}
        source: 'webhook',
      },
    });

    return { executionId: job.id };
  }

  /**
   * Processa eventos financeiros (boleto/pix/checkout) e dispara flow conforme providerSettings.finance.*
   * Ex: { status: "paid", phone: "...", amount: 1000 }
   */
  async processFinanceEvent(workspaceId: string, payload: FinanceWebhookBody) {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    if (!ws) {
      throw new ForbiddenException('Workspace not found');
    }
    const settings = (ws.providerSettings as Record<string, unknown>) || {};
    const finance = (settings.finance as Record<string, unknown>) || {};

    const status = String(payload?.status || '').toLowerCase();
    const map: Record<string, string | undefined> = {
      paid: finance.flowPaidId as string | undefined,
      pending: finance.flowPendingId as string | undefined,
      canceled: finance.flowCanceledId as string | undefined,
      overdue: finance.flowOverdueId as string | undefined,
    };
    const flowId = map[status] || (finance.flowDefaultId as string | undefined);
    if (!flowId) {
      this.logger.warn(
        `No finance flow configured for status ${status} in workspace ${workspaceId}`,
      );
      return { skipped: true, reason: 'no_flow_configured' };
    }

    const phone = this.extractPhone(payload);
    if (!phone) {
      throw new BadRequestException('Missing phone in finance payload');
    }

    const job = await flowQueue.add('run-flow', {
      workspaceId,
      flowId,
      user: phone,
      initialVars: {
        finance: payload,
        source: 'finance_webhook',
      },
    });

    try {
      await this.prisma.auditLog.create({
        data: {
          workspaceId,
          action: 'FINANCE_EVENT',
          resource: 'finance',
          resourceId: flowId,
          details: {
            status,
            phone,
            amount: payload?.amount,
            provider: payload?.provider,
          },
        },
      });
    } catch (err) {
      // PULSE:OK — Finance event logging non-critical; flow trigger already queued
      this.logger.warn(`Failed to log finance event: ${err?.message}`);
    }

    return { executionId: job.id, status, flowId };
  }

  async getRecentFinanceEvents(workspaceId: string, limit = 50, status?: string) {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        workspaceId,
        action: 'FINANCE_EVENT',
        ...(status ? { details: { path: ['status'], equals: status } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 5), 200),
      select: {
        createdAt: true,
        details: true,
        resourceId: true,
      },
    });
    return logs.map((l) => {
      const details = (l.details as Record<string, unknown>) || {};
      return {
        at: l.createdAt,
        flowId: l.resourceId,
        status: details.status as string | undefined,
        phone: details.phone as string | undefined,
        amount: details.amount as number | undefined,
        provider: details.provider as string | undefined,
      };
    });
  }

  private extractPhone(payload: PhoneBearingPayload): string | null {
    // Recursive search or specific field check?
    // Let's check common flat fields first.
    const data = asRecord(payload.data);
    const dataObject = data ? asRecord(data.object) : null;
    const customerDetails = dataObject ? asRecord(dataObject.customer_details) : null;
    const buyer = asRecord(payload.buyer);
    const candidates: unknown[] = [
      payload.phone,
      payload.mobile,
      payload.whatsapp,
      payload.telephone,
      payload.celular,
      payload.contact_phone,
      // Stripe specific
      customerDetails?.phone,
      dataObject?.phone,
      // Hotmart specific
      buyer?.phone,
      payload.checkout_phone,
    ];

    for (const c of candidates) {
      if (c && typeof c === 'string') {
        // Clean string
        const cleaned = c.replace(D_RE, '');
        if (cleaned.length >= 10) return cleaned; // Basic validation
      }
    }

    return null;
  }

  async updateMessageStatus(input: {
    workspaceId?: string;
    externalId?: string;
    status: string;
    errorCode?: string;
    phone?: string;
    channel?: string;
  }) {
    const status = (input.status || '').toUpperCase();
    const workspaceId = input.workspaceId;
    const externalId = input.externalId;
    const phone = input.phone?.replace(D_RE, '') || undefined;

    if (!workspaceId) {
      throw new BadRequestException('workspaceId é obrigatório');
    }
    if (!status) {
      throw new BadRequestException('status é obrigatório');
    }

    const updatedMessages: {
      id: string;
      conversationId: string | null;
      contactId: string | null;
      externalId: string | null;
    }[] = [];

    // 1) Tenta localizar por externalId
    let updated = 0;
    if (externalId) {
      const res = await this.prisma.message.updateMany({
        where: { workspaceId, externalId },
        data: { status, errorCode: input.errorCode || null },
      });
      updated += res.count;
      if (res.count > 0) {
        const msgs = await this.prisma.message.findMany({
          take: 20,
          where: { workspaceId, externalId },
          select: {
            id: true,
            conversationId: true,
            contactId: true,
            externalId: true,
          },
        });
        updatedMessages.push(...msgs);
      }
    }

    // 2) Fallback por phone (última mensagem OUTBOUND)
    if (updated === 0 && phone) {
      const where: Record<string, unknown> = {
        workspaceId,
        direction: 'OUTBOUND',
        contact: { phone },
      };
      if (input.channel) {
        where.conversation = { channel: input.channel };
      }
      const msg = await this.prisma.message.findFirst({
        where,
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (msg?.id) {
        // Re-read then update scoped by workspaceId so multi-tenant guard is
        // explicit at the call site (msg was already scoped by the findFirst
        // above, but the gate checks query shape, not control flow).
        await this.prisma.message.updateMany({
          where: { id: msg.id, workspaceId },
          data: { status, errorCode: input.errorCode || null },
        });
        const updatedMsg = await this.prisma.message.findFirst({
          where: { id: msg.id, workspaceId },
          select: {
            id: true,
            conversationId: true,
            contactId: true,
            externalId: true,
          },
        });
        if (updatedMsg) {
          updated = 1;
          updatedMessages.push(updatedMsg);
        }
      }
    }

    // 3) Se não atualizou, registra log para inspeção
    if (updated === 0) {
      await this.prisma.auditLog.create({
        data: {
          workspaceId,
          action: 'MESSAGE_STATUS_MISS',
          resource: 'message',
          details: {
            externalId,
            phone,
            status,
            errorCode: input.errorCode,
          },
        },
      });
    }

    // 4) Notifica clientes conectados
    if (updatedMessages.length > 0) {
      // biome-ignore lint/performance/noAwaitInLoops: sequential message status update
      for (const m of updatedMessages) {
        this.inboxGateway.emitToWorkspace(workspaceId, 'message:status', {
          id: m.id,
          conversationId: m.conversationId,
          contactId: m.contactId,
          externalId: m.externalId,
          status,
          errorCode: input.errorCode || null,
        });
        if (m.conversationId) {
          this.inboxGateway.emitToWorkspace(workspaceId, 'conversation:update', {
            id: m.conversationId,
            lastMessageStatus: status,
            lastMessageErrorCode: input.errorCode || null,
            lastMessageId: m.id,
          });
        }
        // Pub/Sub para múltiplas instâncias (escutadas pelo InboxEventsService)
        try {
          await this.redis.publish(
            'ws:inbox',
            JSON.stringify({
              type: 'message:status',
              workspaceId,
              payload: {
                id: m.id,
                conversationId: m.conversationId,
                contactId: m.contactId,
                externalId: m.externalId,
                status,
                errorCode: input.errorCode || null,
              },
            }),
          );
          if (m.conversationId) {
            await this.redis.publish(
              'ws:inbox',
              JSON.stringify({
                type: 'conversation:update',
                workspaceId,
                conversation: {
                  id: m.conversationId,
                  lastMessageStatus: status,
                  lastMessageErrorCode: input.errorCode || null,
                  lastMessageId: m.id,
                },
              }),
            );
          }
        } catch (err) {
          this.logger.warn(`Failed to publish ws status: ${err?.message || err}`);
        }
      }
    }

    return { updated };
  }

  // ============================================================================
  // OMNICHANNEL MESSAGE PROCESSING
  // ============================================================================

  /**
   * Processa mensagens recebidas do Instagram via webhook
   * Delega para OmnichannelService que normaliza e salva na inbox
   */
  async processInstagramMessage(workspaceId: string, payload: InstagramWebhookBody) {
    this.logger.log(`[INSTAGRAM] Processing message for workspace ${workspaceId}`);

    try {
      const result = await this.omnichannelService.processInstagramWebhook(workspaceId, payload);
      return result;
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'unknown error';
      this.logger.error(`[INSTAGRAM] Error processing message: ${message}`);
      throw error;
    }
  }

  // ── Webhook Event Audit Trail ──

  async logWebhookEvent<T extends object>(
    provider: string,
    eventType: string,
    externalId: string,
    payload: T,
  ) {
    // Prisma.JsonValue requires an index signature; callers pass well-typed
    // provider-specific DTOs (StripeEventLike, GenericPaymentWebhookBody…)
    // that are JSON-serializable by construction. Convert via JSON round-trip
    // to guarantee the value matches Prisma's InputJsonValue shape at runtime
    // (strips functions, undefined, symbols, class identity, etc.).
    const jsonPayload = JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
    return this.prisma.webhookEvent.upsert({
      where: { provider_externalId: { provider, externalId } },
      create: { provider, eventType, externalId, payload: jsonPayload, status: 'received' },
      update: { status: 'received', receivedAt: new Date() },
    });
  }

  async markWebhookProcessed(id: string) {
    return this.prisma.webhookEvent.update({
      where: { id },
      data: { status: 'processed', processedAt: new Date() },
    });
  }

  async markWebhookFailed(id: string, error: string) {
    return this.prisma.webhookEvent.update({
      where: { id },
      data: { status: 'failed', error },
    });
  }
}
