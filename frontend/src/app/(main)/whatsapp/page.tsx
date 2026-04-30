'use client';

import { kloelT, kloelError } from '@/lib/i18n/t';
/** Dynamic. */
export const dynamic = 'force-dynamic';

// PULSE_VISUAL_OK: Tailwind bracket hex values are intentional Meta integration
// design colors. Token colors (#0A0A0C, #111113, #222226, #E0DDD8) are the
// Monitor palette. Remaining hexes are custom Meta channel UI surface colors.

import { apiFetch } from '@/lib/api/core';
import { getWhatsAppStatus, type WhatsAppConnectionStatus } from '@/lib/api/whatsapp';
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
    <div className="rounded-2xl border border-[#222226] bg-[#111113] p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#E0DDD8]">
          {title}
        </h2>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
            connected ? 'bg-[#17331F] text-[#8EE39A]' : 'bg-[#2A1A1A] text-[#FF9B9B]'
          }`}
        >
          {connected ? 'Conectado' : 'Nao conectado'}
        </span>
      </div>
      <p className="text-sm text-[#9B9BA1]">{description}</p>
      {meta?.length ? (
        <div className="mt-4 space-y-2 text-xs text-[#B9B9BE]">
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
      const [metaRes, whatsappRes] = await Promise.all([
        apiFetch<MetaStatusResponse>('/meta/auth/status'),
        getWhatsAppStatus(''),
      ]);

      setMetaStatus(metaRes.data ?? null);
      setWhatsAppStatus(whatsappRes || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleConnect = useCallback(async () => {
    setActionMessage('Gerando fluxo oficial da Meta...');
    try {
      const res = await apiFetch<{ url?: string }>(
        '/meta/auth/url?channel=whatsapp&returnTo=/whatsapp',
      );
      const url = String(res.data?.url || '').trim();
      if (!url) {
        throw kloelError('Nao foi possivel gerar a URL de conexao da Meta.');
      }
      window.location.href = url;
    } catch (error: unknown) {
      setActionMessage(readErrorMessage(error, 'Falha ao iniciar a conexao Meta.'));
    }
  }, []);

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
    <div className="min-h-screen bg-[#0A0A0C] px-6 py-8 text-[#EAEAF0]">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 rounded-[28px] border border-[#222226] bg-[linear-gradient(135deg,#161619_0%,#0E0E11_100%)] p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#7E7E85]">
                {kloelT(`Meta Cloud Runtime`)}
              </p>
              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-white">
                {kloelT(`WhatsApp oficial, sem QR, sem browser e sem WAHA`)}
              </h1>
              <p className="mt-3 text-sm leading-6 text-[#A9A9B0]">
                {kloelT(`Esta area valida o canal oficial da Meta que o Kloel usa para WhatsApp, Instagram,
                Messenger e Ads. O backend e o worker agora operam a partir da Meta API oficial e do
                estado persistido do workspace.`)}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-full border border-[#35353B] px-5 py-2 text-sm font-medium text-[#F2F2F5]"
              >
                {kloelT(`Atualizar`)}
              </button>
              {metaStatus?.connected ? (
                <button
                  type="button"
                  onClick={() => void handleDisconnect()}
                  className="rounded-full bg-[#2D1616] px-5 py-2 text-sm font-medium text-[#FFB0B0]"
                >
                  {kloelT(`Desconectar Meta`)}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleConnect()}
                  className="rounded-full bg-[#E0DDD8] px-5 py-2 text-sm font-semibold text-[#111113]"
                >
                  {kloelT(`Conectar com Meta`)}
                </button>
              )}
            </div>
          </div>

          {actionMessage ? (
            <div className="mt-5 rounded-2xl border border-[#26262B] bg-[#121216] px-4 py-3 text-sm text-[#D7D7DD]">
              {actionMessage}
            </div>
          ) : null}
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ChannelCard
            title={kloelT(`WhatsApp`)}
            description={kloelT(
              `Canal operacional do Kloel para envio, inbox e automacao via Cloud API.`,
            )}
            connected={whatsappConnected}
            meta={[
              `Status: ${String(whatsAppStatus?.status || 'desconectado')}`,
              `Phone Number ID: ${String(
                whatsAppStatus?.phoneNumberId ||
                  metaStatus?.channels?.whatsapp?.phoneNumberId ||
                  metaStatus?.whatsappPhoneNumberId ||
                  'nao informado',
              )}`,
              `WABA ID: ${String(
                whatsAppStatus?.whatsappBusinessId ||
                  metaStatus?.channels?.whatsapp?.whatsappBusinessId ||
                  metaStatus?.whatsappBusinessId ||
                  'nao informado',
              )}`,
              `Numero: ${String(whatsAppStatus?.phone || 'nao resolvido')}`,
            ]}
          />
          <ChannelCard
            title={kloelT(`Instagram`)}
            description={kloelT(
              `Mensagens e eventos oficiais do Instagram pelo mesmo vinculo Meta.`,
            )}
            connected={Boolean(metaStatus?.channels?.instagram?.connected)}
            meta={[
              `Conta: ${String(
                metaStatus?.channels?.instagram?.username ||
                  metaStatus?.instagramUsername ||
                  'nao conectada',
              )}`,
            ]}
          />
          <ChannelCard
            title={kloelT(`Messenger`)}
            description={kloelT(`Recebimento e resposta por pagina oficial da Meta.`)}
            connected={Boolean(metaStatus?.channels?.messenger?.connected)}
            meta={[
              `Pagina: ${String(
                metaStatus?.pageName || metaStatus?.channels?.messenger?.pageId || 'nao conectada',
              )}`,
            ]}
          />
          <ChannelCard
            title={kloelT(`Meta Ads`)}
            description={kloelT(`Ads compartilha a mesma conexao autenticada do workspace.`)}
            connected={Boolean(metaStatus?.channels?.ads?.connected)}
            meta={[
              `Conta de anuncios: ${String(
                metaStatus?.channels?.ads?.adAccountId || 'nao conectada',
              )}`,
            ]}
          />
        </div>

        <div className="rounded-[24px] border border-[#222226] bg-[#111113] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#7E7E85]">
            {kloelT(`Estado atual`)}
          </h2>
          {loading ? (
            <p className="mt-4 text-sm text-[#A9A9B0]">{kloelT(`Carregando integracao Meta...`)}</p>
          ) : (
            <div className="mt-4 grid gap-3 text-sm text-[#D4D4DA] md:grid-cols-2">
              <div className="rounded-2xl border border-[#222226] bg-[#0E0E10] px-4 py-3">
                <div className="text-xs uppercase tracking-[0.14em] text-[#7E7E85]">
                  {kloelT(`Meta Auth`)}
                </div>
                <div className="mt-2">
                  {metaStatus?.connected ? 'Conectado' : 'Pendente'}
                  {metaStatus?.tokenExpired ? ' com token expirado' : ''}
                </div>
              </div>
              <div className="rounded-2xl border border-[#222226] bg-[#0E0E10] px-4 py-3">
                <div className="text-xs uppercase tracking-[0.14em] text-[#7E7E85]">
                  {kloelT(`Provider ativo`)}
                </div>
                <div className="mt-2">{String(whatsAppStatus?.provider || 'meta-cloud')}</div>
              </div>
              <div className="rounded-2xl border border-[#222226] bg-[#0E0E10] px-4 py-3">
                <div className="text-xs uppercase tracking-[0.14em] text-[#7E7E85]">
                  {kloelT(`Runtime degradado`)}
                </div>
                <div className="mt-2">{whatsAppStatus?.degraded ? 'Sim' : 'Nao'}</div>
              </div>
              <div className="rounded-2xl border border-[#222226] bg-[#0E0E10] px-4 py-3">
                <div className="text-xs uppercase tracking-[0.14em] text-[#7E7E85]">
                  {kloelT(`Motivo atual`)}
                </div>
                <div className="mt-2">
                  {String(
                    whatsAppStatus?.message ||
                      whatsAppStatus?.degradedReason ||
                      'integracao pronta',
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
