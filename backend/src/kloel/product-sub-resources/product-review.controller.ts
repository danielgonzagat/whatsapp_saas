import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../../common/interfaces';
import { PrismaService } from '../../prisma/prisma.service';
import {
  LooseObject,
  ensureWorkspaceProductAccess,
  getWorkspaceId,
  normalizeOptionalText,
  parseNumber,
} from './helpers/common.helpers';
import { serializeReview } from './helpers/plan.helpers';

/** Product review controller. */
@Controller('products/:productId/reviews')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductReviewController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** List. */
  @Get()
  async list(@Param('productId') productId: string, @Request() req: AuthenticatedRequest) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const reviews = await this.prisma.productReview.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return reviews.map(serializeReview);
  }

  /** Create. */
  @Post()
  async create(
    @Param('productId') productId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const rating = parseNumber(body.rating) ?? 5;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('A nota da avaliação precisa ficar entre 1 e 5');
    }

    const authorName = normalizeOptionalText(body.authorName ?? body.name);
    if (!authorName) {
      throw new BadRequestException('Nome do autor da avaliação é obrigatório');
    }

    const comment = normalizeOptionalText(body.comment ?? body.text);

    const created = await this.prisma.productReview.create({
      data: {
        productId,
        rating,
        comment,
        authorName,
        verified: (body.verified ?? false) as boolean,
      },
    });

    return serializeReview(created);
  }

  /** Delete. */
  @Delete(':reviewId')
  async delete(
    @Param('productId') productId: string,
    @Param('reviewId') reviewId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const review = await this.prisma.productReview.findFirst({
      where: { id: reviewId, productId },
    });
    if (!review) {
      throw new NotFoundException('Avaliação não encontrada');
    }

    await this.auditService.log({
      workspaceId: getWorkspaceId(req),
      action: 'DELETE_RECORD',
      resource: 'ProductReview',
      resourceId: reviewId,
      details: { deletedBy: 'user', productId },
    });
    return this.prisma.productReview.delete({ where: { id: reviewId } });
  }
}
