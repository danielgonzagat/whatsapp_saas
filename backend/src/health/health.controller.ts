import { Controller, Get, HttpCode, HttpStatus, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { HealthService } from './health.service';
import { SystemHealthService } from './system-health.service';
import { RouteClass } from '../common/throttler/route-class.decorator';
import { WebhookEndpoint } from '../common/decorators/webhook-endpoint.decorator';
import { InternalEndpoint } from '../common/decorators/internal-endpoint.decorator';

/** Health controller. */
@Controller('health')
@RouteClass('read')
export class HealthController {
  constructor(
    private healthService: HealthService,
    private systemHealthService: SystemHealthService,
  ) {}

  /** Liveness probe — public, always 200 if process is up. */
  @Public()
  @Get('liveness')
  @HttpCode(HttpStatus.OK)
  liveness() {
    return {
      status: 'UP',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  /** Readiness probe — public, returns 200 if all critical deps reachable. */
  @Public()
  @Get('readiness')
  async readiness(@Res({ passthrough: true }) res: Response) {
    const checks = await this.healthService.runReadinessChecks();
    const failures = checks.filter((c) => c.status !== 'up').map((c) => c.name);
    const allUp = failures.length === 0;
    if (!allUp) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    const details = Object.fromEntries(
      checks.map((check) => [
        check.name,
        {
          ...check,
          status: check.status === 'up' ? 'UP' : 'DOWN',
        },
      ]),
    );

    return {
      status: allUp ? 'UP' : 'DOWN',
      ready: allUp,
      failures,
      details,
      ...(allUp ? {} : { message: `Dependencies down: ${failures.join(', ')}` }),
      timestamp: new Date().toISOString(),
    };
  }

  /** Deep diagnostic — admin only, includes detailed metrics. */
  @InternalEndpoint('health deep diagnostic')
  @Get('deep')
  @UseGuards(JwtAuthGuard)
  async deep() {
    return this.healthService.runDeepDiagnostic();
  }

  /** System health — public runtime dependencies and queue state. */
  @Public()
  @Get('system')
  async system() {
    return this.systemHealthService.check();
  }

  /** Get health. */
  @WebhookEndpoint('External health check endpoint')
  @Get(':workspaceId')
  @UseGuards(JwtAuthGuard)
  async getHealth(@Param('workspaceId') workspaceId: string) {
    return this.healthService.getHealth(workspaceId);
  }
}
