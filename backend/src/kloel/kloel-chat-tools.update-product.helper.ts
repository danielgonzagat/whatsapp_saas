import type { PrismaService } from '../prisma/prisma.service';
import type { ProductService, UpdateProductDto } from '../products/product.service';
import type { ToolResult } from './kloel-chat-tools.agent-runtime.helpers';

export async function runUpdateProduct(
  prisma: PrismaService,
  productService: ProductService,
  workspaceId: string,
  args: {
    productId?: string;
    productName?: string;
    actorId?: unknown;
    name?: string;
    price?: number;
    description?: string;
    active?: boolean;
    imageUrl?: string;
    category?: string;
    format?: string;
    tags?: string[];
    warrantyDays?: number;
    salesPageUrl?: string;
    thankyouUrl?: string;
    thankyouPixUrl?: string;
    thankyouBoletoUrl?: string;
    reclameAquiUrl?: string;
    supportEmail?: string;
    affiliateEnabled?: boolean;
    commissionPercent?: number;
  },
): Promise<ToolResult> {
  let productId = args.productId || '';
  if (!productId && args.productName) {
    const p = await prisma.product.findFirst({
      where: { workspaceId, name: { contains: args.productName, mode: 'insensitive' } },
      select: { id: true },
    });
    productId = p?.id || '';
  }
  if (!productId) {
    return { success: false, error: 'productId_required' };
  }

  const updateData: UpdateProductDto = {};
  const { productId: _pid, productName: _pname, actorId: _actorId, ...fields } = args;
  if (fields.name !== undefined) {
    updateData.name = fields.name;
  }
  if (fields.price !== undefined) {
    updateData.price = fields.price;
  }
  if (fields.description !== undefined) {
    updateData.description = fields.description;
  }
  if (fields.active !== undefined) {
    updateData.active = fields.active;
  }
  if (fields.imageUrl !== undefined) {
    updateData.imageUrl = fields.imageUrl;
  }
  if (fields.category !== undefined) {
    updateData.category = fields.category;
  }
  if (fields.format !== undefined) {
    const format = fields.format.toUpperCase();
    if (format === 'PHYSICAL' || format === 'DIGITAL' || format === 'HYBRID') {
      updateData.format = format;
    }
  }
  if (fields.tags !== undefined) {
    updateData.tags = fields.tags;
  }
  if (fields.warrantyDays !== undefined) {
    updateData.warrantyDays = fields.warrantyDays;
  }
  if (fields.salesPageUrl !== undefined) {
    updateData.salesPageUrl = fields.salesPageUrl;
  }
  if (fields.thankyouUrl !== undefined) {
    updateData.thankyouUrl = fields.thankyouUrl;
  }
  if (fields.thankyouPixUrl !== undefined) {
    updateData.thankyouPixUrl = fields.thankyouPixUrl;
  }
  if (fields.thankyouBoletoUrl !== undefined) {
    updateData.thankyouBoletoUrl = fields.thankyouBoletoUrl;
  }
  if (fields.reclameAquiUrl !== undefined) {
    updateData.reclameAquiUrl = fields.reclameAquiUrl;
  }
  if (fields.supportEmail !== undefined) {
    updateData.supportEmail = fields.supportEmail;
  }
  if (fields.affiliateEnabled !== undefined) {
    updateData.affiliateEnabled = fields.affiliateEnabled;
  }
  if (fields.commissionPercent !== undefined) {
    updateData.commissionPercent = fields.commissionPercent;
  }
  if (Object.keys(updateData).length === 0) {
    return { success: false, error: 'no_fields_to_update' };
  }

  const actorId =
    typeof args.actorId === 'string' && args.actorId.trim() ? args.actorId : 'kloel-chat';
  try {
    const result = await productService.update(workspaceId, productId, updateData, { id: actorId });
    return {
      success: result.success,
      ...(result.product !== undefined ? { product: result.product } : {}),
      ...(result.message !== undefined ? { message: result.message } : {}),
    };
  } catch {
    return { success: false, error: 'product_not_found' };
  }
}
