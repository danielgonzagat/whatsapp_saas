import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AuditService } from '../audit/audit.service';
import { OpsAlertService } from '../observability/ops-alert.service';

const S_RE = /\s+/g;

const PENSANDO_NA_MELHOR_RESP_RE = /^Pensando na melhor resposta para /i;

type AgentEventType =
  | 'thought'
  | 'status'
  | 'error'
  | 'backlog'
  | 'prompt'
  | 'contact'
  | 'summary'
  | 'sale'
  | 'heartbeat'
  | 'typing'
  | 'action'
  | 'proof'
  | 'account';

/** Agent stream event shape. */
export interface AgentStreamEvent {
  /** Type property. */
  type: AgentEventType;
  /** Workspace id property. */
  workspaceId: string;
  /** Ts property. */
  ts: string;
  /** Message property. */
  message: string;
  /** Phase property. */
  phase?: string;
  /** Run id property. */
  runId?: string;
  /** Persistent property. */
  persistent?: boolean;
  /** Streaming property. */
  streaming?: boolean;
  /** Token property. */
  token?: string;
  /** Meta property. */
  meta?: Record<string, unknown>;
}

type AgentListener = (event: AgentStreamEvent) => void;

type NormalizableAgentEvent = Omit<AgentStreamEvent, 'ts'> & { ts?: string };

function baseMessageText(event: NormalizableAgentEvent): string {
  const primary = String(event.message || '')
    .replace(S_RE, ' ')
    .trim();
  if (primary) {
    return primary;
  }
  if (event.streaming && event.token) {
    return String(event.token || '').trim();
  }
  return '';
}

function stripProvaRegistradaPrefix(message: string): string {
  const prefix = 'Prova registrada:';
  if (!message.startsWith(prefix)) {
    return message;
  }
  return message.slice(prefix.length).trim();
}

function rewriteComposeReplyPhrase(message: string, phase?: string): string {
  if (phase !== 'compose_reply') {
    return message;
  }
  if (!PENSANDO_NA_MELHOR_RESP_RE.test(message)) {
    return message;
  }
  return message.replace(PENSANDO_NA_MELHOR_RESP_RE, 'Preparando resposta para ');
}

function normalizeAgentMessage(event: NormalizableAgentEvent) {
  const base = baseMessageText(event);
  const stripped = stripProvaRegistradaPrefix(base);
  return rewriteComposeReplyPhrase(stripped, event.phase);
}

/** Agent events service. */
@Injectable()
export class AgentEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentEventsService.name);
  private subscriber: Redis | null = null;
  private readonly listeners = new Map<string, Set<AgentListener>>();
  private readonly history = new Map<string, AgentStreamEvent[]>();
  private readonly historyLimit = 100;

  constructor(
    @InjectRedis() private readonly redis: Redis,
    @Optional() private readonly auditService?: AuditService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  /** On module init. */
  async onModuleInit() {
    this.subscriber = this.redis.duplicate();
    await this.subscriber.subscribe('ws:agent');

    this.subscriber.on('message', (channel, raw) => {
      if (channel !== 'ws:agent') {
        return;
      }
      this.handleIncoming(raw);
    });

    this.logger.log('Subscribed to ws:agent events');
  }

  /** On module destroy. */
  async onModuleDestroy() {
    try {
      // cache.invalidate — clear local history on shutdown to prevent stale event data
      this.history.clear();
      this.listeners.clear();
      await this.subscriber?.quit();
    } catch {
      // ignore
    }
  }

  /** Subscribe. */
  subscribe(workspaceId: string, listener: AgentListener) {
    const key = String(workspaceId || '').trim();
    if (!key) {
      return () => undefined;
    }

    const bucket = this.listeners.get(key) || new Set<AgentListener>();
    bucket.add(listener);
    this.listeners.set(key, bucket);

    return () => {
      const current = this.listeners.get(key);
      current?.delete(listener);
      if (current && current.size === 0) {
        this.listeners.delete(key);
      }
    };
  }

  /** Get recent. */
  getRecent(workspaceId: string): AgentStreamEvent[] {
    return [...(this.history.get(workspaceId) || [])];
  }

  /** Publish. */
  async publish(event: Omit<AgentStreamEvent, 'ts'> & { ts?: string }): Promise<void> {
    const normalized: AgentStreamEvent = {
      ...event,
      ts: event.ts || new Date().toISOString(),
      message: normalizeAgentMessage(event),
      streaming: event.streaming ?? event.meta?.streaming === true,
      token:
        typeof event.token === 'string'
          ? event.token
          : typeof event.meta?.token === 'string'
            ? event.meta.token
            : undefined,
    };

    if (!normalized.workspaceId || !normalized.message) {
      return;
    }

    try {
      await this.redis.publish('ws:agent', JSON.stringify(normalized));
    } catch (err: unknown) {
      void this.opsAlert?.alertOnDegradation(
        err instanceof Error ? err.message : 'unknown_error',
        'AgentEventsService.publish',
        { workspaceId: normalized.workspaceId },
      );
      this.logger.warn(
        `Falling back to local dispatch for ws:agent: ${err instanceof Error ? err.message : 'unknown_error'}`,
      );
      this.dispatch(normalized);
    }
  }

  private handleIncoming(raw: string) {
    try {
      const event = JSON.parse(raw) as AgentStreamEvent;
      if (!event?.workspaceId || !event?.type || !event?.message) {
        return;
      }
      this.dispatch(event);
    } catch (err: unknown) {
      void this.opsAlert?.alertOnDegradation(
        err instanceof Error ? err.message : 'unknown_error',
        'AgentEventsService.handleIncoming',
      );
      this.logger.warn(
        `Failed to parse ws:agent event: ${err instanceof Error ? err.message : 'unknown_error'}`,
      );
    }
  }

  private dispatch(event: AgentStreamEvent) {
    const workspaceId = String(event.workspaceId);
    const previousHistory = this.history.get(workspaceId) || [];
    let nextHistory = [...previousHistory, event].slice(-this.historyLimit);

    if (this.isStreamingEvent(event) && previousHistory.length > 0) {
      const last = previousHistory[previousHistory.length - 1];
      if (
        this.isStreamingEvent(last) &&
        last.type === event.type &&
        (last.phase || '') === (event.phase || '') &&
        (last.runId || '') === (event.runId || '')
      ) {
        nextHistory = [...previousHistory.slice(0, -1), event].slice(-this.historyLimit);
      }
    }

    this.history.set(workspaceId, nextHistory);

    const listeners = this.listeners.get(workspaceId);
    if (!listeners?.size) {
      return;
    }

    for (const listener of listeners) {
      try {
        listener(event);
      } catch (err: unknown) {
        void this.opsAlert?.alertOnDegradation(
          err instanceof Error ? err.message : 'unknown_error',
          'AgentEventsService.dispatch',
          { workspaceId: event.workspaceId },
        );
        this.logger.warn(
          `Failed to dispatch ws:agent listener: ${err instanceof Error ? err.message : 'unknown_error'}`,
        );
      }
    }
  }

  private isStreamingEvent(event: AgentStreamEvent | undefined | null) {
    return Boolean(
      event &&
      (event.streaming === true ||
        event.phase === 'streaming_token' ||
        event.meta?.streaming === true),
    );
  }
}
