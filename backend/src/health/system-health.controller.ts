import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { SystemHealthService } from './system-health.service';

@ApiTags('System')
@Controller('health')
export class SystemHealthController {
  constructor(private health: SystemHealthService) {}

  /**
   * Liveness: "is the process alive?" — no dependencies, always cheap.
   * Orchestrators use this to decide whether to restart the container.
   */
  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe — process is alive' })
  liveness() {
    return this.health.liveness();
  }

  /**
   * Readiness: "should this instance receive traffic?" — DB + Redis only.
   * Orchestrators use this to decide whether to route requests here.
   */
  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — DB and Redis available' })
  async ready() {
    return this.health.readiness();
  }

  /**
   * Full system health: deep check including all integrations. Used by
   * operator dashboards and monitoring tools, NOT by orchestrators.
   */
  @Public()
  @Get('system')
  @ApiOperation({ summary: 'Deep system health with all integration details' })
  async check() {
    return this.health.check();
  }
}
