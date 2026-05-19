import type { PrismaClient, Prisma } from '@prisma/client';
import { forEachSequential } from '../utils/async-sequence';
import type {
  BusinessStateSnapshot,
  DemandState,
  HumanTaskPayload,
  MarketSignal,
} from './commercial-intelligence.types';

type PrismaLike = Pick<PrismaClient, 'kloelMemory' | 'systemInsight'>;

/** Coerce a domain object into a Prisma-compatible JSON input value. */
function toJsonValue<T>(obj: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(obj)) as Prisma.InputJsonValue;
}

async function upsertMemory(
  prisma: Partial<PrismaLike>,
  input: {
    workspaceId: string;
    key: string;
    value: DemandState | MarketSignal | BusinessStateSnapshot | HumanTaskPayload;
    category: string;
    type: string;
    content?: string;
    metadata?: Record<string, unknown>;
  },
) {
  if (!prisma?.kloelMemory?.upsert) {
    return null;
  }

  const jsonValue = toJsonValue(input.value);
  const jsonMetadata = input.metadata ? toJsonValue(input.metadata) : null;

  return prisma.kloelMemory.upsert({
    where: {
      workspaceId_key: {
        workspaceId: input.workspaceId,
        key: input.key,
      },
    },
    update: {
      value: jsonValue,
      category: input.category,
      type: input.type,
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(jsonMetadata !== null ? { metadata: jsonMetadata } : {}),
    },
    create: {
      workspaceId: input.workspaceId,
      key: input.key,
      value: jsonValue,
      category: input.category,
      type: input.type,
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(jsonMetadata !== null ? { metadata: jsonMetadata } : {}),
    },
  });
}

/** Persist demand state. */
export async function persistDemandState(
  prisma: Partial<PrismaLike>,
  input: {
    workspaceId: string;
    contactId: string;
    state: DemandState;
    contactName?: string | null;
  },
) {
  return upsertMemory(prisma, {
    workspaceId: input.workspaceId,
    key: `demand_state:${input.contactId}`,
    value: input.state,
    category: 'demand_control',
    type: 'demand_state',
    content: input.state.strategy,
    metadata: {
      contactId: input.contactId,
      contactName: input.contactName || null,
    },
  });
}

/** Persist market signals. */
export async function persistMarketSignals(
  prisma: Partial<PrismaLike>,
  input: {
    workspaceId: string;
    signals: MarketSignal[];
  },
) {
  await forEachSequential(input.signals.slice(0, 10), async (signal) => {
    await upsertMemory(prisma, {
      workspaceId: input.workspaceId,
      key: `market_signal:${signal.normalizedKey}`,
      value: signal,
      category: 'market_signal',
      type: signal.signalType,
      content: signal.normalizedKey,
      metadata: {
        frequency: signal.frequency,
        examples: signal.examples,
      },
    });
  });
}

/** Persist business snapshot. */
export async function persistBusinessSnapshot(
  prisma: Partial<PrismaLike>,
  input: {
    workspaceId: string;
    snapshot: BusinessStateSnapshot;
  },
) {
  await upsertMemory(prisma, {
    workspaceId: input.workspaceId,
    key: 'business_state:current',
    value: input.snapshot,
    category: 'business_state',
    type: 'snapshot',
    content: input.snapshot.growthRiskLevel,
    metadata: {
      dominantObjection: input.snapshot.dominantObjection,
      topProductKey: input.snapshot.topProductKey,
    },
  });
}

/** Persist human task. */
export async function persistHumanTask(
  prisma: Partial<PrismaLike>,
  input: {
    workspaceId: string;
    task: HumanTaskPayload;
  },
) {
  if (!prisma?.kloelMemory?.create) {
    return null;
  }

  return prisma.kloelMemory.create({
    data: {
      workspaceId: input.workspaceId,
      key: `human_task:${input.task.contactId || input.task.phone || input.task.id}:${input.task.id}`,
      value: toJsonValue(input.task),
      category: 'human_task',
      type: input.task.taskType,
      content: input.task.reason,
      metadata: toJsonValue({
        urgency: input.task.urgency,
        businessImpact: input.task.businessImpact,
        contactId: input.task.contactId,
        phone: input.task.phone,
      }),
    },
  });
}

/** Persist system insight. */
export async function persistSystemInsight(
  prisma: Partial<PrismaLike>,
  input: {
    workspaceId: string;
    type: string;
    title: string;
    description: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    metadata?: Record<string, unknown>;
  },
) {
  if (!prisma?.systemInsight?.findFirst || !prisma?.systemInsight?.create) {
    return null;
  }

  const existing = await prisma.systemInsight.findFirst({
    where: {
      workspaceId: input.workspaceId,
      type: input.type,
      title: input.title,
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.systemInsight.create({
    data: {
      workspaceId: input.workspaceId,
      type: input.type,
      title: input.title,
      description: input.description,
      severity: input.severity,
      ...(input.metadata ? { metadata: toJsonValue(input.metadata) } : {}),
    },
  });
}
