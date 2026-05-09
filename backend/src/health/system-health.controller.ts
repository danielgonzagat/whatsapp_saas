import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { SystemHealthService } from './system-health.service';

@ApiTags('System')
@Controller('health')
export class SystemHealthController {
  constructor(private readonly health: SystemHealthService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe — process is alive' })
  liveness() {
    return this.health.liveness();
  }

  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe — process is alive' })
  healthLive() {
    return this.health.liveness();
  }

  @Public()
  @Get('liveness')
  @ApiOperation({ summary: 'Liveness probe — process is alive' })
  healthLiveness() {
    return this.health.liveness();
  }

  @Public()
  @Get('readiness')
  @ApiOperation({
    summary:
      'Readiness probe — Postgres, Redis (BullMQ), Stripe, Meta Cloud API, OpenAI, Anthropic',
  })
  async readiness() {
    const result = await this.health.deepReadiness();
    if (result.status === 'DOWN') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — DB and Redis available' })
  async ready() {
    return this.health.readiness();
  }

  @Public()
  @Get('system')
  @ApiOperation({ summary: 'Deep system health with all integration details' })
  async check() {
    return this.health.check();
  }
}
