import { BadRequestException, Injectable } from '@nestjs/common';
import { GdprStatus, GdprType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { generateCode, parseFacebookSignedRequest } from './gdpr.helpers';

@Injectable()
export class GdprFacebookCallbackService {
  constructor(private readonly prisma: PrismaService) {}

  async handleFacebookCallback(signedRequest: string) {
    const payload = parseFacebookSignedRequest(signedRequest);
    const providerUserId = String(payload.user_id || '').trim();
    if (!providerUserId) {
      throw new BadRequestException('signed_request sem user_id.');
    }

    const agent = await this.prisma.agent.findFirst({
      where: {
        OR: [
          { provider: 'facebook', providerId: providerUserId },
          {
            socialAccounts: {
              some: { provider: 'facebook', providerUserId },
            },
          },
        ],
      },
      select: { id: true, workspaceId: true },
    });

    if (!agent) {
      const siteUrl = process.env.FRONTEND_URL || 'https://kloel.com';
      return {
        url: `${siteUrl.replace(/\/$/, '')}/data-deletion`,
        confirmation_code: 'not_found',
      };
    }

    const code = generateCode();

    const request = await this.prisma.gdprRequest.create({
      data: {
        workspaceId: agent.workspaceId,
        userId: agent.id,
        type: GdprType.DELETE,
        code,
        status: GdprStatus.VERIFYING,
      },
    });

    return {
      url: `${(process.env.FRONTEND_URL || 'https://kloel.com').replace(/\/$/, '')}/data-deletion/status/${code}`,
      confirmation_code: code,
    };
  }
}
