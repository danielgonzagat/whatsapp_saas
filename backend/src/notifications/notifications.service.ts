import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

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

  async sendPushNotification(
    agentId: string,
    title: string,
    body: string,
    data: any = {},
  ) {
    const devices = await this.prisma.deviceToken.findMany({
      where: { agentId },
    });

    if (devices.length === 0) return;

    this.logger.log(
      `Sending push to ${devices.length} devices for agent ${agentId}`,
    );
    if (data && Object.keys(data).length > 0) {
      this.logger.debug(`Push payload for agent ${agentId}`, data);
    }

    // TODO: Integrate with Firebase Admin SDK (FCM)
    // await firebase.messaging().sendMulticast({
    //   tokens: devices.map(d => d.token),
    //   notification: { title, body },
    //   data,
    // });
  }
}
