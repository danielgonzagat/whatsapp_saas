import { Controller, Get, HttpCode, HttpStatus, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { HealthService } from './health.service';
import { RouteClass } from '../common/throttler/route-class.decorator';
import { WebhookEndpoint } from '../common/decorators/webhook-endpoint.decorator';
import { InternalEndpoint } from '../common/decorators/internal-endpoint.decorator';

/** Health controller. */
@Controller('health')
@RouteClass('read')
export class HealthController {
  constructor(private healthService: HealthService) {}

  /** Liveness probe — public, always 200 if process is up. */
  @Public()
  @Get('liveness')
  @HttpCode(HttpStatus.OK)
  liveness() {
    return {
      status: 'up',
      live: true,
      timestamp: new Date().toISOString(),
    };
  }

  /** Readiness probe — public, returns 200 if all critical deps reachable. */
  @Public()
  @Get('readiness')
  async readiness(@Res({ passthrough: true }) res: Response) {
    const checks = await this.healthService.runReadinessChecks();
    const allUp = checks.every((c) => c.status === 'up');
    if (!allUp) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return {
      status: allUp ? 'up' : 'down',
      ready: allUp,
      checks,
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

  /** Get health. */
  @WebhookEndpoint('External health check endpoint')
  @Get(':workspaceId')
  @UseGuards(JwtAuthGuard)
  async getHealth(@Param('workspaceId') workspaceId: string) {
    return this.healthService.getHealth(workspaceId);
  }
}
