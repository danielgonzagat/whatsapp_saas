import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({ cors: true })
export class FlowsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  /* eslint-disable @typescript-eslint/no-floating-promises */
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('FlowsGateway');

  private readonly sub: Redis;

  constructor(private readonly jwtService: JwtService) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) throw new Error('REDIS_URL is required');
    // Dedicated subscriber to avoid putting the shared client in subscriber mode
    this.sub = new Redis(redisUrl, { maxRetriesPerRequest: null });
  }

  async onModuleInit() {
    // Dedicated subscription to flow logs (pattern flow:log:<workspaceId>)
    await this.sub.psubscribe('flow:log:*');
    await this.sub.psubscribe('alerts:*');
    this.sub.on('pmessage', (_pattern, channel, message) => {
      const workspaceId = channel.split(':').pop();
      if (workspaceId) {
        if (channel.startsWith('flow:log:')) {
          this.server
            .to(`workspace:${workspaceId}`)
            .emit('flow:log', JSON.parse(message));
        } else if (channel.startsWith('alerts:')) {
          this.server
            .to(`workspace:${workspaceId}`)
            .emit('alert', JSON.parse(message));
        }
      }
    });
  }

  handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(`Client ${client.id} disconnected: missing token`);
      client.disconnect(true);
      return;
    }

    try {
      const payload: any = this.jwtService.verify(token);
      const workspaceId =
        (client.handshake.query.workspaceId as string) || payload.workspaceId;
      if (
        !workspaceId ||
        (payload.workspaceId && payload.workspaceId !== workspaceId)
      ) {
        this.logger.warn(`Client ${client.id} disconnect: workspace mismatch`);
        client.disconnect(true);
        return;
      }
      client.join(`workspace:${workspaceId}`);
      this.logger.log(
        `Client connected: ${client.id} to workspace:${workspaceId}`,
      );
    } catch (err) {
      this.logger.warn(
        `Client ${client.id} disconnected: invalid token (${err?.message || err})`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth?.token || client.handshake.query?.token;
    if (typeof auth === 'string') {
      return auth.startsWith('Bearer ') ? auth.slice(7) : auth;
    }
    const headerAuth = client.handshake.headers?.authorization;
    if (typeof headerAuth === 'string') {
      return headerAuth.startsWith('Bearer ')
        ? headerAuth.slice(7)
        : headerAuth;
    }
    return null;
  }
}
