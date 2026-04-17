import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { adminErrors } from '../common/admin-api-errors';
import { AdminProductStateAction } from './dto/update-product-state.dto';
import { getAdminProductDetail, type AdminProductDetail } from './queries/detail-product.query';
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

  async detail(productId: string): Promise<AdminProductDetail> {
    const result = await getAdminProductDetail(this.prisma, productId);
    if (!result) throw adminErrors.userNotFound();
    return result;
  }

  async approve(
    productId: string,
    actorId: string,
    input?: { note?: string; checklist?: string[] },
  ): Promise<void> {
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
        note: input?.note ?? null,
        checklist: input?.checklist ?? [],
      },
    });
  }

  async reject(
    productId: string,
    actorId: string,
    input: { reason: string; checklist?: string[] },
  ): Promise<void> {
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
        reason: input.reason,
        checklist: input.checklist ?? [],
      },
    });
  }

  async updateState(
    productId: string,
    actorId: string,
    action: AdminProductStateAction,
    note?: string,
  ): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, workspaceId: true, status: true, name: true, active: true },
    });
    if (!product) throw adminErrors.userNotFound();

    const nextData =
      action === AdminProductStateAction.PAUSE
        ? { active: false, status: 'PAUSED' }
        : { active: true, status: 'APPROVED' };

    await this.prisma.product.update({
      where: { id: productId },
      data: nextData,
    });

    await this.audit.append({
      adminUserId: actorId,
      action:
        action === AdminProductStateAction.PAUSE
          ? 'admin.products.paused'
          : 'admin.products.reactivated',
      entityType: 'Product',
      entityId: productId,
      details: {
        workspaceId: product.workspaceId,
        previousStatus: product.status,
        previousActive: product.active,
        name: product.name,
        note: note ?? null,
      },
    });
  }
}

export type { AdminProductRow, ListProductsResult, AdminProductDetail };
