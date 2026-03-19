import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SystemHealthService } from './system-health.service';
import { Public } from '../auth/public.decorator';

@ApiTags('System')
@Controller('health')
export class SystemHealthController {
  constructor(private health: SystemHealthService) {}

  @Public()
  @Get('system')
  @ApiOperation({ summary: 'Check consolidated system health status' })
  async check() {
    return this.health.check();
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness alias for orchestration/liveness tools' })
  async ready() {
    return this.health.check();
  }
}
