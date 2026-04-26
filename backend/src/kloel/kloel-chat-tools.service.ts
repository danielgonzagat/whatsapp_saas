import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { filterLegacyProducts } from '../common/products/legacy-products.util';
import { PrismaService } from '../prisma/prisma.service';
import { SmartPaymentService } from './smart-payment.service';

const NON_SLUG_CHAR_RE = /[^a-z0-9_:-]+/g;

function safeStr(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

/** Generic tool result shape. */
interface ToolResult {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

interface ToolSaveProductArgs {
  name: string;
  price: number;
  description?: string;
}

interface ToolDeleteProductArgs {
  productId?: string;
  productName?: string;
}

interface ToolToggleAutopilotArgs {
  enabled: boolean;
}

interface ToolSetBrandVoiceArgs {
  tone: string;
  personality?: string;
}

interface ToolRememberUserInfoArgs {
  key: string;
  value: string;
}

interface ToolCreateFlowArgs {
  name: string;
  trigger: string;
  actions?: string[];
}

interface ToolDashboardSummaryArgs {
  period?: 'today' | 'week' | 'month';
}

/** Handles product, flow, dashboard, payment, and misc AI chat tools. */
@Injectable()
export class KloelChatToolsService {
  private readonly logger = new Logger(KloelChatToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly smartPaymentService: SmartPaymentService,
  ) {}

  async toolSaveProduct(workspaceId: string, args: ToolSaveProductArgs): Promise<ToolResult> {
    const product = await this.prisma.product.create({
      data: {
        workspaceId,
        name: args.name,
        price: args.price,
        description: args.description || '',
        active: true,
      },
    });
    return { success: true, product, message: `Produto "${args.name}" cadastrado com sucesso!` };
  }

  async toolListProducts(workspaceId: string): Promise<ToolResult> {
    const products = filterLegacyProducts(
      await this.prisma.product.findMany({
        where: { workspaceId, active: true },
        select: { id: true, name: true, price: true, description: true, status: true },
        orderBy: { name: 'asc' },
        take: 100,
      }),
    );
    if (products.length === 0) {
      return { success: true, message: 'Nenhum produto cadastrado ainda.' };
    }
    const list = products.map((p) => `- ${p.name}: R$ ${p.price}`).join('\n');
    return { success: true, products, message: `Aqui estão seus produtos:\n\n${list}` };
  }

  async toolDeleteProduct(workspaceId: string, args: ToolDeleteProductArgs): Promise<ToolResult> {
    const { productId, productName } = args;
    const where: Prisma.ProductWhereInput = { workspaceId };
    if (productId) {
      where.id = productId;
    } else if (productName) {
      where.name = { contains: productName, mode: 'insensitive' };
    }
    const product = await this.prisma.product.findFirst({ where: { ...where, workspaceId } });
    if (!product) return { success: false, error: 'Produto não encontrado.' };

    await this.prisma.$transaction(
      [
        this.prisma.product.updateMany({
          where: { id: product.id, workspaceId },
          data: { active: false },
        }),
        this.prisma.auditLog.create({
          data: {
            workspaceId,
            action: 'USER_DATA_DELETED',
            resource: 'Product',
            resourceId: product.id,
            details: {
              source: 'kloel_tool_delete_product',
              softDelete: true,
              productName: product.name,
            },
          },
        }),
      ],
      { isolationLevel: 'ReadCommitted' },
    );
    return { success: true, message: `Produto "${product.name}" removido com sucesso.` };
  }

  async toolToggleAutopilot(
    workspaceId: string,
    args: ToolToggleAutopilotArgs,
  ): Promise<ToolResult> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const currentSettings = (workspace?.providerSettings as Record<string, unknown>) || {};
    if (args.enabled && currentSettings.billingSuspended === true) {
      return {
        success: false,
        enabled: false,
        error: 'Autopilot suspenso: regularize cobrança para ativar.',
      };
    }
    const newSettings = {
      ...currentSettings,
      autopilot: {
        ...((currentSettings.autopilot as Record<string, unknown>) || {}),
        enabled: args.enabled,
      },
      autopilotEnabled: args.enabled,
    };
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { providerSettings: newSettings as Prisma.InputJsonValue },
    });
    return {
      success: true,
      enabled: args.enabled,
      message: args.enabled ? 'Autopilot ativado.' : 'Autopilot desativado.',
    };
  }

  async toolSetBrandVoice(workspaceId: string, args: ToolSetBrandVoiceArgs): Promise<ToolResult> {
    await this.prisma.kloelMemory.upsert({
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
    return { success: true, message: `Tom de voz definido como "${args.tone}"` };
  }

  async toolRememberUserInfo(
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
    if (!normalizedKey || !value) return { success: false, error: 'missing_user_memory_payload' };

    const profileKey = `user_profile:${userId || 'workspace_owner'}`;
    const existing = await this.prisma.kloelMemory.findUnique({
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

    await this.prisma.kloelMemory.upsert({
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
    return { success: true, message: `Memória "${normalizedKey}" salva.` };
  }

  async toolCreateFlow(workspaceId: string, args: ToolCreateFlowArgs): Promise<ToolResult> {
    const nodes = [
      {
        id: 'start',
        type: 'trigger',
        position: { x: 100, y: 100 },
        data: { trigger: args.trigger },
      },
      {
        id: 'msg1',
        type: 'message',
        position: { x: 100, y: 200 },
        data: { message: args.actions?.[0] || 'Olá!' },
      },
    ];
    const edges = [{ id: 'e1', source: 'start', target: 'msg1' }];
    const flow = await this.prisma.flow.create({
      data: {
        workspaceId,
        name: args.name,
        description: `Fluxo criado via chat: ${args.trigger}`,
        nodes,
        edges,
        isActive: true,
      },
    });
    return { success: true, flow, message: `Fluxo "${args.name}" criado com sucesso!` };
  }

  async toolListFlows(workspaceId: string): Promise<ToolResult> {
    const flows = await this.prisma.flow.findMany({
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

  async toolGetDashboardSummary(
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
    const [contacts, messages, flows] = await Promise.all([
      this.prisma.contact.count({ where: { workspaceId, createdAt: { gte: dateFilter } } }),
      this.prisma.message.count({ where: { workspaceId, createdAt: { gte: dateFilter } } }),
      this.prisma.flow.count({ where: { workspaceId, isActive: true } }),
    ]);
    return {
      success: true,
      period,
      stats: { newContacts: contacts, messages, activeFlows: flows },
    };
  }

  async toolCreatePaymentLink(
    workspaceId: string,
    args: { amount: number; description: string; customerName?: string },
  ): Promise<ToolResult> {
    const paymentResult = await this.smartPaymentService.createSmartPayment({
      workspaceId,
      amount: Number(args.amount) || 0,
      productName: args.description,
      customerName: args.customerName || 'Cliente',
      phone: '',
    });
    return { success: true, ...paymentResult };
  }
}
