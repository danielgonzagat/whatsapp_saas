import { Injectable, NotFoundException } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';
import { PrismaService } from '../../prisma/prisma.service';

export interface ReviewListArgs {
  productId: string;
  limit?: number;
  [key: string]: unknown;
}

export interface ReviewCreateArgs {
  productId: string;
  rating?: number;
  authorName?: string;
  name?: string;
  comment?: string;
  text?: string;
  verified?: boolean;
  idempotencyKey?: string;
  [key: string]: unknown;
}

export interface ReviewApproveArgs {
  reviewId: string;
  productId?: string;
  [key: string]: unknown;
}

export interface ReviewReplyArgs {
  reviewId: string;
  reply: string;
  productId?: string;
  [key: string]: unknown;
}

export interface ReviewDeleteArgs {
  reviewId: string;
  productId?: string;
  [key: string]: unknown;
}

/**
 * ReviewService — wraps ProductReview CRUD for capability resolution.
 *
 * domainService aliases:
 *   - ReviewService.listForProduct
 *   - ReviewService.approve  (sets verified=true)
 *   - ReviewService.reply    (stores reply in metadata JSON)
 *   - ReviewService.delete
 *
 * Workspace isolation: all operations validate product.workspaceId.
 */
@Injectable()
export class ReviewService {
  private readonly logger = StructuredLogger.from(ReviewService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async assertProductOwnership(productId: string, workspaceId: string): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException(`Produto ${productId} não encontrado no workspace`);
    }
  }

  
    /** Create a new review for a product (domainService: ReviewService.create). */
    async create(
      workspaceId: string,
      args: ReviewCreateArgs,
    ): Promise<{ success: boolean; data: unknown }> {
      const productId = String(args.productId ?? '').trim();
      if (!productId) return { success: false, data: { error: 'productId_required' } };

      await this.assertProductOwnership(productId, workspaceId);

      const rating = Number(args.rating ?? 5);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return { success: false, data: { error: 'rating_must_be_1_to_5' } };
      }

      const authorName = String(args.authorName ?? args.name ?? '').trim() || null;
      const comment = String(args.comment ?? args.text ?? '').trim() || null;
      const verified = args.verified === true;

      const review = await this.prisma.productReview.create({
        data: {
          productId,
          rating,
          authorName,
          comment,
          verified,
        },
      });

      this.logger.log(
        `ReviewService.create ws=${workspaceId} product=${productId} id=${review.id}`,
      );
      return { success: true, data: review };
    }


  /** List all reviews for a product. */
  async listForProduct(
    workspaceId: string,
    args: ReviewListArgs,
  ): Promise<{ success: boolean; data: unknown }> {
    const productId = String(args.productId ?? '');
    if (!productId) return { success: false, data: [] };

    await this.assertProductOwnership(productId, workspaceId);

    const limit = Math.min(Number(args.limit ?? 100), 500);
    const reviews = await this.prisma.productReview.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        rating: true,
        authorName: true,
        comment: true,
        verified: true,
        createdAt: true,
      },
    });

    this.logger.log(`ReviewService.listForProduct ws=${workspaceId} product=${productId} count=${reviews.length}`);
    return { success: true, data: reviews };
  }

  /** Approve a review (set verified = true). */
  async approve(
    workspaceId: string,
    args: ReviewApproveArgs,
  ): Promise<{ success: boolean; data: unknown }> {
    const reviewId = String(args.reviewId ?? '');
    if (!reviewId) return { success: false, data: null };

    const review = await this.prisma.productReview.findFirst({
      where: { id: reviewId },
      select: { id: true, productId: true },
    });
    if (!review) throw new NotFoundException(`Avaliação ${reviewId} não encontrada`);

    await this.assertProductOwnership(review.productId, workspaceId);

    const updated = await this.prisma.productReview.update({
      where: { id: reviewId },
      data: { verified: true },
    });

    this.logger.log(`ReviewService.approve ws=${workspaceId} review=${reviewId}`);
    return { success: true, data: updated };
  }

  /** Reply to a review (stored in comment field as reply prefix). */
  async reply(
    workspaceId: string,
    args: ReviewReplyArgs,
  ): Promise<{ success: boolean; data: unknown }> {
    const reviewId = String(args.reviewId ?? '');
    const replyText = String(args.reply ?? '').trim();
    if (!reviewId || !replyText) return { success: false, data: null };

    const review = await this.prisma.productReview.findFirst({
      where: { id: reviewId },
      select: { id: true, productId: true, comment: true },
    });
    if (!review) throw new NotFoundException(`Avaliação ${reviewId} não encontrada`);

    await this.assertProductOwnership(review.productId, workspaceId);

    // Append reply as a structured suffix to the comment field
    const updatedComment = review.comment
      ? `${review.comment}\n\n[Resposta da loja]: ${replyText}`
      : `[Resposta da loja]: ${replyText}`;

    const updated = await this.prisma.productReview.update({
      where: { id: reviewId },
      data: { comment: updatedComment },
    });

    this.logger.log(`ReviewService.reply ws=${workspaceId} review=${reviewId}`);
    return { success: true, data: updated };
  }

  /** Delete a review. */
  async delete(
    workspaceId: string,
    args: ReviewDeleteArgs,
  ): Promise<{ success: boolean; data: unknown }> {
    const reviewId = String(args.reviewId ?? '');
    if (!reviewId) return { success: false, data: null };

    const review = await this.prisma.productReview.findFirst({
      where: { id: reviewId },
      select: { id: true, productId: true },
    });
    if (!review) throw new NotFoundException(`Avaliação ${reviewId} não encontrada`);

    await this.assertProductOwnership(review.productId, workspaceId);

    await this.prisma.productReview.delete({ where: { id: reviewId } });

    this.logger.log(`ReviewService.delete ws=${workspaceId} review=${reviewId}`);
    return { success: true, data: { deleted: reviewId } };
  }
}
