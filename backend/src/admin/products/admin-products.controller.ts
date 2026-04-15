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
import { AdminProductsService } from './admin-products.service';
import { ListProductsQueryDto } from './dto/list-products.dto';
import { ApproveProductDto, RejectProductDto } from './dto/moderate-product.dto';

@Public()
@Controller('admin/products')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminProductsController {
  constructor(private readonly products: AdminProductsService) {}

  @Get()
  @RequireAdminPermission(AdminModule.PRODUTOS, AdminAction.VIEW)
  async list(@Query() query: ListProductsQueryDto) {
    return this.products.list({
      search: query.search,
      status: query.status,
      workspaceId: query.workspaceId,
      skip: query.skip,
      take: query.take,
    });
  }

  @Post(':productId/approve')
  @RequireAdminPermission(AdminModule.PRODUTOS, AdminAction.APPROVE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async approve(
    @Param('productId') productId: string,
    @Body() dto: ApproveProductDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    await this.products.approve(productId, admin.id, dto.note);
  }

  @Post(':productId/reject')
  @RequireAdminPermission(AdminModule.PRODUTOS, AdminAction.APPROVE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async reject(
    @Param('productId') productId: string,
    @Body() dto: RejectProductDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    await this.products.reject(productId, admin.id, dto.reason);
  }
}
