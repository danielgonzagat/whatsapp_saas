export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface SubmitKycContext {
  ipAddress?: string;
  userAgent?: string;
}

export function trimToUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function digitsOnly(value: unknown): string | undefined {
  const raw = trimToUndefined(value);
  if (!raw) {
    return undefined;
  }
  const normalized = raw.replace(/\D/g, '');
  return normalized || undefined;
}

export function buildPersonName(name: string | null | undefined): {
  firstName?: string;
  lastName?: string;
} {
  const normalized = trimToUndefined(name);
  if (!normalized) {
    return {};
  }

  const parts = normalized.split(/\s+/);
  const firstName = parts.shift();
  const lastName = parts.join(' ') || undefined;
  return {
    firstName,
    lastName,
  };
}

export function buildDateOfBirth(date: Date | null | undefined):
  | {
      day: number;
      month: number;
      year: number;
    }
  | undefined {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return undefined;
  }

  return {
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  };
}

import { BadRequestException, NotFoundException } from '@nestjs/common';

export async function doAdminApprove(deps: { prisma: any }, agentId: string) {
  const agent = await deps.prisma.agent.findUnique({
    where: { id: agentId },
    select: { id: true, kycStatus: true },
  });

  if (!agent) {
    throw new NotFoundException('Agent not found');
  }
  if (agent.kycStatus === 'approved') {
    throw new BadRequestException('KYC already approved');
  }

  await deps.prisma.agent.update({
    where: { id: agentId },
    data: {
      kycStatus: 'approved',
      kycApprovedAt: new Date(),
    },
  });

  return { success: true, status: 'approved', agentId };
}

export async function doAutoApproveIfComplete(
  deps: { prisma: any },
  getCompletion: (agentId: string, workspaceId: string) => Promise<{ percentage: number }>,
  agentId: string,
  workspaceId: string,
) {
  const completion = await getCompletion(agentId, workspaceId);

  if (completion.percentage >= 75) {
    await deps.prisma.agent.update({
      where: { id: agentId },
      data: {
        kycStatus: 'approved',
        kycApprovedAt: new Date(),
      },
    });
    return { approved: true, percentage: completion.percentage };
  }

  return { approved: false, percentage: completion.percentage };
}
