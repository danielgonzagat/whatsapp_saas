import type { PrismaService } from '../prisma/prisma.service';
import type { ProductService } from '../products/product.service';
import type {
  ToolDeleteProductArgs,
  ToolSaveProductArgs,
} from './kloel-chat-tools.products.helpers';
import type { ToolResult } from './kloel-chat-tools.agent-runtime.helpers';

type ProductFormat = 'PHYSICAL' | 'DIGITAL' | 'HYBRID';

function resolveActorId(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : 'kloel-chat';
}

function resolveFormat(raw: unknown): ProductFormat | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const normalized = raw.toUpperCase();
  return normalized === 'PHYSICAL' || normalized === 'DIGITAL' || normalized === 'HYBRID'
    ? (normalized as ProductFormat)
    : undefined;
}

/** Look up a product id by name within a workspace (case-insensitive contains). */
export async function findProductIdByName(
  prisma: PrismaService,
  workspaceId: string,
  productName: string,
): Promise<string | undefined> {
  const product = await prisma.product.findFirst({
    where: { workspaceId, name: { contains: productName, mode: 'insensitive' } },
    select: { id: true },
  });
  return typeof product?.id === 'string' ? product.id : undefined;
}

export function runSaveProductViaService(
  productService: ProductService,
  workspaceId: string,
  args: ToolSaveProductArgs,
): Promise<ToolResult> {
  const actorRef = args as ToolSaveProductArgs & { actorId?: unknown };
  const actorId = resolveActorId(actorRef.actorId);
  const format = resolveFormat(args.format);

  return productService.create(
    workspaceId,
    {
      name: args.name,
      price: args.price,
      ...(args.description !== undefined ? { description: args.description } : {}),
      ...(args.category !== undefined ? { category: args.category } : {}),
      ...(args.imageUrl !== undefined ? { imageUrl: args.imageUrl } : {}),
      ...(format !== undefined ? { format } : {}),
    },
    { id: actorId },
  ) as Promise<ToolResult>;
}

export async function runDeleteProductViaService(
  prisma: PrismaService,
  productService: ProductService,
  workspaceId: string,
  args: ToolDeleteProductArgs,
): Promise<ToolResult> {
  const actorId = resolveActorId(args.actorId);
  const directProductId =
    typeof args.productId === 'string' && args.productId.trim()
      ? args.productId.trim()
      : undefined;
  const productName =
    typeof args.productName === 'string' && args.productName.trim()
      ? args.productName.trim()
      : undefined;

  const resolvedProductId =
    directProductId ?? (productName ? await findProductIdByName(prisma, workspaceId, productName) : undefined);
  if (!resolvedProductId) {
    return { success: false, error: 'Produto não encontrado.' };
  }

  return productService.delete(workspaceId, resolvedProductId, {
    id: actorId,
  }) as Promise<ToolResult>;
}

export async function runPublishProductViaService(
  prisma: PrismaService,
  productService: ProductService,
  workspaceId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const productId = typeof args.productId === 'string' ? args.productId.trim() : '';
  const productName = typeof args.productName === 'string' ? args.productName.trim() : '';
  const actorId = resolveActorId(args.actorId);

  let resolvedProductId = productId;
  if (resolvedProductId) {
    const product = await prisma.product.findFirst({
      where: { id: resolvedProductId, workspaceId },
      select: { id: true },
    });
    resolvedProductId = product?.id ?? '';
  } else if (productName) {
    resolvedProductId = (await findProductIdByName(prisma, workspaceId, productName)) ?? '';
  }

  if (!resolvedProductId) {
    return { success: false, error: 'product_not_found' };
  }

  try {
    const result = await productService.publish(workspaceId, resolvedProductId, { id: actorId });
    return {
      success: result.success,
      ...(result.product !== undefined ? { product: result.product } : {}),
      ...(result.message !== undefined ? { message: result.message } : {}),
    };
  } catch {
    return { success: false, error: 'product_not_found' };
  }
}

export async function runUploadProductImage(
  prisma: PrismaService,
  productService: ProductService,
  workspaceId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  let productId = typeof args.productId === 'string' ? args.productId.trim() : '';
  const productName = typeof args.productName === 'string' ? args.productName.trim() : '';
  const imageUrl = typeof args.imageUrl === 'string' ? args.imageUrl : '';
  const actorId = resolveActorId(args.actorId);

  if (!productId && !productName) {
    return { success: false, error: 'Informe o ID ou nome do produto.' };
  }
  if (!imageUrl) {
    return {
      success: false,
      error: 'image_url_required',
      message: 'Envie a URL da imagem ou faça upload pelo chat.',
    };
  }

  if (!productId && productName) {
    productId = (await findProductIdByName(prisma, workspaceId, productName)) ?? '';
  }

  if (!productId) {
    return { success: false, error: 'product_not_found' };
  }

  const result = await productService.setImage(workspaceId, productId, imageUrl, { id: actorId });
  return {
    success: result.success,
    ...(result.product !== undefined ? { product: result.product } : {}),
    ...(result.message !== undefined ? { message: result.message } : {}),
  };
}
