import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { ProductCategoriesService } from './product-categories.service';

@ApiTags('Product Categories')
@ApiBearerAuth()
@UseGuards(ThrottlerGuard)
@Controller('product-categories')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Throttle({ default: { limit: 30, ttl: 60000 } })
export class ProductCategoriesController {
  constructor(private readonly service: ProductCategoriesService) {}

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    const workspaceId = resolveWorkspaceId(req);
    return this.service.listByWorkspace(workspaceId);
  }
}
