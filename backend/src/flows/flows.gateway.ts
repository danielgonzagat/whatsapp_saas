import { Logger, OnModuleInit, Optional } from '@nestjs/common';
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
import { OpsAlertService } from '../observability/ops-alert.service';

type GatewayPayload = Record<string, unknown>;

function isGatewayPayload(value: unknown): value is GatewayPayload {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonRecord(raw: string): GatewayPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isGatewayPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readWorkspaceId(payload: unknown): string | undefined {
  if (!isGatewayPayload(payload)) {
    return undefined;
  }
  return readString(payload.workspaceId);
}

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
  @WebSocketServer() server!: Server;
  private logger: Logger = new Logger('FlowsGateway');

  private readonly sub: Redis;

  constructor(
    private readonly jwtService: JwtService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {
    // Dedicated subscriber to avoid putting the shared client in subscriber mode
    this.sub = createRedisClient();
  }

  /** On module init. */
  async onModuleInit(): Promise<void> {
    // Dedicated subscription to flow logs (pattern flow:log:<workspaceId>)
    await this.sub.psubscribe('flow:log:*');
    await this.sub.psubscribe('alerts:*');
    this.sub.on('pmessage', (_pattern, channel, message) => {
      const workspaceId = channel.split(':').pop();
      if (workspaceId) {
        if (channel.startsWith('flow:log:')) {
          const flowLogPayload = parseJsonRecord(message);
          if (flowLogPayload) {
            this.server.to(`workspace:${workspaceId}`).emit('flow:log', flowLogPayload);
          }
        } else if (channel.startsWith('alerts:')) {
          const alertPayload = parseJsonRecord(message);
          if (alertPayload) {
            this.server.to(`workspace:${workspaceId}`).emit('alert', alertPayload);
          }
        }
      }
    });
  }

  /** Handle connection. */
  handleConnection(client: Socket): void {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(`Client ${client.id} disconnected: missing token`);
      client.disconnect(true);
      return;
    }

    try {
      const payload: unknown = this.jwtService.verify(token);
      const payloadWorkspaceId = readWorkspaceId(payload);
      const workspaceId = readString(client.handshake.query.workspaceId) ?? payloadWorkspaceId;
      if (!workspaceId || (payloadWorkspaceId && payloadWorkspaceId !== workspaceId)) {
        this.logger.warn(`Client ${client.id} disconnect: workspace mismatch`);
        client.disconnect(true);
        return;
      }
      void client.join(`workspace:${workspaceId}`);
      this.logger.log(`Client connected: ${client.id} to workspace:${workspaceId}`);
    } catch (err: unknown) {
      void this.opsAlert?.alertOnCriticalError(err, 'FlowsGateway.handleConnection');
      this.logger.warn(
        `Client ${client.id} disconnected: invalid token (${(err instanceof Error ? err.message : 'unknown') || String(err)})`,
      );
      client.disconnect(true);
    }
  }

  /** Handle disconnect. */
  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  private extractToken(client: Socket): string | null {
    const auth =
      readString((client.handshake.auth as { token?: unknown } | undefined)?.token) ??
      readString(client.handshake.query?.token);
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
