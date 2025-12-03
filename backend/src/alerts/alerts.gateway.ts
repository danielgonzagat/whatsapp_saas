import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Gateway para alertas operacionais (rate-limit, provider down, fallback fail).
 * Consumido pelo front para exibir toasts/banners em tempo real.
 */
@WebSocketGateway({ cors: true })
export class AlertsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private logger = new Logger('AlertsGateway');
  private readonly sub: Redis;

  constructor() {
    const redisUrl =
      process.env.REDIS_URL ||
      `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`;
    // Dedicated subscriber to avoid locking the shared Redis connection
    this.sub = new Redis(redisUrl, { maxRetriesPerRequest: null });
  }

  async onModuleInit() {
    await this.sub.subscribe('alerts');
    this.sub.on('message', (_channel, message) => {
      try {
        const payload = JSON.parse(message);
        const workspaceId = payload.workspaceId;
        // Emite para room do workspace; se não houver, emite broadcast
        if (workspaceId) {
          this.server
            .to(`workspace:${workspaceId}`)
            .emit('alert:event', payload);
        } else {
          this.server.emit('alert:event', payload);
        }
      } catch (err) {
        this.logger.error('Failed to parse alert message', err);
      }
    });
  }

  handleConnection(client: Socket) {
    const workspaceId = client.handshake.query.workspaceId as string;
    if (workspaceId) {
      void client.join(`workspace:${workspaceId}`);
      this.logger.log(
        `Client connected: ${client.id} to workspace:${workspaceId}`,
      );
    } else {
      this.logger.log(`Client connected: ${client.id} (no workspace)`);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }
}
