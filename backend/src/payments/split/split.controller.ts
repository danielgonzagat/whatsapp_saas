import { Body, Controller, Logger, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';

import { SplitPreviewDto } from './dto/split-preview.dto';
import { calculateSplit } from './split.engine';
import type { SplitInput } from './split.types';

function dtoToSplitInput(dto: SplitPreviewDto): SplitInput {
  return {
    buyerPaidCents: BigInt(dto.buyerPaidCents),
    saleValueCents: BigInt(dto.saleValueCents),
    interestCents: BigInt(dto.interestCents),
    marketplaceFeeCents: BigInt(dto.marketplaceFeeCents),
    supplier: dto.supplier
      ? { accountId: dto.supplier.accountId, amountCents: BigInt(dto.supplier.amountCents) }
      : undefined,
    affiliate: dto.affiliate
      ? { accountId: dto.affiliate.accountId, percentBp: dto.affiliate.percentBp }
      : undefined,
    coproducer: dto.coproducer
      ? { accountId: dto.coproducer.accountId, percentBp: dto.coproducer.percentBp }
      : undefined,
    manager: dto.manager
      ? { accountId: dto.manager.accountId, percentBp: dto.manager.percentBp }
      : undefined,
    seller: { accountId: dto.seller.accountId },
  };
}

/** Split controller. */
@Controller('payments/split')
@UseGuards(JwtAuthGuard, WorkspaceGuard, ThrottlerGuard)
@Throttle({ default: { limit: 5, ttl: 60000 } })
export class SplitController {
  private readonly logger = new Logger(SplitController.name);

  /** Preview split. */
  @Post(':workspaceId/preview')
  preview(@Param('workspaceId') workspaceId: string, @Body() dto: SplitPreviewDto) {
    const input = dtoToSplitInput(dto);
    const result = calculateSplit(input, workspaceId);

    this.logger.log({
      operation: 'splitPreviewRequested',
      workspaceId,
      saleValueCents: input.saleValueCents.toString(),
    });

    return {
      kloelTotalCents: result.kloelTotalCents.toString(),
      splits: result.splits.map((line) => ({
        accountId: line.accountId,
        role: line.role,
        amountCents: line.amountCents.toString(),
      })),
      residueCents: result.residueCents.toString(),
    };
  }
}
