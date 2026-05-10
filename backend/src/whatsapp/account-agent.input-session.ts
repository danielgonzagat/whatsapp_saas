import type { Prisma } from '@prisma/client';
import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';
import { AccountDeps } from './account-agent.gap-detector';
import type { AccountInputSessionPayload } from './account-agent.types';
import { asRecord, getPromptForStage } from './account-agent.parsers';
import { materializeProductExt } from './account-agent.product-materializer';

type InputSessionRecord = {
  key: string;
  metadata: Record<string, unknown> | null;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return toPrismaJsonValue(value);
}

export async function respondToInputSessionExt(
  deps: AccountDeps,
  {
    workspaceId,
    sessionId,
    answer,
    findInputSessionFn,
    finishApprovalFn,
    enqueueContactResumptionFn,
  }: {
    workspaceId: string;
    sessionId: string;
    answer: string;
    findInputSessionFn: (
      workspaceId: string,
      sessionId: string,
    ) => Promise<{ record: InputSessionRecord; session: AccountInputSessionPayload }>;
    finishApprovalFn: (
      workspaceId: string,
      approvalId: string,
      productId: string | null,
    ) => Promise<void>;
    enqueueContactResumptionFn: (
      workspaceId: string,
      session: AccountInputSessionPayload,
    ) => Promise<void>;
  },
) {
  const trimmed = String(answer || '').trim();
  const { record, session } = await findInputSessionFn(workspaceId, sessionId);
  const next = {
    ...session,
    answers: { ...session.answers },
    updatedAt: new Date().toISOString(),
  } as AccountInputSessionPayload;
  let nextPrompt: string | null = null;
  let completed = false;
  let productId: string | null = null;
  switch (session.status) {
    case 'WAITING_DESCRIPTION':
      next.answers.description = trimmed;
      next.status = 'WAITING_OFFERS';
      nextPrompt = getPromptForStage(next.status, next.productName);
      break;
    case 'WAITING_OFFERS':
      next.answers.offers = trimmed;
      next.status = 'WAITING_COMPANY';
      nextPrompt = getPromptForStage(next.status, next.productName);
      break;
    case 'WAITING_COMPANY': {
      next.answers.company = trimmed;
      const m = await materializeProductExt(deps, workspaceId, next);
      next.status = 'COMPLETED';
      next.completedAt = new Date().toISOString();
      next.materializedProductId = m.productId;
      productId = m.productId;
      completed = true;
      nextPrompt = null;
      break;
    }
    case 'COMPLETED':
    default:
      return { completed: true, session: next, nextPrompt: null };
  }
  await deps.prisma.kloelMemory.update({
    where: { workspaceId_key: { workspaceId, key: record.key } },
    data: {
      value: toJson(next),
      metadata: { ...(asRecord(record.metadata) ?? {}), status: next.status },
    },
  });
  await deps.prisma.inputCollectionSession.upsert({
    where: { id: next.id },
    create: {
      id: next.id,
      workspaceId,
      kind: next.kind,
      state: next.status,
      entityType: 'product',
      entityId: next.normalizedProductName,
      prompt: getPromptForStage(next.status, next.productName),
      answers: toJson(next.answers || {}),
      payload: toJson(next),
      completedAt: next.completedAt ? new Date(next.completedAt) : undefined,
    },
    update: {
      state: next.status,
      prompt: getPromptForStage(next.status, next.productName),
      answers: toJson(next.answers || {}),
      payload: toJson(next),
      completedAt: next.completedAt ? new Date(next.completedAt) : null,
    },
  });
  if (completed) {
    await finishApprovalFn(workspaceId, next.approvalId, productId);
    await deps.agentEvents.publish({
      type: 'status',
      workspaceId,
      phase: 'account_product_materialized',
      persistent: true,
      message: `${next.productName} foi criado, enriquecido e está pronto para venda.`,
      meta: { inputSessionId: next.id, productId, requestedProductName: next.productName },
    });
    await enqueueContactResumptionFn(workspaceId, next);
  } else if (nextPrompt)
    await deps.agentEvents.publish({
      type: 'prompt',
      workspaceId,
      phase: next.status === 'WAITING_OFFERS' ? 'account_input_offers' : 'account_input_company',
      persistent: true,
      message: nextPrompt,
      meta: { inputSessionId: next.id, stage: next.status },
    });
  return { completed, productId, session: next, nextPrompt };
}
