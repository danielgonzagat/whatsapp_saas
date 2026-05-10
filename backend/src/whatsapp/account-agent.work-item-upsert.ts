import type { Prisma } from '@prisma/client';
import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';
import type { AccountDeps } from './account-agent.gap-detector';

function toJson(value: unknown): Prisma.InputJsonValue {
  return toPrismaJsonValue(value);
}

export interface WorkItemInput {
  kind: string;
  entityType: string;
  entityId: string;
  state: string;
  title: string;
  summary: string;
  priority: number;
  utility: number;
  requiresApproval: boolean;
  requiresInput: boolean;
  approvalState: string | null;
  inputState: string | null;
  blockedBy: Record<string, unknown> | null;
  evidence: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export async function upsertWorkItem(deps: AccountDeps, workspaceId: string, input: WorkItemInput) {
  const id = `${workspaceId}:${input.kind}:${input.entityType}:${input.entityId}`;
  const prev = await deps.prisma.agentWorkItem.findFirst({
    where: { id, workspaceId },
    select: { id: true, state: true, title: true, summary: true, priority: true, utility: true },
  });
  const upd = {
    state: input.state,
    owner: input.state === 'BLOCKED' ? 'RULES' : 'AGENT',
    title: input.title,
    summary: input.summary || null,
    priority: input.priority,
    utility: input.utility,
    blockedBy: input.blockedBy ? toJson(input.blockedBy) : null,
    requiresApproval: input.requiresApproval,
    requiresInput: input.requiresInput,
    approvalState: input.approvalState || null,
    inputState: input.inputState || null,
    evidence: toJson(input.evidence),
    metadata: toJson(input.metadata),
  };
  await deps.prisma.agentWorkItem.upsert({
    where: { id },
    update: upd,
    create: {
      id,
      workspaceId,
      kind: input.kind,
      entityType: input.entityType,
      entityId: input.entityId,
      ...upd,
    },
  });
  const changed =
    !prev ||
    prev.state !== input.state ||
    prev.title !== input.title ||
    String(prev.summary || '') !== String(input.summary || '') ||
    Number(prev.priority || 0) !== Number(input.priority || 0) ||
    Number(prev.utility || 0) !== Number(input.utility || 0);
  if (changed)
    await deps.agentEvents.publish({
      type: 'account',
      workspaceId,
      phase: prev ? 'account_work_item_updated' : 'account_work_item_created',
      persistent: input.state === 'BLOCKED',
      message: prev
        ? `Atualizei ${input.title} para ${input.state}.`
        : `Materializei ${input.title} no universo operacional da conta.`,
      meta: {
        workItemId: id,
        kind: input.kind,
        entityType: input.entityType,
        entityId: input.entityId,
        state: input.state,
        previousState: prev?.state || null,
        priority: input.priority,
        utility: input.utility,
        requiresApproval: input.requiresApproval,
        requiresInput: input.requiresInput,
        capabilityCode: input.metadata.capabilityCode || null,
      },
    });
}
