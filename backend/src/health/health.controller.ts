import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HealthService } from './health.service';
import { RouteClass } from '../common/throttler/route-class.decorator';

/** Health controller. */
@Controller('health')
@RouteClass('read')
export class HealthController {
  constructor(private healthService: HealthService) {}

  /** Get health. */
  @Get(':workspaceId')
  @UseGuards(JwtAuthGuard)
  async getHealth(@Param('workspaceId') workspaceId: string) {
    return this.healthService.getHealth(workspaceId);
  }
}
