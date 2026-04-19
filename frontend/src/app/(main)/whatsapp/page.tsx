'use client';

export const dynamic = 'force-dynamic';

import { apiFetch } from '@/lib/api/core';
import { getWhatsAppStatus, type WhatsAppConnectionStatus } from '@/lib/api/whatsapp';
import { resolveMetaConnectUrl } from '@/components/kloel/marketing/meta-connect';
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

function formatMetaQualityRating(value?: string | null) {
  switch (String(value || '').trim().toUpperCase()) {
    case 'GREEN':
      return 'Verde';
    case 'YELLOW':
      return 'Em observação';
    case 'RED':
      return 'Crítico';
    default:
      return 'Não informado';
  }
}

function formatMetaVerificationStatus(value?: string | null) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return 'Não informado';
  return (
    {
      VERIFIED: 'Verificado',
      APPROVED: 'Aprovado',
      PENDING: 'Pendente',
      REVIEWING: 'Em revisão',
      REJECTED: 'Rejeitado',
      AVAILABLE_WITHOUT_REVIEW: 'Disponível sem revisão',
      EXPIRED: 'Expirado',
    }[normalized] || normalized
  );
}

function formatWhatsAppProviderLabel(value?: string | null) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  if (!normalized || normalized === 'meta-cloud') {
    return 'API oficial da Meta';
  }

  if (normalized === 'legacy-runtime' || normalized === 'whatsapp-api' || normalized === 'waha') {
    return 'Runtime legado';
  }

  return normalized;
}

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
      const url = resolveMetaConnectUrl(res as { data?: { url?: string }; error?: string; url?: string });
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
  const qualityRating = formatMetaQualityRating(whatsAppStatus?.qualityRating);
  const codeVerificationStatus = formatMetaVerificationStatus(
    whatsAppStatus?.codeVerificationStatus,
  );
  const nameStatus = formatMetaVerificationStatus(whatsAppStatus?.nameStatus);
  const qualityWarning =
    whatsAppStatus?.qualityRating &&
    String(whatsAppStatus.qualityRating).trim().toUpperCase() !== 'GREEN';
  const verificationWarning =
    (whatsAppStatus?.codeVerificationStatus &&
      !['VERIFIED', 'APPROVED'].includes(
        String(whatsAppStatus.codeVerificationStatus).trim().toUpperCase(),
      )) ||
    (whatsAppStatus?.nameStatus &&
      !['APPROVED', 'AVAILABLE_WITHOUT_REVIEW'].includes(
        String(whatsAppStatus.nameStatus).trim().toUpperCase(),
      ));

  return (
    <div className="min-h-screen bg-[#0A0A0C] px-6 py-8 text-[#EAEAF0]">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 rounded-[28px] border border-[#222226] bg-[linear-gradient(135deg,#161619_0%,#0E0E11_100%)] p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#7E7E85]">
                Runtime oficial do WhatsApp
              </p>
              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-white">
                WhatsApp oficial na infraestrutura da Meta
              </h1>
              <p className="mt-3 text-sm leading-6 text-[#A9A9B0]">
                Esta area valida o canal oficial da Meta que o Kloel usa para WhatsApp, Instagram,
                Messenger e Ads. O backend e o worker agora operam a partir da Meta API oficial e do
                estado persistido do workspace.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-full border border-[#35353B] px-5 py-2 text-sm font-medium text-[#F2F2F5]"
              >
                Atualizar
              </button>
              {metaStatus?.connected ? (
                <button
                  type="button"
                  onClick={() => void handleDisconnect()}
                  className="rounded-full bg-[#2D1616] px-5 py-2 text-sm font-medium text-[#FFB0B0]"
                >
                  Desconectar Meta
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleConnect()}
                  className="rounded-full bg-[#E0DDD8] px-5 py-2 text-sm font-semibold text-[#111113]"
                >
                  Conectar com Meta
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
            title="WhatsApp"
            description="Canal operacional do Kloel para envio, inbox e automacao via Cloud API."
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
              `Qualidade: ${qualityRating}`,
              `Código: ${codeVerificationStatus}`,
              `Nome Meta: ${nameStatus}`,
            ]}
          />
          <ChannelCard
            title="Instagram"
            description="Mensagens e eventos oficiais do Instagram pelo mesmo vinculo Meta."
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
            title="Messenger"
            description="Recebimento e resposta por pagina oficial da Meta."
            connected={Boolean(metaStatus?.channels?.messenger?.connected)}
            meta={[
              `Pagina: ${String(
                metaStatus?.pageName || metaStatus?.channels?.messenger?.pageId || 'nao conectada',
              )}`,
            ]}
          />
          <ChannelCard
            title="Meta Ads"
            description="Ads compartilha a mesma conexao autenticada do workspace."
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
            Estado atual
          </h2>
          {loading ? (
            <p className="mt-4 text-sm text-[#A9A9B0]">Carregando integracao Meta...</p>
          ) : (
            <div className="mt-4 grid gap-3 text-sm text-[#D4D4DA] md:grid-cols-2">
              <div className="rounded-2xl border border-[#222226] bg-[#0E0E10] px-4 py-3">
                <div className="text-xs uppercase tracking-[0.14em] text-[#7E7E85]">Meta Auth</div>
                <div className="mt-2">
                  {metaStatus?.connected ? 'Conectado' : 'Pendente'}
                  {metaStatus?.tokenExpired ? ' com token expirado' : ''}
                </div>
              </div>
              <div className="rounded-2xl border border-[#222226] bg-[#0E0E10] px-4 py-3">
                <div className="text-xs uppercase tracking-[0.14em] text-[#7E7E85]">
                  Provider ativo
                </div>
                <div className="mt-2">
                  {formatWhatsAppProviderLabel(whatsAppStatus?.provider || 'meta-cloud')}
                </div>
              </div>
              <div className="rounded-2xl border border-[#222226] bg-[#0E0E10] px-4 py-3">
                <div className="text-xs uppercase tracking-[0.14em] text-[#7E7E85]">
                  Runtime degradado
                </div>
                <div className="mt-2">{whatsAppStatus?.degraded ? 'Sim' : 'Nao'}</div>
              </div>
              <div className="rounded-2xl border border-[#222226] bg-[#0E0E10] px-4 py-3">
                <div className="text-xs uppercase tracking-[0.14em] text-[#7E7E85]">
                  Motivo atual
                </div>
                <div className="mt-2">
                  {String(
                    whatsAppStatus?.message ||
                      whatsAppStatus?.degradedReason ||
                      'integracao pronta',
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-[#222226] bg-[#0E0E10] px-4 py-3">
                <div className="text-xs uppercase tracking-[0.14em] text-[#7E7E85]">
                  Quality rating
                </div>
                <div className="mt-2">{qualityRating}</div>
              </div>
              <div className="rounded-2xl border border-[#222226] bg-[#0E0E10] px-4 py-3">
                <div className="text-xs uppercase tracking-[0.14em] text-[#7E7E85]">
                  Verificação do código
                </div>
                <div className="mt-2">{codeVerificationStatus}</div>
              </div>
              <div className="rounded-2xl border border-[#222226] bg-[#0E0E10] px-4 py-3">
                <div className="text-xs uppercase tracking-[0.14em] text-[#7E7E85]">
                  Status do nome
                </div>
                <div className="mt-2">{nameStatus}</div>
              </div>
            </div>
          )}
        </div>

        {qualityWarning || verificationWarning ? (
          <div className="mt-6 rounded-[24px] border border-[#5A3A20] bg-[#1A1310] px-5 py-4 text-sm text-[#F2D2BF]">
            O número oficial da Meta precisa de atenção. Revise o quality rating, a verificação do
            código e o status do nome antes de ampliar volume outbound.
          </div>
        ) : null}
      </div>
    </div>
  );
}
