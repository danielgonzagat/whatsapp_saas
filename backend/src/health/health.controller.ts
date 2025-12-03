import { Controller, Get, Param } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private healthService: HealthService) {}

  @Get(':workspaceId')
  async getHealth(@Param('workspaceId') workspaceId: string) {
    return this.healthService.getHealth(workspaceId);
  }
}
