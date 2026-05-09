'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { mutate } from 'swr';
import useSWR from 'swr';
import type {
  MarketingConnectStatus,
  EmailSendResult,

  EmailTemplatePreset,
  EmailChannelConnection,
  EmailCampaignListItem,
  EmailCampaign,
  EmailCampaignListResponse,
  EmailCampaignDetailResponse,
  EmailCampaignSendResponse,
  CreateEmailCampaignInput,
} from './MarketingTypes';

const EMAIL_CAMPAIGNS_KEY = '/marketing/email/campaigns';

function emailCampaignsFetcher(key: string): Promise<EmailCampaignListItem[]> {
  return apiFetch<EmailCampaignListResponse>(key).then((res) => res.data?.campaigns ?? res.campaigns ?? []);
}

export interface UseEmailMarketingProps {
  connectionStatus?: MarketingConnectStatus | null | undefined;
  defaultRecipientEmail?: string | null | undefined;
}

export interface UseEmailMarketingReturn {
  connection: EmailChannelConnection | undefined;
  campaigns: EmailCampaignListItem[];
  campaignsLoading: boolean;
  campaignsError: string | undefined;
  emailSubject: string;
  setEmailSubject: (value: string) => void;
  emailBody: string;
  setEmailBody: (value: string) => void;
  emailSending: boolean;
  emailResult: EmailSendResult | null;
  canSubmit: boolean;
  handleSend: () => Promise<void>;
  handleSelectTemplate: (template: EmailTemplatePreset) => void;
  getCampaign: (id: string) => Promise<EmailCampaign | null>;
  createCampaign: (input: CreateEmailCampaignInput) => Promise<EmailCampaign | null>;
  sendCampaign: (campaignId: string) => Promise<EmailCampaign | null>;
  refreshCampaigns: () => void;
}

export function useEmailMarketing({
  connectionStatus,
  defaultRecipientEmail,
}: UseEmailMarketingProps): UseEmailMarketingReturn {
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<EmailSendResult | null>(null);

  const {
    data: campaigns = [],
    isLoading: campaignsLoading,
    error: campaignsSwrError,
    mutate: mutateCampaigns,
  } = useSWR(EMAIL_CAMPAIGNS_KEY, emailCampaignsFetcher, {
    revalidateOnFocus: false,
  });

  const campaignsError =
    campaignsSwrError instanceof Error
      ? campaignsSwrError.message
      : campaignsSwrError
        ? String(campaignsSwrError)
        : undefined;

  const connection = connectionStatus?.channels?.email;

  const canSubmit =
    !emailSending &&
    connection?.connected === true &&
    Boolean(defaultRecipientEmail) &&
    emailSubject.trim() !== '' &&
    emailBody.trim() !== '';

  const handleSend = useCallback(async () => {
    if (!emailSubject.trim() || !emailBody.trim() || !defaultRecipientEmail) {
      return;
    }
    setEmailSending(true);
    setEmailResult(null);
    try {
      const res = await apiFetch<EmailCampaignSendResponse>('/marketing/email/campaigns', {
        method: 'POST',
        body: {
          name: emailSubject.trim(),
          subject: emailSubject.trim(),
          htmlBody: emailBody,
          recipients: [{ email: defaultRecipientEmail }],
        },
      });
      const campaignData = (res.data as EmailCampaignSendResponse | undefined)?.campaign;
      const campaignId = campaignData?.id;
      if (!campaignId) {
        setEmailResult({ sent: 0, failed: 1 });
        setEmailSending(false);
        return;
      }

      const sendRes = await apiFetch<EmailCampaignSendResponse>(
        `/marketing/email/campaigns/${campaignId}/send`,
        { method: 'POST' },
      );
      const sentCampaign = (sendRes.data as EmailCampaignSendResponse | undefined)?.campaign;
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/marketing'));
      setEmailResult({
        sent: sentCampaign?.sentCount ?? 1,
        failed: sentCampaign?.failedCount ?? 0,
      });
    } catch {
      setEmailResult({ sent: 0, failed: 1 });
    } finally {
      setEmailSending(false);
    }
  }, [defaultRecipientEmail, emailBody, emailSubject]);

  const handleSelectTemplate = useCallback((template: EmailTemplatePreset) => {
    setEmailSubject(template.subject);
    setEmailBody(template.html);
  }, []);

  const getCampaign = useCallback(async (id: string): Promise<EmailCampaign | null> => {
    const res = await apiFetch<EmailCampaignDetailResponse>(`/marketing/email/campaigns/${id}`);
    return (res.data as EmailCampaignDetailResponse | undefined)?.campaign ?? null;
  }, []);

  const createCampaign = useCallback(
    async (input: CreateEmailCampaignInput): Promise<EmailCampaign | null> => {
      const res = await apiFetch<EmailCampaignSendResponse>('/marketing/email/campaigns', {
        method: 'POST',
        body: input,
      });
      const campaign = (res.data as EmailCampaignSendResponse | undefined)?.campaign;
      if (campaign) {
        mutateCampaigns();
      }
      return campaign ?? null;
    },
    [mutateCampaigns],
  );

  const sendCampaign = useCallback(
    async (campaignId: string): Promise<EmailCampaign | null> => {
      const res = await apiFetch<EmailCampaignSendResponse>(
        `/marketing/email/campaigns/${campaignId}/send`,
        { method: 'POST' },
      );
      const campaign = (res.data as EmailCampaignSendResponse | undefined)?.campaign;
      if (campaign) {
        mutateCampaigns();
      }
      return campaign ?? null;
    },
    [mutateCampaigns],
  );

  const refreshCampaigns = useCallback(() => {
    mutateCampaigns();
  }, [mutateCampaigns]);

  return {
    connection,
    campaigns,
    campaignsLoading,
    campaignsError,
    emailSubject,
    setEmailSubject,
    emailBody,
    setEmailBody,
    emailSending,
    emailResult,
    canSubmit,
    handleSend,
    handleSelectTemplate,
    getCampaign,
    createCampaign,
    sendCampaign,
    refreshCampaigns,
  };
}
