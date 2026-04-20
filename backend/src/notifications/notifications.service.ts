import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

const N_RE = /\\n/g;

/** Notifications service. */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private firebaseApp: admin.app.App | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly config: ConfigService,
  ) {
    this.initFirebase();
  }

  private initFirebase() {
    try {
      const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
      const privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY');

      if (projectId && clientEmail && privateKey) {
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey: privateKey.replace(N_RE, '\n'),
          }),
        });
        this.logger.log('✅ Firebase Admin SDK inicializado');
      } else {
        this.logger.warn('⚠️ Firebase não configurado - push notifications desabilitadas');
      }
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      if ((error as { code?: string } | null)?.code === 'app/duplicate-app') {
        this.firebaseApp = admin.app();
        this.logger.log('✅ Firebase Admin SDK já inicializado');
      } else {
        this.logger.error(`❌ Erro ao inicializar Firebase: ${errorInstanceofError.message}`);
      }
    }
  }

  async registerDevice(agentId: string, token: string, platform: string) {
    this.logger.log(`Registering device for agent ${agentId}: ${platform}`);

    return this.prisma.deviceToken.upsert({
      where: { token },
      update: { agentId, platform },
      create: {
        token,
        platform,
        agentId,
      },
    });
  }

  async unregisterDevice(token: string) {
    this.logger.log(`Unregistering device token: ${token.substring(0, 20)}...`);

    const device = await this.prisma.deviceToken
      .findUnique({ where: { token }, select: { id: true, agentId: true } })
      .catch(() => null);
    if (device) {
      await this.auditService
        .log({
          workspaceId: 'system',
          action: 'DELETE_RECORD',
          resource: 'DeviceToken',
          resourceId: device.id,
          agentId: device.agentId,
          details: { deletedBy: 'user' },
        })
        .catch(() => {});
    }

    return this.prisma.deviceToken
      .delete({
        where: { token },
      })
      .catch((err) => {
        this.logger.warn(`Failed to unregister device token: ${err?.message}`);
        return null;
      });
  }

  // messageLimit: push notifications are not WhatsApp messages; no WhatsApp rate limit applies
  async sendPushNotification(
    agentId: string,
    title: string,
    body: string,
    data: Record<string, string> = {},
  ) {
    const devices = await this.prisma.deviceToken.findMany({
      where: { agentId },
      select: { id: true, token: true },
      take: 50,
    });

    if (devices.length === 0) {
      this.logger.debug(`Nenhum device registrado para agent ${agentId}`);
      return { sent: 0, failed: 0 };
    }

    this.logger.log(`📱 Enviando push para ${devices.length} devices do agent ${agentId}`);

    if (!this.firebaseApp) {
      this.logger.warn('Firebase não configurado - push não enviado');
      return {
        sent: 0,
        failed: devices.length,
        reason: 'firebase_not_configured',
      };
    }

    try {
      const tokens = devices.map((d) => d.token);

      const message: admin.messaging.MulticastMessage = {
        tokens,
        notification: {
          title,
          body,
        },
        data: {
          ...data,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'kloel_notifications',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().sendEachForMulticast(message);

      this.logger.log(
        `✅ Push enviado: ${response.successCount} sucesso, ${response.failureCount} falhas`,
      );

      // Remover tokens inválidos
      if (response.failureCount > 0) {
        const tokensToRemove: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
            tokensToRemove.push(tokens[idx]);
          }
        });

        if (tokensToRemove.length > 0) {
          await this.prisma.deviceToken.deleteMany({
            where: { token: { in: tokensToRemove } },
          });
          this.logger.log(`🗑️ ${tokensToRemove.length} tokens inválidos removidos`);
        }
      }

      return {
        sent: response.successCount,
        failed: response.failureCount,
      };
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.error(`❌ Erro ao enviar push: ${errorInstanceofError.message}`);
      return { sent: 0, failed: devices.length, error: errorInstanceofError.message };
    }
  }

  /**
   * Envia notificação para todos os agents de um workspace
   */
  async sendPushToWorkspace(
    workspaceId: string,
    title: string,
    body: string,
    data: Record<string, string> = {},
  ) {
    const agents = await this.prisma.agent.findMany({
      where: { workspaceId },
      select: { id: true },
      take: 100,
    });

    const results = await Promise.all(
      agents.map((agent) => this.sendPushNotification(agent.id, title, body, data)),
    );

    const totalSent = results.reduce((sum, r) => sum + r.sent, 0);
    const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);

    return { sent: totalSent, failed: totalFailed };
  }

  /**
   * Notifica sobre nova mensagem recebida
   */
  async notifyNewMessage(
    workspaceId: string,
    contactName: string,
    messagePreview: string,
    conversationId: string,
  ) {
    return this.sendPushToWorkspace(
      workspaceId,
      `💬 ${contactName}`,
      messagePreview.substring(0, 100),
      {
        type: 'new_message',
        conversationId,
      },
    );
  }

  /**
   * Notifica sobre pagamento recebido
   */
  async notifyPaymentReceived(workspaceId: string, amount: number, customerName: string) {
    return this.sendPushToWorkspace(
      workspaceId,
      '💰 Pagamento Recebido!',
      `${customerName} pagou R$ ${amount.toFixed(2)}`,
      {
        type: 'payment_received',
        amount: amount.toString(),
      },
    );
  }
}
