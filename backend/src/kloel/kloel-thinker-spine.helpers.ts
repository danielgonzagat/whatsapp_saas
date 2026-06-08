import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { emitCognitionAlias } from './event-taxonomy.canonical-aliases';

/** Minimal logger surface used by spine persistence (avoids a hard dep on Nest). */
interface SpineWarnLogger {
  warn(message: string): void;
}

/**
 * Persists a conversational chat turn to the cognitive spine (autopilotEvent)
 * so cross-session memory is fed. Fire-and-forget — never blocks the reply.
 * Extracted from KloelThinkerService.think.
 */
export function persistChatTurnToSpine(
  prisma: PrismaService,
  logger: SpineWarnLogger,
  params: {
    workspaceId: string;
    message: string;
    fullResponse: string;
    mode: string;
    conversationId: string | undefined;
  },
): void {
  const { workspaceId, message, fullResponse, mode, conversationId } = params;
  // Dual-emit: legacy `kloel.chat.turn` + canonical `cognition.chat.turn`
  // per docs/architecture/EVENT_TAXONOMY_MIGRATION.md. Both rows are
  // persisted so cognitive readers can be migrated independently.
  const chatTurnMeta: Prisma.InputJsonValue = {
    userPreview: message.slice(0, 280),
    replyPreview: fullResponse.slice(0, 280),
    mode,
    conversationId: conversationId ?? null,
  };
  emitCognitionAlias(
    (eventName) => {
      void prisma.autopilotEvent
        .create({
          data: {
            workspaceId,
            intent: 'kloel_chat_turn',
            action: eventName,
            status: 'executed',
            meta: chatTurnMeta,
          },
        })
        .catch((e: unknown) => {
          logger.warn(
            `chat-turn spine persist failed (${eventName}): ${e instanceof Error ? e.message : 'unknown'}`,
          );
        });
    },
    'kloel.chat.turn',
    { workspaceId },
  );
}
