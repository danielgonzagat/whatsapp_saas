'use client';

import { kloelT, kloelError } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { externalBrands } from '@/lib/external-brand-tokens';
/** Dynamic. */
export const dynamic = 'force-dynamic';

// design colors. Token colors (colors.background.void, colors.background.surface, colors.border.space, colors.text.silver) are the
// Monitor palette. Remaining hexes are custom Meta channel UI surface colors.

import { apiFetch } from '@/lib/api/core';
import {
  mapMetaAuthStatusToWhatsAppStatus,
  type WhatsAppConnectionStatus,
} from '@/lib/api/whatsapp';
import { useCallback, useEffect, useState } from 'react';
import { mutate } from 'swr';

type MetaChannelStatus = {
  connected?: boolean;
  phoneNumberId?: string | null;
  whatsappBusinessId?: string | null;
  username?: string | null;
  pageId?: string | null;
  adAccountId?: string | null;
};

type MetaStatusResponse = {
  connected?: boolean;
  tokenExpired?: boolean;
  channels?: {
    whatsapp?: MetaChannelStatus;
    instagram?: MetaChannelStatus;
    messenger?: MetaChannelStatus;
    ads?: MetaChannelStatus;
  };
  pageName?: string | null;
  pageId?: string | null;
  instagramUsername?: string | null;
  whatsappPhoneNumberId?: string | null;
  whatsappBusinessId?: string | null;
};

function readErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return fallback;
}

function formatConnectionState(connected?: boolean, rawStatus?: string | null): string {
  if (connected) {
    return 'Conectado';
  }
  const normalized = String(rawStatus || '').toLowerCase();
  if (normalized.includes('reconnect')) {
    return 'Reconectando';
  }
  return 'Desconectado';
}

function formatOperatorReason(value?: string | null): string {
  const raw = String(value || '').toLowerCase();
  if (!raw) {
    return 'Tudo pronto para conectar.';
  }
  if (raw.includes('expired') || raw.includes('token')) {
    return 'A autorização expirou. Conecte novamente.';
  }
  if (raw.includes('oauth') || raw.includes('configuration') || raw.includes('config')) {
    return 'A autorização Meta ainda não está configurada no backend.';
  }
  if (raw.includes('permission') || raw.includes('scope')) {
    return 'A autorização precisa ser renovada com as permissões corretas.';
  }
  if (raw.includes('rate') || raw.includes('limit')) {
    return 'O canal atingiu um limite temporário. Tente novamente em alguns minutos.';
  }
  return 'A conexão precisa ser revisada. Conecte novamente quando quiser.';
}

