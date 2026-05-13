import { Injectable, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { StructuredLogger } from '../../logging/structured-logger';
import { OpsAlertService } from '../../observability/ops-alert.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BrainEventSpineService } from '../brain-event-spine.service';
import { KloelService } from '../kloel.service';
import { AgentRuntimeSessionStore } from './agent-runtime.session-store';
import { sanitizeAgentRuntimeText, toInputJsonValue } from './agent-runtime.sanitizer';

type AgentJobPayload = {
  jobKey: string;
  title: string;
  prompt: string;
  toolScope: string[];
  envelope: unknown;
};

type ClaimedAgentJobEvent = {
  id: string;
  eventType: string;
  subject: string;
  payload: Prisma.JsonValue;
  idempotencyKey: string;
  occurredAt: Date;
  attempts: number;
  lastError: string | null;
};

@Injectable()
export class AgentRuntimeJobRunnerService {
  private readonly logger = StructuredLogger.from(AgentRuntimeJobRunnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly brainEvents: BrainEventSpineService,
    private readonly sessions: AgentRuntimeSessionStore,
    private readonly kloel: KloelService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async runAllPendingAgentJobs(): Promise<void> {
    try {
      const rows = await this.prisma.mindOutboxEvent.findMany({
        where: { eventType: 'agent.job.due', status: 'pending' },
        distinct: ['workspaceId'],
        orderBy: { createdAt: 'asc' },
        take: 25,
        select: { workspaceId: true },
      });

      for (const row of rows) {
        await this.runPendingJobsForWorkspace(row.workspaceId, 5);
      }
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'AgentRuntimeJobRunnerService.runAllPendingAgentJobs');
      this.logger.warn(`Failed to run pending agent jobs: ${this.messageFor(error)}`);
    }
  }

  async runPendingJobsForWorkspace(
    workspaceId: string,
    limit = 5,
  ): Promise<{ claimed: number; succeeded: number; failed: number }> {
    const { events } = await this.brainEvents.claimPendingEvents({
      workspaceId,
      eventType: 'agent.job.due',
      limit,
    });
    let succeeded = 0;
    let failed = 0;

    for (const event of events) {
      const result = await this.runClaimedJob(workspaceId, event);
      if (result) {
        succeeded += 1;
      } else {
        failed += 1;
      }
    }

    return { claimed: events.length, succeeded, failed };
  }

  private async runClaimedJob(workspaceId: string, event: ClaimedAgentJobEvent): Promise<boolean> {
    const payload = this.parsePayload(event.payload, event.subject);
    if (!payload.prompt) {
      await this.brainEvents.markDispatchFailed(event.id, workspaceId, 'missing_agent_job_prompt');
      return false;
    }

    try {
      const result = await this.kloel.thinkSync({
        workspaceId,
        mode: 'chat',
        message: payload.prompt,
        companyContext: this.buildCompanyContext(payload, event),
        allowedTools: payload.toolScope,
      });

      await this.sessions.recordTurn({
        workspaceId,
        channel: `agent_job:${payload.jobKey}`,
        userMessage: payload.prompt,
        assistantMessage: result.response,
        intent: 'scheduled_agent_job',
        confidence: 0.8,
        actions: [
          {
            toolName: 'agent.job.due',
            success: true,
            result: {
              eventId: event.id,
              idempotencyKey: event.idempotencyKey,
            },
          },
        ],
      });
      await this.recordJobExecutionSnapshot(workspaceId, payload, {
        status: 'succeeded',
        eventId: event.id,
        message: result.response,
      });
      await this.brainEvents.markDispatchSucceeded(event.id, workspaceId);
      return true;
    } catch (error: unknown) {
      const message = this.messageFor(error);
      await this.sessions.recordTurn({
        workspaceId,
        channel: `agent_job:${payload.jobKey}`,
        userMessage: payload.prompt,
        assistantMessage: `scheduled_job_failed: ${message}`,
        intent: 'scheduled_agent_job',
        confidence: 0,
        actions: [
          {
            toolName: 'agent.job.due',
            success: false,
            result: { eventId: event.id, error: message },
          },
        ],
      });
      await this.recordJobExecutionSnapshot(workspaceId, payload, {
        status: 'failed',
        eventId: event.id,
        message,
      });
      await this.brainEvents.markDispatchFailed(event.id, workspaceId, message);
      return false;
    }
  }

  private async recordJobExecutionSnapshot(
    workspaceId: string,
    payload: AgentJobPayload,
    result: { status: 'succeeded' | 'failed'; eventId: string; message: string },
  ): Promise<void> {
    const key = payload.jobKey.startsWith('agent_job:')
      ? payload.jobKey
      : `agent_job:${payload.jobKey}`;
    try {
      const row = await this.prisma.kloelMemory.findUnique({
        where: { workspaceId_key: { workspaceId, key } },
        select: { value: true, metadata: true },
      });
      const now = new Date().toISOString();
      const value =
        row?.value && typeof row.value === 'object' && !Array.isArray(row.value)
          ? (row.value as Record<string, unknown>)
          : {};
      const metadata =
        row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {};
      await this.prisma.kloelMemory.updateMany({
        where: { workspaceId, key, category: 'agent_job', type: 'scheduled' },
        data: {
          value: toInputJsonValue({
            ...value,
            lastResultAt: now,
            lastResultStatus: result.status,
            lastResultSummary: sanitizeAgentRuntimeText(result.message, 1000),
            lastError:
              result.status === 'failed' ? sanitizeAgentRuntimeText(result.message, 500) : undefined,
          }),
          metadata: {
            ...metadata,
            kind: 'agent_job',
            lastResultAt: now,
            lastResultStatus: result.status,
            lastEventId: result.eventId,
            ...(result.status === 'failed'
              ? { lastError: sanitizeAgentRuntimeText(result.message, 500) }
              : { lastError: null }),
          } satisfies Prisma.InputJsonObject,
        },
      });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'AgentRuntimeJobRunnerService.recordJobExecutionSnapshot',
      );
      this.logger.warn(`Failed to persist agent job execution snapshot: ${this.messageFor(error)}`);
    }
  }

  private parsePayload(payload: Prisma.JsonValue, fallbackKey: string): AgentJobPayload {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { jobKey: fallbackKey, title: fallbackKey, prompt: '', toolScope: [], envelope: null };
    }
    const record = payload as Record<string, unknown>;
    return {
      jobKey: sanitizeAgentRuntimeText(record.jobKey ?? fallbackKey, 160) || fallbackKey,
      title: sanitizeAgentRuntimeText(record.title ?? fallbackKey, 200) || fallbackKey,
      prompt: sanitizeAgentRuntimeText(record.prompt, 4000),
      toolScope: Array.isArray(record.toolScope)
        ? record.toolScope.filter((tool): tool is string => typeof tool === 'string')
        : [],
      envelope: record.envelope ?? null,
    };
  }

  private buildCompanyContext(payload: AgentJobPayload, event: ClaimedAgentJobEvent): string {
    return [
      '<scheduled-agent-job>',
      `jobKey=${payload.jobKey}`,
      `title=${payload.title}`,
      `eventId=${event.id}`,
      `idempotencyKey=${event.idempotencyKey}`,
      `occurredAt=${event.occurredAt.toISOString()}`,
      `toolScope=${payload.toolScope.join(', ') || 'none'}`,
      'rules:',
      '- Execute this as a governed scheduled Kloel job.',
      '- Use only real workspace evidence and configured tools.',
      '- Do not claim completion without observed proof.',
      '</scheduled-agent-job>',
    ].join('\n');
  }

  private messageFor(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
