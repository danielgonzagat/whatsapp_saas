import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

export async function listMonitoredGroups(prisma: PrismaService, workspaceId: string) {
  return prisma.monitoredGroup.findMany({
    where: { workspaceId },
    include: {
      members: { take: 500 },
      keywords: { take: 200 },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function addMonitoredGroup(
  prisma: PrismaService,
  workspaceId: string,
  data: { jid: string; name?: string; inviteLink?: string; settings?: Record<string, unknown> },
) {
  return prisma.monitoredGroup.create({
    data: {
      jid: data.jid,
      name: data.name,
      inviteLink: data.inviteLink,
      settings: JSON.parse(JSON.stringify(data.settings || {})) as Prisma.InputJsonObject,
      workspace: { connect: { id: workspaceId } },
    },
  });
}

export async function listGroupMembers(prisma: PrismaService, groupId: string) {
  return prisma.groupMember.findMany({
    take: 500,
    where: { groupId },
    select: {
      id: true,
      groupId: true,
      phone: true,
      isAdmin: true,
      createdAt: true,
    },
  });
}

export async function listBannedKeywords(prisma: PrismaService, groupId: string) {
  return prisma.bannedKeyword.findMany({
    take: 200,
    where: { groupId },
    select: {
      id: true,
      groupId: true,
      keyword: true,
      action: true,
      createdAt: true,
    },
  });
}
