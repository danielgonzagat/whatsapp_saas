import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAction, AdminModule, PlatformLedgerKind } from '@prisma/client';
import { Public } from '../../auth/public.decorator';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { PlatformWalletService } from './platform-wallet.service';

/**
 * SP-9 v0 read-only endpoints for /carteira. The split engine that
 * actually writes to the ledger lands in a follow-up PR wired into
 * the checkout confirm flow. Until then, the wallet returns zeros
 * for a freshly-seeded currency and the ledger list is empty —
 * which is the correct honest state per CLAUDE.md.
 */
@Public()
@Controller('admin/carteira')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminCarteiraController {
  constructor(private readonly wallet: PlatformWalletService) {}

  @Get('balance')
  @RequireAdminPermission(AdminModule.CARTEIRA, AdminAction.VIEW)
  async balance(@Query('currency') currency?: string) {
    return this.wallet.readBalance(currency ?? 'BRL');
  }

  @Get('ledger')
  @RequireAdminPermission(AdminModule.CARTEIRA, AdminAction.VIEW)
  async ledger(
    @Query('currency') currency?: string,
    @Query('kind') kind?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const parsedKind =
      kind && Object.values(PlatformLedgerKind).includes(kind as PlatformLedgerKind)
        ? (kind as PlatformLedgerKind)
        : undefined;
    return this.wallet.listLedger({
      currency,
      kind: parsedKind,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }
}
