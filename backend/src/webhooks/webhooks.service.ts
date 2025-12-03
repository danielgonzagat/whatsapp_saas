import {
  Injectable,
  Logger,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { flowQueue } from '../queue/queue';
import { InboxGateway } from '../inbox/inbox.gateway';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type { Redis } from 'ioredis';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private prisma: PrismaService,
    private inboxGateway: InboxGateway,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  async processWebhook(workspaceId: string, flowId: string, payload: any) {
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
      this.logger.warn(
        `No phone number found in webhook payload for flow ${flowId}`,
      );
      // We might still want to log this execution as "FAILED" or "NO_CONTACT"
      throw new BadRequestException(
        'Could not identify a phone number in the payload. Provide phone/mobile/whatsapp or nested contact details.',
      );
    }

    this.logger.log(
      `Identified user ${phone} from webhook. Dispatching flow...`,
    );

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
  async processFinanceEvent(workspaceId: string, payload: any) {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    if (!ws) {
      throw new ForbiddenException('Workspace not found');
    }
    const settings: any = ws.providerSettings || {};
    const finance = settings.finance || {};

    const status = String(payload?.status || '').toLowerCase();
    const map: Record<string, string | undefined> = {
      paid: finance.flowPaidId,
      pending: finance.flowPendingId,
      canceled: finance.flowCanceledId,
      overdue: finance.flowOverdueId,
    };
    const flowId = map[status] || finance.flowDefaultId;
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
          } as any,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to log finance event: ${(err as any)?.message}`);
    }

    return { executionId: job.id, status, flowId };
  }

  async getRecentFinanceEvents(
    workspaceId: string,
    limit = 50,
    status?: string,
  ) {
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
    return logs.map((l) => ({
      at: l.createdAt,
      flowId: l.resourceId,
      status: (l.details as any)?.status,
      phone: (l.details as any)?.phone,
      amount: (l.details as any)?.amount,
      provider: (l.details as any)?.provider,
    }));
  }

  private extractPhone(payload: any): string | null {
    // Recursive search or specific field check?
    // Let's check common flat fields first.
    const candidates = [
      payload.phone,
      payload.mobile,
      payload.whatsapp,
      payload.telephone,
      payload.celular,
      payload.contact_phone,
      // Stripe specific
      payload.data?.object?.customer_details?.phone,
      payload.data?.object?.phone,
      // Hotmart specific
      payload.buyer?.phone,
      payload.checkout_phone,
    ];

    for (const c of candidates) {
      if (c && typeof c === 'string') {
        // Clean string
        const cleaned = c.replace(/\D/g, '');
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
    const phone = input.phone?.replace(/\D/g, '') || undefined;

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
          where: { workspaceId, externalId },
          select: { id: true, conversationId: true, contactId: true, externalId: true },
          take: 20,
        });
        updatedMessages.push(...msgs);
      }
    }

    // 2) Fallback por phone (última mensagem OUTBOUND)
    if (updated === 0 && phone) {
      const where: any = {
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
        const updatedMsg = await this.prisma.message.update({
          where: { id: msg.id },
          data: { status, errorCode: input.errorCode || null },
          select: { id: true, conversationId: true, contactId: true, externalId: true },
        });
        updated = 1;
        updatedMessages.push(updatedMsg as any);
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
          } as any,
        },
      });
    }

    // 4) Notifica clientes conectados
    if (updatedMessages.length > 0) {
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
          this.logger.warn(
            `Failed to publish ws status: ${(err as any)?.message || err}`,
          );
        }
      }
    }

    return { updated };
  }
}
