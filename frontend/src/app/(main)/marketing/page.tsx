'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  useMarketingStats,
  useMarketingChannels,
  useMarketingLiveFeed,
  useChannelStats,
  useAIBrain,
} from '@/hooks/useMarketing';

/* ═══════════════════════════════════════════
   CHANNEL CONFIG
   ═══════════════════════════════════════════ */
const CHANNEL_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  WHATSAPP: {
    label: 'WhatsApp',
    color: '#25D366',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="#25D366"/>
        <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.96 7.96 0 01-4.11-1.14l-.29-.174-3.01.79.8-2.93-.19-.3A7.96 7.96 0 014 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z" fill="#25D366"/>
      </svg>
    ),
  },
  INSTAGRAM: {
    label: 'Instagram',
    color: '#E1306C',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="5" stroke="#E1306C" strokeWidth="2"/>
        <circle cx="12" cy="12" r="5" stroke="#E1306C" strokeWidth="2"/>
        <circle cx="18" cy="6" r="1.5" fill="#E1306C"/>
      </svg>
    ),
  },
  MESSENGER: {
    label: 'Messenger',
    color: '#0084FF',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.2 5.42 3.15 7.2.16.15.26.36.27.58l.05 1.81c.02.63.67 1.03 1.24.76l2.02-.89c.17-.08.36-.1.55-.06.9.25 1.86.38 2.72.38 5.64 0 10-4.13 10-9.7S17.64 2 12 2z" fill="#0084FF"/>
        <path d="M6.53 14.02l2.69-4.27c.43-.68 1.33-.85 1.96-.37l2.14 1.6c.2.15.47.15.66 0l2.88-2.19c.39-.29.89.18.64.6l-2.69 4.27c-.43.68-1.33.85-1.96.37l-2.14-1.6a.52.52 0 00-.66 0l-2.88 2.19c-.39.29-.89-.18-.64-.6z" fill="#fff"/>
      </svg>
    ),
  },
  EMAIL: {
    label: 'Email',
    color: '#6E6E73',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="4" width="20" height="16" rx="3" stroke="#6E6E73" strokeWidth="2"/>
        <path d="M2 7l10 7 10-7" stroke="#6E6E73" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  TIKTOK: {
    label: 'TikTok',
    color: '#FE2C55',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M9 12a4 4 0 104 4V4c1 2 3 3 5 3" stroke="#FE2C55" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
};

const CHANNEL_ORDER = ['WHATSAPP', 'INSTAGRAM', 'MESSENGER', 'EMAIL', 'TIKTOK'];

/* ═══════════════════════════════════════════
   MOCK LIVE FEED TEMPLATES (fallback)
   ═══════════════════════════════════════════ */
const MSG_TEMPLATES = [
  { contactName: 'Maria Silva', content: 'Oi, quero saber mais sobre o produto', channel: 'WHATSAPP', direction: 'INBOUND' },
  { contactName: 'Kloel AI', content: 'Claro! Temos opcoes incriveis pra voce. Posso te mostrar?', channel: 'WHATSAPP', direction: 'OUTBOUND' },
  { contactName: 'Pedro Santos', content: 'Qual o preco?', channel: 'INSTAGRAM', direction: 'INBOUND' },
  { contactName: 'Kloel AI', content: 'O valor e R$197 com desconto especial hoje!', channel: 'INSTAGRAM', direction: 'OUTBOUND' },
  { contactName: 'Ana Costa', content: 'Fechado! Como faco pra pagar?', channel: 'WHATSAPP', direction: 'INBOUND' },
  { contactName: 'Kloel AI', content: 'Perfeito! Segue o link de pagamento...', channel: 'WHATSAPP', direction: 'OUTBOUND' },
];

/* ═══════════════════════════════════════════
   REVENUE TICKER COMPONENT
   ═══════════════════════════════════════════ */
function RevenueTicker({ baseValue }: { baseValue: number }) {
  const [display, setDisplay] = useState(baseValue);
  const ref = useRef(baseValue);

  useEffect(() => {
    ref.current = baseValue;
    setDisplay(baseValue);
  }, [baseValue]);

  useEffect(() => {
    const interval = setInterval(() => {
      const bump = Math.random() * 15 + 2;
      ref.current += bump;
      setDisplay(ref.current);
    }, Math.random() * 3000 + 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: 14, color: '#6E6E73', fontFamily: 'var(--font-mono)' }}>R$</span>
      <span
        style={{
          fontSize: 42,
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          color: '#E0DDD8',
          letterSpacing: '-0.02em',
          animation: 'tickerUp 0.3s ease',
        }}
        key={Math.floor(display)}
      >
        {display.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════
   LIVE FEED COMPONENT
   ═══════════════════════════════════════════ */
function LiveFeed({ messages }: { messages: any[] }) {
  const feed = messages.length > 0 ? messages : MSG_TEMPLATES.map((m, i) => ({ ...m, id: `mock-${i}`, createdAt: new Date().toISOString() }));

  return (
    <div
      style={{
        height: 380,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {feed.map((msg: any, i: number) => {
        const ch = CHANNEL_META[msg.channel] || CHANNEL_META.WHATSAPP;
        const isOut = msg.direction === 'OUTBOUND';
        return (
          <div
            key={msg.id || i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 6,
              background: isOut ? 'rgba(232,93,48,0.04)' : 'transparent',
              animation: `slideIn 0.3s ease ${i * 0.05}s both`,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: 6,
                marginTop: 7,
                background: ch.color,
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: isOut ? '#E85D30' : '#E0DDD8',
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  {msg.contactName || 'Unknown'}
                </span>
                <span style={{ fontSize: 10, color: '#3A3A3F', fontFamily: 'var(--font-mono)' }}>
                  {msg.createdAt
                    ? new Date(msg.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    : '--:--'}
                </span>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: '#6E6E73',
                  fontFamily: 'var(--font-body)',
                  lineHeight: 1.4,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {msg.content}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════
   CHANNEL DETAIL VIEW
   ═══════════════════════════════════════════ */
function ChannelDetail({
  channel,
  channelData,
  onBack,
}: {
  channel: string;
  channelData: any;
  onBack: () => void;
}) {
  const { stats, isLoading } = useChannelStats(channel);
  const meta = CHANNEL_META[channel] || CHANNEL_META.WHATSAPP;
  const isLive = channelData?.status === 'live';

  return (
    <div style={{ padding: 32, minHeight: '100vh', background: '#0A0A0C' }}>
      <div style={{ maxWidth: 960 }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
          <button
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              color: '#6E6E73',
              cursor: 'pointer',
              fontFamily: 'var(--font-display)',
              fontSize: 13,
              padding: 0,
            }}
          >
            Marketing
          </button>
          <span style={{ color: '#3A3A3F', fontSize: 13 }}>/</span>
          <span style={{ color: '#E0DDD8', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600 }}>
            {meta.label}
          </span>
        </div>

        {/* Channel Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 6,
              background: '#111113',
              border: '1px solid #222226',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {meta.icon}
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: '#E0DDD8', fontFamily: 'var(--font-display)', margin: 0 }}>
              {meta.label}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 6,
                  background: isLive ? meta.color : '#3A3A3F',
                }}
              />
              <span style={{ fontSize: 11, color: isLive ? meta.color : '#3A3A3F', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {isLive ? 'LIVE' : 'SETUP'}
              </span>
            </div>
          </div>
        </div>

        {isLive ? (
          /* ── LIVE VIEW ── */
          <>
            {/* Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 32 }}>
              {[
                { label: 'MENSAGENS', value: stats?.totalMessages ?? channelData?.messages ?? 0 },
                { label: 'CONVERSAS', value: stats?.totalConversations ?? 0 },
                { label: 'ABERTAS', value: stats?.openConversations ?? 0 },
                { label: 'TAXA RESPOSTA', value: `${stats?.responseRate ?? 0}%` },
                { label: 'CONVERSAO', value: `${stats?.conversionRate ?? 0}%` },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    background: '#111113',
                    border: '1px solid #222226',
                    borderRadius: 6,
                    padding: '16px 14px',
                  }}
                >
                  <div style={{ fontSize: 10, color: '#3A3A3F', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', marginBottom: 8, textTransform: 'uppercase' }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#E0DDD8', fontFamily: 'var(--font-mono)' }}>
                    {isLoading ? '--' : s.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Split View: Conversations + Config */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', fontFamily: 'var(--font-display)', marginBottom: 16 }}>
                  Conversas Recentes
                </div>
                <div style={{ color: '#6E6E73', fontSize: 13, fontFamily: 'var(--font-body)' }}>
                  {stats?.openConversations ?? 0} conversas ativas neste canal
                </div>
              </div>
              <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', fontFamily: 'var(--font-display)', marginBottom: 16 }}>
                  Configuracao
                </div>
                <div style={{ color: '#6E6E73', fontSize: 13, fontFamily: 'var(--font-body)' }}>
                  Canal conectado e operando via Kloel AI
                </div>
              </div>
            </div>
          </>
        ) : (
          /* ── SETUP VIEW ── */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 32 }}>
            <div style={{ display: 'flex', gap: 32 }}>
              {[
                { step: 1, label: 'Conectar Conta', desc: `Vincule sua conta do ${meta.label}` },
                { step: 2, label: 'Configurar IA', desc: 'Defina tom de voz e respostas' },
                { step: 3, label: 'Ativar Canal', desc: 'Comece a receber e responder' },
              ].map((s) => (
                <div
                  key={s.step}
                  style={{
                    width: 200,
                    background: '#111113',
                    border: '1px solid #222226',
                    borderRadius: 6,
                    padding: 20,
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      background: 'rgba(232,93,48,0.08)',
                      border: '1px solid rgba(232,93,48,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 12px',
                      fontSize: 14,
                      fontWeight: 700,
                      color: '#E85D30',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {s.step}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', fontFamily: 'var(--font-display)', marginBottom: 4 }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: 12, color: '#6E6E73', fontFamily: 'var(--font-body)' }}>
                    {s.desc}
                  </div>
                </div>
              ))}
            </div>
            <button
              style={{
                padding: '12px 32px',
                background: '#E85D30',
                color: '#0A0A0C',
                border: 'none',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                fontFamily: 'var(--font-display)',
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
            >
              Conectar {meta.label}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═══════════════════════════════════════════ */
export default function MarketingPage() {
  const router = useRouter();
  const { stats, isLoading: statsLoading, error: statsError } = useMarketingStats();
  const { channels, isLoading: channelsLoading, error: channelsError } = useMarketingChannels();
  const { messages, isLoading: feedLoading, error: feedError } = useMarketingLiveFeed();
  const { brain, isLoading: brainLoading, error: brainError } = useAIBrain();

  // Graceful error handling: skip loading when API errors (tables may not exist)
  const hasError = !!(statsError || channelsError);

  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);

  const activeChannelCount = Object.values(channels as Record<string, any>).filter(
    (c: any) => c?.status === 'live'
  ).length;

  const isLoading = (statsLoading || channelsLoading) && !hasError;

  /* ── Channel Detail View ── */
  if (selectedChannel) {
    return (
      <ChannelDetail
        channel={selectedChannel}
        channelData={(channels as any)[selectedChannel]}
        onBack={() => setSelectedChannel(null)}
      />
    );
  }

  /* ── Loading ── */
  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', background: '#0A0A0C' }}>
        <div style={{ width: 20, height: 20, border: '2px solid transparent', borderTopColor: '#E85D30', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  /* ── Command Center View ── */
  return (
    <div style={{ padding: 32, minHeight: '100vh', background: '#0A0A0C' }}>
      <div style={{ maxWidth: 1120 }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: '#E0DDD8',
              fontFamily: 'var(--font-display)',
              margin: 0,
              letterSpacing: '-0.01em',
            }}
          >
            Marketing
          </h1>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              background: 'rgba(232,93,48,0.06)',
              border: '1px solid rgba(232,93,48,0.15)',
              borderRadius: 6,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: 6,
                background: '#E85D30',
                animation: 'pulse 2s ease infinite',
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#E85D30',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {activeChannelCount} {activeChannelCount === 1 ? 'CANAL ATIVO' : 'CANAIS ATIVOS'}
            </span>
          </div>
        </div>

        {/* ── Revenue Counter ── */}
        <div style={{ marginBottom: 32, animation: 'glow 4s ease infinite' }}>
          <div style={{ fontSize: 11, color: '#3A3A3F', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
            RECEITA TOTAL
          </div>
          <RevenueTicker baseValue={stats.totalRevenue || 0} />
          <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
            {[
              { label: 'Mensagens', value: stats.totalMessages },
              { label: 'Leads', value: stats.totalLeads },
              { label: 'Vendas', value: stats.totalSales },
            ].map((m) => (
              <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 18, fontWeight: 600, color: '#E0DDD8', fontFamily: 'var(--font-mono)' }}>
                  {m.value.toLocaleString('pt-BR')}
                </span>
                <span style={{ fontSize: 11, color: '#3A3A3F', fontFamily: 'var(--font-body)' }}>
                  {m.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Channel Grid ── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, color: '#3A3A3F', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
            CANAIS
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            {CHANNEL_ORDER.map((ch, i) => {
              const meta = CHANNEL_META[ch];
              const data = (channels as any)[ch] || { status: 'setup', messages: 0, leads: 0, sales: 0 };
              const isLive = data.status === 'live';

              return (
                <button
                  key={ch}
                  onClick={() => setSelectedChannel(ch)}
                  style={{
                    background: '#111113',
                    border: `1px solid ${isLive ? 'rgba(232,93,48,0.15)' : '#222226'}`,
                    borderRadius: 6,
                    padding: '16px 14px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 150ms ease',
                    animation: `slideIn 0.3s ease ${i * 0.06}s both`,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = meta.color;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = isLive ? 'rgba(232,93,48,0.15)' : '#222226';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    {meta.icon}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: 5,
                          background: isLive ? meta.color : '#3A3A3F',
                        }}
                      />
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          color: isLive ? meta.color : '#3A3A3F',
                          fontFamily: 'var(--font-mono)',
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {isLive ? 'LIVE' : 'SETUP'}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', fontFamily: 'var(--font-display)', marginBottom: 4 }}>
                    {meta.label}
                  </div>
                  {isLive ? (
                    <div style={{ display: 'flex', gap: 12 }}>
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#E0DDD8', fontFamily: 'var(--font-mono)' }}>
                          {data.sales || 0}
                        </span>
                        <span style={{ fontSize: 10, color: '#3A3A3F', fontFamily: 'var(--font-body)', marginLeft: 3 }}>vendas</span>
                      </div>
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#E0DDD8', fontFamily: 'var(--font-mono)' }}>
                          {data.leads || 0}
                        </span>
                        <span style={{ fontSize: 10, color: '#3A3A3F', fontFamily: 'var(--font-body)', marginLeft: 3 }}>leads</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: '#3A3A3F', fontFamily: 'var(--font-body)' }}>
                      Clique para configurar
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Bottom Grid: Live Feed + AI Brain + Quick Actions ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>

          {/* Live Feed */}
          <div
            style={{
              background: '#111113',
              border: '1px solid #222226',
              borderRadius: 6,
              padding: '16px 0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: 6, background: '#E85D30', animation: 'pulse 2s ease infinite' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', fontFamily: 'var(--font-display)' }}>
                  Live Feed
                </span>
              </div>
              <span style={{ fontSize: 11, color: '#3A3A3F', fontFamily: 'var(--font-mono)' }}>
                {messages.length > 0 ? `${messages.length} msgs` : 'demo'}
              </span>
            </div>
            <LiveFeed messages={messages} />
          </div>

          {/* Right Column: AI Brain + Quick Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* AI Brain Panel */}
            <div
              style={{
                background: '#111113',
                border: '1px solid #222226',
                borderRadius: 6,
                padding: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2a4 4 0 014 4v1h1a3 3 0 013 3v4a3 3 0 01-3 3h-1v1a4 4 0 01-8 0v-1H7a3 3 0 01-3-3v-4a3 3 0 013-3h1V6a4 4 0 014-4z" stroke="#E85D30" strokeWidth="1.5"/>
                  <circle cx="9" cy="12" r="1" fill="#E85D30"/>
                  <circle cx="15" cy="12" r="1" fill="#E85D30"/>
                </svg>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', fontFamily: 'var(--font-display)' }}>
                  AI Brain
                </span>
                <div
                  style={{
                    marginLeft: 'auto',
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: 9,
                    fontWeight: 600,
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: (brain as any).status === 'active' ? '#25D366' : '#3A3A3F',
                    background: (brain as any).status === 'active' ? 'rgba(37,211,102,0.08)' : 'rgba(58,58,63,0.1)',
                  }}
                >
                  {(brain as any).status === 'active' ? 'ATIVO' : 'CONFIG'}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'Produtos carregados', value: (brain as any).productsLoaded ?? 0 },
                  { label: 'Objecoes mapeadas', value: (brain as any).objectionsMapped ?? 0 },
                  { label: 'Conversas ativas', value: (brain as any).activeConversations ?? 0 },
                  { label: 'Tempo de resposta', value: (brain as any).avgResponseTime ?? '--' },
                ].map((item) => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#6E6E73', fontFamily: 'var(--font-body)' }}>
                      {item.label}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', fontFamily: 'var(--font-mono)' }}>
                      {brainLoading ? '--' : item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div
              style={{
                background: '#111113',
                border: '1px solid #222226',
                borderRadius: 6,
                padding: 16,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
                Acoes Rapidas
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { label: 'Nova Campanha', href: '/campaigns', icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#E85D30" strokeWidth="2" strokeLinecap="round"/></svg>
                  )},
                  { label: 'Envio em Massa', href: '/mass-send', icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="#E85D30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  )},
                  { label: 'Configurar Fluxo', href: '/flow', icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2 2-2 2M18 13l2 2-2 2M21 3l-8.5 8.5M14 14l7 7" stroke="#E85D30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  )},
                  { label: 'Ver Inbox', href: '/inbox', icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" stroke="#E85D30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  )},
                ].map((action) => (
                  <button
                    key={action.label}
                    onClick={() => router.push(action.href)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      background: 'transparent',
                      border: '1px solid #222226',
                      borderRadius: 6,
                      color: '#E0DDD8',
                      fontFamily: 'var(--font-display)',
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 150ms ease',
                      textAlign: 'left',
                      width: '100%',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(232,93,48,0.3)';
                      (e.currentTarget as HTMLElement).style.background = 'rgba(232,93,48,0.04)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = '#222226';
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}
                  >
                    {action.icon}
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
