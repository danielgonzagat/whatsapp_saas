import { Injectable } from '@nestjs/common';
import { MetaSdkService } from '../meta-sdk.service';

/** Meta ads service. */
@Injectable()
export class MetaAdsService {
  constructor(private readonly metaSdk: MetaSdkService) {}

  /** Get campaigns. */
  async getCampaigns(adAccountId: string, accessToken: string, params?: Record<string, unknown>) {
    const fields = 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time';
    return this.metaSdk.graphApiGet(
      `act_${adAccountId}/campaigns`,
      { fields, ...params },
      accessToken,
    );
  }

  /** Get account insights. */
  async getAccountInsights(
    adAccountId: string,
    accessToken: string,
    params: { since: string; until: string; level?: string },
  ) {
    const fields =
      'spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,action_values,cost_per_action_type';
    return this.metaSdk.graphApiGet(
      `act_${adAccountId}/insights`,
      {
        fields,
        time_range: JSON.stringify({
          since: params.since,
          until: params.until,
        }),
        level: params.level || 'account',
      },
      accessToken,
    );
  }

  /** Get campaign insights. */
  async getCampaignInsights(campaignId: string, accessToken: string, since: string, until: string) {
    const fields = 'spend,impressions,clicks,ctr,cpc,reach,actions,action_values';
    return this.metaSdk.graphApiGet(
      `${campaignId}/insights`,
      { fields, time_range: JSON.stringify({ since, until }) },
      accessToken,
    );
  }

  /** Update campaign status. */
  async updateCampaignStatus(campaignId: string, status: 'ACTIVE' | 'PAUSED', accessToken: string) {
    return this.metaSdk.graphApiPost(campaignId, { status }, accessToken);
  }

  /** Get lead forms. */
  async getLeadForms(pageId: string, accessToken: string) {
    return this.metaSdk.graphApiGet(
      `${pageId}/leadgen_forms`,
      { fields: 'id,name,status,leads_count' },
      accessToken,
    );
  }

  /** Get leads. */
  async getLeads(formId: string, accessToken: string) {
    return this.metaSdk.graphApiGet(
      `${formId}/leads`,
      { fields: 'id,created_time,field_data' },
      accessToken,
    );
  }
}
