import { Injectable, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { StructuredLogger } from '../../logging/structured-logger';
import { OpsAlertService } from '../../observability/ops-alert.service';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeAgentRuntimeText, toInputJsonValue } from './agent-runtime.sanitizer';
import { AgentRuntimePolicyService } from './agent-runtime.policy';

export interface AgentScheduledJobInput {
  workspaceId: string;
  jobId: string;
  title: string;
  prompt: string;
  schedule: {
    kind: 'once' | 'interval';
    runAt?: Date;
    everyMinutes?: number;
  };
  toolScope?: string[];
  enabled?: boolean;
}

@Injectable()
export class AgentRuntimeSchedulerService {
  private readonly logger = StructuredLogger.from(AgentRuntimeSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AgentRuntimePolicyService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  async upsertJob(input: AgentScheduledJobInput): Promise<{ ok: boolean; key: string }> {
    const key = `agent_job:${input.jobId}`;
    const runAt = input.schedule.runAt ?? this.nextRunFor(input.schedule.everyMinutes ?? 60);
    const value = {
      kind: 'agent_job',
      title: sanitizeAgentRuntimeText(input.title, 200),
      prompt: sanitizeAgentRuntimeText(input.prompt, 4000),
      schedule: {
        kind: input.schedule.kind,
        runAt: runAt.toISOString(),
        everyMinutes: input.schedule.everyMinutes ?? null,
      },
      toolScope: input.toolScope ?? [],
      enabled: input.enabled !== false,
      lastRunAt: null,
    };

    await this.prisma.kloelMemory.upsert({
      where: { workspaceId_key: { workspaceId: input.workspaceId, key } },
      update: {
        value: toInputJsonValue(value),
        content: `${value.title}\n${value.prompt}`,
        metadata: { kind: 'agent_job', nextRunAt: runAt.toISOString() } satisfies Prisma.InputJsonObject,
      },
      create: {
        workspaceId: input.workspaceId,
        key,
        category: 'agent_job',
        type: 'scheduled',
        value: toInputJsonValue(value),
        content: `${value.title}\n${value.prompt}`,
        metadata: { kind: 'agent_job', nextRunAt: runAt.toISOString() } satisfies Prisma.InputJsonObject,
      },
    });

    return { ok: true, key };
  }

  async listDueJobs(now = new Date(), limit = 25): Promise<
    Array<{
      id: string;
      workspaceId: string;
      key: string;
      title: string;
      prompt: string;
      toolScope: string[];
    }>
  > {
    const rows = await this.prisma.kloelMemory.findMany({
      where: { category: 'agent_job', type: 'scheduled' },
      orderBy: { updatedAt: 'asc' },
      take: Math.max(1, Math.min(limit, 100)),
      select: { id: true, workspaceId: true, key: true, value: true },
    });

    return rows
      .map((row) => this.parseDueJob(row, now))
      .filter((job): job is NonNullable<ReturnType<typeof this.parseDueJob>> => job !== null);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async auditDueJobs(): Promise<void> {
    try {
      const due = await this.listDueJobs(new Date(), 10);
      for (const job of due) {
        const envelope = this.policy.buildEnvelope({
          workspaceId: job.workspaceId,
          toolName: 'scheduled_agent_job',
          allowedTools: job.toolScope,
        });
        await this.prisma.auditLog.create({
          data: {
            workspaceId: job.workspaceId,
            action: 'KLOEL_AGENT_JOB_DUE',
            resource: 'KloelAgentRuntime',
            resourceId: job.key,
            details: toInputJsonValue({ title: job.title, envelope }) as Prisma.InputJsonObject,
          },
        });
      }
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'AgentRuntimeSchedulerService.auditDueJobs');
      this.logger.warn(`Failed to audit due agent jobs: ${this.messageFor(error)}`);
    }
  }

  private parseDueJob(
    row: { id: string; workspaceId: string; key: string; value: Prisma.JsonValue },
    now: Date,
  ): { id: string; workspaceId: string; key: string; title: string; prompt: string; toolScope: string[] } | null {
    if (!row.value || typeof row.value !== 'object' || Array.isArray(row.value)) {
      return null;
    }
    const value = row.value as Record<string, unknown>;
    const schedule = value.schedule as Record<string, unknown> | undefined;
    const enabled = value.enabled !== false;
    const runAtRaw = typeof schedule?.runAt === 'string' ? schedule.runAt : '';
    const runAt = new Date(runAtRaw);
    if (!enabled || Number.isNaN(runAt.getTime()) || runAt > now) {
      return null;
    }
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      key: row.key,
      title: typeof value.title === 'string' ? value.title : row.key,
      prompt: typeof value.prompt === 'string' ? value.prompt : '',
      toolScope: Array.isArray(value.toolScope)
        ? value.toolScope.filter((tool): tool is string => typeof tool === 'string')
        : [],
    };
  }

  private nextRunFor(everyMinutes: number): Date {
    return new Date(Date.now() + Math.max(1, everyMinutes) * 60_000);
  }

  private messageFor(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
