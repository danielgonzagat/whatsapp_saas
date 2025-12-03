import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({ cors: true })
export class InboxGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('InboxGateway');

  constructor(private readonly jwt: JwtService) {}

  handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(`Client ${client.id} disconnected: missing token`);
      client.disconnect(true);
      return;
    }

    try {
      const payload: any = this.jwt.verify(token);
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

      void client.join(`workspace:${workspaceId}`);
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

  // Método helper para enviar eventos para o workspace
  emitToWorkspace(workspaceId: string, event: string, data: any) {
    this.server.to(`workspace:${workspaceId}`).emit(event, data);
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
