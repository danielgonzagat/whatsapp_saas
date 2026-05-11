import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { ProductCategoriesService } from './product-categories.service';

import { RouteClass } from '../common/throttler/route-class.decorator';
@ApiTags('Product Categories')
@ApiBearerAuth()
@Controller('product-categories')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('mutate')
export class ProductCategoriesController {
  constructor(private readonly service: ProductCategoriesService) {}

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    const workspaceId = resolveWorkspaceId(req);
    return this.service.listByWorkspace(workspaceId);
  }
}
