import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export async function listWorkspaceIntegrations(prisma: PrismaService, workspaceId: string) {
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

export function createWorkspaceIntegration(
  prisma: PrismaService,
  workspaceId: string,
  data: { type: string; name: string; credentials: Prisma.InputJsonValue },
) {
  return prisma.integration.create({ data: { workspaceId, ...data } });
}
