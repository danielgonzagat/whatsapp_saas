// Meta Ads, Instagram, Messenger API functions
import { apiFetch } from './core';

// ============================================
// Meta Ads
// ============================================

export interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  effective_status?: string;
  insights?: {
    data?: Array<{
      spend?: string;
      impressions?: string;
      clicks?: string;
      ctr?: string;
      cpc?: string;
      conversions?: string;
      purchase_roas?: Array<{ value: string }>;
      action_values?: Array<{ action_type: string; value: string }>;
    }>;
  };
}

export interface MetaInsight {
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  conversions?: string;
  purchase_roas?: Array<{ value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  data?: MetaInsight[];
}

export interface MetaLeadForm {
  id: string;
  name: string;
  status?: string;
  leads_count?: number;
}

export interface MetaLead {
  id: string;
  field_data: Array<{ name: string; values: string[] }>;
  created_time?: string;
}

export const metaAdsApi = {
  /**
   * GET /meta/ads/campaigns — list campaigns for an ad account
   */
  getCampaigns: (adAccountId: string, accessToken: string) =>
    apiFetch<{ data: MetaCampaign[] }>(`/meta/ads/campaigns`, {
      params: { adAccountId, accessToken },
    }),

  /**
   * PATCH /meta/ads/campaigns/:id/status — toggle campaign active/paused
   */
  updateCampaignStatus: (
    campaignId: string,
    status: 'ACTIVE' | 'PAUSED',
    accessToken: string,
  ) =>
    apiFetch<{ success: boolean }>(`/meta/ads/campaigns/${encodeURIComponent(campaignId)}/status`, {
      method: 'PATCH',
      body: { status, accessToken },
    }),

  /**
   * GET /meta/ads/insights/account — account-level aggregated insights
   */
  getAccountInsights: (
    adAccountId: string,
    accessToken: string,
    opts?: { since?: string; until?: string; level?: string },
  ) =>
    apiFetch<MetaInsight>(`/meta/ads/insights/account`, {
      params: {
        adAccountId,
        accessToken,
        since: opts?.since,
        until: opts?.until,
        level: opts?.level,
      },
    }),

  /**
   * GET /meta/ads/insights/daily — per-campaign daily insights
   */
  getDailyInsights: (
    campaignId: string,
    accessToken: string,
    since?: string,
    until?: string,
  ) =>
    apiFetch<MetaInsight>(`/meta/ads/insights/daily`, {
      params: { campaignId, accessToken, since, until },
    }),

  /**
   * GET /meta/ads/leads — list lead forms for a page
   */
  getLeadForms: (pageId: string, accessToken: string) =>
    apiFetch<{ data: MetaLeadForm[] }>(`/meta/ads/leads`, {
      params: { pageId, accessToken },
    }),

  /**
   * GET /meta/ads/leads/:formId — get leads from a specific form
   */
  getFormLeads: (formId: string, accessToken: string) =>
    apiFetch<{ data: MetaLead[] }>(`/meta/ads/leads/${encodeURIComponent(formId)}`, {
      params: { accessToken },
    }),
};

// ============================================
// Instagram
// ============================================

export interface InstagramMedia {
  id: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
  caption?: string;
  permalink?: string;
}

export interface InstagramComment {
  id: string;
  text: string;
  username?: string;
  timestamp?: string;
}

export const instagramApi = {
  /**
   * GET /meta/instagram/media — list media posts
   */
  getMedia: (igAccountId: string, accessToken: string, limit = 25) =>
    apiFetch<{ data: InstagramMedia[] }>(`/meta/instagram/media`, {
      params: { igAccountId, accessToken, limit: String(limit) },
    }),

  /**
   * POST /meta/instagram/publish/photo — publish a photo post
   */
  publishPhoto: (
    igAccountId: string,
    imageUrl: string,
    caption: string,
    accessToken: string,
  ) =>
    apiFetch<{ id: string; success?: boolean }>(`/meta/instagram/publish/photo`, {
      method: 'POST',
      body: { igAccountId, imageUrl, caption, accessToken },
    }),

  /**
   * GET /meta/instagram/media/:id/comments — fetch comments on a post
   */
  getComments: (mediaId: string, accessToken: string) =>
    apiFetch<{ data: InstagramComment[] }>(
      `/meta/instagram/media/${encodeURIComponent(mediaId)}/comments`,
      { params: { accessToken } },
    ),

  /**
   * POST /meta/instagram/comments/:id/reply — reply to a comment
   */
  replyToComment: (commentId: string, text: string, accessToken: string) =>
    apiFetch<{ id: string }>(`/meta/instagram/comments/${encodeURIComponent(commentId)}/reply`, {
      method: 'POST',
      body: { text, accessToken },
    }),

  /**
   * POST /meta/instagram/messages/send — send Instagram DM
   */
  sendMessage: (
    igAccountId: string,
    recipientId: string,
    text: string,
    accessToken: string,
  ) =>
    apiFetch<{ message_id?: string }>(`/meta/instagram/messages/send`, {
      method: 'POST',
      body: { igAccountId, recipientId, text, accessToken },
    }),
};

// ============================================
// Messenger
// ============================================

export interface MessengerConversation {
  id: string;
  participants?: { data: Array<{ id: string; name: string; email?: string }> };
  updated_time?: string;
  messages?: { data: Array<{ id: string; message: string; created_time: string }> };
}

export const messengerApi = {
  /**
   * POST /meta/messenger/send — send a Messenger text or media message
   */
  send: (body: {
    pageId: string;
    recipientId: string;
    text?: string;
    mediaType?: string;
    mediaUrl?: string;
    pageAccessToken: string;
  }) =>
    apiFetch<{ message_id?: string }>(`/meta/messenger/send`, {
      method: 'POST',
      body,
    }),

  /**
   * GET /meta/messenger/conversations — list page conversations
   */
  getConversations: (pageId: string, pageAccessToken: string) =>
    apiFetch<{ data: MessengerConversation[] }>(`/meta/messenger/conversations`, {
      params: { pageId, pageAccessToken },
    }),
};
