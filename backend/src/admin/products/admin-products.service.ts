import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { adminErrors } from '../common/admin-api-errors';
import {
  listAdminProducts,
  type AdminProductRow,
  type ListProductsInput,
  type ListProductsResult,
} from './queries/list-products.query';

@Injectable()
export class AdminProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  async list(input: ListProductsInput): Promise<ListProductsResult> {
    return listAdminProducts(this.prisma, input);
  }

  async approve(productId: string, actorId: string, note?: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, workspaceId: true, status: true, name: true },
    });
    if (!product) throw adminErrors.userNotFound();

    await this.prisma.product.update({
      where: { id: productId },
      data: { status: 'APPROVED', active: true },
    });

    await this.audit.append({
      adminUserId: actorId,
      action: 'admin.products.approved',
      entityType: 'Product',
      entityId: productId,
      details: {
        workspaceId: product.workspaceId,
        previousStatus: product.status,
        name: product.name,
        note: note ?? null,
      },
    });
  }

  async reject(productId: string, actorId: string, reason: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, workspaceId: true, status: true, name: true },
    });
    if (!product) throw adminErrors.userNotFound();

    await this.prisma.product.update({
      where: { id: productId },
      data: { status: 'REJECTED', active: false },
    });

    await this.audit.append({
      adminUserId: actorId,
      action: 'admin.products.rejected',
      entityType: 'Product',
      entityId: productId,
      details: {
        workspaceId: product.workspaceId,
        previousStatus: product.status,
        name: product.name,
        reason,
      },
    });
  }
}

export type { AdminProductRow, ListProductsResult };
