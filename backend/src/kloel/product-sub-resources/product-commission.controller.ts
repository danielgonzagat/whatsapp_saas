import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
  Optional,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../../common/interfaces';
import { PartnershipsService } from '../../partnerships/partnerships.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OpsAlertService } from '../../observability/ops-alert.service';
import {
  COMMISSION_PARTNER_INVITE_ROLES,
  buildCommissionPayload,
  ensureNoDuplicateCommission,
} from './helpers/affiliate.helpers';
import {
  LooseObject,
  ensureWorkspaceProductAccess,
  getWorkspaceId,
} from './helpers/common.helpers';

/** Product commission controller. */
@Controller('products/:productId/commissions')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductCommissionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly partnershipsService: PartnershipsService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  /** List. */
  @Get()
  async list(@Param('productId') productId: string, @Request() req: AuthenticatedRequest) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    return this.prisma.productCommission.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Create. */
  @Post()
  async create(
    @Param('productId') productId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    const workspaceId = getWorkspaceId(req);
    await ensureWorkspaceProductAccess(this.prisma, productId, workspaceId);

    const payload = buildCommissionPayload(body);
    await ensureNoDuplicateCommission(this.prisma, productId, payload);

    const commission = await this.prisma.productCommission.create({
      data: {
        productId,
        ...payload,
      },
    });

    if (payload.agentEmail && COMMISSION_PARTNER_INVITE_ROLES.has(payload.role)) {
      try {
        await this.partnershipsService.createPartner(workspaceId, {
          partnerName: payload.agentName || payload.agentEmail,
          partnerEmail: payload.agentEmail,
          type: payload.role,
          commissionRate: payload.percentage,
        });
      } catch (error) {
        void this.opsAlert?.alertOnCriticalError(
          error,
          'ProductCommissionController.createPartner',
        );
        await this.prisma.productCommission
          .delete({ where: { id: commission.id } })
          .catch(() => undefined);
        throw error;
      }
    }

    return commission;
  }

  /** Update. */
  @Put(':commissionId')
  async update(
    @Param('productId') productId: string,
    @Param('commissionId') commissionId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const commission = await this.prisma.productCommission.findFirst({
      where: { id: commissionId, productId },
    });
    if (!commission) {
      throw new NotFoundException('Comissão não encontrada');
    }

    const payload = buildCommissionPayload(body, commission);
    await ensureNoDuplicateCommission(this.prisma, productId, payload, commissionId);

    return this.prisma.productCommission.update({
      where: { id: commissionId },
      data: payload,
    });
  }

  /** Delete. */
  @Delete(':commissionId')
  async delete(
    @Param('productId') productId: string,
    @Param('commissionId') commissionId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const commission = await this.prisma.productCommission.findFirst({
      where: { id: commissionId, productId },
    });
    if (!commission) {
      throw new NotFoundException('Comissão não encontrada');
    }

    await this.auditService.log({
      workspaceId: getWorkspaceId(req),
      action: 'DELETE_RECORD',
      resource: 'ProductCommission',
      resourceId: commissionId,
      details: { deletedBy: 'user', productId },
    });
    return this.prisma.productCommission.delete({
      where: { id: commissionId },
    });
  }
}
