import type { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';

type FollowupMetadata = {
  phone?: string;
  contactId?: string;
  message?: string;
  scheduledFor?: unknown;
  delayMinutes?: unknown;
  status?: string;
  executedAt?: unknown;
  [key: string]: unknown;
};

/** Followup list item shape. */
export interface FollowupListItem {
  id: string;
  key: string;
  phone?: unknown;
  contactId?: unknown;
  message: unknown;
  scheduledFor?: unknown;
  delayMinutes?: unknown;
  status: unknown;
  createdAt: Date;
  executedAt?: unknown;
}

export async function runListFollowups(
  prisma: PrismaService,
  workspaceId: string,
  contactId?: string,
) {
  try {
    const whereClause: Prisma.KloelMemoryWhereInput = { workspaceId, category: 'followups' };
    if (contactId) {
      whereClause.metadata = { path: ['contactId'], equals: contactId };
    }
    const followups = await prisma.kloelMemory.findMany({
      where: { ...whereClause, workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, key: true, value: true, metadata: true, createdAt: true },
    });
    return {
      total: followups.length,
      followups: followups.map((f): FollowupListItem => {
        const meta = (f.metadata as FollowupMetadata) || {};
        return {
          id: f.id,
          key: f.key,
          phone: meta.phone,
          contactId: meta.contactId,
          message: meta.message || f.value,
          scheduledFor: meta.scheduledFor,
          delayMinutes: meta.delayMinutes,
          status: meta.status || 'pending',
          createdAt: f.createdAt,
          executedAt: meta.executedAt,
        };
      }),
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'unknown error';
    console.error(`Erro ao listar follow-ups: ${msg}`);
    return { total: 0, followups: [] };
  }
}

// ── Persona Management ──

export async function runListPersonas(prisma: PrismaService, workspaceId: string) {
  return prisma.persona.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      name: true,
      role: true,
      basePrompt: true,
      voiceId: true,
      knowledgeBaseId: true,
      workspaceId: true,
      createdAt: true,
    },
  });
}

export function runCreatePersona(
  prisma: PrismaService,
  workspaceId: string,
  data: {
    name: string;
    role?: string;
    basePrompt?: string;
    description?: string;
    systemPrompt?: string;
    temperature?: number;
  },
) {
  return prisma.persona.create({
    data: {
      workspaceId,
      name: data.name,
      role: data.role || 'SALES',
      basePrompt: data.basePrompt || data.systemPrompt || '',
    },
  });
}

// ── Integration Management ──

export async function runListIntegrations(prisma: PrismaService, workspaceId: string) {
  return prisma.integration.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      type: true,
      name: true,
      credentials: true,
      isActive: true,
      workspaceId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function runCreateIntegration(
  prisma: PrismaService,
  workspaceId: string,
  data: { type: string; name: string; credentials: Prisma.InputJsonValue },
) {
  return prisma.integration.create({ data: { workspaceId, ...data } });
}
