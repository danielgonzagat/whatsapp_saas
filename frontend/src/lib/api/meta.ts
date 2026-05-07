// Meta Ads, Instagram, Messenger API functions
import { mutate } from 'swr';
import { apiFetch } from './core';

const invalidateMeta = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/meta'));

// ============================================
// Meta Ads
// ============================================

export interface MetaCampaign {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Status property. */
  status: string;
  /** Effective_status property. */
  effective_status?: string;
  /** Insights property. */
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

/** Meta insight shape. */
export interface MetaInsight {
  /** Spend property. */
  spend?: string;
  /** Impressions property. */
  impressions?: string;
  /** Clicks property. */
  clicks?: string;
  /** Ctr property. */
  ctr?: string;
  /** Cpc property. */
  cpc?: string;
  /** Conversions property. */
  conversions?: string;
  /** Purchase_roas property. */
  purchase_roas?: Array<{ value: string }>;
  /** Action_values property. */
  action_values?: Array<{ action_type: string; value: string }>;
  /** Data property. */
  data?: MetaInsight[];
}

/** Meta lead form shape. */
export interface MetaLeadForm {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Status property. */
  status?: string;
  /** Leads_count property. */
  leads_count?: number;
}

/** Meta lead shape. */
export interface MetaLead {
  /** Id property. */
  id: string;
  /** Field_data property. */
  field_data: Array<{ name: string; values: string[] }>;
  /** Created_time property. */
  created_time?: string;
}

/** Meta ads api. Access token resolved server-side from DB per workspace. */
export const metaAdsApi = {
  /**
   * GET /meta/ads/campaigns — list campaigns for an ad account
   */
  getCampaigns: (adAccountId?: string) =>
    apiFetch<{ data: MetaCampaign[] }>(`/meta/ads/campaigns`, {
      params: adAccountId ? { adAccountId } : undefined,
    }),

  /**
   * PATCH /meta/ads/campaigns/:id/status — toggle campaign active/paused
   */
  updateCampaignStatus: async (campaignId: string, status: 'ACTIVE' | 'PAUSED') => {
    const res = await apiFetch<{ success: boolean }>(
      `/meta/ads/campaigns/${encodeURIComponent(campaignId)}/status`,
      {
        method: 'PATCH',
        body: { status },
      },
    );
    invalidateMeta();
    return res;
  },

  /**
   * GET /meta/ads/insights/account — account-level aggregated insights
   */
  getAccountInsights: (
    adAccountId?: string,
    opts?: { since?: string; until?: string; level?: string },
  ) =>
    apiFetch<MetaInsight>(`/meta/ads/insights/account`, {
      params: {
        adAccountId,
        since: opts?.since,
        until: opts?.until,
        level: opts?.level,
      },
    }),

  /**
   * GET /meta/ads/insights/daily — per-campaign daily insights
   */
  getDailyInsights: (campaignId: string, since?: string, until?: string) =>
    apiFetch<MetaInsight>(`/meta/ads/insights/daily`, {
      params: { campaignId, since, until },
    }),

  /**
   * GET /meta/ads/leads — list lead forms for a page
   */
  getLeadForms: (pageId?: string) =>
    apiFetch<{ data: MetaLeadForm[] }>(`/meta/ads/leads`, {
      params: pageId ? { pageId } : undefined,
    }),

  /**
   * GET /meta/ads/leads/:formId — get leads from a specific form
   */
  getFormLeads: (formId: string) =>
    apiFetch<{ data: MetaLead[] }>(`/meta/ads/leads/${encodeURIComponent(formId)}`),
};

// ============================================
// Instagram
// ============================================

export interface InstagramMedia {
  /** Id property. */
  id: string;
  /** Media_type property. */
  media_type: string;
  /** Media_url property. */
  media_url?: string;
  /** Thumbnail_url property. */
  thumbnail_url?: string;
  /** Timestamp property. */
  timestamp: string;
  /** Like_count property. */
  like_count?: number;
  /** Comments_count property. */
  comments_count?: number;
  /** Caption property. */
  caption?: string;
  /** Permalink property. */
  permalink?: string;
}

/** Instagram comment shape. */
export interface InstagramComment {
  /** Id property. */
  id: string;
  /** Text property. */
  text: string;
  /** Username property. */
  username?: string;
  /** Timestamp property. */
  timestamp?: string;
}

/** Instagram api. */
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
  publishPhoto: async (
    igAccountId: string,
    imageUrl: string,
    caption: string,
    accessToken: string,
  ) => {
    const res = await apiFetch<{ id: string; success?: boolean }>(`/meta/instagram/publish/photo`, {
      method: 'POST',
      body: { igAccountId, imageUrl, caption, accessToken },
    });
    invalidateMeta();
    return res;
  },

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
  replyToComment: async (commentId: string, text: string, accessToken: string) => {
    const res = await apiFetch<{ id: string }>(
      `/meta/instagram/comments/${encodeURIComponent(commentId)}/reply`,
      {
        method: 'POST',
        body: { text, accessToken },
      },
    );
    invalidateMeta();
    return res;
  },

  /**
   * POST /meta/instagram/messages/send — send Instagram DM
   */
  sendMessage: async (
    igAccountId: string,
    recipientId: string,
    text: string,
    accessToken: string,
  ) => {
    const res = await apiFetch<{ message_id?: string }>(`/meta/instagram/messages/send`, {
      method: 'POST',
      body: { igAccountId, recipientId, text, accessToken },
    });
    invalidateMeta();
    return res;
  },
};

// ============================================
// Messenger
// ============================================

export interface MessengerConversation {
  /** Id property. */
  id: string;
  /** Participants property. */
  participants?: { data: Array<{ id: string; name: string; email?: string }> };
  /** Updated_time property. */
  updated_time?: string;
  /** Messages property. */
  messages?: { data: Array<{ id: string; message: string; created_time: string }> };
}

/** Messenger api. */
export const messengerApi = {
  /**
   * POST /meta/messenger/send — send a Messenger text or media message
   */
  send: async (body: {
    pageId: string;
    recipientId: string;
    text?: string;
    mediaType?: string;
    mediaUrl?: string;
    pageAccessToken: string;
  }) => {
    const res = await apiFetch<{ message_id?: string }>(`/meta/messenger/send`, {
      method: 'POST',
      body,
    });
    invalidateMeta();
    return res;
  },

  /**
   * GET /meta/messenger/conversations — list page conversations
   */
  getConversations: (pageId: string, pageAccessToken: string) =>
    apiFetch<{ data: MessengerConversation[] }>(`/meta/messenger/conversations`, {
      params: { pageId, pageAccessToken },
    }),
};
