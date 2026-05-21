import type { PrismaService } from '../prisma/prisma.service';
import type { ToolResult } from './kloel-chat-tools.agent-runtime.helpers';

// === PRODUCT MANAGEMENT TOOLS ===

export async function runGetProductPlans(
  prisma: PrismaService,
  workspaceId: string,
  args: { productId?: string; productName?: string },
): Promise<ToolResult> {
  let pid = args.productId || '';
  if (!pid && args.productName) {
    const p = await prisma.product.findFirst({
      where: { workspaceId, name: { contains: args.productName, mode: 'insensitive' } },
      select: { id: true },
    });
    pid = p?.id || '';
  }
  if (!pid) {
    return { success: false, error: 'productId_required' };
  }
  const product = await prisma.product.findFirst({
    where: { id: pid, workspaceId },
    select: { id: true, name: true, price: true },
  });
  if (!product) {
    return { success: false, error: 'product_not_found' };
  }
  const plans = await prisma.productPlan.findMany({
    where: { productId: pid },
    select: {
      id: true,
      name: true,
      price: true,
      itemsPerPlan: true,
      maxInstallments: true,
      active: true,
    },
    orderBy: { price: 'asc' },
  });
  return {
    success: true,
    product: { id: product.id, name: product.name, price: product.price },
    plans,
    count: plans.length,
  };
}

export async function runGetProductUrls(
  prisma: PrismaService,
  workspaceId: string,
  args: { productId: string },
): Promise<ToolResult> {
  if (!args.productId) {
    return { success: false, error: 'productId_required' };
  }
  const product = await prisma.product.findFirst({
    where: { id: args.productId, workspaceId },
    select: {
      id: true,
      name: true,
      salesPageUrl: true,
      thankyouUrl: true,
      thankyouPixUrl: true,
      thankyouBoletoUrl: true,
      reclameAquiUrl: true,
      supportEmail: true,
      slug: true,
    },
  });
  if (!product) {
    return { success: false, error: 'product_not_found' };
  }
  return {
    success: true,
    product: { id: product.id, name: product.name },
    urls: {
      salesPageUrl: product.salesPageUrl,
      thankyouUrl: product.thankyouUrl,
      thankyouPixUrl: product.thankyouPixUrl,
      thankyouBoletoUrl: product.thankyouBoletoUrl,
      reclameAquiUrl: product.reclameAquiUrl,
      supportEmail: product.supportEmail,
      slug: product.slug,
    },
  };
}

