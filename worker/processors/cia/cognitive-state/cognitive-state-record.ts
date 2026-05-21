import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { RecordDecisionOutcomeInput } from './cognitive-state-types';

const resolveDecisionOwner = (input: RecordDecisionOutcomeInput): string =>
  input.contactId || input.phone || input.conversationId || 'workspace';

const buildDecisionKey = (input: RecordDecisionOutcomeInput): string =>
  `decision_outcome:${resolveDecisionOwner(input)}:${Date.now()}:${randomUUID()}`;

const buildDecisionValue = (input: RecordDecisionOutcomeInput) => ({
  action: input.action,
  outcome: input.outcome,
  reward: input.reward || 0,
  message: input.message || null,
  conversationId: input.conversationId || null,
  metadata: input.metadata || {},
});

const buildDecisionMetadata = (input: RecordDecisionOutcomeInput) => ({
  contactId: input.contactId || null,
  conversationId: input.conversationId || null,
  phone: input.phone || null,
  outcome: input.outcome,
});

export async function recordDecisionOutcome(
  prisma: PrismaClient,
  input: RecordDecisionOutcomeInput,
) {
  if (!prisma?.kloelMemory?.create) {
    return null;
  }
  const action = String(input.action || 'UNKNOWN');
  return prisma.kloelMemory.create({
    data: {
      workspaceId: input.workspaceId,
      key: buildDecisionKey(input),
      category: 'decision_outcome',
      type: action,
      content: input.message || action,
      value: buildDecisionValue(input),
      metadata: buildDecisionMetadata(input),
    },
  });
}
