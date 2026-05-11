import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import Redis from 'ioredis';
import { Server, Socket } from 'socket.io';
import { createRedisClient } from '../common/redis/redis.util';

/**
 * Gateway para alertas operacionais (rate-limit, provider down, fallback fail).
 * Consumido pelo front para exibir toasts/banners em tempo real.
 */
@WebSocketGateway({
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [
      process.env.FRONTEND_URL || 'http://localhost:3000',
    ],
    credentials: true,
  },
})
export class AlertsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  /** Server property. */
  @WebSocketServer() server: Server;
  private logger = new Logger('AlertsGateway');
  private readonly sub: Redis;

  constructor() {
    // Dedicated subscriber to avoid locking the shared Redis connection
    this.sub = createRedisClient();
  }

  /** On module init. */
  async onModuleInit() {
    await this.sub.subscribe('alerts');
    this.sub.on('message', (_channel, message) => {
      try {
        const payload = JSON.parse(message);
        const workspaceId = payload.workspaceId;
        // Emite para room do workspace; se não houver, emite broadcast
        if (workspaceId) {
          this.server.to(`workspace:${workspaceId}`).emit('alert:event', payload);
        } else {
          this.server.emit('alert:event', payload);
        }
      } catch (err: unknown) {
        // PULSE:OK — Redis pub/sub parse error; cannot propagate from event handler
        this.logger.error('Failed to parse alert message', err);
      }
    });
  }

  /** Handle connection. */
  handleConnection(client: Socket) {
    const workspaceId = client.handshake.query.workspaceId as string;
    if (workspaceId) {
      void client.join(`workspace:${workspaceId}`);
      this.logger.log(`Client connected: ${client.id} to workspace:${workspaceId}`);
    } else {
      this.logger.log(`Client connected: ${client.id} (no workspace)`);
    }
  }

  /** Handle disconnect. */
  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }
}
