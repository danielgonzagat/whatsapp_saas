import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Sse,
  MessageEvent,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { Observable, Subject, interval, map, merge } from 'rxjs';
import { WhatsAppConnectionService } from './whatsapp-connection.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import * as QRCode from 'qrcode';

@ApiTags('KLOEL WhatsApp Connection')
@Controller('kloel/whatsapp/connection')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@ApiBearerAuth()
export class WhatsAppConnectionController {
  private readonly logger = new Logger(WhatsAppConnectionController.name);
  private qrSubjects: Map<string, Subject<MessageEvent>> = new Map();

  constructor(
    private readonly whatsappConnection: WhatsAppConnectionService,
  ) {
    // Escuta eventos de QR Code
    this.whatsappConnection.on('qr', ({ workspaceId, qr }) => {
      this.notifyQrUpdate(workspaceId, qr);
    });

    // Escuta eventos de conexão
    this.whatsappConnection.on('connected', ({ workspaceId, phoneNumber }) => {
      this.notifyConnected(workspaceId, phoneNumber);
    });

    this.whatsappConnection.on('disconnected', ({ workspaceId }) => {
      this.notifyDisconnected(workspaceId);
    });
  }

  @Post(':workspaceId/initiate')
  @ApiOperation({ summary: 'Inicia conexão WhatsApp e retorna QR Code' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  async initiateConnection(@Param('workspaceId') workspaceId: string) {
    this.logger.log(`Iniciando conexão para workspace: ${workspaceId}`);
    const result = await this.whatsappConnection.initiateConnection(workspaceId);
    
    // Se temos QR Code, converte para imagem base64
    if (result.qrCode) {
      const qrImageBase64 = await QRCode.toDataURL(result.qrCode);
      return {
        ...result,
        qrCodeImage: qrImageBase64,
      };
    }
    
    return result;
  }

  @Get(':workspaceId/status')
  @ApiOperation({ summary: 'Retorna status da conexão WhatsApp' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  getStatus(@Param('workspaceId') workspaceId: string) {
    const session = this.whatsappConnection.getConnectionStatus(workspaceId);
    
    if (!session) {
      return {
        status: 'not_initialized',
        message: 'Conexão não iniciada',
      };
    }

    return {
      status: session.status,
      phoneNumber: session.phoneNumber,
      businessName: session.businessName,
      lastActivity: session.lastActivity,
      error: session.errorMessage,
    };
  }

  @Get(':workspaceId/qr')
  @ApiOperation({ summary: 'Retorna QR Code atual como imagem base64' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  async getQrCode(@Param('workspaceId') workspaceId: string) {
    const qr = this.whatsappConnection.getQrCode(workspaceId);
    
    if (!qr) {
      return {
        status: 'no_qr',
        message: 'Nenhum QR Code disponível. Inicie uma conexão primeiro.',
      };
    }

    const qrImageBase64 = await QRCode.toDataURL(qr);
    return {
      status: 'qr_ready',
      qrCode: qr,
      qrCodeImage: qrImageBase64,
    };
  }

  @Sse(':workspaceId/stream')
  @ApiOperation({ summary: 'Stream SSE para atualizações de conexão (QR Code, status)' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  streamUpdates(@Param('workspaceId') workspaceId: string): Observable<MessageEvent> {
    this.logger.log(`SSE stream iniciado para workspace: ${workspaceId}`);
    
    // Cria subject para este workspace
    if (!this.qrSubjects.has(workspaceId)) {
      this.qrSubjects.set(workspaceId, new Subject<MessageEvent>());
    }
    
    const qrSubject = this.qrSubjects.get(workspaceId)!;
    
    // Heartbeat a cada 30s para manter conexão
    const heartbeat$ = interval(30000).pipe(
      map(() => ({
        data: { type: 'heartbeat', timestamp: new Date().toISOString() },
      } as MessageEvent))
    );

    // Envia status inicial
    setTimeout(async () => {
      const session = this.whatsappConnection.getConnectionStatus(workspaceId);
      if (session?.qrCode) {
        const qrImage = await QRCode.toDataURL(session.qrCode);
        qrSubject.next({
          data: {
            type: 'qr_update',
            qrCode: session.qrCode,
            qrCodeImage: qrImage,
          },
        } as MessageEvent);
      } else if (session?.status === 'connected') {
        qrSubject.next({
          data: {
            type: 'connected',
            phoneNumber: session.phoneNumber,
            businessName: session.businessName,
          },
        } as MessageEvent);
      }
    }, 100);

    return merge(qrSubject.asObservable(), heartbeat$);
  }

  @Delete(':workspaceId/disconnect')
  @ApiOperation({ summary: 'Desconecta WhatsApp' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  async disconnect(@Param('workspaceId') workspaceId: string) {
    await this.whatsappConnection.disconnect(workspaceId);
    return {
      status: 'disconnected',
      message: 'WhatsApp desconectado com sucesso',
    };
  }

  @Post(':workspaceId/send')
  @ApiOperation({ summary: 'Envia mensagem via WhatsApp conectado' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        phoneNumber: { type: 'string', example: '5511999999999' },
        message: { type: 'string', example: 'Olá! Mensagem enviada via KLOEL.' },
      },
    },
  })
  async sendMessage(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { phoneNumber: string; message: string },
  ) {
    const success = await this.whatsappConnection.sendMessage(
      workspaceId,
      body.phoneNumber,
      body.message,
    );

    if (success) {
      return {
        status: 'sent',
        message: 'Mensagem enviada com sucesso',
      };
    }

    return {
      status: 'error',
      message: 'Erro ao enviar mensagem. Verifique se o WhatsApp está conectado.',
    };
  }

  @Post(':workspaceId/send-media')
  @ApiOperation({ summary: 'Envia mídia (imagem, documento, áudio)' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        phoneNumber: { type: 'string', example: '5511999999999' },
        type: { type: 'string', enum: ['image', 'document', 'audio'] },
        mediaUrl: { type: 'string', example: 'https://example.com/file.pdf' },
        caption: { type: 'string', example: 'Confira nosso catálogo!' },
      },
    },
  })
  async sendMedia(
    @Param('workspaceId') workspaceId: string,
    @Body() body: {
      phoneNumber: string;
      type: 'image' | 'document' | 'audio';
      mediaUrl: string;
      caption?: string;
    },
  ) {
    const success = await this.whatsappConnection.sendMedia(
      workspaceId,
      body.phoneNumber,
      body.type,
      body.mediaUrl,
      body.caption,
    );

    return {
      status: success ? 'sent' : 'error',
      message: success ? 'Mídia enviada com sucesso' : 'Erro ao enviar mídia',
    };
  }

  @Get('active-sessions')
  @ApiOperation({ summary: 'Lista todas as sessões WhatsApp ativas' })
  getActiveSessions() {
    return {
      sessions: this.whatsappConnection.getActiveSessions(),
      total: this.whatsappConnection.getActiveSessions().length,
    };
  }

  // Métodos internos para notificação via SSE
  private async notifyQrUpdate(workspaceId: string, qr: string) {
    const subject = this.qrSubjects.get(workspaceId);
    if (subject) {
      const qrImage = await QRCode.toDataURL(qr);
      subject.next({
        data: {
          type: 'qr_update',
          qrCode: qr,
          qrCodeImage: qrImage,
        },
      } as MessageEvent);
    }
  }

  private notifyConnected(workspaceId: string, phoneNumber: string) {
    const subject = this.qrSubjects.get(workspaceId);
    if (subject) {
      subject.next({
        data: {
          type: 'connected',
          phoneNumber,
        },
      } as MessageEvent);
    }
  }

  private notifyDisconnected(workspaceId: string) {
    const subject = this.qrSubjects.get(workspaceId);
    if (subject) {
      subject.next({
        data: {
          type: 'disconnected',
        },
      } as MessageEvent);
    }
  }
}
