import { Prisma } from '@prisma/client';
import { filterLegacyProducts } from '../common/products/legacy-products.util';
import type { StructuredLogger } from '../logging/structured-logger';
import type { PrismaService } from '../prisma/prisma.service';
import type { ToolResult } from './kloel-chat-tools.agent-runtime.helpers';
import type {
  ToolDeleteProductArgs,
  ToolSaveProductArgs,
  ToolToggleAutopilotArgs,
} from './kloel-chat-tools.types';

export async function runSaveProduct(
  prisma: PrismaService,
  workspaceId: string,
  args: ToolSaveProductArgs,
): Promise<ToolResult> {
  const product = await prisma.product.create({
    data: {
      workspaceId,
      name: args.name,
      price: args.price,
      description: args.description || '',
      format: args.format || 'DIGITAL',
      category: args.category || null,
      imageUrl: args.imageUrl || null,
      active: true,
    },
  });
  return { success: true, product, message: `Produto "${args.name}" cadastrado com sucesso!` };
}

export async function runListProducts(
  prisma: PrismaService,
  workspaceId: string,
): Promise<ToolResult> {
  const products = filterLegacyProducts(
    await prisma.product.findMany({
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

export async function runDeleteProduct(
  prisma: PrismaService,
  workspaceId: string,
  args: ToolDeleteProductArgs,
): Promise<ToolResult> {
  const { productId, productName } = args;
  const where: Prisma.ProductWhereInput = { workspaceId };
  if (productId) {
    where.id = productId;
  } else if (productName) {
    where.name = { contains: productName, mode: 'insensitive' };
  }
  const product = await prisma.product.findFirst({ where: { ...where, workspaceId } });
  if (!product) {
    return { success: false, error: 'Produto não encontrado.' };
  }
  await prisma.$transaction(
    [
      prisma.product.updateMany({
        where: { id: product.id, workspaceId },
        data: { active: false },
      }),
      prisma.auditLog.create({
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

export async function runToggleAutopilot(
  prisma: PrismaService,
  logger: Pick<StructuredLogger, 'log'>,
  workspaceId: string,
  args: ToolToggleAutopilotArgs,
): Promise<ToolResult> {
  const settingsSnapshot = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { providerSettings: true },
  });
  const currentSettings = (settingsSnapshot?.providerSettings as Record<string, unknown>) || {};
  logger.log('Autopilot decision', {
    context: 'KloelChatTools.toolToggleAutopilot',
    decision: args.enabled ? 'enable' : 'disable',
    billingSuspended: currentSettings.billingSuspended === true,
  });
  if (args.enabled && currentSettings.billingSuspended === true) {
    return {
      success: false,
      enabled: false,
      error: 'Autopilot suspenso: regularize cobrança para ativar.',
    };
  }
  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = (workspace?.providerSettings as Record<string, unknown>) || {};
    const newSettings = {
      ...settings,
      autopilot: {
        ...((settings.autopilot as Record<string, unknown>) || {}),
        enabled: args.enabled,
      },
      autopilotEnabled: args.enabled,
    };
    await tx.workspace.update({
      where: { id: workspaceId },
      data: { providerSettings: newSettings },
    });
    return {
      success: true,
      enabled: args.enabled,
      message: args.enabled ? 'Autopilot ativado.' : 'Autopilot desativado.',
    };
  });
}
