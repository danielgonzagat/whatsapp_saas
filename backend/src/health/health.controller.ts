import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HealthService } from './health.service';

/** Health controller. */
@Controller('health')
export class HealthController {
  constructor(private healthService: HealthService) {}

  /** Get health. */
  @Get(':workspaceId')
  @UseGuards(JwtAuthGuard)
  async getHealth(@Param('workspaceId') workspaceId: string) {
    return this.healthService.getHealth(workspaceId);
  }
}
