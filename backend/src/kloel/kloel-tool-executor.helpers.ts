import { Prisma } from '@prisma/client';
import { filterLegacyProducts } from '../common/products/legacy-products.util';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ToolResult,
  ToolSaveProductArgs,
  ToolDeleteProductArgs,
  ToolSetBrandVoiceArgs,
  ToolCreateFlowArgs,
} from './kloel-tool-executor.types';

const NON_SLUG_CHAR_RE = /[^a-z0-9_:-]+/g;

/** Safely coerce unknown values to string. */
export function safeStr(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

/** Save a new product for a workspace. */
export async function toolSaveProduct(
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
      active: true,
    },
  });
  return { success: true, product, message: `Produto "${args.name}" cadastrado com sucesso!` };
}

/** List active products for a workspace. */
export async function toolListProducts(
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
  if (products.length === 0) return { success: true, message: 'Nenhum produto cadastrado ainda.' };
  const list = products.map((p) => `- ${p.name}: R$ ${p.price}`).join('\n');
  return { success: true, products, message: `Aqui estão seus produtos:\n\n${list}` };
}

/** Soft-delete a product by id or name. */
export async function toolDeleteProduct(
  prisma: PrismaService,
  workspaceId: string,
  args: ToolDeleteProductArgs,
): Promise<ToolResult> {
  const where: Prisma.ProductWhereInput = { workspaceId };
  if (args.productId) {
    where.id = args.productId;
  } else if (args.productName) {
    where.name = { contains: args.productName, mode: 'insensitive' };
  }
  const product = await prisma.product.findFirst({ where: { ...where, workspaceId } });
  if (!product) return { success: false, error: 'Produto não encontrado.' };
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

/** Set brand voice (tone/personality) for a workspace. */
export async function toolSetBrandVoice(
  prisma: PrismaService,
  workspaceId: string,
  args: ToolSetBrandVoiceArgs,
): Promise<ToolResult> {
  const value = { style: args.tone, personality: args.personality || '' };
  const content = `Tom: ${args.tone}. ${args.personality || ''}`.trim();
  const metadata = { tone: args.tone, personality: args.personality || '' };
  await prisma.kloelMemory.upsert({
    where: { workspaceId_key: { workspaceId, key: 'brandVoice' } },
    update: { value, category: 'preferences', type: 'persona', content, metadata },
    create: {
      workspaceId,
      key: 'brandVoice',
      value,
      category: 'preferences',
      type: 'persona',
      content,
      metadata,
    },
  });
  return { success: true, message: `Tom de voz definido como "${args.tone}"` };
}

/** Remember a key/value fact about the user. */
export async function toolRememberUserInfo(
  prisma: PrismaService,
  workspaceId: string,
  args: { key?: unknown; value?: unknown },
  userId?: string,
): Promise<ToolResult> {
  const normalizedKey = safeStr(args?.key)
    .trim()
    .toLowerCase()
    .replace(NON_SLUG_CHAR_RE, '_')
    .slice(0, 80);
  const value = safeStr(args?.value).trim();
  if (!normalizedKey || !value) return { success: false, error: 'missing_user_memory_payload' };
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
  const content = Object.entries(nextValue)
    .filter(([k]) => !['updatedAt', 'userId'].includes(k))
    .map(([k, v]) => k + ': ' + safeStr(v))
    .join('\n');
  await prisma.kloelMemory.upsert({
    where: { workspaceId_key: { workspaceId, key: profileKey } },
    update: {
      value: nextValue,
      category: 'user_preferences',
      type: 'user_profile',
      content,
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
      content,
      metadata: { userId: userId || null, source: 'remember_user_info' },
    },
  });
  return { success: true, message: `Memória "${normalizedKey}" salva.` };
}

/** Create an automation flow. */
export async function toolCreateFlow(
  prisma: PrismaService,
  workspaceId: string,
  args: ToolCreateFlowArgs,
): Promise<ToolResult> {
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
  const flow = await prisma.flow.create({
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
