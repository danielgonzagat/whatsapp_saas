import { StructuredLogger } from '../logging/structured-logger';
import { OpsAlertService } from '../observability/ops-alert.service';
import { DecisionOutcomeService } from './decision-outcome.service';
import { MindBeliefService } from './mind/inference/mind-belief.service';
import { MindSurpriseService } from './mind/inference/mind-surprise.service';
import { MindObservabilityService } from './mind/observability/mind-observability.service';
import {
  GuestConversation,
  persistConversation,
  persistConversationMessage,
} from './guest-chat.conversation.helpers';
import type { GuestChatTerminalDeps } from './guest-chat.terminal-hooks.helper';
import type Redis from 'ioredis';

export function buildTerminalDeps(
  decisionOutcomeService: DecisionOutcomeService | undefined,
  mindBeliefService: MindBeliefService | undefined,
  mindSurpriseService: MindSurpriseService | undefined,
  mindObservability: MindObservabilityService | undefined,
  logger: StructuredLogger,
  opsAlert: OpsAlertService | undefined,
  _lastCognitiveState: Record<string, unknown> | undefined,
): GuestChatTerminalDeps {
  return {
    decisionOutcomeService,
    mindBeliefService,
    mindSurpriseService,
    mindObservability,
    logger,
    opsAlert,
    _lastCognitiveState,
  };
}
/** Persist a full guest conversation. */
export async function persistGuestConversation(
  sessionId: string,
  conversation: GuestConversation,
  redis: Redis | undefined,
  conversations: Map<string, GuestConversation>,
  logger: StructuredLogger,
): Promise<void> {
  return persistConversation(sessionId, conversation, redis, conversations, logger);
}

/** Persist a single message into a guest conversation. */
export async function persistGuestConversationMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  redis: Redis | undefined,
  conversations: Map<string, GuestConversation>,
  logger: StructuredLogger,
): Promise<void> {
  return persistConversationMessage(sessionId, role, content, redis, conversations, logger);
}
