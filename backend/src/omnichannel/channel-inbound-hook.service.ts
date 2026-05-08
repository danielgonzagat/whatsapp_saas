import { Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common';
import { MindEventProcessorService } from '../kloel/mind-event-processor.service';
import { MindPerceptionService } from '../kloel/mind-perception.service';
import { ensureError, type NormalizedMessage } from '../inbox/omnichannel.helpers';
import type { MindPerceptEvent } from '../kloel/mind.types';

function channelToPerceptChannel(msg: NormalizedMessage): string {
  const normalized = String(msg.channel || '')
    .trim()
    .toLowerCase();
  return normalized || 'unknown';
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
  ) {}

  async onMessageReceived(
    msg: NormalizedMessage,
    contactId?: string,
    messageId?: string,
  ): Promise<void> {
    if (!this.mindEvents) {
      return;
    }

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

    try {
      const result = await this.mindEvents.process(event);
      this.logger.log(
        `MIND inbound hook workspace=${msg.workspaceId} channel=${perceptChannel} ` +
          `predicted=${result.predicted} resolved=${result.resolved} ` +
          `surprise=${result.surpriseTotal.toFixed(3)} beliefs=${result.beliefsUpdated}`,
      );
    } catch (err: unknown) {
      const wrapped = ensureError(err);
      this.logger.error(
        `MIND inbound hook failed workspace=${msg.workspaceId} channel=${perceptChannel}: ${wrapped.message}`,
      );
    }
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

    try {
      const result = await this.mindEvents.process(event);
      this.logger.log(
        `MIND outbound hook workspace=${workspaceId} channel=${perceptChannel} ` +
          `predicted=${result.predicted} resolved=${result.resolved} ` +
          `surprise=${result.surpriseTotal.toFixed(3)} beliefs=${result.beliefsUpdated}`,
      );
    } catch (err: unknown) {
      const wrapped = ensureError(err);
      this.logger.error(
        `MIND outbound hook failed workspace=${workspaceId} channel=${perceptChannel}: ${wrapped.message}`,
      );
    }
  }
}
