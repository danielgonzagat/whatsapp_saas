import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { KloelBusinessConfigToolsService } from './kloel-business-config-tools.service';
import {
  isRecord,
  isSupportedApprovedHighRiskTool,
} from './kloel-tool-dispatcher.high-risk.helpers';
import type { UnknownRecord } from '../common/types';

export type ApprovedToolExecutionResult = {
  success: boolean;
  approvalRequestId: string;
  state: string;
  executed: boolean;
  toolName?: string;
  result?: unknown;
};

function readApprovedToolPayload(payload: Prisma.JsonValue): {
  toolName: string;
  args: UnknownRecord;
} | null {
  if (!isRecord(payload)) {
    return null;
  }
  const toolName = typeof payload.toolName === 'string' ? payload.toolName.trim() : '';
  if (!toolName || !isRecord(payload.args)) {
    return null;
  }
  return { toolName, args: payload.args };
}

async function executeApprovedHighRiskTool(
  bizConfigToolsService: KloelBusinessConfigToolsService,
  workspaceId: string,
  toolName: string,
  args: UnknownRecord,
): Promise<unknown> {
  switch (toolName) {
    case 'create_campaign':
      return bizConfigToolsService.toolCreateCampaign(workspaceId, args as never);
    case 'change_plan':
      return bizConfigToolsService.toolChangePlan(workspaceId, args as never);
    default:
      throw new Error(`unsupported_approved_tool:${toolName}`);
  }
}

export async function executeApprovedApprovalRequestWithDeps(input: {
  prisma: PrismaService;
  bizConfigToolsService: KloelBusinessConfigToolsService;
  workspaceId: string;
  approvalRequestId: string;
  userId?: string;
}): Promise<ApprovedToolExecutionResult> {
  const approval = await input.prisma.approvalRequest.findFirst({
    where: {
      id: input.approvalRequestId,
      workspaceId: input.workspaceId,
      state: 'APPROVED',
    },
  });
  if (!approval) {
    return {
      success: false,
      approvalRequestId: input.approvalRequestId,
      state: 'APPROVED',
      executed: false,
    };
  }

  const payload = readApprovedToolPayload(approval.payload);
  if (!payload || approval.kind !== `kloel_tool:${payload.toolName}`) {
    return {
      success: true,
      approvalRequestId: approval.id,
      state: approval.state,
      executed: false,
    };
  }

  if (!isSupportedApprovedHighRiskTool(payload.toolName)) {
    return {
      success: true,
      approvalRequestId: approval.id,
      state: approval.state,
      executed: false,
      toolName: payload.toolName,
    };
  }

  try {
    const result = await executeApprovedHighRiskTool(
      input.bizConfigToolsService,
      input.workspaceId,
      payload.toolName,
      payload.args,
    );
    await input.prisma.approvalRequest.updateMany({
      where: { id: approval.id, workspaceId: input.workspaceId, state: 'APPROVED' },
      data: {
        state: 'COMPLETED',
        respondedAt: new Date(),
        response: {
          action: 'approved_executed',
          executedToolName: payload.toolName,
          executedByUserId: input.userId ?? null,
          executedAt: new Date().toISOString(),
          result: result as Prisma.InputJsonValue,
        },
      },
    });
    return {
      success: true,
      approvalRequestId: approval.id,
      state: 'COMPLETED',
      executed: true,
      toolName: payload.toolName,
      result,
    };
  } catch (error: unknown) {
    await input.prisma.approvalRequest.updateMany({
      where: { id: approval.id, workspaceId: input.workspaceId, state: 'APPROVED' },
      data: {
        state: 'FAILED',
        respondedAt: new Date(),
        response: {
          action: 'approved_execution_failed',
          executedToolName: payload.toolName,
          executedByUserId: input.userId ?? null,
          failedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        },
      },
    });
    throw error;
  }
}
