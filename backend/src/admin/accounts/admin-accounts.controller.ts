import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminAction, AdminModule } from '@prisma/client';
import { Public } from '../../auth/public.decorator';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import type { AuthenticatedAdmin } from '../auth/admin-token.types';
import { AdminAccountsService } from './admin-accounts.service';
import { ApproveKycDto } from './dto/approve-kyc.dto';
import { BulkUpdateAccountStateDto } from './dto/bulk-update-account-state.dto';
import { ListAccountsQueryDto } from './dto/list-accounts.dto';
import { RejectKycDto } from './dto/reject-kyc.dto';
import { ResetAccountPasswordDto } from './dto/reset-account-password.dto';
import { UpdateAccountStateDto } from './dto/update-account-state.dto';
import { RouteClass } from '../../common/throttler/route-class.decorator';

/** Admin accounts controller. */
@Public()
@Controller('admin/accounts')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
@RouteClass('mutate')
export class AdminAccountsController {
  // audit.append is centralized in AdminAccountsService for mutating admin account operations.
  constructor(private readonly accounts: AdminAccountsService) {}

  /** List. */
  @Get()
  @RequireAdminPermission(AdminModule.CONTAS, AdminAction.VIEW)
  async list(@Query() query: ListAccountsQueryDto) {
    return this.accounts.list({
      ...(query.search !== undefined ? { search: query.search } : {}),
      ...(query.kycStatus !== undefined ? { kycStatus: query.kycStatus } : {}),
      ...(query.skip !== undefined ? { skip: query.skip } : {}),
      ...(query.take !== undefined ? { take: query.take } : {}),
    });
  }

  /** Kyc queue. */
  @Get('kyc/queue')
  @RequireAdminPermission(AdminModule.CONTAS, AdminAction.VIEW)
  async kycQueue() {
    return this.accounts.kycQueue();
  }

  /** Detail. */
  @Get(':workspaceId')
  @RequireAdminPermission(AdminModule.CONTAS, AdminAction.VIEW)
  async detail(@Param('workspaceId') workspaceId: string) {
    return this.accounts.detail(workspaceId);
  }

  /** Bulk update state. */
  @Post('bulk/state')
  @RequireAdminPermission(AdminModule.CONTAS, AdminAction.EDIT)
  async bulkUpdateState(
    @Body() dto: BulkUpdateAccountStateDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.accounts.bulkUpdateState(dto.workspaceIds, admin.id, dto.action, {
      ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
      ...(dto.frozenBalanceInCents !== undefined
        ? { frozenBalanceInCents: dto.frozenBalanceInCents }
        : {}),
    });
  }

  /** Update state. */
  @Post(':workspaceId/state')
  @RequireAdminPermission(AdminModule.CONTAS, AdminAction.EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateState(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: UpdateAccountStateDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    await this.accounts.updateState(workspaceId, admin.id, dto.action, {
      ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
      ...(dto.frozenBalanceInCents !== undefined
        ? { frozenBalanceInCents: dto.frozenBalanceInCents }
        : {}),
    });
  }

  /** Reset password. */
  @Post(':workspaceId/reset-password')
  @RequireAdminPermission(AdminModule.CONTAS, AdminAction.EDIT)
  async resetPassword(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: ResetAccountPasswordDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.accounts.resetOwnerPassword(workspaceId, admin.id, dto.temporaryPassword);
  }

  /** Impersonate owner. */
  @Post(':workspaceId/impersonate')
  @RequireAdminPermission(AdminModule.CONTAS, AdminAction.EDIT)
  async impersonateOwner(
    @Param('workspaceId') workspaceId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.accounts.impersonateOwner(workspaceId, admin.id, admin.role);
  }

  /** Approve kyc. */
  @Post('agents/:agentId/kyc/approve')
  @RequireAdminPermission(AdminModule.CONTAS, AdminAction.EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  async approveKyc(
    @Param('agentId') agentId: string,
    @Body() dto: ApproveKycDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    await this.accounts.approveKyc(agentId, admin.id, dto.note);
  }

  /** Reject kyc. */
  @Post('agents/:agentId/kyc/reject')
  @RequireAdminPermission(AdminModule.CONTAS, AdminAction.EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  async rejectKyc(
    @Param('agentId') agentId: string,
    @Body() dto: RejectKycDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    await this.accounts.rejectKyc(agentId, admin.id, dto.reason);
  }

  /** Reverify kyc. */
  @Post('agents/:agentId/kyc/reverify')
  @RequireAdminPermission(AdminModule.CONTAS, AdminAction.EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  async reverifyKyc(
    @Param('agentId') agentId: string,
    @Body() dto: RejectKycDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    await this.accounts.reverifyKyc(agentId, admin.id, dto.reason);
  }
}
