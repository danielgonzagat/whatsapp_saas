import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from '../common/interfaces';

export interface ApprovalDecisionDto {
  note?: string;
  adjustment?: Prisma.InputJsonValue;
}

export function readUserId(user: unknown): string | undefined {
  if (!user || typeof user !== 'object') {
    return undefined;
  }
  const sub = 'sub' in user ? (user as { sub?: unknown }).sub : undefined;
  if (typeof sub === 'string' && sub.trim()) {
    return sub;
  }
  const legacyId = 'id' in user ? (user as { id?: unknown }).id : undefined;
  return typeof legacyId === 'string' && legacyId.trim() ? legacyId : undefined;
}

export function readWorkspaceId(req: AuthenticatedRequest): string {
  const workspaceId = req.workspaceId || req.user?.workspaceId;
  if (!workspaceId) {
    throw new BadRequestException('workspace_id_required');
  }
  return workspaceId;
}

export function normalizeApprovalNote(body?: ApprovalDecisionDto): string | null {
  return typeof body?.note === 'string' && body.note.trim() ? body.note.trim() : null;
}

export async function transitionApprovalRequest(
  deps: { prisma: PrismaService },
  input: {
    approvalRequestId: string;
    req: AuthenticatedRequest;
    state: 'APPROVED' | 'REJECTED' | 'ADJUSTMENT_REQUESTED';
    body?: ApprovalDecisionDto;
  },
) {
  const approvalRequestId = String(input.approvalRequestId || '').trim();
  if (!approvalRequestId) {
    throw new BadRequestException('approval_request_id_required');
  }
  const workspaceId = readWorkspaceId(input.req);
  const approval = await deps.prisma.approvalRequest.findFirst({
    where: { id: approvalRequestId, workspaceId },
    select: { id: true, state: true },
  });
  if (!approval) {
    throw new NotFoundException('approval_request_not_found');
  }
  if (approval.state !== 'OPEN') {
    throw new BadRequestException('approval_request_not_open');
  }
  const userId = readUserId(input.req.user);
  const response: Prisma.InputJsonObject = {
    action: input.state.toLowerCase(),
    decidedAt: new Date().toISOString(),
    ...(userId ? { decidedByUserId: userId } : {}),
    note: normalizeApprovalNote(input.body),
    ...(input.state === 'ADJUSTMENT_REQUESTED'
      ? { adjustment: input.body?.adjustment ?? null }
      : {}),
  };
  const result = await deps.prisma.approvalRequest.updateMany({
    where: { id: approvalRequestId, workspaceId, state: 'OPEN' },
    data: {
      state: input.state,
      respondedAt: new Date(),
      response,
    },
  });
  if (result.count !== 1) {
    throw new BadRequestException('approval_request_not_open');
  }
  return {
    success: true,
    approvalRequestId,
    state: input.state,
  };
}
