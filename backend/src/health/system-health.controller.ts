import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../auth/public.decorator';
import { BullMQHealthIndicator } from './indicators/bullmq.health-indicator';
import { DatabaseBackupHealthIndicator } from './indicators/database-backup.health-indicator';
import { EmailHealthIndicator } from './indicators/email.health-indicator';
import { PrismaHealthIndicator } from './indicators/prisma.health-indicator';
import { RedisHealthIndicator } from './indicators/redis.health-indicator';
import { StripeHealthIndicator } from './indicators/stripe.health-indicator';
import { SystemHealthService } from './system-health.service';

@ApiTags('System')
@Controller('health')
export class SystemHealthController {
  constructor(
    private readonly health: SystemHealthService,
    private readonly healthCheckService: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly redisIndicator: RedisHealthIndicator,
    private readonly bullmqIndicator: BullMQHealthIndicator,
    private readonly backupIndicator: DatabaseBackupHealthIndicator,
    private readonly emailIndicator: EmailHealthIndicator,
    private readonly stripeIndicator: StripeHealthIndicator,
  ) {}

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
  @Get('readiness')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe — DB, Redis, BullMQ, email, Stripe, backup' })
  async readiness(): Promise<HealthCheckResult> {
    return this.healthCheckService.check([
      () => this.prismaIndicator.isHealthy('database'),
      () => this.redisIndicator.isHealthy('redis'),
      () => this.bullmqIndicator.isHealthy('bullmq'),
      () => this.emailIndicator.isHealthy('email'),
      () => this.stripeIndicator.isHealthy('stripe'),
      () => this.backupIndicator.isHealthy('backup'),
    ]);
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
