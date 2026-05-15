import { Injectable, Logger } from '@nestjs/common';
import { enums } from 'google-ads-api';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AdProvider,
  OAuthConnectResult,
  OAuthStatusResult,
  SyncAccountsResult,
  SyncCampaignsResult,
  SyncInsightsResult,
  DisconnectResult,
  RefreshTokenResult,
} from './ad-provider.interface';
import { NotConfiguredException } from './exceptions/not-configured.exception';
import {
  buildGoogleAdsClientParams,
  createGoogleAdsApiClient,
  decryptGoogleAdsTokenOrPlain,
  GOOGLE_ADS_PLATFORM,
} from './google-ads.helpers';
import {
  buildGoogleAdsAccount,
  mapGoogleAdsCampaignRow,
  mapGoogleAdsInsightRows,
} from './google-ads.mappers';
import {
  completeGoogleAdsOAuth,
  connectGoogleAdsOAuth,
  disconnectGoogleAdsOAuth,
  refreshGoogleAdsOAuthToken,
} from './google-ads-oauth.helpers';

@Injectable()
export class GoogleAdsProvider implements AdProvider {
  readonly platform = GOOGLE_ADS_PLATFORM;
  private readonly logger = new Logger(GoogleAdsProvider.name);

  constructor(private readonly prisma: PrismaService) {}

  private async getCredential(workspaceId: string) {
    const cred = await this.prisma.integrationCredential.findUnique({
      where: { workspaceId },
    });

    if (!cred || !cred.refreshToken || cred.status !== 'connected') {
      throw new NotConfiguredException(
        'Google Ads workspace not connected — OAuth tokens missing',
        GOOGLE_ADS_PLATFORM,
        ['refreshToken'],
      );
    }

    const accessToken = decryptGoogleAdsTokenOrPlain(cred.accessToken);
    const refreshToken = decryptGoogleAdsTokenOrPlain(cred.refreshToken);

    return {
      credential: cred,
      refreshToken,
      accessToken,
    };
  }

  async connect(workspaceId: string, redirectUri: string): Promise<OAuthConnectResult> {
    return connectGoogleAdsOAuth(this.oauthContext(), workspaceId, redirectUri);
  }

  async completeOAuth(
    workspaceId: string,
    code: string,
    redirectUri: string,
  ): Promise<OAuthConnectResult> {
    return completeGoogleAdsOAuth(this.oauthContext(), workspaceId, code, redirectUri);
  }

  async getStatus(workspaceId: string): Promise<OAuthStatusResult> {
    const cred = await this.prisma.integrationCredential.findUnique({
      where: { workspaceId },
      select: { status: true, loginCustomerId: true },
    });

    const connected = cred?.status === 'connected';
    const loginCustomerId = cred?.loginCustomerId;

    const result: OAuthStatusResult = {
      connected,
      status: cred?.status || 'disconnected',
    };

    if (loginCustomerId) {
      result.accountId = loginCustomerId;
    }

    return result;
  }

  async disconnect(workspaceId: string): Promise<DisconnectResult> {
    return disconnectGoogleAdsOAuth(this.oauthContext(), workspaceId);
  }

  async refreshToken(workspaceId: string): Promise<RefreshTokenResult | null> {
    return refreshGoogleAdsOAuthToken(this.oauthContext(), workspaceId);
  }

  async syncAccounts(workspaceId: string): Promise<SyncAccountsResult> {
    const { refreshToken, credential } = await this.getCredential(workspaceId);
    const { clientId, clientSecret, developerToken } = buildGoogleAdsClientParams();

    const client = createGoogleAdsApiClient({ clientId, clientSecret, developerToken });

    const accessible = await client.listAccessibleCustomers(refreshToken);
    const resourceNames = (accessible as { resource_names?: string[] }).resource_names || [];
    const customerIds = resourceNames.map((rn) => rn.replace('customers/', ''));
    if (customerIds.length === 0) {
      return { accounts: [] };
    }

    const accounts: SyncAccountsResult['accounts'] = [];
    const loginCustomerId = customerIds.length > 1 ? customerIds[0] : null;

    for (const customerId of customerIds) {
      try {
        const customer = client.Customer({
          customer_id: customerId,
          refresh_token: refreshToken,
          ...(loginCustomerId ? { login_customer_id: loginCustomerId } : {}),
        });
        const rows = await customer.query(
          `SELECT customer_client.descriptive_name FROM customer_client WHERE customer_client.id = '${customerId}'`,
        );
        const data = Array.isArray(rows) ? rows[0] : undefined;
        const cdata = (data as Record<string, unknown> | undefined)?.customer_client as
          | { descriptive_name?: string }
          | undefined;
        accounts.push(buildGoogleAdsAccount(customerId, cdata?.descriptive_name));
      } catch (err) {
        this.logger.error(`Failed to fetch account details for ${customerId}`, err);
        accounts.push(buildGoogleAdsAccount(customerId));
      }
    }

    if (loginCustomerId && loginCustomerId !== credential.loginCustomerId) {
      await this.prisma.integrationCredential.update({
        where: { workspaceId },
        data: { loginCustomerId, updatedAt: new Date() },
      });
    }

    return { accounts };
  }

