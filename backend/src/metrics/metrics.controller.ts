import { Controller, Get, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { safeCompareStrings } from '../common/utils/crypto-compare.util';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from './metrics.service';
import { QueueHealthService } from './queue-health.service';

/** Metrics controller. */
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly queueHealth: QueueHealthService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get()
  async getMetrics(@Req() req: Request, @Res() res: Response) {
    this.validateAccess(req);
    const queueStatus = await this.queueHealth.getQueuesStatus();
    this.metrics.updateQueueMetrics(queueStatus);
    const [suspended, total] = await Promise.all([
      this.prisma.workspace.count({
        where: {
          providerSettings: {
            path: ['billingSuspended'],
            equals: true,
          },
        },
      }),
      this.prisma.workspace.count(),
    ]);
    this.metrics.updateBillingSuspensionMetrics({ suspended, total });
    const data = await this.metrics.getMetrics();
    res.setHeader('Content-Type', 'text/plain');
    res.send(data);
  }

  @Public()
  @Get('queues')
  async getQueues(@Req() req: Request) {
    this.validateAccess(req);
    return this.queueHealth.getQueuesStatus();
  }

  /**
   * Protege métricas se METRICS_TOKEN estiver configurado.
   */
  private validateAccess(req: Request) {
    const expected = process.env.METRICS_TOKEN;
    if (!expected) {
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('METRICS_TOKEN not configured');
      }
      return;
    }

    const header = req.headers.authorization || '';
    const alt = req.headers['x-metrics-token'];
    const bearer =
      typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
    const provided =
      (typeof alt === 'string' && alt) ||
      bearer ||
      (typeof req.query?.token === 'string' ? req.query.token : undefined);

    if (!provided || !safeCompareStrings(provided, expected)) {
      throw new UnauthorizedException('Invalid metrics token');
    }
  }
}
