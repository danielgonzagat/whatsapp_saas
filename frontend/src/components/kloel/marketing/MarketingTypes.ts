export interface ChannelRealData {
  messages: number;
  leads: number;
  sales: number;
  status: string;
}

export interface ChannelStatRow {
  label: string;
  value: string;
}

export interface WhatsAppChannelConnection {
  provider?: string;
  connected?: boolean;
  status?: string;
  authUrl?: string;
  phoneNumberId?: string | null;
  whatsappBusinessId?: string | null;
  phoneNumber?: string | null;
  pushName?: string | null;
  degradedReason?: string | null;
}

export interface InstagramChannelConnection {
  connected?: boolean;
  status?: string;
  authUrl?: string;
  instagramAccountId?: string | null;
  username?: string | null;
  pageName?: string | null;
}

export interface FacebookChannelConnection {
  connected?: boolean;
  status?: string;
  authUrl?: string;
  pageId?: string | null;
  pageName?: string | null;
}

export interface EmailChannelConnection {
  connected?: boolean;
  status?: string;
  enabled?: boolean;
  provider?: string;
  providerAvailable?: boolean;
  fromEmail?: string;
  fromName?: string;
  workspaceName?: string | null;
}

export interface MarketingConnectStatus {
  meta?: {
    connected?: boolean;
    tokenExpired?: boolean;
    pageName?: string | null;
    pageId?: string | null;
    instagramUsername?: string | null;
    updatedAt?: string | null;
  };
  channels?: {
    whatsapp?: WhatsAppChannelConnection;
    instagram?: InstagramChannelConnection;
    facebook?: FacebookChannelConnection;
    email?: EmailChannelConnection;
  };
}

export interface IgProfileData {
  username?: string;
  name?: string;
  followers?: number;
  followersCount?: number;
  followers_count?: number;
  posts?: number;
  mediaCount?: number;
  media_count?: number;
  bio?: string;
}

export interface IgInsightsData {
  impressions?: number;
  reach?: number;
  engagement?: number;
  follower_count?: number;
  followersCount?: number;
}

export interface TikTokStatusData {
  connected?: boolean;
  status?: string;
  kind?: string | null;
  openId?: string | null;
  advertiserIds?: string[];
  expiresAt?: string | null;
  secretConfigured?: boolean;
}

export interface AIBrainInfo {
  productsLoaded: number;
  activeConversations: number;
  objectionsMapped: number;
  avgResponseTime: string;
  status: string;
  [key: string]: unknown;
}

export interface FeedMessageLike {
  text?: string;
  content?: string;
  from?: string;
  contactName?: string;
  channel?: string;
  isAI?: boolean;
  direction?: string;
  time?: string;
  createdAt?: string;
}

export interface EmailSendResult {
  sent: number;
  failed: number;
}

export interface EmailSendResponsePayload {
  sent?: number;
  failed?: number;
  successCount?: number;
  failCount?: number;
}

export interface EmailTemplatePreset {
  id: string;
  label: string;
  subject: string;
  html: string;
}

export type EmailCampaignStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'SENDING'
  | 'SENT'
  | 'FAILED'
  | 'CANCELLED';

export type EmailRecipientStatus =
  | 'PENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'OPENED'
  | 'CLICKED'
  | 'REPLIED'
  | 'FAILED'
  | 'BOUNCED'
  | 'UNSUBSCRIBED';

export type EmailDeliveryEventKind =
  | 'SENT'
  | 'DELIVERED'
  | 'OPENED'
  | 'CLICKED'
  | 'REPLIED'
  | 'BOUNCED'
  | 'COMPLAINT'
  | 'UNSUBSCRIBED';

export interface EmailCampaignRecipient {
  id: string;
  campaignId: string;
  email: string;
  name: string | null;
  status: EmailRecipientStatus;
  providerMessageId: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  repliedAt: string | null;
  failedAt: string | null;
  bouncedAt: string | null;
  unsubscribedAt: string | null;
  deliveries: EmailCampaignDelivery[];
}

export interface EmailCampaignDelivery {
  id: string;
  campaignId: string;
  recipientId: string;
  event: EmailDeliveryEventKind;
  providerMessageId: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
}

export interface EmailCampaign {
  id: string;
  workspaceId: string;
  name: string;
  subject: string;
  htmlBody: string;
  fromEmail: string | null;
  fromName: string | null;
  replyTo: string | null;
  status: EmailCampaignStatus;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  repliedCount: number;
  failedCount: number;
  bouncedCount: number;
  unsubscribedCount: number;
  provider: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  recipients?: EmailCampaignRecipient[];
}

export interface EmailCampaignListItem {
  id: string;
  name: string;
  subject: string;
  status: EmailCampaignStatus;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  repliedCount: number;
  failedCount: number;
  provider: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEmailCampaignInput {
  name: string;
  subject: string;
  htmlBody: string;
  fromEmail?: string;
  fromName?: string;
  replyTo?: string;
  recipients: { email: string; name?: string }[];
}

export interface EmailCampaignSendResponse {
  campaign: EmailCampaign;
  message: string;
}

export interface EmailCampaignListResponse {
  campaigns: EmailCampaignListItem[];
}

export interface EmailCampaignDetailResponse {
  campaign: EmailCampaign;
}