  async syncCampaigns(workspaceId: string): Promise<SyncCampaignsResult> {
    const dbAccounts = await this.prisma.adAccount.findMany({
      where: { workspaceId, platform: GOOGLE_ADS_PLATFORM },
      select: { accountId: true },
    });
    if (dbAccounts.length === 0) {
      return { campaigns: [] };
    }

    const { refreshToken, credential } = await this.getCredential(workspaceId);
    const { clientId, clientSecret, developerToken } = buildGoogleAdsClientParams();

    const client = createGoogleAdsApiClient({ clientId, clientSecret, developerToken });

    const loginCustomerId: string | null | undefined =
      credential.loginCustomerId || (dbAccounts.length > 1 ? dbAccounts[0]?.accountId : null);

    const campaigns: SyncCampaignsResult['campaigns'] = [];

    for (const account of dbAccounts) {
      try {
        const customer = client.Customer({
          customer_id: account.accountId,
          refresh_token: refreshToken,
          ...(loginCustomerId ? { login_customer_id: loginCustomerId } : {}),
        });
        const rows = await customer.report({
          entity: 'campaign',
          attributes: ['campaign.id', 'campaign.name', 'campaign.status'],
          metrics: [
            'metrics.cost_micros',
            'metrics.impressions',
            'metrics.clicks',
            'metrics.conversions',
            'metrics.ctr',
            'metrics.average_cpc',
            'metrics.conversions_value',
          ],
          constraints: {
            'campaign.status': enums.CampaignStatus.ENABLED,
          },
          date_constant: 'LAST_30_DAYS',
        });

        const data = (Array.isArray(rows) ? rows : [rows]) as Record<string, unknown>[];
        for (const row of data) {
          campaigns.push(mapGoogleAdsCampaignRow(row, account.accountId));
        }
      } catch (err) {
        this.logger.error(`Failed to sync campaigns for account ${account.accountId}`, err);
      }
    }

    return { campaigns };
  }

  async syncInsights(workspaceId: string, since: Date, until: Date): Promise<SyncInsightsResult> {
    const dbAccounts = await this.prisma.adAccount.findMany({
      where: { workspaceId, platform: GOOGLE_ADS_PLATFORM },
      select: { accountId: true },
    });
    if (dbAccounts.length === 0) {
      return { insights: [] };
    }

    const { refreshToken, credential } = await this.getCredential(workspaceId);
    const { clientId, clientSecret, developerToken } = buildGoogleAdsClientParams();

    const client = createGoogleAdsApiClient({ clientId, clientSecret, developerToken });

    const loginCustomerId: string | null | undefined =
      credential.loginCustomerId || (dbAccounts.length > 1 ? dbAccounts[0]?.accountId : null);

    const fromDate = since.toISOString().slice(0, 10);
    const toDate = until.toISOString().slice(0, 10);
    const insights: SyncInsightsResult['insights'] = [];

    for (const account of dbAccounts) {
      try {
        const customer = client.Customer({
          customer_id: account.accountId,
          refresh_token: refreshToken,
          ...(loginCustomerId ? { login_customer_id: loginCustomerId } : {}),
        });
        const rows = await customer.report({
          entity: 'campaign',
          attributes: ['campaign.id', 'campaign.name'],
          metrics: [
            'metrics.cost_micros',
            'metrics.impressions',
            'metrics.clicks',
            'metrics.conversions',
            'metrics.ctr',
            'metrics.average_cpc',
            'metrics.conversions_value',
          ],
          segments: ['segments.date'],
          from_date: fromDate,
          to_date: toDate,
        });

        const data = (Array.isArray(rows) ? rows : [rows]) as Record<string, unknown>[];
        insights.push(...mapGoogleAdsInsightRows(data, account.accountId));
      } catch (err) {
        this.logger.error(`Failed to sync insights for account ${account.accountId}`, err);
      }
    }

    return { insights };
  }

  private oauthContext() {
    return { prisma: this.prisma, logger: this.logger };
  }
}
