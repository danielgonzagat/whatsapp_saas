import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { normalizeStorageUrlForRequest } from '../common/storage/public-storage-url.util';
import { DashboardService } from './dashboard.service';
import { HomeQueryDto } from './dto/home-query.dto';

/** Dashboard controller. */
@Controller('dashboard')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /** Get stats. */
  @Get('stats')
  async getStats(@Req() req: AuthenticatedRequest, @Query('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.dashboardService.getStats(effectiveWorkspaceId);
  }

  /** Get home. */
  @Get('home')
  async getHome(@Req() req: AuthenticatedRequest, @Query() query: HomeQueryDto) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, query.workspaceId);
    const snapshot = await this.dashboardService.getHomeSnapshot(effectiveWorkspaceId, {
      period: query.period,
      startDate: query.startDate,
      endDate: query.endDate,
    });

    return {
      ...snapshot,
      products: snapshot.products.map((product) => ({
        ...product,
        imageUrl: normalizeStorageUrlForRequest(product.imageUrl, req) || null,
      })),
    };
  }
}
