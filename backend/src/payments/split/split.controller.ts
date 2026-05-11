import { Body, Controller, Logger, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { Idempotent } from '../../common/idempotency.guard';

import { SplitPreviewDto } from './dto/split-preview.dto';
import { calculateSplit } from './split.engine';
import type { SplitInput } from './split.types';
import { RouteClass } from '../../common/throttler/route-class.decorator';

function dtoToSplitInput(dto: SplitPreviewDto): SplitInput {
  const input: SplitInput = {
    buyerPaidCents: BigInt(dto.buyerPaidCents),
    saleValueCents: BigInt(dto.saleValueCents),
    interestCents: BigInt(dto.interestCents),
    marketplaceFeeCents: BigInt(dto.marketplaceFeeCents),
    seller: { accountId: dto.seller.accountId },
  };

  if (dto.supplier) {
    input.supplier = {
      accountId: dto.supplier.accountId,
      amountCents: BigInt(dto.supplier.amountCents),
    };
  }
  if (dto.affiliate) {
    input.affiliate = { accountId: dto.affiliate.accountId, percentBp: dto.affiliate.percentBp };
  }
  if (dto.coproducer) {
    input.coproducer = { accountId: dto.coproducer.accountId, percentBp: dto.coproducer.percentBp };
  }
  if (dto.manager) {
    input.manager = { accountId: dto.manager.accountId, percentBp: dto.manager.percentBp };
  }

  return input;
}

/** Split controller. */
@Controller('payments/split')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('mutate')
export class SplitController {
  private readonly logger = new Logger(SplitController.name);

  /** Preview split. */
  @Post(':workspaceId/preview')
  @Idempotent()
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
