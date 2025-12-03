import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type { Redis } from 'ioredis';
import { InboxGateway } from './inbox.gateway';

type WsEvent =
  | { type: 'message:new'; workspaceId: string; message: any }
  | { type: 'conversation:update'; workspaceId: string; conversation: any }
  | { type: 'message:status'; workspaceId: string; payload: any };

/**
 * Escuta eventos publicados no Redis (gerados pelos workers) e retransmite via WebSocket.
 */
@Injectable()
export class InboxEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InboxEventsService.name);
  private subscriber: Redis | null = null;

  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly gateway: InboxGateway,
  ) {}

  async onModuleInit() {
    this.subscriber = this.redis.duplicate();
    // No explicit connect() needed for duplicate usually, but if config says lazyConnect: true...
    // await this.subscriber.connect(); 
    
    // Correct pattern for ioredis
    await this.subscriber.subscribe('ws:inbox');
    
    this.subscriber.on('message', (channel, message) => {
      if (channel === 'ws:inbox') {
        this.handleMessage(message);
      }
    });

    this.logger.log('Subscribed to ws:inbox events');
  }

  async onModuleDestroy() {
    try {
      await this.subscriber?.quit();
    } catch {
      /* ignore */
    }
  }

  private handleMessage(raw: string) {
    try {
      const event: WsEvent = JSON.parse(raw);
      if (!event?.workspaceId || !event?.type) return;
      switch (event.type) {
        case 'message:new':
          this.gateway.emitToWorkspace(event.workspaceId, 'message:new', event.message);
          break;
        case 'conversation:update':
          this.gateway.emitToWorkspace(
            event.workspaceId,
            'conversation:update',
            event.conversation,
          );
          break;
        case 'message:status':
          this.gateway.emitToWorkspace(
            event.workspaceId,
            'message:status',
            event.payload,
          );
          break;
        default:
          break;
      }
    } catch (err) {
      this.logger.warn(`Failed to handle ws:inbox event: ${(err as any)?.message || err}`);
    }
  }
}
