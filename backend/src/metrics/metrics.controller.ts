import {
  Controller,
  Get,
  Res,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { MetricsService } from './metrics.service';
import { Public } from '../auth/public.decorator';
import { QueueHealthService } from './queue-health.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly queueHealth: QueueHealthService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get()
  async getMetrics(@Req() req: any, @Res() res: Response) {
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

  @Get('queues')
  async getQueues(@Req() req: any) {
    this.validateAccess(req);
    return this.queueHealth.getQueuesStatus();
  }

  /**
   * Protege métricas se METRICS_TOKEN estiver configurado.
   */
  private validateAccess(req: any) {
    const expected = process.env.METRICS_TOKEN;
    if (!expected) {
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('METRICS_TOKEN not configured');
      }
      return;
    }

    const header = req.headers['authorization'] || '';
    const alt = req.headers['x-metrics-token'];
    const bearer =
      typeof header === 'string' && header.startsWith('Bearer ')
        ? header.slice(7)
        : undefined;
    const provided =
      (typeof alt === 'string' && alt) ||
      bearer ||
      (typeof req.query?.token === 'string' ? req.query.token : undefined);

    if (provided !== expected) {
      throw new UnauthorizedException('Invalid metrics token');
    }
  }
}
