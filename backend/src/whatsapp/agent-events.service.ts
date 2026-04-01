import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type { Redis } from 'ioredis';

export type AgentEventType =
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

export interface AgentStreamEvent {
  type: AgentEventType;
  workspaceId: string;
  ts: string;
  message: string;
  phase?: string;
  runId?: string;
  persistent?: boolean;
  streaming?: boolean;
  token?: string;
  meta?: Record<string, any>;
}

type AgentListener = (event: AgentStreamEvent) => void;

function normalizeAgentMessage(
  event: Omit<AgentStreamEvent, 'ts'> & { ts?: string },
) {
  let message = String(event.message || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!message && event.streaming && event.token) {
    message = String(event.token || '').trim();
  }

  if (message.startsWith('Prova registrada:')) {
    message = message.slice('Prova registrada:'.length).trim();
  }

  if (
    event.phase === 'compose_reply' &&
    /^Pensando na melhor resposta para /i.test(message)
  ) {
    message = message.replace(
      /^Pensando na melhor resposta para /i,
      'Preparando resposta para ',
    );
  }

  return message;
}

@Injectable()
export class AgentEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentEventsService.name);
  private subscriber: Redis | null = null;
  private readonly listeners = new Map<string, Set<AgentListener>>();
  private readonly history = new Map<string, AgentStreamEvent[]>();
  private readonly historyLimit = 100;

  constructor(@InjectRedis() private readonly redis: Redis) {}

  async onModuleInit() {
    this.subscriber = this.redis.duplicate();
    await this.subscriber.subscribe('ws:agent');

    this.subscriber.on('message', (channel, raw) => {
      if (channel !== 'ws:agent') return;
      this.handleIncoming(raw);
    });

    this.logger.log('Subscribed to ws:agent events');
  }

  async onModuleDestroy() {
    try {
      await this.subscriber?.quit();
    } catch {
      // ignore
    }
  }

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

  getRecent(workspaceId: string): AgentStreamEvent[] {
    return [...(this.history.get(workspaceId) || [])];
  }

  async publish(
    event: Omit<AgentStreamEvent, 'ts'> & { ts?: string },
  ): Promise<void> {
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
    } catch (err: any) {
      this.logger.warn(
        `Falling back to local dispatch for ws:agent: ${err?.message || err}`,
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
    } catch (err: any) {
      this.logger.warn(
        `Failed to parse ws:agent event: ${err?.message || err}`,
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
        nextHistory = [...previousHistory.slice(0, -1), event].slice(
          -this.historyLimit,
        );
      }
    }

    this.history.set(workspaceId, nextHistory);

    const listeners = this.listeners.get(workspaceId);
    if (!listeners?.size) return;

    for (const listener of listeners) {
      try {
        listener(event);
      } catch (err: any) {
        this.logger.warn(
          `Failed to dispatch ws:agent listener: ${err?.message || err}`,
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
