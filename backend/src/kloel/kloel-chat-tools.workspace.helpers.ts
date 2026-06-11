import { Prisma } from '@prisma/client';
import { safeStr } from '../common/string';
import type { StructuredLogger } from '../logging/structured-logger';
import type { PrismaService } from '../prisma/prisma.service';
import type { SmartPaymentService } from './smart-payment.service';
import type { ToolResult } from './kloel-chat-tools.agent-runtime.helpers';
import type { ToolDashboardSummaryArgs } from './kloel-chat-tools.dashboard-payments.helpers';
import type {
  ToolRememberUserInfoArgs,
  ToolSetBrandVoiceArgs,
  ToolSetSalesPolicyArgs,
} from './kloel-chat-tools.settings-policy.helpers';
import { centsFromUnknown } from './kloel-chat-tools.types';
import type { ToolCreateFlowArgs } from './kloel-tool-executor.types';

const NON_SLUG_CHAR_RE = /[^a-z0-9_:-]+/g;

export async function runSetBrandVoice(
  prisma: PrismaService,
  workspaceId: string,
  args: ToolSetBrandVoiceArgs,
  /** Canonical Brain → Mind memory delegate; falls back to prisma.kloelMemory when absent. */
  mindMemory?: PrismaService['kloelMemory'],
): Promise<ToolResult> {
  await (mindMemory ?? prisma.kloelMemory).upsert({
    where: { workspaceId_key: { workspaceId, key: 'brandVoice' } },
    update: {
      value: { style: args.tone, personality: args.personality || '' },
      category: 'preferences',
      type: 'persona',
      content: `Tom: ${args.tone}. ${args.personality || ''}`.trim(),
      metadata: { tone: args.tone, personality: args.personality || '' },
    },
    create: {
      workspaceId,
      key: 'brandVoice',
      value: { style: args.tone, personality: args.personality || '' },
      category: 'preferences',
      type: 'persona',
      content: `Tom: ${args.tone}. ${args.personality || ''}`.trim(),
      metadata: { tone: args.tone, personality: args.personality || '' },
    },
  });
  return {
    success: true,
    message: `Tom de voz definido como "${args.tone}"`,
  };
}

export async function runSetSalesPolicy(
  prisma: PrismaService,
  workspaceId: string,
  args: ToolSetSalesPolicyArgs,
  userId?: string,
): Promise<ToolResult> {
  const aggressiveness = safeStr(args.aggressiveness, 'balanced').trim().slice(0, 40);
  const tone = safeStr(args.tone, '').trim().slice(0, 80);
  const instructions = safeStr(args.instructions, '').trim().slice(0, 1000);
  const appliesTo = safeStr(args.appliesTo, 'all').trim().slice(0, 120);
  if (!aggressiveness && !tone && !instructions) {
    return { success: false, error: 'missing_sales_policy_payload' };
  }
  const policy = {
    aggressiveness: aggressiveness || 'balanced',
    tone: tone || null,
    instructions: instructions || null,
    appliesTo: appliesTo || 'all',
    updatedAt: new Date().toISOString(),
    updatedByUserId: userId || null,
  } satisfies Prisma.InputJsonObject;
  await prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = (workspace?.providerSettings as Record<string, unknown>) || {};
    const autopilot = (settings.autopilot as Record<string, unknown>) || {};
    await tx.workspace.update({
      where: { id: workspaceId },
      data: { providerSettings: { ...settings, autopilot: { ...autopilot, salesPolicy: policy } } },
    });
  });
  return {
    success: true,
    policy,
    message: `Politica comercial atualizada: agressividade ${policy.aggressiveness}.`,
  };
}

export async function runRememberUserInfo(
  prisma: PrismaService,
  workspaceId: string,
  args: ToolRememberUserInfoArgs,
  userId?: string,
  /** Canonical Brain → Mind memory delegate; falls back to prisma.kloelMemory when absent. */
  mindMemory?: PrismaService['kloelMemory'],
): Promise<ToolResult> {
  const normalizedKey = String(args?.key || '')
    .trim()
    .toLowerCase()
    .replace(NON_SLUG_CHAR_RE, '_')
    .slice(0, 80);
  const value = String(args?.value || '').trim();
  if (!normalizedKey || !value) {
    return { success: false, error: 'missing_user_memory_payload' };
  }
  const profileKey = `user_profile:${userId || 'workspace_owner'}`;
  const existing = await (mindMemory ?? prisma.kloelMemory).findUnique({
    where: { workspaceId_key: { workspaceId, key: profileKey } },
  });
  const currentValue =
    existing?.value && typeof existing.value === 'object'
      ? (existing.value as Record<string, Prisma.JsonValue>)
      : {};
  const nextValue: Record<string, Prisma.JsonValue> = {
    ...currentValue,
    [normalizedKey]: value,
    updatedAt: new Date().toISOString(),
    userId: userId || null,
  };
  const contentLines = Object.entries(nextValue)
    .filter(([k]) => !['updatedAt', 'userId'].includes(k))
    .map(([k, v]) => k + ': ' + safeStr(v))
    .join('\n');
  await (mindMemory ?? prisma.kloelMemory).upsert({
    where: { workspaceId_key: { workspaceId, key: profileKey } },
    update: {
      value: nextValue,
      category: 'user_preferences',
      type: 'user_profile',
      content: contentLines,
      metadata: {
        ...((existing?.metadata as Record<string, unknown>) || {}),
        userId: userId || null,
        source: 'remember_user_info',
      },
    },
    create: {
      workspaceId,
      key: profileKey,
      value: nextValue,
      category: 'user_preferences',
      type: 'user_profile',
      content: contentLines,
      metadata: { userId: userId || null, source: 'remember_user_info' },
    },
  });
  return {
    success: true,
    message: `Memória "${normalizedKey}" salva.`,
  };
}

