import { Prisma } from '@prisma/client';
import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';
import { PrismaService } from '../prisma/prisma.service';
import { AgentEventsService } from './agent-events.service';
import { materializeAccountCapabilityGapsExt } from './account-agent.capability-gaps';
import { getPromptForStage } from './account-agent.parsers';
import type { AccountApprovalPayload, AccountInputSessionPayload } from './account-agent.types';

export type WorkItemUpsertInput = {
  kind: string;
  entityType: string;
  entityId?: string | null;
  state: string;
  title: string;
  summary?: string | null;
  priority: number;
  utility: number;
  requiresApproval: boolean;
  requiresInput: boolean;
  approvalState?: string | null;
  inputState?: string | null;
  blockedBy?: Record<string, unknown> | null;
  evidence?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

type AccountWorkItemDeps = {
  prisma: PrismaService;
  agentEvents: AgentEventsService;
};

export async function listAccountWorkItems(
  deps: Pick<AccountWorkItemDeps, 'prisma'>,
  workspaceId: string,
) {
  return deps.prisma.agentWorkItem.findMany({
    where: { workspaceId },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    take: 100,
    select: {
      id: true,
      workspaceId: true,
      kind: true,
      entityType: true,
      entityId: true,
      state: true,
      owner: true,
      title: true,
      summary: true,
      priority: true,
      utility: true,
      eligibleAt: true,
      requiresApproval: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function materializeAccountCapabilityGaps(
  deps: AccountWorkItemDeps,
  workspaceId: string,
) {
  return materializeAccountCapabilityGapsExt(deps, workspaceId);
}

export async function upsertApprovalRequest(
  deps: Pick<AccountWorkItemDeps, 'prisma'>,
  workspaceId: string,
  approval: AccountApprovalPayload,
) {
  return deps.prisma.approvalRequest.upsert({
    where: { id: approval.id },
    create: {
      id: approval.id,
      workspaceId,
      kind: approval.kind,
      scope: 'account',
      entityType: 'product',
      entityId: approval.normalizedProductName,
      state: approval.status,
      title: `Criar produto ${approval.requestedProductName}`,
      prompt: approval.operatorPrompt,
      payload: toPrismaJsonValue(approval),
      ...(approval.status === 'APPROVED' ||
      approval.status === 'REJECTED' ||
      approval.status === 'COMPLETED'
        ? { respondedAt: new Date(approval.lastDetectedAt) }
        : {}),
    },
    update: {
      state: approval.status,
      prompt: approval.operatorPrompt,
      payload: toPrismaJsonValue(approval),
      respondedAt:
        approval.status === 'APPROVED' ||
        approval.status === 'REJECTED' ||
        approval.status === 'COMPLETED'
          ? new Date(approval.lastDetectedAt)
          : null,
    },
  });
}

export async function upsertInputCollectionSession(
  deps: Pick<AccountWorkItemDeps, 'prisma'>,
  workspaceId: string,
  session: AccountInputSessionPayload,
) {
  return deps.prisma.inputCollectionSession.upsert({
    where: { id: session.id },
    create: {
      id: session.id,
      workspaceId,
      kind: session.kind,
      state: session.status,
      entityType: 'product',
      entityId: session.normalizedProductName,
      prompt: getPromptForStage(session.status, session.productName),
      answers: toPrismaJsonValue(session.answers || {}),
      payload: toPrismaJsonValue(session),
      ...(session.completedAt ? { completedAt: new Date(session.completedAt) } : {}),
    },
    update: {
      state: session.status,
      prompt: getPromptForStage(session.status, session.productName),
      answers: toPrismaJsonValue(session.answers || {}),
      payload: toPrismaJsonValue(session),
      completedAt: session.completedAt ? new Date(session.completedAt) : null,
    },
  });
}

async function findPreviousWorkItem(
  deps: Pick<AccountWorkItemDeps, 'prisma'>,
  workspaceId: string,
  id: string,
) {
  return deps.prisma.agentWorkItem.findFirst({
    where: { id, workspaceId },
    select: {
      id: true,
      state: true,
      title: true,
      summary: true,
      priority: true,
      utility: true,
      metadata: true,
    },
  });
}

function buildWorkItemUpdateData(
  input: WorkItemUpsertInput,
  missingValue: Prisma.InputJsonValue | Prisma.NullTypes.JsonNull | undefined,
) {
  return {
    state: input.state,
    owner: input.state === 'BLOCKED' ? 'RULES' : 'AGENT',
    title: input.title,
    summary: input.summary || null,
    priority: input.priority,
    utility: input.utility,
    blockedBy: input.blockedBy ? toPrismaJsonValue(input.blockedBy) : missingValue,
    requiresApproval: input.requiresApproval,
    requiresInput: input.requiresInput,
    approvalState: input.approvalState || null,
    inputState: input.inputState || null,
    evidence: input.evidence ? toPrismaJsonValue(input.evidence) : missingValue,
    metadata: input.metadata ? toPrismaJsonValue(input.metadata) : missingValue,
  };
}

function isWorkItemChanged(
  prev: {
    state: string;
    title: string;
    summary: string | null;
    priority: number;
    utility: number;
  } | null,
  input: WorkItemUpsertInput,
): boolean {
  if (!prev) {
    return true;
  }
  return (
    prev.state !== input.state ||
    prev.title !== input.title ||
    String(prev.summary || '') !== String(input.summary || '') ||
    Number(prev.priority || 0) !== Number(input.priority || 0) ||
    Number(prev.utility || 0) !== Number(input.utility || 0)
  );
}

export async function upsertAccountWorkItem(
  deps: AccountWorkItemDeps,
  workspaceId: string,
  input: WorkItemUpsertInput,
) {
  const entityKey = String(input.entityId || 'global');
  const id = `${workspaceId}:${input.kind}:${input.entityType}:${entityKey}`;
  const previous = await findPreviousWorkItem(deps, workspaceId, id);
  const updateData = buildWorkItemUpdateData(
    input,
    Prisma.JsonNull,
  ) as Prisma.AgentWorkItemUpdateInput;
  const createDataBase = buildWorkItemUpdateData(input, undefined);
  const { blockedBy: _cb, evidence: _ce, metadata: _cm, ...createDataClean } = createDataBase;
  const createData = {
    id,
    workspaceId,
    kind: input.kind,
    entityType: input.entityType,
    entityId: input.entityId || null,
    ...createDataClean,
    ...(_cb !== undefined ? { blockedBy: _cb } : {}),
    ...(_ce !== undefined ? { evidence: _ce } : {}),
    ...(_cm !== undefined ? { metadata: _cm } : {}),
  } as Prisma.AgentWorkItemUncheckedCreateInput;
  await deps.prisma.agentWorkItem.upsert({
    where: { id, workspaceId },
    update: updateData,
    create: createData,
  });
  if (isWorkItemChanged(previous, input)) {
    await deps.agentEvents.publish({
      type: 'account',
      workspaceId,
      phase: previous ? 'account_work_item_updated' : 'account_work_item_created',
      persistent: input.state === 'BLOCKED',
      message: previous
        ? `Atualizei ${input.title} para ${input.state}.`
        : `Materializei ${input.title} no universo operacional da conta.`,
      meta: {
        workItemId: id,
        kind: input.kind,
        entityType: input.entityType,
        entityId: input.entityId || null,
        state: input.state,
        previousState: previous?.state || null,
        priority: input.priority,
        utility: input.utility,
        requiresApproval: input.requiresApproval,
        requiresInput: input.requiresInput,
        capabilityCode: input.metadata?.capabilityCode || null,
      },
    });
  }
}
