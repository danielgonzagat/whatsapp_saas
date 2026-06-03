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

type EmailApiResponse<T> = {
  data?: T | undefined;
  error?: string | undefined;
};

function unwrapEmailResponse<T>(response: EmailApiResponse<T>, fallbackMessage: string): T {
  if (response.error) {
    throw new Error(response.error);
  }
  if (!response.data) {
    throw new Error(fallbackMessage);
  }
  return response.data;
}

function unwrapEmailCampaign<T extends { campaign?: EmailCampaign | undefined }>(
  response: EmailApiResponse<T>,
  fallbackMessage: string,
): EmailCampaign {
  const payload = unwrapEmailResponse(response, fallbackMessage);
  if (!payload.campaign) {
    throw new Error(fallbackMessage);
  }
  return payload.campaign;
}

function emailCampaignsFetcher(key: string): Promise<EmailCampaignListItem[]> {
  return apiFetch<EmailCampaignListResponse>(key).then((res) => {
    const payload = unwrapEmailResponse(res, 'Não foi possível carregar as campanhas de email.');
    return payload.campaigns ?? [];
  });
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
      const campaignData = unwrapEmailResponse(
        res,
        'Não foi possível criar a campanha de email.',
      ).campaign;
      const campaignId = campaignData?.id;
      if (!campaignId) {
        throw new Error('Não foi possível criar a campanha de email.');
      }

      const sendRes = await apiFetch<EmailCampaignSendResponse>(
        `/marketing/email/campaigns/${campaignId}/send`,
        { method: 'POST' },
      );
      const sentCampaign = unwrapEmailCampaign(
        sendRes,
        'Não foi possível enviar a campanha de email.',
      );
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/marketing'));
      setEmailResult({
        sent: sentCampaign.sentCount ?? 1,
        failed: sentCampaign.failedCount ?? 0,
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
    const payload = unwrapEmailResponse(res, 'Não foi possível carregar a campanha de email.');
    return payload.campaign ?? null;
  }, []);

  const createCampaign = useCallback(
    async (input: CreateEmailCampaignInput): Promise<EmailCampaign | null> => {
      const res = await apiFetch<EmailCampaignSendResponse>('/marketing/email/campaigns', {
        method: 'POST',
        body: input,
      });
      const campaign = unwrapEmailCampaign(res, 'Não foi possível criar a campanha de email.');
      mutateCampaigns();
      return campaign;
    },
    [mutateCampaigns],
  );

  const sendCampaign = useCallback(
    async (campaignId: string): Promise<EmailCampaign | null> => {
      const res = await apiFetch<EmailCampaignSendResponse>(
        `/marketing/email/campaigns/${campaignId}/send`,
        { method: 'POST' },
      );
      const campaign = unwrapEmailCampaign(res, 'Não foi possível enviar a campanha de email.');
      mutateCampaigns();
      return campaign;
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
