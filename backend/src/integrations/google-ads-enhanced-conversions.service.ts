import { Injectable, Logger, Optional } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { decryptGoogleAdsToken } from './google-ads-token-crypto';
import { getTraceHeaders } from '../common/trace-headers';
import { OpsAlertService } from '../observability/ops-alert.service';

interface EnhancedConversionUserData {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

interface EnhancedConversionData {
  conversionActionId: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  conversionDateTime?: string;
  conversionValue?: number;
  currencyCode?: string;
  orderId?: string;
  userData: EnhancedConversionUserData;
}

interface GoogleAdsConversionPayload {
  conversions: Array<{
    conversionAction: string;
    gclid?: string;
    gbraid?: string;
    wbraid?: string;
    conversionDateTime?: string;
    conversionValue?: number;
    currencyCode?: string;
    orderId?: string;
    userIdentifiers: Array<{
      addressInfo?: {
        hashedEmail?: string;
        hashedPhoneNumber?: string;
        hashedFirstName?: string;
        hashedLastName?: string;
        hashedStreetAddress?: string;
        city?: string;
        state?: string;
        zip?: string;
        countryCode?: string;
      };
      [key: string]: unknown;
    }>;
  }>;
}

function hashPii(value: string | undefined | null): string {
  if (!value) {
    return '';
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return '';
  }
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

@Injectable()
export class GoogleAdsEnhancedConversionsService {
  private readonly logger = new Logger(GoogleAdsEnhancedConversionsService.name);
  private readonly apiVersion = process.env.GOOGLE_ADS_API_VERSION || 'v18';

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  async uploadConversion(
    workspaceId: string,
    customerId: string,
    data: EnhancedConversionData,
  ): Promise<{ success: boolean; error?: string }> {
    const cred = await this.prisma.integrationCredential.findUnique({
      where: { workspaceId },
      select: { accessToken: true, loginCustomerId: true },
    });

    if (!cred?.accessToken) {
      return { success: false, error: 'no_google_ads_connection' };
    }

    const accessToken = decryptGoogleAdsToken(cred.accessToken) || cred.accessToken;
    const developerToken = String(process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '').trim();

    if (!developerToken) {
      return { success: false, error: 'developer_token_not_configured' };
    }

    const userIdentifiers: Array<{ addressInfo?: Record<string, string> }> = [];
    const hashedData: Record<string, string> = {};

    const emailHash = hashPii(data.userData.email);
    if (emailHash) {
      hashedData.hashedEmail = emailHash;
    }

    const phoneHash = hashPii(data.userData.phone);
    if (phoneHash) {
      hashedData.hashedPhoneNumber = phoneHash;
    }

    const firstNameHash = hashPii(data.userData.firstName);
    if (firstNameHash) {
      hashedData.hashedFirstName = firstNameHash;
    }

    const lastNameHash = hashPii(data.userData.lastName);
    if (lastNameHash) {
      hashedData.hashedLastName = lastNameHash;
    }

    const streetHash = hashPii(data.userData.street);
    if (streetHash) {
      hashedData.hashedStreetAddress = streetHash;
    }

    if (data.userData.city) {
      hashedData.city = data.userData.city;
    }
    if (data.userData.state) {
      hashedData.state = data.userData.state;
    }
    if (data.userData.zip) {
      hashedData.zip = data.userData.zip;
    }
    if (data.userData.country) {
      hashedData.countryCode = data.userData.country;
    }

    if (Object.keys(hashedData).length > 0) {
      userIdentifiers.push({ addressInfo: hashedData });
    }

    const conversionItem: GoogleAdsConversionPayload['conversions'][number] = {
      conversionAction: `customers/${customerId}/conversionActions/${data.conversionActionId}`,
      conversionDateTime: data.conversionDateTime || new Date().toISOString(),
      currencyCode: data.currencyCode || 'BRL',
      userIdentifiers,
    };

    if (data.gclid) {
      conversionItem.gclid = data.gclid;
    }
    if (data.gbraid) {
      conversionItem.gbraid = data.gbraid;
    }
    if (data.wbraid) {
      conversionItem.wbraid = data.wbraid;
    }
    if (data.conversionValue !== undefined) {
      conversionItem.conversionValue = data.conversionValue;
    }
    if (data.orderId) {
      conversionItem.orderId = data.orderId;
    }

    const payload: GoogleAdsConversionPayload = {
      conversions: [conversionItem],
    };

    const loginCustomerId = cred.loginCustomerId || customerId;
    const url = `https://googleads.googleapis.com/${this.apiVersion}/customers/${loginCustomerId}:uploadClickConversions`;

    this.logger.log(
      `Google Ads EC upload: customer=${customerId} action=${data.conversionActionId}`,
    );

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          ...getTraceHeaders(),
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'developer-token': developerToken,
          'login-customer-id': loginCustomerId,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });

      const body = await res.json().catch(() => ({ error: { message: 'parse_error' } }));
      const bodyObj = body as { error?: { message?: string } };

      if (!res.ok || bodyObj.error) {
        this.logger.error(
          `Google Ads EC upload failed: status=${res.status} error=${JSON.stringify(bodyObj.error || body)}`,
        );
        void this.opsAlert?.alertOnCriticalError(
          new Error(`Google Ads EC upload failed: ${JSON.stringify(bodyObj.error || body)}`),
          'GoogleAdsEnhancedConversionsService.uploadConversion',
        );
        return { success: false, error: String(bodyObj.error?.message || 'http_error') };
      }

      this.logger.log(`Google Ads EC uploaded: customer=${customerId}`);
      return { success: true };
    } catch (err: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        err,
        'GoogleAdsEnhancedConversionsService.uploadConversion',
      );
      this.logger.error(
        `Google Ads EC upload error: error=${err instanceof Error ? err.message : 'unknown'}`,
      );

      if (err instanceof Error && err.message.includes('timeout')) {
        return { success: false, error: 'timeout' };
      }

      return { success: false, error: err instanceof Error ? err.message : 'unknown' };
    }
  }

  async uploadBatchConversions(
    workspaceId: string,
    customerId: string,
    conversions: EnhancedConversionData[],
  ): Promise<Array<{ success: boolean; error?: string }>> {
    const results: Array<{ success: boolean; error?: string }> = [];

    for (const conversion of conversions) {
      const result = await this.uploadConversion(workspaceId, customerId, conversion);
      const entry: { success: boolean; error?: string } = { success: result.success };
      if (result.error) {
        entry.error = result.error;
      }
      results.push(entry);
    }

    return results;
  }

  static hashEmail(email: string): string {
    return hashPii(email);
  }

  static hashPhone(phone: string): string {
    return hashPii(phone);
  }
}
