import { Injectable, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
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

type AgentScheduledJobValue = {
  kind: 'agent_job';
  title: string;
  prompt: string;
  schedule: {
    kind: 'once' | 'interval';
    runAt: string;
    everyMinutes: number | null;
  };
  toolScope: string[];
  enabled: boolean;
  lastRunAt: string | null;
};

type DueAgentJob = {
  id: string;
  workspaceId: string;
  key: string;
  title: string;
  prompt: string;
  toolScope: string[];
  value: AgentScheduledJobValue;
};

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
    const value: AgentScheduledJobValue = {
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
        metadata: {
          kind: 'agent_job',
          nextRunAt: runAt.toISOString(),
        } satisfies Prisma.InputJsonObject,
      },
      create: {
        workspaceId: input.workspaceId,
        key,
        category: 'agent_job',
        type: 'scheduled',
        value: toInputJsonValue(value),
        content: `${value.title}\n${value.prompt}`,
        metadata: {
          kind: 'agent_job',
          nextRunAt: runAt.toISOString(),
        } satisfies Prisma.InputJsonObject,
      },
    });

    return { ok: true, key };
  }

  async listDueJobs(now = new Date(), limit = 25): Promise<DueAgentJob[]> {
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

  async listJobs(workspaceId: string, limit = 50): Promise<
    Array<{
      key: string;
      title: string;
      prompt: string;
      enabled: boolean;
      nextRunAt: string | null;
      toolScope: string[];
    }>
  > {
    const rows = await this.prisma.kloelMemory.findMany({
      where: { workspaceId, category: 'agent_job', type: 'scheduled' },
      orderBy: { updatedAt: 'desc' },
      take: Math.max(1, Math.min(limit, 100)),
      select: { key: true, value: true },
    });

    return rows
      .map((row) => {
        if (!row.value || typeof row.value !== 'object' || Array.isArray(row.value)) {
          return null;
        }
        const value = row.value as Record<string, unknown>;
        const schedule = value.schedule as Record<string, unknown> | undefined;
        return {
          key: row.key,
          title: typeof value.title === 'string' ? value.title : row.key,
          prompt: typeof value.prompt === 'string' ? value.prompt : '',
          enabled: value.enabled !== false,
          nextRunAt: typeof schedule?.runAt === 'string' ? schedule.runAt : null,
          toolScope: Array.isArray(value.toolScope)
            ? value.toolScope.filter((tool): tool is string => typeof tool === 'string')
            : [],
        };
      })
      .filter((job): job is NonNullable<typeof job> => job !== null);
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
        await this.enqueueDueJob(job, envelope);
        await this.markJobAudited(job, new Date());
      }
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'AgentRuntimeSchedulerService.auditDueJobs');
      this.logger.warn(`Failed to audit due agent jobs: ${this.messageFor(error)}`);
    }
  }

  private parseDueJob(
    row: { id: string; workspaceId: string; key: string; value: Prisma.JsonValue },
    now: Date,
  ): DueAgentJob | null {
    if (!row.value || typeof row.value !== 'object' || Array.isArray(row.value)) {
      return null;
    }
    const value = this.parseJobValue(row.value);
    if (!value) {
      return null;
    }
    const schedule = value.schedule;
    const enabled = value.enabled !== false;
    const runAt = new Date(schedule.runAt);
    if (!enabled || Number.isNaN(runAt.getTime()) || runAt > now) {
      return null;
    }
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      key: row.key,
      title: value.title,
      prompt: value.prompt,
      toolScope: value.toolScope,
      value,
    };
  }

  private parseJobValue(value: Prisma.JsonValue): AgentScheduledJobValue | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const record = value as Record<string, unknown>;
    const schedule =
      record.schedule && typeof record.schedule === 'object' && !Array.isArray(record.schedule)
        ? (record.schedule as Record<string, unknown>)
        : {};
    const kind = schedule.kind === 'once' ? 'once' : 'interval';
    const runAt = typeof schedule.runAt === 'string' ? schedule.runAt : '';
    const everyMinutes = typeof schedule.everyMinutes === 'number' ? schedule.everyMinutes : null;
    return {
      kind: 'agent_job',
      title: typeof record.title === 'string' ? record.title : '',
      prompt: typeof record.prompt === 'string' ? record.prompt : '',
      schedule: { kind, runAt, everyMinutes },
      toolScope: Array.isArray(record.toolScope)
        ? record.toolScope.filter((tool): tool is string => typeof tool === 'string')
        : [],
      enabled: record.enabled !== false,
      lastRunAt: typeof record.lastRunAt === 'string' ? record.lastRunAt : null,
    };
  }

  private async markJobAudited(job: DueAgentJob, now: Date): Promise<void> {
    const nextValue: AgentScheduledJobValue =
      job.value.schedule.kind === 'once'
        ? {
            ...job.value,
            enabled: false,
            lastRunAt: now.toISOString(),
          }
        : {
            ...job.value,
            schedule: {
              ...job.value.schedule,
              runAt: this.nextRunFor(job.value.schedule.everyMinutes ?? 60, now).toISOString(),
            },
            lastRunAt: now.toISOString(),
          };
    await this.prisma.kloelMemory.updateMany({
      where: { id: job.id, workspaceId: job.workspaceId, key: job.key },
      data: {
        value: toInputJsonValue(nextValue),
        metadata: {
          kind: 'agent_job',
          nextRunAt: nextValue.schedule.runAt,
          lastRunAt: now.toISOString(),
          enabled: nextValue.enabled,
        } satisfies Prisma.InputJsonObject,
      },
    });
  }

  private async enqueueDueJob(job: DueAgentJob, envelope: unknown): Promise<void> {
    const idempotencyKey = `${job.key}:${job.value.schedule.runAt}`;
    await this.prisma.mindOutboxEvent.upsert({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: job.workspaceId,
          idempotencyKey,
        },
      },
      update: {
        payload: toInputJsonValue({
          jobKey: job.key,
          title: job.title,
          prompt: job.prompt,
          toolScope: job.toolScope,
          envelope,
        }),
        status: 'pending',
        lastError: null,
      },
      create: {
        id: randomUUID(),
        workspaceId: job.workspaceId,
        eventType: 'agent.job.due',
        subject: job.key,
        payload: toInputJsonValue({
          jobKey: job.key,
          title: job.title,
          prompt: job.prompt,
          toolScope: job.toolScope,
          envelope,
        }),
        idempotencyKey,
        status: 'pending',
        occurredAt: new Date(job.value.schedule.runAt),
      },
    });
  }

  private nextRunFor(everyMinutes: number, from = new Date()): Date {
    return new Date(from.getTime() + Math.max(1, everyMinutes) * 60_000);
  }

  private messageFor(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
