import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';/**
 * ProductService — Domain service for product operations.
 *
 * This is the shared domain layer that both the UI controllers AND
 * the chat tools should use. Never call Prisma directly for product
 * operations; always go through this service.
 *
 * Responsibilities: validation, tenant isolation, events, audit.
 */
@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);  constructor(private readonly prisma: PrismaService) {}  async create(
    workspaceId: string,
    data: {
      name: string;
      description?: string;
      price: number;
      category?: string;
      imageUrl?: string;
      format?: string;
      active?: boolean;
    },
  ) {
    const product = await this.prisma.product.create({
      data: {
        workspaceId,
        name: data.name,
        description: data.description || null,
        price: data.price || 0,
        currency: 'BRL',
        category: data.category || null,
        imageUrl: data.imageUrl || null,
        format: data.format || 'DIGITAL',
        status: 'DRAFT',
        active: data.active ?? false,
      },
    });

    this.logger.log(`Product created: ${product.id} "${product.name}" in ws ${workspaceId}`);

    return {
      success: true,
      product: {
        id: product.id,
        name: product.name,
        price: product.price,
        active: product.active,
        format: product.format,
      },
    };
  }  async update(
    workspaceId: string,
    productId: string,
    data: Record<string, unknown>,
  ) {
    const existing = await this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
    });
    if (!existing) return { success: false, error: 'product_not_found' };    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = String(data.name);
    if (data.description !== undefined) updateData.description = String(data.description);
    if (data.price !== undefined) updateData.price = Number(data.price);
    if (data.active !== undefined) updateData.active = Boolean(data.active);
    if (data.imageUrl !== undefined) updateData.imageUrl = String(data.imageUrl);
    if (data.format !== undefined) updateData.format = String(data.format);
    if (data.category !== undefined) updateData.category = String(data.category);
    if (data.status !== undefined) updateData.status = String(data.status);

    const product = await this.prisma.product.update({
      where: { id: productId },
      data: updateData,
    });

    this.logger.log(`Product updated: ${product.id} "${product.name}"`);

    return {
      success: true,
      product: {
        id: product.id,
        name: product.name,
        price: product.price,
        active: product.active,
      },
    };
  }  async list(workspaceId: string, opts?: { search?: string; limit?: number }) {
    const products = await this.prisma.product.findMany({
      where: {
        workspaceId,
        ...(opts?.search
          ? { name: { contains: opts.search, mode: 'insensitive' as const } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(opts?.limit ?? 50, 200),
      select: { id: true, name: true, price: true, active: true, imageUrl: true, format: true, createdAt: true },
    });
    return { success: true, products };
  }  async get(workspaceId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
    });
    if (!product) return { success: false, error: 'product_not_found' };
    return { success: true, product };
  }  async delete(workspaceId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
    });
    if (!product) return { success: false, error: 'product_not_found' };
    await this.prisma.product.delete({ where: { id: productId } });
    this.logger.log(`Product deleted: ${productId} "${product.name}"`);
    return { success: true, message: `Produto "${product.name}" removido.` };
  }
}
