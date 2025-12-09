import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
  Gauge,
} from 'prom-client';
import type { QueueSummary } from './queue-health.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MetricsService implements OnModuleDestroy {
  private registry: Registry;
  private httpCounter: Counter<string>;
  private httpDuration: Histogram<string>;
  private queueGauge: Gauge<string>;
  private billingGauge: Gauge<string>;
  private metricsInterval?: ReturnType<typeof setInterval>;

  constructor(private readonly prisma: PrismaService) {
    this.registry = new Registry();
    const enableDefaultMetrics =
      process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID;
    if (enableDefaultMetrics) {
      collectDefaultMetrics({ register: this.registry });
    }

    this.httpCounter = new Counter({
      name: 'http_requests_total',
      help: 'Total de requisições HTTP',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });

    this.httpDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duração das requisições HTTP',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    this.queueGauge = new Gauge({
      name: 'queue_jobs',
      help: 'Jobs by queue, pipe and state',
      labelNames: ['queue', 'pipe', 'state'],
      registers: [this.registry],
    });

    this.billingGauge = new Gauge({
      name: 'billing_workspaces_status',
      help: 'Contagem de workspaces por status de billing',
      labelNames: ['status'],
      registers: [this.registry],
    });
  }

  onModuleDestroy() {
    // noop - default metrics doesn't return interval in prom-client v15+
  }

  observeHttp(method: string, route: string, status: number, seconds: number) {
    const labels = { method, route, status: String(status) };
    this.httpCounter.inc(labels);
    this.httpDuration.observe(labels, seconds);
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  updateQueueMetrics(summaries: QueueSummary[]) {
    summaries.forEach((summary) => {
      const states = ['waiting', 'active', 'delayed', 'failed'] as const;
      states.forEach((state) => {
        const main = summary.main[state] || 0;
        const dlq = summary.dlq[state] || 0;
        this.queueGauge.set({ queue: summary.name, pipe: 'main', state }, main);
        this.queueGauge.set({ queue: summary.name, pipe: 'dlq', state }, dlq);
      });
    });
  }

  updateBillingSuspensionMetrics({
    suspended,
    total,
  }: {
    suspended: number;
    total: number;
  }) {
    const active = Math.max(total - suspended, 0);
    this.billingGauge.set({ status: 'suspended' }, suspended);
    this.billingGauge.set({ status: 'active' }, active);
    this.billingGauge.set({ status: 'total' }, total);
  }
}
