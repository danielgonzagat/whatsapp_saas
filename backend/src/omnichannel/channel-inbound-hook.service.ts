import { Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common';
import { BrainEventSpineService } from '../kloel/brain-event-spine.service';
import { MindEventProcessorService } from '../kloel/mind-event-processor.service';
import { MindPerceptionService } from '../kloel/mind-perception.service';
import { ensureError, type NormalizedMessage } from '../inbox/omnichannel.helpers';
import type { MindPerceptEvent } from '../kloel/mind.types';

const MIND_HOOK_MAX_ATTEMPTS = 3;

function channelToPerceptChannel(msg: NormalizedMessage): string {
  const normalized = String(msg.channel || '')
    .trim()
    .toLowerCase();
  return normalized || 'unknown';
}

function payloadString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value.toString();
  }
  return fallback;
}

@Injectable()
export class ChannelInboundHookService {
  private readonly logger = new Logger(ChannelInboundHookService.name);

  constructor(
    @Optional()
    @Inject(forwardRef(() => MindEventProcessorService))
    private readonly mindEvents?: MindEventProcessorService,
    @Optional()
    @Inject(forwardRef(() => MindPerceptionService))
    private readonly mindPerception?: MindPerceptionService,
    @Optional()
    @Inject(forwardRef(() => BrainEventSpineService))
    private readonly eventSpine?: BrainEventSpineService,
  ) {}

  async onMessageReceived(
    msg: NormalizedMessage,
    contactId?: string,
    messageId?: string,
  ): Promise<void> {
    const perceptChannel = channelToPerceptChannel(msg);
    const subject = contactId ? `contact:${contactId}` : `message:${messageId ?? 'unknown'}`;

    const event: MindPerceptEvent = {
      kind: 'message.received',
      workspaceId: msg.workspaceId,
      subject,
      payload: {
        contentPreview: typeof msg.content === 'string' ? msg.content.slice(0, 240) : '',
        channel: perceptChannel,
        messageId: messageId ?? msg.externalId ?? null,
        messageType: 'TEXT',
      },
      occurredAt: new Date(),
    };

    await this.recordDurableMessageEvent(event, msg, contactId, perceptChannel);
    await this.processWithRetry(event, 'inbound', msg.workspaceId, perceptChannel);
  }

  async onMessageSent(
    workspaceId: string,
    contactId: string,
    channel: string,
    content: string,
    messageId?: string,
  ): Promise<void> {
    if (!this.mindEvents) {
      return;
    }

    const perceptChannel = (channel || 'unknown').trim().toLowerCase();

    const event: MindPerceptEvent = {
      kind: 'message.sent',
      workspaceId,
      subject: `contact:${contactId}`,
      payload: {
        contentPreview: content.slice(0, 240),
        channel: perceptChannel,
        messageId: messageId ?? null,
        messageType: 'TEXT',
      },
      occurredAt: new Date(),
    };

    await this.recordDurableMessageEvent(
      event,
      { workspaceId, externalId: messageId },
      contactId,
      perceptChannel,
    );
    await this.processWithRetry(event, 'outbound', workspaceId, perceptChannel);
  }

  private async processWithRetry(
    event: MindPerceptEvent,
    direction: 'inbound' | 'outbound',
    workspaceId: string,
    perceptChannel: string,
  ): Promise<void> {
    if (!this.mindEvents) {
      return;
    }

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MIND_HOOK_MAX_ATTEMPTS; attempt += 1) {
      try {
        const result = await this.mindEvents.process(event);
        this.logger.log(
          `MIND ${direction} hook workspace=${workspaceId} channel=${perceptChannel} ` +
            `attempt=${attempt} predicted=${result.predicted} resolved=${result.resolved} ` +
            `surprise=${result.surpriseTotal.toFixed(3)} beliefs=${result.beliefsUpdated}`,
        );
        return;
      } catch (err: unknown) {
        lastError = ensureError(err);
        if (attempt < MIND_HOOK_MAX_ATTEMPTS) {
          this.logger.warn(
            `MIND ${direction} hook retry workspace=${workspaceId} channel=${perceptChannel} ` +
              `attempt=${attempt} error=${lastError.message}`,
          );
          await this.retryDelay(attempt);
        }
      }
    }

    this.logger.error(
      `MIND ${direction} hook failed workspace=${workspaceId} channel=${perceptChannel}: ` +
        `${lastError?.message ?? 'unknown'}`,
    );
    throw lastError ?? new Error('MIND hook failed');
  }

  private async recordDurableMessageEvent(
    event: MindPerceptEvent,
    msg: Pick<NormalizedMessage, 'workspaceId' | 'externalId'>,
    contactId: string | undefined,
    perceptChannel: string,
  ): Promise<void> {
    if (!this.eventSpine) {
      return;
    }

    const messageId = payloadString(event.payload.messageId, msg.externalId || event.subject);
    const contentPreview = payloadString(event.payload.contentPreview);
    const messageType = payloadString(event.payload.messageType, 'TEXT');

    await this.eventSpine.recordCommercial({
      workspaceId: event.workspaceId,
      contactId,
      subject: event.subject,
      eventType: event.kind === 'message.sent' ? 'message.sent' : 'message.received',
      idempotencyKey: `${event.kind}:${event.workspaceId}:${messageId}`,
      occurredAt: event.occurredAt,
      payload: {
        contentPreview,
        direction: event.kind === 'message.sent' ? 'OUTBOUND' : 'INBOUND',
        messageId,
        messageType,
        channel: perceptChannel,
      },
    });
  }

  private retryDelay(attempt: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, attempt * 100));
  }
}
