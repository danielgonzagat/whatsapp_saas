import { Logger, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import Redis from 'ioredis';
import { Server, Socket } from 'socket.io';
import { createRedisClient } from '../common/redis/redis.util';

/** Flows gateway. */
@WebSocketGateway({
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [
      process.env.FRONTEND_URL || 'http://localhost:3000',
    ],
    credentials: true,
  },
})
export class FlowsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  /** Server property. */
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('FlowsGateway');

  private readonly sub: Redis;

  constructor(private readonly jwtService: JwtService) {
    // Dedicated subscriber to avoid putting the shared client in subscriber mode
    this.sub = createRedisClient();
  }

  /** On module init. */
  async onModuleInit() {
    // Dedicated subscription to flow logs (pattern flow:log:<workspaceId>)
    await this.sub.psubscribe('flow:log:*');
    await this.sub.psubscribe('alerts:*');
    this.sub.on('pmessage', (_pattern, channel, message) => {
      const workspaceId = channel.split(':').pop();
      if (workspaceId) {
        if (channel.startsWith('flow:log:')) {
          let flowLogPayload: Record<string, unknown> | null = null;
          try {
            flowLogPayload = JSON.parse(message);
          } catch {
            /* invalid JSON in flow log */
          }
          if (flowLogPayload) {
            this.server.to(`workspace:${workspaceId}`).emit('flow:log', flowLogPayload);
          }
        } else if (channel.startsWith('alerts:')) {
          let alertPayload: Record<string, unknown> | null = null;
          try {
            alertPayload = JSON.parse(message);
          } catch {
            /* invalid JSON in alert */
          }
          if (alertPayload) {
            this.server.to(`workspace:${workspaceId}`).emit('alert', alertPayload);
          }
        }
      }
    });
  }

  /** Handle connection. */
  handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(`Client ${client.id} disconnected: missing token`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify(token);
      const workspaceId = (client.handshake.query.workspaceId as string) || payload.workspaceId;
      if (!workspaceId || (payload.workspaceId && payload.workspaceId !== workspaceId)) {
        this.logger.warn(`Client ${client.id} disconnect: workspace mismatch`);
        client.disconnect(true);
        return;
      }
      void client.join(`workspace:${workspaceId}`);
      this.logger.log(`Client connected: ${client.id} to workspace:${workspaceId}`);
    } catch (err: unknown) {
      this.logger.warn(
        `Client ${client.id} disconnected: invalid token (${(err instanceof Error ? err.message : 'unknown') || String(err)})`,
      );
      client.disconnect(true);
    }
  }

  /** Handle disconnect. */
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
      return headerAuth.startsWith('Bearer ') ? headerAuth.slice(7) : headerAuth;
    }
    return null;
  }
}
