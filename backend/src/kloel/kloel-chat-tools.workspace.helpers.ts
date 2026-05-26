import { Prisma } from '@prisma/client';
import * as QRCode from 'qrcode';
import type { StructuredLogger } from '../logging/structured-logger';
import type { PrismaService } from '../prisma/prisma.service';
import type { SmartPaymentService } from './smart-payment.service';
import type { ToolResult } from './kloel-chat-tools.agent-runtime.helpers';
import {
  centsFromUnknown,
  NON_SLUG_CHAR_RE,
  safeStr,
  type ToolCreateFlowArgs,
  type ToolDashboardSummaryArgs,
  type ToolRememberUserInfoArgs,
  type ToolSetBrandVoiceArgs,
  type ToolSetSalesPolicyArgs,
} from './kloel-chat-tools.types';
import { randomBytes } from 'node:crypto';

export async function runSetBrandVoice(
  prisma: PrismaService,
  workspaceId: string,
  args: ToolSetBrandVoiceArgs,
): Promise<ToolResult> {
  await prisma.kloelMemory.upsert({
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
  const existing = await prisma.kloelMemory.findUnique({
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
  await prisma.kloelMemory.upsert({
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

export async function runCreatePaymentLink(
  prisma: PrismaService,
  smartPaymentService: SmartPaymentService,
  logger: Pick<StructuredLogger, 'log'>,
  workspaceId: string,
  args: { amount: number; description: string; customerName?: string },
): Promise<ToolResult> {
  logger.log('Payment operation', {
    context: 'KloelChatTools.toolCreatePaymentLink',
    action: 'createSmartPayment',
    amount: Number(args.amount) || 0,
    hasDescription: !!args.description,
  });
  if (process.env.NODE_ENV !== 'production') {
    const localAmount = Number(args.amount) || 0;
    const localPaymentId = `pay_dev_${Date.now().toString(36)}`;
    const customerName = args.customerName || 'Cliente';
    const checksum = randomBytes(2).toString('hex').toUpperCase();
    if (args.customerName) {
      await upsertDevContact(prisma, workspaceId, customerName);
    }
    await createDevSale(
      prisma,
      workspaceId,
      localPaymentId,
      args.description || 'Produto',
      localAmount,
      args.customerName,
    );
    const pixPayload = `00020126580014BR.GOV.BCB.PIX0136${localPaymentId}520400005303986540${localAmount.toFixed(2)}5802BR5925${customerName}6009SAO PAULO62070503***6304${checksum}`;
    let qrCodeBase64 = '';
    try {
      qrCodeBase64 = await QRCode.toDataURL(pixPayload, { width: 300, margin: 2 });
    } catch {
      // QR code is non-blocking for local checkout smoke paths.
    }
    return {
      success: true,
      paymentId: localPaymentId,
      pixCopyPaste: pixPayload,
      pixQrCode: qrCodeBase64 || undefined,
      billingType: 'PIX',
      customerName,
      message: `PIX de R$ ${localAmount.toFixed(2)} gerado para ${customerName}.`,
    };
  }
  const paymentResult = await smartPaymentService.createSmartPayment({
    workspaceId,
    amount: Number(args.amount) || 0,
    productName: args.description,
    customerName: args.customerName || 'Cliente',
    phone: '',
  });
  return {
    success: true,
    ...paymentResult,
  };
}

async function upsertDevContact(prisma: PrismaService, workspaceId: string, customerName: string) {
  try {
    const existing = await prisma.contact.findFirst({ where: { workspaceId, name: customerName } });
    if (existing) {
      await prisma.contact.updateMany({
        where: { id: existing.id, workspaceId },
        data: { updatedAt: new Date() },
      });
    } else {
      await prisma.contact.create({
        data: { workspaceId, name: customerName, phone: '', leadScore: 30 },
      });
    }
  } catch {
    // Local payment evidence should not fail on optional CRM sync.
  }
}

async function createDevSale(
  prisma: PrismaService,
  workspaceId: string,
  externalPaymentId: string,
  productName: string,
  amount: number,
  customerName?: string,
) {
  try {
    await prisma.kloelSale.create({
      data: {
        workspaceId,
        externalPaymentId,
        productName,
        amount,
        status: 'pending',
        paymentMethod: 'PIX',
        ...(customerName ? { leadPhone: customerName } : {}),
      },
    });
  } catch {
    // Local payment evidence should not fail on optional sales sync.
  }
}