function ChannelCard({
  title,
  description,
  connected,
  meta,
}: {
  title: string;
  description: string;
  connected: boolean;
  meta?: string[];
}) {
  return (
    <div
      className="rounded-2xl border p-5"
      style={{ borderColor: colors.border.space, backgroundColor: colors.background.surface }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2
          className="text-sm font-semibold uppercase tracking-[0.14em]"
          style={{ color: colors.text.silver }}
        >
          {title}
        </h2>
        <span
          className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{
            backgroundColor: connected ? externalBrands.whatsappSuccessBg : 'var(--checkout-danger-bg)',
            color: connected ? colors.semantic.successText : colors.semantic.errorText,
          }}
        >
          {connected ? kloelT('Conectado') : kloelT('Não conectado')}
        </span>
      </div>
      <p className="text-sm" style={{ color: colors.text.faint }}>
        {description}
      </p>
      {meta?.length ? (
        <div className="mt-4 space-y-2 text-xs" style={{ color: colors.text.faintLight }}>
          {meta.map((item) => (
            <div key={item}>{item}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Whats app page. */
export default function WhatsAppPage() {
  const [metaStatus, setMetaStatus] = useState<MetaStatusResponse | null>(null);
  const [whatsAppStatus, setWhatsAppStatus] = useState<WhatsAppConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const metaRes = await apiFetch<MetaStatusResponse>('/meta/auth/status');
      if (
        metaRes.error ||
        (typeof metaRes.status === 'number' && metaRes.status >= 400) ||
        !metaRes.data
      ) {
        throw kloelError(metaRes.error || 'Falha ao consultar status oficial da Meta.');
      }

      const metaData = metaRes.data;
      setMetaStatus(metaData);
      setWhatsAppStatus(mapMetaAuthStatusToWhatsAppStatus(metaData));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const metaOAuthUnavailable =
    whatsAppStatus?.status === 'meta_oauth_configuration_missing' ||
    whatsAppStatus?.degradedReason === 'meta_oauth_configuration_missing';

  const handleConnect = useCallback(async () => {
    if (metaOAuthUnavailable) {
      setActionMessage(formatOperatorReason('meta_oauth_configuration_missing'));
      return;
    }

    setActionMessage('Gerando fluxo oficial da Meta...');
    try {
      const res = await apiFetch<{ url?: string }>(
        '/meta/auth/url?channel=whatsapp&returnTo=/whatsapp',
      );
      const url = String(res.data?.url || '').trim();
      if (!url) {
        throw kloelError('Não foi possível gerar a URL de conexão da Meta.');
      }
      window.location.href = url;
    } catch (error: unknown) {
      setActionMessage(readErrorMessage(error, 'Falha ao iniciar a conexão Meta.'));
    }
  }, [metaOAuthUnavailable]);

  const handleDisconnect = useCallback(async () => {
    setActionMessage('Desconectando Meta...');
    try {
      await apiFetch('/meta/auth/disconnect', { method: 'POST' });
      mutate(
        (key: unknown) =>
          typeof key === 'string' && (key.startsWith('/meta') || key.startsWith('/whatsapp')),
      );
      await load();
      setActionMessage('Meta desconectada.');
    } catch (error: unknown) {
      setActionMessage(readErrorMessage(error, 'Falha ao desconectar Meta.'));
    }
  }, [load]);

  const whatsappConnected =
    Boolean(metaStatus?.channels?.whatsapp?.connected) && Boolean(whatsAppStatus?.connected);

  return (
    <div
      className="min-h-screen px-6 py-8"
      style={{ backgroundColor: colors.background.void, color: colors.text.silver }}
    >
      <div className="mx-auto max-w-5xl">
        <div
          className="mb-8 rounded-[28px] border p-8"
          style={{
            borderColor: colors.border.space,
            backgroundImage: `linear-gradient(135deg, ${externalBrands.whatsappGradientStart} 0%, ${externalBrands.whatsappGradientEnd} 100%)`,
          }}
        >
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <p
                className="mb-3 text-xs font-semibold uppercase tracking-[0.18em]"
                style={{ color: externalBrands.whatsappLabel }}
              >
                {kloelT(`Meta Cloud Runtime`)}
              </p>
              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-white">
                {kloelT(`WhatsApp oficial, sem QR, sem browser e sem WAHA`)}
              </h1>
              <p className="mt-3 text-sm leading-6" style={{ color: externalBrands.whatsappTextSecondary }}>
                {kloelT(`Esta área valida o canal oficial da Meta que o Kloel usa para WhatsApp, Instagram,
                Messenger e Ads. O backend e o worker agora operam a partir da Meta API oficial e do
                estado persistido do workspace.`)}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-full border px-5 py-2 text-sm font-medium"
                style={{ borderColor: colors.border.glow, color: externalBrands.whatsappButtonText }}
              >
                {kloelT(`Atualizar`)}
              </button>
              {metaStatus?.connected ? (
                <button
                  type="button"
                  onClick={() => void handleDisconnect()}
                  className="rounded-full px-5 py-2 text-sm font-medium"
                  style={{ backgroundColor: externalBrands.whatsappDangerBg, color: colors.semantic.errorText }}
                >
                  {kloelT(`Desconectar Meta`)}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleConnect()}
                  disabled={loading || metaOAuthUnavailable}
                  aria-disabled={loading || metaOAuthUnavailable}
                  title={
                    metaOAuthUnavailable
                      ? formatOperatorReason('meta_oauth_configuration_missing')
                      : undefined
                  }
                  className={`rounded-full px-5 py-2 text-sm font-semibold transition-opacity ${
                    loading || metaOAuthUnavailable ? 'cursor-not-allowed opacity-60' : ''
                  }`}
                  style={{
                    backgroundColor: colors.text.silver,
                    color: colors.background.surface,
                  }}
                >
                  {kloelT(`Conectar com Meta`)}
                </button>
              )}
            </div>
          </div>

          {actionMessage ? (
            <div
              className="mt-5 rounded-2xl border px-4 py-3 text-sm"
              style={{
                borderColor: externalBrands.whatsappCardBorder,
                backgroundColor: colors.background.surface,
                color: externalBrands.whatsappCardText,
              }}
            >
              {actionMessage}
            </div>
          ) : null}
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ChannelCard
            title={kloelT(`WhatsApp`)}
            description={kloelT(
              `Canal operacional do Kloel para envio, inbox e automação via Cloud API.`,
            )}
            connected={whatsappConnected}
            meta={[
              `Status: ${formatConnectionState(whatsappConnected, whatsAppStatus?.status)}`,
              `Número: ${String(whatsAppStatus?.phone || 'não resolvido')}`,
            ]}
          />
          <ChannelCard
            title={kloelT(`Instagram`)}
            description={kloelT(
              `Mensagens e eventos oficiais do Instagram pelo mesmo vínculo Meta.`,
            )}
            connected={Boolean(metaStatus?.channels?.instagram?.connected)}
            meta={[
              `Conta: ${String(
                metaStatus?.channels?.instagram?.username ||
                  metaStatus?.instagramUsername ||
                  'não conectada',
              )}`,
            ]}
          />
          <ChannelCard
            title={kloelT(`Messenger`)}
            description={kloelT(`Recebimento e resposta por página oficial da Meta.`)}
            connected={Boolean(metaStatus?.channels?.messenger?.connected)}
            meta={[
              `Página: ${String(
                metaStatus?.pageName || metaStatus?.channels?.messenger?.pageId || 'não conectada',
              )}`,
            ]}
          />
          <ChannelCard
            title={kloelT(`Meta Ads`)}
            description={kloelT(`Ads compartilha a mesma conexão autenticada do workspace.`)}
            connected={Boolean(metaStatus?.channels?.ads?.connected)}
            meta={[
              `Conta de anúncios: ${String(
                metaStatus?.channels?.ads?.adAccountId || 'não conectada',
              )}`,
            ]}
          />
        </div>

        <div
          className="rounded-[24px] border p-6"
          style={{
            borderColor: colors.border.space,
            backgroundColor: colors.background.surface,
          }}
        >
          <h2
            className="text-sm font-semibold uppercase tracking-[0.14em]"
            style={{ color: externalBrands.whatsappLabel }}
          >
            {kloelT(`Estado atual`)}
          </h2>
          {loading ? (
            <p className="mt-4 text-sm" style={{ color: externalBrands.whatsappTextSecondary }}>
              {kloelT(`Carregando integração Meta...`)}
            </p>
          ) : (
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-2" style={{ color: externalBrands.whatsappCardTextBright }}>
              <div
                className="rounded-2xl border px-4 py-3"
                style={{ borderColor: colors.border.space, backgroundColor: externalBrands.whatsappCardBg }}
              >
                <div
                  className="text-xs uppercase tracking-[0.14em]"
                  style={{ color: externalBrands.whatsappLabel }}
                >
                  {kloelT(`Meta Auth`)}
                </div>
                <div className="mt-2">
                  {metaStatus?.connected ? kloelT('Conectado') : kloelT('Pendente')}
                  {metaStatus?.tokenExpired ? kloelT(' com token expirado') : ''}
                </div>
              </div>
              <div
                className="rounded-2xl border px-4 py-3"
                style={{ borderColor: colors.border.space, backgroundColor: externalBrands.whatsappCardBg }}
              >
                <div
                  className="text-xs uppercase tracking-[0.14em]"
                  style={{ color: externalBrands.whatsappLabel }}
                >
                  {kloelT(`Provider ativo`)}
                </div>
                <div className="mt-2">{kloelT('API oficial da Meta')}</div>
              </div>
              <div
                className="rounded-2xl border px-4 py-3"
                style={{ borderColor: colors.border.space, backgroundColor: externalBrands.whatsappCardBg }}
              >
                <div
                  className="text-xs uppercase tracking-[0.14em]"
                  style={{ color: externalBrands.whatsappLabel }}
                >
                  {kloelT(`Runtime degradado`)}
                </div>
                <div className="mt-2">{whatsAppStatus?.degraded ? kloelT('Sim') : kloelT('Não')}</div>
              </div>
              <div
                className="rounded-2xl border px-4 py-3"
                style={{ borderColor: colors.border.space, backgroundColor: externalBrands.whatsappCardBg }}
              >
                <div
                  className="text-xs uppercase tracking-[0.14em]"
                  style={{ color: externalBrands.whatsappLabel }}
                >
                  {kloelT(`Motivo atual`)}
                </div>
                <div className="mt-2">
                  {formatOperatorReason(whatsAppStatus?.message || whatsAppStatus?.degradedReason)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
