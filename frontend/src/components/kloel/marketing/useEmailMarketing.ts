'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { mutate } from 'swr';
import type { MarketingConnectStatus, EmailSendResult, EmailSendResponsePayload, EmailTemplatePreset } from './MarketingTypes';

export interface UseEmailMarketingProps {
  connectionStatus?: MarketingConnectStatus | null;
  defaultRecipientEmail?: string | null;
}

export interface UseEmailMarketingReturn {
  connection: MarketingConnectStatus['channels'] extends { email?: infer T } ? T : undefined;
  emailSubject: string;
  setEmailSubject: (value: string) => void;
  emailBody: string;
  setEmailBody: (value: string) => void;
  emailSending: boolean;
  emailResult: EmailSendResult | null;
  canSubmit: boolean;
  handleSend: () => Promise<void>;
  handleSelectTemplate: (template: EmailTemplatePreset) => void;
}

export function useEmailMarketing({
  connectionStatus,
  defaultRecipientEmail,
}: UseEmailMarketingProps): UseEmailMarketingReturn {
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<EmailSendResult | null>(null);

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
      const res = await apiFetch('/marketing/email/send', {
        method: 'POST',
        body: {
          subject: emailSubject.trim(),
          html: emailBody,
          recipients: [{ email: defaultRecipientEmail }],
          campaignName: emailSubject.trim(),
        },
      });
      const data = ((res.data ?? res) as EmailSendResponsePayload) || {};
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/marketing'));
      setEmailResult({
        sent: data.sent ?? data.successCount ?? 1,
        failed: data.failed ?? data.failCount ?? 0,
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

  return {
    connection,
    emailSubject,
    setEmailSubject,
    emailBody,
    setEmailBody,
    emailSending,
    emailResult,
    canSubmit,
    handleSend,
    handleSelectTemplate,
  };
}
