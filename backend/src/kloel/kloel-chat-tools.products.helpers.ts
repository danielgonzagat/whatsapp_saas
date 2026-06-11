import { filterLegacyProducts } from '../common/products/legacy-products.util';
import type { PrismaService } from '../prisma/prisma.service';
import type { ToolResult } from './kloel-chat-tools.agent-runtime.helpers';
export interface ToolSaveProductArgs {
  name: string;
  price: number;
  description?: string;
  format?: string;
  category?: string;
  imageUrl?: string;
  tags?: string[];
  warrantyDays?: number;
  salesPageUrl?: string;
  thankyouUrl?: string;
  thankyouPixUrl?: string;
  thankyouBoletoUrl?: string;
  supportEmail?: string;
  affiliateEnabled?: boolean;
  active?: boolean;
}
export interface ToolDeleteProductArgs {
  productId?: string;
  productName?: string;
  actorId?: string;
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
