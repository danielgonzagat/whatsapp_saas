import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';
import type { PrismaService } from '../prisma/prisma.service';
import type { AgentEventsService } from './agent-events.service';
import type { AccountApprovalPayload } from './account-agent.types';
import { detectCatalogGap as detectGap, slugifyCatalogKey } from './account-agent.util';
import { asRecord, parseApprovalPayload, readString } from './account-agent.parsers';

export type AccountDeps = {
  prisma: PrismaService;
  agentEvents: AgentEventsService;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return toPrismaJsonValue(value);
}

function buildApprovalKey(np: string) {
  return `account_approval:product_creation:${np}`;
}

export async function detectCatalogGapExt(
  deps: AccountDeps,
  input: {
    workspaceId: string;
    contactId?: string | null;
    phone?: string | null;
    conversationId?: string | null;
    messageContent: string;
  },
) {
  const messageContent = String(input.messageContent || '').trim();
  if (!messageContent) {
    return { created: false, approval: null, reason: 'empty_message' as const };
  }
  const [products, memoryProducts] = await Promise.all([
    deps.prisma.product.findMany({
      where: { workspaceId: input.workspaceId, active: true },
      select: { name: true },
      take: 100,
    }),
    deps.prisma.kloelMemory.findMany({
      where: {
        workspaceId: input.workspaceId,
        OR: [{ type: 'product' }, { category: 'products' }],
      },
      select: { value: true },
      take: 100,
    }),
  ]);
  const productNames = Array.from(
    new Set(
      [
        ...products.map((p) => p.name),
        ...memoryProducts
          .map((m) => readString(asRecord(m.value)?.name))
          .filter((n): n is string => Boolean(n)),
      ]
        .map((n) => String(n || '').trim())
        .filter(Boolean),
    ),
  );
  const detection = detectGap({ messageContent, productNames });
  if (!detection.buyingIntent) {
    return { created: false, approval: null, reason: 'no_buying_intent' as const };
  }
  if (detection.matchedProducts.length > 0) {
    return { created: false, approval: null, reason: 'catalog_match_found' as const };
  }
  const missingProductName = String(detection.missingProductName || '').trim();
  if (!missingProductName) {
    return { created: false, approval: null, reason: 'candidate_not_found' as const };
  }
  const normalizedProductName = slugifyCatalogKey(missingProductName);
  if (!normalizedProductName) {
    return { created: false, approval: null, reason: 'candidate_not_normalized' as const };
  }
  const key = buildApprovalKey(normalizedProductName);
  const existing = await deps.prisma.kloelMemory.findUnique({
    where: { workspaceId_key: { workspaceId: input.workspaceId, key } },
  });
  const contact = input.contactId
    ? await deps.prisma.contact.findFirst({
        where: { id: input.contactId, workspaceId: input.workspaceId },
        select: { id: true, name: true, phone: true },
      })
    : null;
  const now = new Date().toISOString();
  const previous = parseApprovalPayload(existing?.value);
  const approval: AccountApprovalPayload = {
    id: previous?.id || randomUUID(),
    kind: 'product_creation',
    status:
      previous?.status === 'APPROVED' ||
      previous?.status === 'REJECTED' ||
      previous?.status === 'COMPLETED'
        ? previous.status
        : 'OPEN',
    requestedProductName: previous?.requestedProductName || missingProductName,
    normalizedProductName,
    contactId: input.contactId || previous?.contactId || null,
    contactName: contact?.name || previous?.contactName || null,
    phone: input.phone || contact?.phone || previous?.phone || null,
    conversationId: input.conversationId || previous?.conversationId || null,
    customerMessage: messageContent,
    operatorPrompt:
      previous?.operatorPrompt ||
      `Cliente ${contact?.name || input.phone || 'sem nome'} está querendo comprar ${missingProductName}. Deseja criar esse produto?`,
    source: 'inbound_catalog_gap',
    firstDetectedAt: previous?.firstDetectedAt || now,
    lastDetectedAt: now,
    inputSessionId: previous?.inputSessionId || null,
    materializedProductId: previous?.materializedProductId || null,
  };
  await deps.prisma.kloelMemory.upsert({
    where: { workspaceId_key: { workspaceId: input.workspaceId, key } },
    create: {
      workspaceId: input.workspaceId,
      key,
      value: toJson(approval),
      category: 'account_approval',
      type: 'product_creation',
      content: approval.operatorPrompt,
      metadata: toJson({
        status: approval.status,
        contactId: approval.contactId,
        phone: approval.phone,
        requestedProductName: approval.requestedProductName,
      }),
    },
    update: {
      value: toJson(approval),
      category: 'account_approval',
      type: 'product_creation',
      content: approval.operatorPrompt,
      metadata: toJson({
        status: approval.status,
        contactId: approval.contactId,
        phone: approval.phone,
        requestedProductName: approval.requestedProductName,
      }),
    },
  });
  await deps.prisma.approvalRequest.upsert({
    where: { id: approval.id },
    create: {
      id: approval.id,
      workspaceId: input.workspaceId,
      kind: approval.kind,
      scope: 'account',
      entityType: 'product',
      entityId: approval.normalizedProductName,
      state: approval.status,
      title: `Criar produto ${approval.requestedProductName}`,
      prompt: approval.operatorPrompt,
      payload: toJson(approval),
      ...(approval.status === 'APPROVED' ||
      approval.status === 'REJECTED' ||
      approval.status === 'COMPLETED'
        ? { respondedAt: new Date(approval.lastDetectedAt) }
        : {}),
    },
    update: {
      state: approval.status,
      prompt: approval.operatorPrompt,
      payload: toJson(approval),
      respondedAt:
        approval.status === 'APPROVED' ||
        approval.status === 'REJECTED' ||
        approval.status === 'COMPLETED'
          ? new Date(approval.lastDetectedAt)
          : null,
    },
  });
  if (!existing) {
    await deps.agentEvents.publish({
      type: 'prompt',
      workspaceId: input.workspaceId,
      phase: 'account_catalog_gap',
      persistent: true,
      message: approval.operatorPrompt,
      meta: {
        approvalId: approval.id,
        requestedProductName: approval.requestedProductName,
        contactId: approval.contactId,
        phone: approval.phone,
        options: [
          { id: 'approve', label: 'Sim' },
          { id: 'reject', label: 'Não' },
        ],
      },
    });
  }
  return {
    created: !existing,
    approval,
    reason: !existing ? ('created' as const) : ('updated' as const),
  };
}
