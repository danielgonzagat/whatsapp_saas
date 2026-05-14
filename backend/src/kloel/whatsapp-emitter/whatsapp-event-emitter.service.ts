import { Injectable, Logger } from '@nestjs/common';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import type { AbiTruthMode } from '../abi/abi-schema';

export interface WhatsAppEmitInput {
  readonly workspaceId: string;
  readonly entityRef?: { readonly entityType: string; readonly entityId: string };
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly causedBy?: readonly string[];
  readonly correlationId?: string;
  readonly occurredAt?: string;
}

export interface MessageReceivedInput extends WhatsAppEmitInput {
  readonly contactId: string;
  readonly messageId: string;
  readonly phone: string;
  readonly provider: string;
}

export interface MessageReadInput extends WhatsAppEmitInput {
  readonly chatId: string;
  readonly contactId?: string;
}

export interface MessageRepliedInput extends WhatsAppEmitInput {
  readonly to: string;
  readonly contactId?: string;
  readonly messageId?: string;
  readonly author: 'autopilot' | 'human' | 'lead';
  readonly content?: string;
}

export interface HandoffToHumanInput extends WhatsAppEmitInput {
  readonly contactId: string;
  readonly reason: string;
}

export interface ConversationResumedInput extends WhatsAppEmitInput {
  readonly contactId: string;
  readonly resumeTrigger: string;
}

export interface LeadWentSilentInput extends WhatsAppEmitInput {
  readonly contactId: string;
  readonly lastMessageAt: string;
  readonly silenceHours: number;
  readonly reason: string;
}

export interface SessionLifecycleInput extends WhatsAppEmitInput {
  readonly event: 'qr' | 'connected' | 'disconnected' | 'banned';
  readonly phoneNumber?: string;
  readonly reason?: string;
}

const PROCESSOR = 'whatsapp-event-emitter';
const PROCESSOR_VERSION = '0.1.0';
const SCHEMA_VERSION = '1.0.0';
const SOURCE_PRODUCTION: 'production' = 'production';

@Injectable()
export class WhatsAppEventEmitterService {
  private readonly logger = new Logger(WhatsAppEventEmitterService.name);

  constructor(private readonly spine: SpineEmitterService) {}

  emitMessageReceived(input: MessageReceivedInput): void {
    void this.safeEmit(
      'commerce.whatsapp.message_received',
      'observed',
      input.workspaceId,
      {
        entityType: 'contact',
        entityId: input.contactId,
      },
      {
        messageId: input.messageId,
        phone: input.phone,
        channel: 'whatsapp',
        provider: input.provider,
        ...(input.payload ?? {}),
      },
      input.causedBy,
      input.correlationId,
      input.occurredAt,
    );
  }

  emitMessageRead(input: MessageReadInput): void {
    void this.safeEmit(
      'commerce.whatsapp.message_read',
      'observed',
      input.workspaceId,
      {
        entityType: 'chat',
        entityId: input.chatId,
      },
      {
        chatId: input.chatId,
        ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
        ...(input.payload ?? {}),
      },
      input.causedBy,
      input.correlationId,
      input.occurredAt,
    );
  }

  emitMessageReplied(input: MessageRepliedInput): void {
    void this.safeEmit(
      'commerce.whatsapp.message_replied',
      'observed',
      input.workspaceId,
      {
        entityType: 'contact',
        entityId: input.contactId ?? input.to,
      },
      {
        to: input.to,
        author: input.author,
        ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
        ...(input.messageId !== undefined ? { messageId: input.messageId } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.payload ?? {}),
      },
      input.causedBy,
      input.correlationId,
      input.occurredAt,
    );
  }

  emitHandoffToHuman(input: HandoffToHumanInput): void {
    void this.safeEmit(
      'commerce.whatsapp.handoff_to_human',
      'observed',
      input.workspaceId,
      {
        entityType: 'contact',
        entityId: input.contactId,
      },
      {
        reason: input.reason,
        ...(input.payload ?? {}),
      },
      input.causedBy,
      input.correlationId,
      input.occurredAt,
    );
  }

  emitLeadWentSilent(input: LeadWentSilentInput): void {
    void this.safeEmit(
      'commerce.lead.went_silent',
      'inferred',
      input.workspaceId,
      {
        entityType: 'contact',
        entityId: input.contactId,
      },
      {
        lastMessageAt: input.lastMessageAt,
        silenceHours: input.silenceHours,
        reason: input.reason,
        ...(input.payload ?? {}),
      },
      input.causedBy,
      input.correlationId,
      input.occurredAt,
    );
  }

  emitConversationResumed(input: ConversationResumedInput): void {
    void this.safeEmit(
      'commerce.whatsapp.conversation_resumed',
      'observed',
      input.workspaceId,
      {
        entityType: 'contact',
        entityId: input.contactId,
      },
      {
        resumeTrigger: input.resumeTrigger,
        ...(input.payload ?? {}),
      },
      input.causedBy,
      input.correlationId,
      input.occurredAt,
    );
  }

  emitSessionLifecycle(input: SessionLifecycleInput): void {
    void this.safeEmit(
      'commerce.whatsapp.session_lifecycle',
      'observed',
      input.workspaceId,
      {
        entityType: 'workspace',
        entityId: input.workspaceId,
      },
      {
        event: input.event,
        ...(input.phoneNumber !== undefined ? { phoneNumber: input.phoneNumber } : {}),
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
        ...(input.payload ?? {}),
      },
      input.causedBy,
      input.correlationId,
      input.occurredAt,
    );
  }

  private safeEmit(
    eventName: string,
    truthMode: AbiTruthMode,
    workspaceId: string,
    entityRef: { entityType: string; entityId: string },
    payload: Readonly<Record<string, unknown>>,
    causedBy?: readonly string[],
    correlationId?: string,
    occurredAt?: string,
  ): void {
    try {
      this.spine.emit({
        eventName,
        workspaceId,
        entityRef,
        truthMode,
        provenance: {
          source: SOURCE_PRODUCTION,
          processor: PROCESSOR,
          processorVersion: PROCESSOR_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
        payload,
        ...(causedBy !== undefined && causedBy.length > 0 ? { causedBy } : {}),
        ...(correlationId !== undefined ? { correlationId } : {}),
        ...(occurredAt !== undefined ? { occurredAt } : {}),
      });
    } catch (err: unknown) {
      this.logger.warn(
        `Failed to emit ${eventName} for ws=${workspaceId}: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }
}
