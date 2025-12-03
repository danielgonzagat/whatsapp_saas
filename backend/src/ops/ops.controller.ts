import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { queueRegistry, queueOptions, connection } from '../queue/queue';
import { Queue } from 'bullmq';
import { QueueHealthService } from '../metrics/queue-health.service';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

@Controller('ops/queues')
@UseGuards(JwtAuthGuard)
@Roles('ADMIN')
export class OpsController {
  constructor(
    private readonly queueHealth: QueueHealthService,
    @InjectRedis() private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async list() {
    return this.queueHealth.getQueuesStatus();
  }

  @Get(':name/dlq')
  async listDlq(@Param('name') name: string, @Query('limit') limit = '20') {
    const dlq = this.getDlq(name);
    const jobs = await dlq.getJobs(['waiting', 'failed'], 0, Number(limit) - 1);
    return jobs.map((job) => ({
      id: job.id,
      name: job.name,
      data: job.data,
      opts: job.opts,
      failedReason: job.failedReason,
      attemptsMade: (job as any).attemptsMade,
      timestamp: job.timestamp,
    }));
  }

  @Post(':name/dlq/retry')
  async retryDlq(@Param('name') name: string, @Body('limit') limit = 10) {
    const main = this.getQueue(name);
    const dlq = this.getDlq(name);
    const jobs = await dlq.getJobs(['waiting', 'failed'], 0, Number(limit) - 1);

    let retried = 0;
    for (const job of jobs) {
      await main.add(job.name || 'default', job.data, job.opts);
      await job.remove();
      retried++;
    }

    return { queue: name, retried };
  }

  @Post(':name/dlq/purge')
  async purgeDlq(@Param('name') name: string) {
    const dlq = this.getDlq(name);
    const counts = await dlq.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'failed',
    );
    await dlq.drain();
    await dlq.clean(0, 1000, 'failed');
    return { queue: name, purged: counts };
  }

  @Get('alerts/webhooks')
  async listWebhookAlerts(@Query('limit') limit = '20') {
    const max = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const rows = await this.redis.lrange('alerts:webhooks', 0, max - 1);
    return rows
      .map((r) => {
        try {
          return JSON.parse(r);
        } catch {
          return { raw: r };
        }
      })
      .filter(Boolean);
  }

  @Post('alerts/webhooks/clear')
  async clearWebhookAlerts() {
    await this.redis.del('alerts:webhooks');
    return { cleared: true };
  }

  @Get('/billing/suspended')
  async listBillingSuspended() {
    const workspaces = await this.prisma.workspace.findMany({
      where: {
        providerSettings: {
          path: ['billingSuspended'],
          equals: true,
        },
      },
      select: { id: true, name: true, providerSettings: true, subscription: true },
    });
    return workspaces.map((ws) => ({
      id: ws.id,
      name: ws.name,
      subscriptionStatus: (ws as any)?.subscription?.status || 'UNKNOWN',
    }));
  }

  private getQueue(name: string) {
    const queue = queueRegistry[name];
    if (!queue) {
      throw new BadRequestException(`Queue not found: ${name}`);
    }
    return queue;
  }

  private getDlq(name: string) {
    const queue = this.getQueue(name);
    return new Queue(`${queue.name}-dlq`, {
      ...queueOptions,
      connection,
    });
  }
}
