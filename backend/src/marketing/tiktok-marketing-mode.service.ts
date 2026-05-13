import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type TikTokMode = 'sell' | 'listen' | 'blocked';

export interface TikTokModeResult {
  mode: TikTokMode;
  details: {
    /** Whether TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET are both configured. */
    clientConfigured: boolean;
    secretConfigured: boolean;
    /** Whether TIKTOK_OUTBOUND_APPROVED === 'true'. */
    outboundApproved: boolean;
    /** Whether a valid (non-expired) token exists in the workspace. */
    tokenValid: boolean;
    /** Whether at least one successful outbound was recorded in the last 7 days. */
    recentOutbound: boolean;
    /** Missing env vars (human-readable). */
    missingVariables: string[];
    /** Required steps to unlock the next mode tier. */
    requiredSteps: string[];
  };
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class TikTokMarketingModeService {
  private readonly logger = new Logger(TikTokMarketingModeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveMode(workspaceId: string, tokenExpired = false): Promise<TikTokModeResult> {
    const clientKey = this.tryReadTikTokClientKey();
    const clientSecret = this.tryReadTikTokSecret();
    const outboundApproved = this.readOutboundApproved();

    const clientConfigured = Boolean(clientKey);
    const secretConfigured = Boolean(clientSecret);

    const missingVariables: string[] = [];
    const requiredSteps: string[] = [];

    if (!clientConfigured) {
      missingVariables.push('TIKTOK_CLIENT_KEY');
      requiredSteps.push('Configure TIKTOK_CLIENT_KEY no ambiente de producao');
    }
    if (!secretConfigured) {
      missingVariables.push('TIKTOK_CLIENT_SECRET');
      requiredSteps.push('Configure TIKTOK_CLIENT_SECRET no ambiente de producao');
    }

    const tokenValid = clientConfigured && secretConfigured && !tokenExpired;

    let mode: TikTokMode;

    if (!clientConfigured || !secretConfigured) {
      mode = 'blocked';
      return {
        mode,
        details: {
          clientConfigured,
          secretConfigured,
          outboundApproved,
          tokenValid: false,
          recentOutbound: false,
          missingVariables,
          requiredSteps: requiredSteps.length
            ? requiredSteps
            : ['Credenciais TikTok ausentes — contate o administrador'],
        },
      };
    }

    if (!tokenValid) {
      mode = 'blocked';
      return {
        mode,
        details: {
          clientConfigured,
          secretConfigured,
          outboundApproved,
          tokenValid: false,
          recentOutbound: false,
          missingVariables,
          requiredSteps: [
            'Token do TikTok expirado ou revogado — reconecte a conta TikTok',
            ...requiredSteps,
          ],
        },
      };
    }

    if (!outboundApproved) {
      mode = 'listen';
      return {
        mode,
        details: {
          clientConfigured,
          secretConfigured,
          outboundApproved: false,
          tokenValid: true,
          recentOutbound: false,
          missingVariables: ['TIKTOK_OUTBOUND_APPROVED'],
          requiredSteps: [
            'O app TikTok ainda nao foi aprovado para envio pro-ativo',
            'Defina TIKTOK_OUTBOUND_APPROVED=true quando aprovado',
          ],
        },
      };
    }

    const recentOutbound = await this.hasRecentOutbound(workspaceId);

    if (recentOutbound) {
      mode = 'sell';
    } else {
      mode = 'listen';
    }

    const result: TikTokModeResult = {
      mode,
      details: {
        clientConfigured,
        secretConfigured,
        outboundApproved: true,
        tokenValid: true,
        recentOutbound,
        missingVariables,
        requiredSteps,
      },
    };

    if (mode === 'listen') {
      result.details.requiredSteps.push(
        'Nenhum envio pro-ativo nos ultimos 7 dias — o canal entrara em modo sell apos o primeiro envio',
      );
    }

    this.logger.log(
      `TikTok mode resolved for workspace ${workspaceId}: ${mode}`,
      { context: 'TikTokMarketingModeService.resolveMode' },
    );

    return result;
  }

  private async hasRecentOutbound(workspaceId: string): Promise<boolean> {
    const since = new Date(Date.now() - SEVEN_DAYS_MS);
    const count = await this.prisma.message.count({
      where: {
        workspaceId,
        direction: 'OUTBOUND',
        status: { in: ['SENT', 'DELIVERED', 'READ'] },
        createdAt: { gte: since },
      },
    });

    if (count > 0) {
      return true;
    }

    const saleCount = await this.prisma.kloelSale.count({
      where: {
        workspaceId,
        status: 'paid',
        paidAt: { gte: since },
      },
    });

    return saleCount > 0;
  }

  private tryReadTikTokClientKey(): string {
    return (
      String(process.env.TIKTOK_CLIENT_KEY || '').trim() ||
      String(process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY || '').trim()
    );
  }

  private tryReadTikTokSecret(): string {
    return String(process.env.TIKTOK_CLIENT_SECRET || '').trim();
  }

  private readOutboundApproved(): boolean {
    return String(process.env.TIKTOK_OUTBOUND_APPROVED || '').trim().toLowerCase() === 'true';
  }
}
