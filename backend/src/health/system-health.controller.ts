import { Controller, Get, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../admin/auth/guards/admin-auth.guard';
import { Public } from '../auth/public.decorator';
import { SystemHealthService } from './system-health.service';
import { RouteClass } from '../common/throttler/route-class.decorator';
import { WebhookEndpoint } from '../common/decorators/webhook-endpoint.decorator';

@ApiTags('System')
@Controller('health')
@RouteClass('read')
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
  @ApiOperation({ summary: 'System health — production runtime and queue health' })
  async system() {
    return this.health.check();
  }

  @UseGuards(AdminAuthGuard)
  @WebhookEndpoint('External deep health check')
  @Get('deep')
  @ApiOperation({
    summary: 'Deep diagnostic — admin-only with queue depths and performance metrics',
  })
  async deep() {
    return this.health.deepDiagnostic();
  }
}
