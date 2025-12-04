import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import Redis from 'ioredis';
import { Logger, OnModuleInit } from '@nestjs/common';

@WebSocketGateway({ cors: true })
export class CopilotGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger('CopilotGateway');
  private readonly sub: Redis;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    this.sub = new Redis(redisUrl, { maxRetriesPerRequest: null });
  }

  async onModuleInit() {
    await this.sub.psubscribe('ws:copilot:*');
    this.sub.on('pmessage', (_pattern, channel, message) => {
      try {
        const payload = JSON.parse(message);
        const workspaceId = channel.split(':').pop();
        if (workspaceId) {
          this.server
            .to(`workspace:${workspaceId}`)
            .emit('copilot:suggestion', payload);
        } else {
          this.server.emit('copilot:suggestion', payload);
        }
      } catch (err) {
        this.logger.warn(`CopilotGateway parse error: ${err?.message}`);
      }
    });
  }

  handleConnection(client: Socket) {
    const workspaceId = client.handshake.query.workspaceId as string;
    if (workspaceId) {
      void client.join(`workspace:${workspaceId}`);
      this.logger.log(
        `Copilot client connected ${client.id} -> workspace:${workspaceId}`,
      );
    } else {
      this.logger.log(`Copilot client connected ${client.id} (no workspace)`);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Copilot client disconnected ${client.id}`);
  }
}