export async function runGetProductReviews(
  prisma: PrismaService,
  workspaceId: string,
  args: { productId: string },
): Promise<ToolResult> {
  if (!args.productId) {
    return { success: false, error: 'productId_required' };
  }
  const product = await prisma.product.findFirst({
    where: { id: args.productId, workspaceId },
    select: { id: true, name: true },
  });
  if (!product) {
    return { success: false, error: 'product_not_found' };
  }
  const reviews = await prisma.productReview.findMany({
    where: { productId: args.productId },
    select: {
      id: true,
      rating: true,
      comment: true,
      authorName: true,
      createdAt: true,
      verified: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return {
    success: true,
    product: { id: product.id, name: product.name },
    reviews,
    count: reviews.length,
  };
}

export async function runGetProductAiConfig(
  prisma: PrismaService,
  workspaceId: string,
  args: { productId: string },
): Promise<ToolResult> {
  if (!args.productId) {
    return { success: false, error: 'productId_required' };
  }
  const product = await prisma.product.findFirst({
    where: { id: args.productId, workspaceId },
    select: { id: true, name: true, aiConfig: true },
  });
  if (!product) {
    return { success: false, error: 'product_not_found' };
  }
  return {
    success: true,
    product: { id: product.id, name: product.name },
    aiConfig: product.aiConfig || null,
  };
}

export async function runValidateCoupon(
  prisma: PrismaService,
  _workspaceId: string,
  args: { productId: string; code: string },
): Promise<ToolResult> {
  if (!args.productId || !args.code) {
    return { success: false, error: 'productId_and_code_required' };
  }
  const coupon = await prisma.productCoupon.findFirst({
    where: { productId: args.productId, code: args.code, active: true },
  });
  if (!coupon) {
    return { success: false, error: 'coupon_not_found_or_inactive', valid: false };
  }
  const now = new Date();
  if (coupon.expiresAt && new Date(coupon.expiresAt) < now) {
    return {
      success: true,
      valid: false,
      reason: 'expired',
      coupon: { code: coupon.code, discount: coupon.discountValue },
    };
  }
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
    return {
      success: true,
      valid: false,
      reason: 'max_uses_reached',
      coupon: { code: coupon.code },
    };
  }
  return {
    success: true,
    valid: true,
    coupon: {
      id: coupon.id,
      code: coupon.code,
      discountValue: coupon.discountValue,
      type: coupon.discountType,
    },
  };
}

export async function runGetAnalytics(
  prisma: PrismaService,
  workspaceId: string,
  args: { metric: string; period?: string },
): Promise<ToolResult> {
  const period = args.period || 'month';
  const now = new Date();
  let since: Date;
  if (period === 'today') {
    since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === 'week') {
    since = new Date(now.getTime() - 7 * 86400000);
  } else {
    since = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const [contactCount, _orderCount, orders] = await Promise.all([
    prisma.contact.count({ where: { workspaceId } }),
    prisma.checkoutOrder.count({ where: { workspaceId, createdAt: { gte: since } } }),
    prisma.checkoutOrder.findMany({
      where: { workspaceId, createdAt: { gte: since } },
      select: { totalInCents: true, status: true },
    }),
  ]);
  const totalRevenue = orders.reduce((sum: number, o) => sum + o.totalInCents, 0);
  const paidOrders = orders.filter((o) => o.status === 'PAID' || o.status === 'DELIVERED').length;
  return {
    success: true,
    period,
    metrics: {
      totalContacts: contactCount,
      ordersInPeriod: orders.length,
      paidOrders,
      totalRevenueCents: totalRevenue,
      conversionRate:
        contactCount > 0 ? ((paidOrders / contactCount) * 100).toFixed(1) + '%' : '0%',
    },
  };
}

export async function runCreateBroadcast(
  prisma: PrismaService,
  workspaceId: string,
  args: { name: string; message: string; targetTags?: string[]; scheduleAt?: string },
): Promise<ToolResult> {
  if (!args.name || !args.message) {
    return { success: false, error: 'name_and_message_required' };
  }
  const campaign = await prisma.campaign.create({
    data: {
      workspaceId,
      name: args.name,
      messageTemplate: args.message,
      filters: args.targetTags?.length ? { tags: args.targetTags } : undefined,
      scheduledAt: args.scheduleAt ? new Date(args.scheduleAt) : undefined,
      status: 'DRAFT',
    },
  });
  return {
    success: true,
    campaign: { id: campaign.id, name: campaign.name, status: campaign.status },
    message: `Campanha "${args.name}" criada.`,
  };
}

export async function runConfigureAiPersona(
  prisma: PrismaService,
  workspaceId: string,
  args: {
    name?: string;
    personality?: string;
    tone?: string;
    language?: string;
    useEmojis?: boolean;
  },
): Promise<ToolResult> {
  const persona = {
    name: args.name || 'KLOEL',
    personality: args.personality || '',
    tone: args.tone || 'professional',
    language: args.language || 'pt-BR',
    useEmojis: args.useEmojis ?? true,
    updatedAt: new Date().toISOString(),
  };
  await prisma.kloelMemory.upsert({
    where: { workspaceId_key: { workspaceId, key: 'aiPersona' } },
    update: {
      value: persona,
      category: 'preferences',
      type: 'persona',
      content: `Persona: ${persona.name}, Tom: ${persona.tone}`,
      metadata: persona,
    },
    create: {
      workspaceId,
      key: 'aiPersona',
      value: persona,
      category: 'preferences',
      type: 'persona',
      content: `Persona: ${persona.name}, Tom: ${persona.tone}`,
      metadata: persona,
    },
  });
  return { success: true, persona, message: `Persona IA "${persona.name}" configurada.` };
}

export async function runToggleTheme(
  prisma: PrismaService,
  workspaceId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const theme = args.theme === 'dark' || args.theme === 'light' ? String(args.theme) : 'light';
  try {
    await prisma.kloelMemory.upsert({
      where: { workspaceId_key: { workspaceId, key: 'uiTheme' } },
      update: { value: { theme }, category: 'preferences' },
      create: {
        workspaceId,
        key: 'uiTheme',
        value: { theme },
        category: 'preferences',
      },
    });
    return { success: true, theme, message: `Tema alterado para ${theme}.` };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao alterar tema',
    };
  }
}
