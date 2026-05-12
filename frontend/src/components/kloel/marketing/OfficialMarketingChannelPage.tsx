'use client';

import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useProducts } from '@/hooks/useProducts';
import { apiFetch } from '@/lib/api';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import {
  CHANNEL_META,
  type ChannelConnectionStatus,
  type ChannelKey,
  type ConnectStatus,
  type TikTokStatus,
  statusText,
  trustedExternalUrl,
} from './OfficialMarketingChannelPage.helpers';

interface Props {
  channel: ChannelKey;
}

const SETUP_STEPS = ['Conexão', 'Produtos', 'Arsenal', 'Configuração'] as const;

interface ProductOption {
  id: string;
  name: string;
}

interface ChannelSetup {
  currentStep: number;
  selectedProductIds: string[];
  arsenal: string[];
  config: {
    tone: string;
    aggressiveness: string;
    workingHours: string;
    followUpEnabled: boolean;
    proactiveDailyLimit: number;
    language: string;
    handoffCriteria: string;
  };
}

const DEFAULT_SETUP: ChannelSetup = {
  currentStep: 0,
  selectedProductIds: [],
  arsenal: [],
  config: {
    tone: 'consultivo',
    aggressiveness: 'moderado',
    workingHours: '08:00-22:00',
    followUpEnabled: true,
    proactiveDailyLimit: 25,
    language: 'pt-BR',
    handoffCriteria: '',
  },
};

function normalizeSetup(raw: unknown): ChannelSetup {
  const record =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const config =
    record.config && typeof record.config === 'object' && !Array.isArray(record.config)
      ? (record.config as Record<string, unknown>)
      : {};
  const currentStep = Number(record.currentStep);
  return {
    currentStep: Number.isInteger(currentStep) ? Math.min(3, Math.max(0, currentStep)) : 0,
    selectedProductIds: Array.isArray(record.selectedProductIds)
      ? record.selectedProductIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [],
    arsenal: Array.isArray(record.arsenal)
      ? record.arsenal.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    config: {
      ...DEFAULT_SETUP.config,
      tone: typeof config.tone === 'string' ? config.tone : DEFAULT_SETUP.config.tone,
      aggressiveness:
        typeof config.aggressiveness === 'string'
          ? config.aggressiveness
          : DEFAULT_SETUP.config.aggressiveness,
      workingHours:
        typeof config.workingHours === 'string'
          ? config.workingHours
          : DEFAULT_SETUP.config.workingHours,
      followUpEnabled:
        typeof config.followUpEnabled === 'boolean'
          ? config.followUpEnabled
          : DEFAULT_SETUP.config.followUpEnabled,
      proactiveDailyLimit:
        typeof config.proactiveDailyLimit === 'number'
          ? config.proactiveDailyLimit
          : DEFAULT_SETUP.config.proactiveDailyLimit,
      language:
        typeof config.language === 'string' ? config.language : DEFAULT_SETUP.config.language,
      handoffCriteria:
        typeof config.handoffCriteria === 'string'
          ? config.handoffCriteria
          : DEFAULT_SETUP.config.handoffCriteria,
    },
  };
}

function normalizeProduct(raw: unknown): ProductOption | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const id = String(record.id || '').trim();
  if (!id) {
    return null;
  }
  return {
    id,
    name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : 'Produto',
  };
}

