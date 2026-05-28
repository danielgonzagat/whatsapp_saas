import { Controller, Get, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
  @ApiResponse({ status: 200, description: 'Process is alive' })
  liveness() {
    return this.health.liveness();
  }

  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe — process is alive' })
  @ApiResponse({ status: 200, description: 'Process is alive' })
  healthLive() {
    return this.health.liveness();
  }

  @Public()
  @Get('liveness')
  @ApiOperation({ summary: 'Liveness probe — process is alive' })
  @ApiResponse({ status: 200, description: 'Process is alive' })
  healthLiveness() {
    return this.health.liveness();
  }

  @Public()
  @Get('readiness')
  @ApiOperation({
    summary:
      'Readiness probe — Postgres, Redis (BullMQ), Stripe, Meta Cloud API, OpenAI, Anthropic',
  })
  @ApiResponse({ status: 200, description: 'All dependencies are healthy' })
  @ApiResponse({ status: 503, description: 'One or more dependencies are down' })
  async readiness() {
    const result = await this.health.deepReadiness();
    if (result.status === 'DOWN') {
      const failures = Array.isArray(result.failures) ? result.failures : [];
      throw new ServiceUnavailableException({
        ...result,
        message: `Dependencies down: ${failures.join(', ') || 'unknown'}`,
      });
    }
    return result;
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — DB and Redis available' })
  @ApiResponse({ status: 200, description: 'DB and Redis are available' })
  @ApiResponse({ status: 503, description: 'DB or Redis unavailable' })
  async ready() {
    return this.health.readiness();
  }

  @Public()
  @Get('system')
  @ApiOperation({ summary: 'System health — production runtime and queue health' })
  @ApiResponse({ status: 200, description: 'System health status' })
  async system() {
    return this.health.check();
  }

  @UseGuards(AdminAuthGuard)
  @WebhookEndpoint('External deep health check')
  @Get('deep')
  @ApiOperation({
    summary: 'Deep diagnostic — admin-only with queue depths and performance metrics',
  })
  @ApiResponse({ status: 200, description: 'Deep diagnostic results' })
  async deep() {
    return this.health.deepDiagnostic();
  }
}
