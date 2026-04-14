import { Logger, OnModuleInit } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import Redis from 'ioredis';
import { Server, Socket } from 'socket.io';
import { createRedisClient } from '../common/redis/redis.util';

@WebSocketGateway({
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [
      process.env.FRONTEND_URL || 'http://localhost:3000',
    ],
    credentials: true,
  },
})
export class CopilotGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger('CopilotGateway');
  private readonly sub: Redis;

  constructor() {
    this.sub = createRedisClient();
  }

  async onModuleInit() {
    await this.sub.psubscribe('ws:copilot:*');
    this.sub.on('pmessage', (_pattern, channel, message) => {
      try {
        const payload = JSON.parse(message);
        const workspaceId = channel.split(':').pop();
        if (workspaceId) {
          this.server.to(`workspace:${workspaceId}`).emit('copilot:suggestion', payload);
        } else {
          this.server.emit('copilot:suggestion', payload);
        }
      } catch (err) {
        // PULSE:OK — Redis pub/sub parse error; cannot propagate from event handler
        this.logger.warn(`CopilotGateway parse error: ${err?.message}`);
      }
    });
  }

  handleConnection(client: Socket) {
    const workspaceId = client.handshake.query.workspaceId as string;
    if (workspaceId) {
      void client.join(`workspace:${workspaceId}`);
      this.logger.log(`Copilot client connected ${client.id} -> workspace:${workspaceId}`);
    } else {
      this.logger.log(`Copilot client connected ${client.id} (no workspace)`);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Copilot client disconnected ${client.id}`);
  }
}
