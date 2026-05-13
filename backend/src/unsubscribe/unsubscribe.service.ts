import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { verifyUnsubscribeToken } from '../common/utils/unsubscribe-token.util';

export interface UnsubscribeResult {
  success: boolean;
  email?: string;
  workspaceId?: string;
  contactId?: string;
  error?: string;
}

@Injectable()
export class UnsubscribeService {
  private readonly logger = new Logger(UnsubscribeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async processUnsubscribeToken(token: string): Promise<UnsubscribeResult> {
    const payload = verifyUnsubscribeToken(token);
    if (!payload) {
      return { success: false, error: 'invalid_token' };
    }

    const email = payload.email;
    const workspaceId = payload.workspaceId;

    try {
      if (!workspaceId) {
        const contact = await this.prisma.contact.findFirst({
          where: { email: { equals: email, mode: 'insensitive' } },
          select: { id: true, workspaceId: true, optIn: true },
        });

        if (!contact) {
          this.logger.warn(`Unsubscribe token for unknown email: ${email}`);
          return { success: false, error: 'contact_not_found' };
        }

        await this.prisma.contact.update({
          where: { id: contact.id },
          data: { optIn: false, optedOutAt: new Date() },
        });

        return {
          success: true,
          email,
          workspaceId: contact.workspaceId,
          contactId: contact.id,
        };
      }

      const contacts = await this.prisma.contact.findMany({
        where: {
          email: { equals: email, mode: 'insensitive' },
          workspaceId,
        },
        select: { id: true, workspaceId: true, optIn: true },
        take: 1,
      });

      const contact = contacts[0];

      if (!contact) {
        this.logger.warn(`Unsubscribe token for unknown contact: workspace=${workspaceId} email=${email}`);
        return { success: false, error: 'contact_not_found' };
      }

      await this.prisma.contact.update({
        where: { id: contact.id },
        data: { optIn: false, optedOutAt: new Date() },
      });

      return {
        success: true,
        email,
        workspaceId: contact.workspaceId,
        contactId: contact.id,
      };
    } catch (error: unknown) {
      this.logger.error(
        `Unsubscribe failed: ${error instanceof Error ? error.message : 'unknown_error'}`,
      );
      return { success: false, error: 'internal_error' };
    }
  }
}