export async function runCreateFlow(
  prisma: PrismaService,
  workspaceId: string,
  args: ToolCreateFlowArgs,
): Promise<ToolResult> {
  const nodes = [
    { id: 'start', type: 'trigger', position: { x: 100, y: 100 }, data: { trigger: args.trigger } },
    {
      id: 'msg1',
      type: 'message',
      position: { x: 100, y: 200 },
      data: { message: args.actions?.[0] || 'Olá!' },
    },
  ];
  const flow = await prisma.flow.create({
    data: {
      workspaceId,
      name: args.name,
      description: `Fluxo criado via chat: ${args.trigger}`,
      nodes,
      edges: [{ id: 'e1', source: 'start', target: 'msg1' }],
      isActive: true,
    },
  });
  return {
    success: true,
    flow,
    message: `Fluxo "${args.name}" criado com sucesso!`,
  };
}

export async function runListFlows(
  prisma: PrismaService,
  workspaceId: string,
): Promise<ToolResult> {
  const flows = await prisma.flow.findMany({
    where: { workspaceId },
    select: {
      id: true,
      name: true,
      isActive: true,
      createdAt: true,
      _count: { select: { executions: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  return {
    success: true,
    flows: flows.map((f) => ({
      id: f.id,
      name: f.name,
      active: f.isActive,
      executions: f._count.executions,
    })),
    message: `Você tem ${flows.length} fluxo(s) cadastrado(s).`,
  };
}

export async function runGetDashboardSummary(
  prisma: PrismaService,
  workspaceId: string,
  args: ToolDashboardSummaryArgs,
): Promise<ToolResult> {
  const period = args.period || 'today';
  let dateFilter: Date;
  switch (period) {
    case 'week':
      dateFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      dateFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      dateFilter = new Date();
      dateFilter.setHours(0, 0, 0, 0);
  }
  const [contacts, messages, flows, paidOrders, wallet] = await Promise.all([
    prisma.contact.count({ where: { workspaceId, createdAt: { gte: dateFilter } } }),
    prisma.message.count({ where: { workspaceId, createdAt: { gte: dateFilter } } }),
    prisma.flow.count({ where: { workspaceId, isActive: true } }),
    prisma.checkoutOrder.aggregate({
      where: { workspaceId, status: 'PAID', paidAt: { gte: dateFilter } },
      _count: { _all: true },
      _sum: { totalInCents: true },
    }),
    prisma.kloelWallet.findUnique({
      where: { workspaceId },
      select: {
        availableBalanceInCents: true,
        pendingBalanceInCents: true,
        blockedBalanceInCents: true,
      },
    }),
  ]);
  const revenueInCents = paidOrders._sum.totalInCents || 0;
  const availableInCents = centsFromUnknown(wallet?.availableBalanceInCents);
  const pendingInCents = centsFromUnknown(wallet?.pendingBalanceInCents);
  const blockedInCents = centsFromUnknown(wallet?.blockedBalanceInCents);
  const totalInCents = availableInCents + pendingInCents + blockedInCents;
  return {
    success: true,
    period,
    stats: {
      newContacts: contacts,
      messages,
      activeFlows: flows,
      paidOrders: paidOrders._count._all,
      revenueInCents,
      revenue: revenueInCents / 100,
      wallet: {
        availableInCents,
        pendingInCents,
        blockedInCents,
        totalInCents,
        available: availableInCents / 100,
        pending: pendingInCents / 100,
        blocked: blockedInCents / 100,
        total: totalInCents / 100,
      },
    },
  };
}

/**
 * Stale, no-longer-wired payment-link helper. The canonical path lives in
 * `kloel-chat-tools.dashboard-payments.helpers.ts` and routes real PIX through
 * `SmartPaymentService` via the dispatcher receipt path.
 *
 * This entrypoint must NEVER fabricate a payment instrument. The previous
 * non-production branch hand-rolled an EMV PIX copy-paste payload with a random
 * checksum and a `pay_dev_*` id and returned it as a real instrument — that is
 * a fabricated reality. It now returns an honest setup-required result, mirroring the
 * canonical `canonical_dispatcher_required` convention, regardless of NODE_ENV.
 */
export function runCreatePaymentLink(
  _prisma: PrismaService,
  _smartPaymentService: SmartPaymentService,
  logger: Pick<StructuredLogger, 'log'>,
  _workspaceId: string,
  args: { amount: number; description: string; customerName?: string },
): Promise<ToolResult> {
  logger.log('Payment operation blocked: non-canonical create_payment_link path', {
    context: 'KloelChatTools.toolCreatePaymentLink',
    action: 'createSmartPayment',
    amount: Number(args.amount) || 0,
    hasDescription: !!args.description,
    blocked: true,
  });
  return Promise.resolve({
    success: false,
    error: 'canonical_dispatcher_required',
    billingType: 'PIX',
    message:
      'create_payment_link must be executed through the canonical dispatcher receipt path. ' +
      'No payment instrument is available from this path.',
  });
}
