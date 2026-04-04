import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type CookieConsentRecord = {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  updatedAt: string;
};

type CookieConsentInput = {
  necessary?: boolean;
  analytics?: boolean;
  marketing?: boolean;
};

@Injectable()
export class CookieConsentService {
  constructor(private readonly prisma: PrismaService) {}

  normalize(input?: CookieConsentInput | null): CookieConsentRecord {
    return {
      necessary: true,
      analytics: Boolean(input?.analytics),
      marketing: Boolean(input?.marketing),
      updatedAt: new Date().toISOString(),
    };
  }

  parseCookieValue(rawValue?: string | null): CookieConsentRecord | null {
    const value = String(rawValue || '').trim();
    if (!value) return null;

    try {
      const parsed = JSON.parse(value) as CookieConsentInput & { updatedAt?: string };
      const consent = this.normalize(parsed);
      return {
        ...consent,
        updatedAt:
          typeof parsed?.updatedAt === 'string' && parsed.updatedAt.trim()
            ? parsed.updatedAt
            : consent.updatedAt,
      };
    } catch {
      return null;
    }
  }

  serializeCookieValue(consent: CookieConsentRecord): string {
    return JSON.stringify(consent);
  }

  async getForAgent(agentId: string): Promise<CookieConsentRecord | null> {
    const consent = await this.prisma.cookieConsent.findUnique({
      where: { agentId },
    });

    if (!consent) return null;

    return {
      necessary: consent.necessary,
      analytics: consent.analytics,
      marketing: consent.marketing,
      updatedAt: consent.updatedAt.toISOString(),
    };
  }

  async saveForAgent(
    agentId: string,
    input?: CookieConsentInput | null,
  ): Promise<CookieConsentRecord> {
    const normalized = this.normalize(input);
    const consent = await this.prisma.cookieConsent.upsert({
      where: { agentId },
      update: {
        necessary: true,
        analytics: normalized.analytics,
        marketing: normalized.marketing,
      },
      create: {
        agentId,
        necessary: true,
        analytics: normalized.analytics,
        marketing: normalized.marketing,
      },
    });

    return {
      necessary: consent.necessary,
      analytics: consent.analytics,
      marketing: consent.marketing,
      updatedAt: consent.updatedAt.toISOString(),
    };
  }
}