export function OfficialMarketingChannelPage({ channel }: Props) {
  const meta = CHANNEL_META[channel];
  const { products } = useProducts();
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [tiktokStatus, setTikTokStatus] = useState<TikTokStatus | null>(null);
  const [setup, setSetup] = useState<ChannelSetup>(DEFAULT_SETUP);
  const [setupLoaded, setSetupLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [disconnectArmed, setDisconnectArmed] = useState(false);

  const productOptions = useMemo(() => {
    if (!Array.isArray(products)) {
      return [];
    }
    return products.flatMap((product) => {
      const normalized = normalizeProduct(product);
      return normalized ? [normalized] : [];
    });
  }, [products]);

  const connection = useMemo(() => {
    if (channel === 'tiktok') {
      return {
        connected: tiktokStatus?.connected,
        status: tiktokStatus?.status,
      };
    }
    const channelStatus = status?.channels as
      | Partial<Record<ChannelKey, ChannelConnectionStatus>>
      | undefined;
    return channelStatus?.[channel] || null;
  }, [channel, status, tiktokStatus]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setSetupLoaded(false);
    setLoadError(null);
    try {
      const nextStatus = await apiFetch<ConnectStatus>('/marketing/connect/status');
      if (nextStatus.error) {
        throw new Error(nextStatus.error);
      }
      setStatus(nextStatus.data || (nextStatus as unknown as ConnectStatus));
      const setupResponse = await apiFetch<{ setup?: unknown }>(
        `/marketing/connect/channel-setup?channel=${encodeURIComponent(channel)}`,
      );
      if (setupResponse.error) {
        throw new Error(setupResponse.error);
      }
      setSetup(normalizeSetup(setupResponse.data?.setup));
      setSetupLoaded(true);
      if (channel === 'tiktok') {
        const nextTikTok = await apiFetch<TikTokStatus>('/marketing/connect/tiktok/status');
        if (nextTikTok.error) {
          throw new Error(nextTikTok.error);
        }
        setTikTokStatus(nextTikTok.data || null);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Falha ao carregar status.');
    } finally {
      setIsLoading(false);
    }
  }, [channel]);

  const persistSetup = useCallback(
    async (nextSetup: ChannelSetup, successMessage?: string) => {
      setBusy('setup');
      setMessage(null);
      const response = await apiFetch<{ setup?: unknown }>('/marketing/connect/channel-setup', {
        method: 'POST',
        body: {
          channel,
          currentStep: nextSetup.currentStep,
          selectedProductIds: nextSetup.selectedProductIds,
          arsenal: nextSetup.arsenal,
          config: nextSetup.config,
        },
      });
      setBusy(null);
      if (response.error) {
        setMessage(response.error);
        return;
      }
      setSetup(normalizeSetup(response.data?.setup));
      setSetupLoaded(true);
      setMessage(successMessage || 'Progresso salvo.');
    },
    [channel],
  );

  const setCurrentStep = useCallback(
    (nextStep: number) => {
      const normalized = Math.min(3, Math.max(0, nextStep));
      setSetup((currentSetup) => {
        const nextSetup = { ...currentSetup, currentStep: normalized };
        void persistSetup(nextSetup);
        return nextSetup;
      });
    },
    [persistSetup],
  );

  const toggleProduct = useCallback(
    (productId: string) => {
      const selected = new Set(setup.selectedProductIds);
      if (selected.has(productId)) {
        selected.delete(productId);
      } else {
        selected.add(productId);
      }
      setSetup({ ...setup, selectedProductIds: Array.from(selected) });
    },
    [setup],
  );

  const updateConfig = useCallback((patch: Partial<ChannelSetup['config']>) => {
    setSetup((current) => ({ ...current, config: { ...current.config, ...patch } }));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openMeta = useCallback(async () => {
    setBusy('meta');
    setMessage(null);
    setDisconnectArmed(false);
    try {
      const returnTo = `/marketing/${channel}`;
      const response = await apiFetch<{ url?: string }>(
        `/meta/auth/url?channel=${encodeURIComponent(channel)}&returnTo=${encodeURIComponent(returnTo)}`,
      );
      const url = String(response.data?.url || '').trim();
      if (
        !url ||
        !trustedExternalUrl(url, [
          'facebook.com',
          'www.facebook.com',
          'business.facebook.com',
          'instagram.com',
          'www.instagram.com',
          'api.instagram.com',
        ])
      ) {
        throw new Error('URL oficial da Meta indisponivel.');
      }
      window.location.assign(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao abrir Meta.');
      setBusy(null);
    }
  }, [channel]);

  const disconnectMeta = useCallback(async () => {
    if (!disconnectArmed) {
      setDisconnectArmed(true);
      setMessage('Clique novamente em Confirmar desconexão para revogar a conexão Meta.');
      return;
    }
    if (
      !window.confirm(
        'Desconectar a Meta revoga WhatsApp, Instagram e Facebook deste workspace. Confirmar?',
      )
    ) {
      setDisconnectArmed(false);
      return;
    }
    setBusy('meta-disconnect');
    setMessage(null);
    const response = await apiFetch('/meta/auth/disconnect', { method: 'POST' });
    setBusy(null);
    setDisconnectArmed(false);
    if (response.error) {
      setMessage(response.error);
      return;
    }
    setMessage('Conexão Meta revogada.');
    await refresh();
  }, [disconnectArmed, refresh]);

  const toggleEmail = useCallback(
    async (enabled: boolean) => {
      setBusy('email');
      setMessage(null);
      const response = await apiFetch('/marketing/connect/email', {
        method: 'POST',
        body: { enabled },
      });
      setBusy(null);
      if (response.error) {
        setMessage(response.error);
        return;
      }
      setMessage(enabled ? 'Email ativado.' : 'Email desativado.');
      await refresh();
    },
    [refresh],
  );

  const sendEmailTest = useCallback(async () => {
    setBusy('email-test');
    setMessage(null);
    const response = await apiFetch<{ toEmail?: string; provider?: string }>(
      '/marketing/connect/email/test',
      { method: 'POST', body: {} },
    );
    setBusy(null);
    setMessage(
      response.error || `Email de teste enviado via ${response.data?.provider || 'provider'}.`,
    );
  }, []);

  const openTikTok = useCallback(async (kind: 'creator' | 'advertiser') => {
    setBusy(`tiktok-${kind}`);
    setMessage(null);
    try {
      const response = await apiFetch<{ url?: string }>(
        `/marketing/connect/tiktok/url?kind=${kind}`,
      );
      const url = String(response.data?.url || '').trim();
      const hosts =
        kind === 'advertiser' ? ['business-api.tiktok.com'] : ['www.tiktok.com', 'tiktok.com'];
      if (!url || !trustedExternalUrl(url, hosts)) {
        throw new Error('URL oficial do TikTok indisponivel.');
      }
      window.location.assign(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao abrir TikTok.');
      setBusy(null);
    }
  }, []);

  const details = channel === 'tiktok' ? tiktokStatus : connection;
  const setupUnavailable =
    connection?.status === 'server_not_configured' || connection?.status === 'unavailable';
  const badgeStatus = isLoading
    ? 'Carregando'
    : statusText(connection?.connected, connection?.status);

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '28px clamp(16px, 4vw, 40px)',
        background: KLOEL_THEME.bgPrimary,
        color: KLOEL_THEME.textPrimary,
        fontFamily: "'Sora', system-ui, sans-serif",
      }}
    >
      <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
        {(['whatsapp', 'instagram', 'facebook', 'tiktok', 'email'] as ChannelKey[]).map((item) => (
          <Link
            key={item}
            href={`/marketing/${item}`}
            style={{
              color: item === channel ? CHANNEL_META[item].color : KLOEL_THEME.textSecondary,
              textDecoration: 'none',
              border: `1px solid ${KLOEL_THEME.borderPrimary}`,
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 12,
            }}
          >
            {CHANNEL_META[item].label}
          </Link>
        ))}
      </nav>

      <section style={{ maxWidth: 920, margin: '0 auto' }}>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 'clamp(28px, 5vw, 44px)', lineHeight: 1.05 }}>
              {meta.label}
            </h1>
            <p style={{ color: KLOEL_THEME.textSecondary, lineHeight: 1.7, maxWidth: 620 }}>
              {meta.summary}
            </p>
          </div>
          <span
            style={{
              height: 28,
              borderRadius: 6,
              padding: '5px 10px',
              color: connection?.connected ? KLOEL_THEME.success : KLOEL_THEME.error,
              background: connection?.connected ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.12)',
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {badgeStatus}
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 10,
            margin: '22px 0',
          }}
        >
          {meta.proof.map((item) => (
            <div
              key={item}
              style={{
                border: `1px solid ${KLOEL_THEME.borderPrimary}`,
                background: KLOEL_THEME.bgCard,
                borderRadius: 6,
                padding: 14,
                borderLeft: `3px solid ${meta.color}`,
              }}
            >
              {item}
            </div>
          ))}
        </div>

        <ol
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 10,
            margin: '0 0 22px',
            padding: 0,
            listStyle: 'none',
            overflowX: 'auto',
          }}
        >
          {SETUP_STEPS.map((step, index) => (
            <li
              key={step}
              aria-current={setup.currentStep === index ? 'step' : undefined}
              style={{
                minHeight: 72,
                minWidth: 170,
              }}
            >
              <button
                type="button"
                aria-label={`Passo ${index + 1}`}
                disabled={!setupLoaded}
                onClick={() => setCurrentStep(index)}
                style={{
                  width: '100%',
                  minHeight: 72,
                  borderRadius: 6,
                  border: `1px solid ${KLOEL_THEME.borderPrimary}`,
                  display: 'grid',
                  gridTemplateColumns: '32px 1fr',
                  gap: 10,
                  alignItems: 'center',
                  background:
                    setup.currentStep === index ? 'rgba(232,93,48,.14)' : KLOEL_THEME.bgSecondary,
                  padding: 14,
                  cursor: setupLoaded ? 'pointer' : 'not-allowed',
                  opacity: setupLoaded ? 1 : 0.62,
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: meta.color,
                    color: KLOEL_THEME.textOnAccent,
                    fontWeight: 800,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {index + 1}
                </span>
                <span style={{ color: KLOEL_THEME.textPrimary, lineHeight: 1.45 }}>{step}</span>
              </button>
            </li>
          ))}
        </ol>

        <section style={setupPanelStyle}>
          <p
            style={{
              margin: '0 0 14px',
              color: KLOEL_THEME.textSecondary,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
            }}
          >
            Passo {setup.currentStep + 1} de 4
          </p>

          {setup.currentStep === 0 ? (
            <div style={{ color: KLOEL_THEME.textSecondary, lineHeight: 1.7 }}>
              <strong style={{ color: KLOEL_THEME.textPrimary }}>Conexão oficial.</strong> Use o
              botão de conexão abaixo para abrir o fluxo oficial do provedor. O status volta para
              esta tela e o progresso do canal fica salvo no workspace.
            </div>
          ) : null}

          {setup.currentStep === 1 ? (
            <div>
              <h2 style={sectionTitleStyle}>Produtos liberados no canal</h2>
              {productOptions.length === 0 ? (
                <p style={{ color: KLOEL_THEME.textSecondary }}>
                  Nenhum produto cadastrado ainda. Cadastre produtos para liberar ofertas neste
                  canal.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {productOptions.map((product) => (
                    <label key={product.id} style={productRowStyle}>
                      <span>{product.name}</span>
                      <input
                        type="checkbox"
                        checked={setup.selectedProductIds.includes(product.id)}
                        onChange={() => toggleProduct(product.id)}
                      />
                    </label>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => void persistSetup(setup, 'Produtos do canal salvos.')}
                style={{ ...secondaryButtonStyle, marginTop: 14 }}
              >
                {busy === 'setup' ? 'Salvando...' : 'Salvar produtos'}
              </button>
            </div>
          ) : null}

          {setup.currentStep === 2 ? (
            <div>
              <h2 style={sectionTitleStyle}>Arsenal do canal</h2>
              <textarea
                value={setup.arsenal.join('\n')}
                onChange={(event) =>
                  setSetup((current) => ({
                    ...current,
                    arsenal: event.target.value
                      .split('\n')
                      .map((item) => item.trim())
                      .filter(Boolean),
                  }))
                }
                placeholder="Um material por linha: script de objeção, depoimento, oferta, FAQ, garantia..."
                rows={7}
                style={textAreaStyle}
              />
              <button
                type="button"
                onClick={() => void persistSetup(setup, 'Arsenal do canal salvo.')}
                style={{ ...secondaryButtonStyle, marginTop: 14 }}
              >
                {busy === 'setup' ? 'Salvando...' : 'Salvar arsenal'}
              </button>
            </div>
          ) : null}

          {setup.currentStep === 3 ? (
            <div>
              <h2 style={sectionTitleStyle}>Configuração operacional</h2>
              <div style={{ display: 'grid', gap: 12 }}>
                <label style={fieldStyle}>
                  Tom
                  <select
                    value={setup.config.tone || 'consultivo'}
                    onChange={(event) => updateConfig({ tone: event.target.value })}
                    style={inputStyle}
                  >
                    <option value="consultivo">Consultivo</option>
                    <option value="urgente">Urgente</option>
                    <option value="casual">Casual</option>
                    <option value="formal">Formal</option>
                  </select>
                </label>
                <label style={fieldStyle}>
                  Agressividade
                  <select
                    value={setup.config.aggressiveness || 'moderado'}
                    onChange={(event) => updateConfig({ aggressiveness: event.target.value })}
                    style={inputStyle}
                  >
                    <option value="passivo">Passivo</option>
                    <option value="moderado">Moderado</option>
                    <option value="incisivo">Incisivo</option>
                  </select>
                </label>
                <label style={fieldStyle}>
                  Horário de operação
                  <input
                    value={setup.config.workingHours || ''}
                    onChange={(event) => updateConfig({ workingHours: event.target.value })}
                    style={inputStyle}
                  />
                </label>
                <label style={fieldStyle}>
                  Limite diário de mensagens proativas por contato
                  <input
                    type="number"
                    min={0}
                    value={setup.config.proactiveDailyLimit ?? 0}
                    onChange={(event) =>
                      updateConfig({ proactiveDailyLimit: Number(event.target.value) || 0 })
                    }
                    style={inputStyle}
                  />
                </label>
                <label style={fieldStyle}>
                  Idioma
                  <input
                    value={setup.config.language || 'pt-BR'}
                    onChange={(event) => updateConfig({ language: event.target.value })}
                    style={inputStyle}
                  />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={setup.config.followUpEnabled !== false}
                    onChange={(event) => updateConfig({ followUpEnabled: event.target.checked })}
                  />
                  Follow-up automático
                </label>
                <label style={fieldStyle}>
                  Critérios de transferência para humano
                  <textarea
                    value={setup.config.handoffCriteria || ''}
                    onChange={(event) => updateConfig({ handoffCriteria: event.target.value })}
                    rows={4}
                    style={textAreaStyle}
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => void persistSetup(setup, 'Configuração do canal salva.')}
                style={{ ...secondaryButtonStyle, marginTop: 14 }}
              >
                {busy === 'setup' ? 'Salvando...' : 'Salvar configuração'}
              </button>
            </div>
          ) : null}
        </section>

        {isLoading ? (
          <p style={{ color: KLOEL_THEME.textSecondary }}>Carregando status oficial...</p>
        ) : loadError ? (
          <p style={{ color: KLOEL_THEME.error }}>Falha ao carregar conexão: {loadError}</p>
        ) : setupUnavailable ? (
          <p style={{ color: KLOEL_THEME.textSecondary }}>
            Configuração server-side pendente para este canal.
          </p>
        ) : !connection?.connected ? (
          <p style={{ color: KLOEL_THEME.textSecondary }}>
            Nenhuma conta conectada neste workspace.
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
          {channel === 'email' ? (
            <>
              <button
                type="button"
                onClick={() => void toggleEmail(true)}
                style={buttonStyle(meta.color)}
              >
                {busy === 'email' ? 'Ativando...' : 'Conectar Email'}
              </button>
              <button
                type="button"
                onClick={() => void sendEmailTest()}
                style={secondaryButtonStyle}
              >
                {busy === 'email-test' ? 'Enviando...' : 'Enviar teste'}
              </button>
            </>
          ) : channel === 'tiktok' ? (
            <>
              <button
                type="button"
                onClick={() => void openTikTok('creator')}
                style={buttonStyle(meta.color)}
              >
                {busy === 'tiktok-creator' ? 'Abrindo...' : 'Conectar conta TikTok'}
              </button>
              <button
                type="button"
                onClick={() => void openTikTok('advertiser')}
                style={secondaryButtonStyle}
              >
                {busy === 'tiktok-advertiser' ? 'Abrindo...' : 'Conectar advertiser'}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => void openMeta()} style={buttonStyle(meta.color)}>
                {busy === 'meta' ? 'Abrindo...' : `Conectar ${meta.label} via Meta oficial`}
              </button>
              {connection?.connected ? (
                <button
                  type="button"
                  onClick={() => void disconnectMeta()}
                  style={secondaryButtonStyle}
                >
                  {busy === 'meta-disconnect'
                    ? 'Desconectando...'
                    : disconnectArmed
                      ? 'Confirmar desconexão'
                      : 'Desconectar Meta'}
                </button>
              ) : null}
            </>
          )}
          <button type="button" onClick={() => void refresh()} style={secondaryButtonStyle}>
            Recarregar status
          </button>
          <button
            type="button"
            onClick={() => setCurrentStep(setup.currentStep + 1)}
            disabled={!setupLoaded || setup.currentStep >= 3}
            style={secondaryButtonStyle}
          >
            Avançar passo
          </button>
        </div>

        {message ? <p style={{ color: KLOEL_THEME.textSecondary }}>{message}</p> : null}

        <pre
          style={{
            marginTop: 24,
            padding: 16,
            borderRadius: 6,
            border: `1px solid ${KLOEL_THEME.borderPrimary}`,
            background: KLOEL_THEME.bgCard,
            color: KLOEL_THEME.textSecondary,
            overflowX: 'auto',
            fontSize: 12,
          }}
        >
          {JSON.stringify(details || {}, null, 2)}
        </pre>
      </section>
    </main>
  );
}

function buttonStyle(color: string): CSSProperties {
  return {
    border: 'none',
    borderRadius: 6,
    background: color,
    color: KLOEL_THEME.textOnAccent,
    padding: '12px 16px',
    fontWeight: 700,
    cursor: 'pointer',
  };
}

const secondaryButtonStyle: CSSProperties = {
  border: `1px solid ${KLOEL_THEME.borderPrimary}`,
  borderRadius: 6,
  background: KLOEL_THEME.bgCard,
  color: KLOEL_THEME.textPrimary,
  padding: '12px 16px',
  fontWeight: 700,
  cursor: 'pointer',
};

const setupPanelStyle: CSSProperties = {
  border: `1px solid ${KLOEL_THEME.borderPrimary}`,
  background: KLOEL_THEME.bgCard,
  borderRadius: 6,
  padding: 18,
  marginBottom: 18,
};

const sectionTitleStyle: CSSProperties = {
  margin: '0 0 12px',
  fontSize: 16,
};

const productRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  border: `1px solid ${KLOEL_THEME.borderPrimary}`,
  borderRadius: 6,
  padding: 12,
};

const fieldStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
  color: KLOEL_THEME.textSecondary,
  fontSize: 13,
};

const inputStyle: CSSProperties = {
  border: `1px solid ${KLOEL_THEME.borderPrimary}`,
  borderRadius: 6,
  background: KLOEL_THEME.bgSecondary,
  color: KLOEL_THEME.textPrimary,
  padding: '10px 12px',
};

const textAreaStyle: CSSProperties = {
  ...inputStyle,
  width: '100%',
  resize: 'vertical',
  fontFamily: "'Sora', system-ui, sans-serif",
};
