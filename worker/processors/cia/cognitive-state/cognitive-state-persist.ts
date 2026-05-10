import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { CustomerCognitiveState } from './cognitive-state-types';
import { clamp } from './cognitive-state-types';
import { buildStateKey } from './cognitive-state-load';
import { toPrismaJsonValue } from '../../../utils/prisma-json.util';

interface PersistCognitiveStateInput {
  workspaceId: string;
  conversationId?: string | null;
  contactId?: string | null;
  phone?: string | null;
  contactName?: string | null;
  state: CustomerCognitiveState;
  source?: string;
}

function normalizeStateForPersist(input: PersistCognitiveStateInput): CustomerCognitiveState {
  return {
    ...input.state,
    conversationId: input.conversationId || input.state.conversationId || null,
    contactId: input.contactId || input.state.contactId || null,
    phone: input.phone || input.state.phone || null,
    contactName: input.contactName || input.state.contactName || null,
    updatedAt: new Date().toISOString(),
  } satisfies CustomerCognitiveState;
}

function buildPersistMetadata(normalizedState: CustomerCognitiveState, source: string) {
  return {
    source,
    contactId: normalizedState.contactId || null,
    conversationId: normalizedState.conversationId || null,
    phone: normalizedState.phone || null,
    nextBestAction: normalizedState.nextBestAction,
    intent: normalizedState.intent,
    stage: normalizedState.stage,
  };
}

async function fetchPreviousMemory(prisma: PrismaClient, workspaceId: string, key: string) {
  if (!prisma?.kloelMemory?.findUnique) {
    return null;
  }
  return prisma.kloelMemory
    .findUnique({ where: { workspaceId_key: { workspaceId, key } } })
    .catch(() => null /* not found */);
}

async function upsertCognitiveMemory(
  prisma: PrismaClient,
  args: {
    workspaceId: string;
    key: string;
    normalizedState: CustomerCognitiveState;
    source: string;
  },
) {
  const metadata = buildPersistMetadata(args.normalizedState, args.source);
  const stateValue = toPrismaJsonValue(args.normalizedState);
  await prisma.kloelMemory.upsert({
    where: { workspaceId_key: { workspaceId: args.workspaceId, key: args.key } },
    update: {
      value: stateValue,
      metadata,
      content: args.normalizedState.summary,
    },
    create: {
      workspaceId: args.workspaceId,
      key: args.key,
      category: 'cognitive_state',
      type: args.normalizedState.intent,
      content: args.normalizedState.summary,
      value: stateValue,
      metadata,
    },
  });
}

async function writeCognitiveDelta(
  prisma: PrismaClient,
  args: {
    workspaceId: string;
    previousValue: unknown;
    normalizedState: CustomerCognitiveState;
    source: string;
  },
) {
  if (!prisma?.kloelMemory?.create) {
    return;
  }
  if (JSON.stringify(args.previousValue || null) === JSON.stringify(args.normalizedState)) {
    return;
  }

  const { normalizedState } = args;
  const deltaKey = `cognitive_delta:${normalizedState.contactId || normalizedState.phone || 'workspace'}:${Date.now()}:${randomUUID()}`;

  const deltaValue = toPrismaJsonValue({
    previous: args.previousValue === undefined ? null : toPrismaJsonValue(args.previousValue),
    current: toPrismaJsonValue(normalizedState),
    source: args.source,
  });

  await prisma.kloelMemory
    .create({
      data: {
        workspaceId: args.workspaceId,
        key: deltaKey,
        category: 'cognitive_delta',
        type: normalizedState.nextBestAction,
        content: normalizedState.summary,
        value: deltaValue,
        metadata: {
          contactId: normalizedState.contactId || null,
          conversationId: normalizedState.conversationId || null,
          phone: normalizedState.phone || null,
        },
      },
    })
    .catch(() => null /* non-critical: best-effort cognitive delta persistence */);
}

function computePurchaseProbability(stage: CustomerCognitiveState['stage']): string {
  const raw = stage === 'CHECKOUT' ? 0.86 : stage === 'HOT' ? 0.7 : stage === 'WARM' ? 0.42 : 0.18;
  return clamp(raw, 0, 1).toFixed(3);
}

async function projectStateToContact(
  prisma: PrismaClient,
  normalizedState: CustomerCognitiveState,
) {
  if (!normalizedState.contactId || !prisma?.contact?.update) {
    return;
  }
  const leadScore = Math.max(
    0,
    Math.min(100, Math.round(normalizedState.trustScore * 55 + normalizedState.urgencyScore * 45)),
  );
  await prisma.contact
    .update({
      where: { id: normalizedState.contactId },
      data: {
        leadScore,
        purchaseProbability: computePurchaseProbability(normalizedState.stage),
        nextBestAction: normalizedState.nextBestAction,
        aiSummary: normalizedState.summary,
      },
    })
    .catch(() => null /* non-critical: best-effort contact score update */);
}

export async function persistCustomerCognitiveState(
  prisma: PrismaClient,
  input: PersistCognitiveStateInput,
) {
  if (!prisma?.kloelMemory?.upsert) {
    return input.state;
  }

  const key = buildStateKey(input);
  const source = input.source || 'autonomy';
  const previous = await fetchPreviousMemory(prisma, input.workspaceId, key);
  const normalizedState = normalizeStateForPersist(input);

  await upsertCognitiveMemory(prisma, {
    workspaceId: input.workspaceId,
    key,
    normalizedState,
    source,
  });
  await writeCognitiveDelta(prisma, {
    workspaceId: input.workspaceId,
    previousValue: previous?.value,
    normalizedState,
    source,
  });
  await projectStateToContact(prisma, normalizedState);

  return normalizedState;
}
