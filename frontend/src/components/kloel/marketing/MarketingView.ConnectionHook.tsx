'use client';

import { kloelError } from '@/lib/i18n/t';
import { apiFetch } from '@/lib/api';
import { navigateCurrentWindow, isTrustedMetaOauthUrl } from './MarketingShared';
import { useCallback, useState } from 'react';
import type { KeyedMutator } from 'swr';
import type { MarketingConnectStatus } from './MarketingTypes';

interface UseMarketingConnectionParams {
  mutateConnectionStatus: KeyedMutator<MarketingConnectStatus>;
  userEmail: string | undefined;
}

export function useMarketingConnection({
  mutateConnectionStatus,
  userEmail,
}: UseMarketingConnectionParams) {
  const [connectingKey, setConnectingKey] = useState<string | null>(null);
  const [emailTestSending, setEmailTestSending] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<string | null>(null);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);

  function requireConnectionSuccess<T extends { error?: string | undefined }>(
    response: T,
    fallback: string,
  ): T {
    if (response.error) {
      throw kloelError(response.error || fallback);
    }
    return response;
  }

  const handleConnectMeta = useCallback(
    async (channelKey: 'whatsapp' | 'instagram' | 'facebook') => {
      setConnectingKey(channelKey);
      setConnectionMessage(null);
      try {
        const returnTo = `/marketing/${channelKey}`;
        const res = requireConnectionSuccess(
          await apiFetch<{ url?: string }>(
            `/meta/auth/url?channel=${encodeURIComponent(channelKey)}&returnTo=${encodeURIComponent(returnTo)}`,
          ),
          'Nao foi possivel iniciar a conexao oficial da Meta.',
        );
        const url = String(res?.data?.url || '').trim();
        if (!url) {
          throw kloelError('Nao foi possivel iniciar a conexao oficial da Meta.');
        }
        if (!isTrustedMetaOauthUrl(url)) {
          throw kloelError('Redirecionamento bloqueado: destino Meta invalido.');
        }
        navigateCurrentWindow(url);
      } catch (error: unknown) {
        setConnectingKey(null);
        setConnectionMessage(error instanceof Error ? error.message : 'Falha ao abrir a Meta.');
      }
    },
    [],
  );

  const handleConnectEmail = useCallback(async () => {
    setConnectingKey('email');
    setEmailTestResult(null);
    try {
      requireConnectionSuccess(
        await apiFetch('/marketing/connect/email', { method: 'POST', body: { enabled: true } }),
        'Falha ao ativar o canal de email.',
      );
      await mutateConnectionStatus();
      setEmailTestResult(
        'Email ativado com sucesso. Agora voce pode enviar campanhas e testar o provider.',
      );
    } catch (error: unknown) {
      setEmailTestResult(
        error instanceof Error ? error.message : 'Falha ao ativar o canal de email.',
      );
    } finally {
      setConnectingKey(null);
    }
  }, [mutateConnectionStatus]);

  const handleDisconnectEmail = useCallback(async () => {
    setConnectingKey('email');
    setEmailTestResult(null);
    try {
      requireConnectionSuccess(
        await apiFetch('/marketing/connect/email', { method: 'POST', body: { enabled: false } }),
        'Falha ao desativar o canal de email.',
      );
      await mutateConnectionStatus();
      setEmailTestResult('Canal de email desativado para este workspace.');
    } catch (error: unknown) {
      setEmailTestResult(
        error instanceof Error ? error.message : 'Falha ao desativar o canal de email.',
      );
    } finally {
      setConnectingKey(null);
    }
  }, [mutateConnectionStatus]);

  const handleSendEmailTest = useCallback(async () => {
    setEmailTestSending(true);
    setEmailTestResult(null);
    try {
      const res = requireConnectionSuccess(
        await apiFetch<{ toEmail?: string; provider?: string }>(
          '/marketing/connect/email/test',
          {
            method: 'POST',
            body: { toEmail: userEmail || undefined },
          },
        ),
        'Falha ao enviar email de teste.',
      );
      const payload = res?.data;
      setEmailTestResult(
        `Email de teste enviado para ${payload?.toEmail || userEmail || 'seu email'} via ${payload?.provider || 'provider configurado'}.`,
      );
    } catch (error: unknown) {
      setEmailTestResult(
        error instanceof Error ? error.message : 'Falha ao enviar email de teste.',
      );
    } finally {
      setEmailTestSending(false);
    }
  }, [userEmail]);

  return {
    connectingKey,
    setConnectingKey,
    emailTestSending,
    emailTestResult,
    setEmailTestResult,
    connectionMessage,
    setConnectionMessage,
    handleConnectMeta,
    handleConnectEmail,
    handleDisconnectEmail,
    handleSendEmailTest,
  };
}
