'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { useRouter } from 'next/navigation';
import { IC, Fmt, EMBER, G, SORA, MONO } from './AnunciosShared';

export function TrackingDashboard({ focus }: { focus?: string }) {
  const router = useRouter();
  const focusedRetargeting = focus === 'retargeting';
  const trackedSales = 0;
  const pixelFires = 0;
  const postbacks = 0;
  const utms = 0;
  const attribution = 0;

  const events: { name: string; fires: number }[] = [
    { name: 'PageView', fires: 0 },
    { name: 'AddToCart', fires: 0 },
    { name: 'InitiateCheckout', fires: 0 },
    { name: 'Purchase', fires: 0 },
  ];

  const integrations = [
    { name: 'Checkout Kloel', connected: true },
    { name: 'Meta Pixel', connected: false },
    { name: 'Google Tag', connected: false },
    { name: 'CRM Kloel', connected: true },
  ];

  const retargetingCards = [
    {
      label: 'Follow-ups',
      desc: 'Retome leads frios logo depois do abandono.',
      href: '/followups?source=retargeting',
    },
    {
      label: 'Flow',
      desc: 'Automatize a reentrada com cadencias e regras.',
      href: '/flow?source=retargeting&purpose=recovery',
    },
    {
      label: 'Inbox',
      desc: 'Assuma manualmente as conversas prioritarias.',
      href: '/inbox?source=retargeting',
    },
  ];

  const actionCards = [
    {
      title: 'Abandono',
      desc: 'Leia os gargalos reais antes de montar a recuperação.',
      cta: 'Abrir Analytics',
      action: () => router.push('/analytics?tab=abandonos'),
    },
    {
      title: 'Campanhas',
      desc: 'Use o dado de rastreamento para reimpactar a audiência certa.',
      cta: 'Abrir campanhas',
      action: () => router.push('/campaigns'),
    },
    {
      title: 'Broadcast',
      desc: 'Acione mensagens e emails assim que o lead esfriar.',
      cta: 'Abrir marketing',
      action: () => router.push('/marketing/whatsapp?mode=broadcast'),
    },
    {
      title: 'Flow',
      desc: 'Automatize a retomada com a cadencia certa.',
      cta: 'Abrir flow',
      action: () => router.push('/flow?source=retargeting&purpose=recovery'),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 20, animation: 'fadeIn .3s ease' }}>
      <div
        style={{
          background: focusedRetargeting ? 'rgba(232,93,48,.06)' : colors.background.surface,
          border: focusedRetargeting ? `1px solid ${EMBER}33` : '1px solid colors.border.space',
          borderRadius: 6,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' as const }}>
          <div>
            <div style={{ fontSize: 11, fontFamily: MONO, color: EMBER, letterSpacing: 1, marginBottom: 6 }}>
              {kloelT(`RETARGETING INTELIGENTE`)}
            </div>
            <div style={{ fontSize: 13, fontFamily: SORA, color: 'var(--app-text-primary)', fontWeight: 600 }}>
              {kloelT(`Feche o loop entre abandono, campanha e recuperação`)}
            </div>
            <div style={{ fontSize: 11, fontFamily: SORA, color: 'var(--app-text-secondary)', marginTop: 6, lineHeight: 1.6 }}>
              {kloelT(`Use rastreamento para captar o abandono, acionar follow-ups, abrir campanhas e medir o
              retorno em Analytics sem sair da trilha operacional do produto.`)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            <button
              type="button"
              onClick={() => router.push('/analytics?tab=abandonos')}
              style={{
                background: EMBER, border: 'none', borderRadius: 6, padding: '8px 14px',
                color: colors.text.silver, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: SORA,
              }}
            >
              {kloelT(`Ver abandonos`)}
            </button>
            <button
              type="button"
              onClick={() => router.push('/marketing/email?mode=templates')}
              style={{
                background: 'transparent', border: '1px solid var(--app-border-primary)', borderRadius: 6,
                padding: '8px 14px', color: 'var(--app-text-primary)', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: SORA,
              }}
            >
              {kloelT(`Recuperar por email`)}
            </button>
            <button
              type="button"
              onClick={() => router.push('/settings?section=billing')}
              style={{
                background: 'transparent', border: '1px solid var(--app-border-primary)', borderRadius: 6,
                padding: '8px 14px', color: 'var(--app-text-secondary)', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: SORA,
              }}
            >
              {kloelT(`Plano e cobranca`)}
            </button>
          </div>
        </div>
        {focusedRetargeting && (
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10 }}>
            {retargetingCards.map((item) => (
              <button
                type="button"
                key={item.label}
                onClick={() => router.push(item.href)}
                style={{
                  textAlign: 'left', background: 'var(--app-bg-card)',
                  border: '1px solid var(--app-border-primary)', borderRadius: 6,
                  padding: '14px 16px', cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 11, fontFamily: MONO, color: EMBER, letterSpacing: 1, marginBottom: 6 }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 11, fontFamily: SORA, color: 'var(--app-text-secondary)', lineHeight: 1.6 }}>
                  {item.desc}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center' as const, padding: '16px 0 8px' }}>
        <div style={{ fontSize: 11, fontFamily: MONO, color: 'var(--app-text-secondary)', letterSpacing: 2, marginBottom: 8 }}>
          {kloelT(`VENDAS RASTREADAS`)}
        </div>
        <div
          style={{
            fontSize: 64, fontWeight: 800, fontFamily: MONO, color: EMBER,
            textShadow: `0 0 30px ${EMBER}44`, lineHeight: 1,
          }}
        >
          {trackedSales}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {[
          { label: 'PIXEL FIRES', value: Fmt(pixelFires), color: EMBER },
          { label: 'POSTBACKS', value: Fmt(postbacks), color: G },
          { label: 'UTMs', value: String(utms), color: 'var(--app-text-primary)' },
          { label: 'ATRIBUICAO', value: `${attribution}%`, color: G },
        ].map((s) => (
          <div key={s.label} style={{ background: 'var(--app-bg-card)', border: '1px solid var(--app-border-primary)', borderRadius: 6, padding: 14, textAlign: 'center' as const }}>
            <div style={{ fontSize: 10, fontFamily: MONO, color: 'var(--app-text-secondary)', letterSpacing: 1, marginBottom: 6 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: MONO, color: s.color }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
        {actionCards.map((card) => (
          <div key={card.title} style={{ background: 'var(--app-bg-card)', border: '1px solid var(--app-border-primary)', borderRadius: 6, padding: 16 }}>
            <div style={{ fontSize: 12, fontFamily: MONO, color: EMBER, letterSpacing: 1, marginBottom: 8 }}>
              {card.title}
            </div>
            <div style={{ fontSize: 12, fontFamily: SORA, color: 'var(--app-text-secondary)', lineHeight: 1.6, minHeight: 52 }}>
              {card.desc}
            </div>
            <button
              type="button"
              onClick={card.action}
              style={{
                marginTop: 14, background: 'transparent', border: '1px solid var(--app-border-primary)',
                borderRadius: 6, padding: '8px 14px', color: 'var(--app-text-primary)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: SORA,
              }}
            >
              {card.cta}
            </button>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--app-bg-card)', border: '1px solid var(--app-border-primary)', borderRadius: 6, padding: 16 }}>
        <div style={{ fontSize: 11, fontFamily: MONO, color: 'var(--app-text-secondary)', letterSpacing: 1, marginBottom: 12 }}>
          {kloelT(`PIXEL KLOEL — COPIE E COLE NO SEU SITE`)}
        </div>
        <div
          style={{
            background: 'var(--app-bg-primary)', borderRadius: 6, padding: 14, fontFamily: MONO,
            fontSize: 9, color: 'var(--app-text-secondary)', lineHeight: 1.8,
            overflowX: 'auto' as const, whiteSpace: 'pre' as const, border: '1px solid var(--app-border-subtle)',
          }}
        >
          {`<script>
  !function(k,l,o,e,i){k.KloelPixel=i;k[i]=k[i]||function(){
  (k[i].q=k[i].q||[]).push(arguments)};k[i].l=1*new Date();
  var s=l.createElement('script'),f=l.getElementsByTagName('script')[0];
  s.async=1;s.src='https://px.kloel.com/kl.js';
  f.parentNode.insertBefore(s,f)}(window,document,0,0,'kl');
  kl('init','KL-SEU_ID_AQUI');
  kl('track','PageView');
</script>`}
        </div>
      </div>

      <div style={{ background: 'var(--app-bg-card)', border: '1px solid var(--app-border-primary)', borderRadius: 6, padding: 16 }}>
        <div style={{ fontSize: 11, fontFamily: MONO, color: 'var(--app-text-secondary)', letterSpacing: 1, marginBottom: 12 }}>
          {kloelT(`EVENTOS RASTREADOS`)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
          {events.map((e) => (
            <div key={e.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--app-bg-secondary)', borderRadius: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '16%', background: G }} />
                <span style={{ fontSize: 12, fontFamily: MONO, color: 'var(--app-text-primary)' }}>{e.name}</span>
              </div>
              <span style={{ fontSize: 14, fontFamily: MONO, color: EMBER, fontWeight: 600 }}>{Fmt(e.fires)} fires</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: 'var(--app-bg-card)', border: '1px solid var(--app-border-primary)', borderRadius: 6, padding: 16 }}>
        <div style={{ fontSize: 11, fontFamily: MONO, color: 'var(--app-text-secondary)', letterSpacing: 1, marginBottom: 12 }}>
          {kloelT(`POSTBACK INTEGRACOES`)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {integrations.map((ig) => (
            <div key={ig.name} style={{ background: 'var(--app-bg-secondary)', borderRadius: 6, padding: 14, textAlign: 'center' as const, border: `1px solid ${ig.connected ? `${G}33` : colors.border.space}` }}>
              <div style={{ fontSize: 14, fontFamily: SORA, color: ig.connected ? colors.text.silver : colors.text.dim, fontWeight: 600, marginBottom: 6 }}>
                {ig.name}
              </div>
              <div style={{ fontSize: 10, fontFamily: MONO, color: ig.connected ? G : colors.text.dim }}>
                {ig.connected ? 'CONNECTED' : 'DISCONNECTED'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          background: 'var(--app-bg-card)', border: '1px solid var(--app-border-primary)',
          borderRadius: 6, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: colors.canvas.lime }}>{IC.zap(16)}</span>
          <div>
            <div style={{ fontSize: 13, fontFamily: SORA, color: 'var(--app-text-primary)', fontWeight: 600 }}>
              {kloelT(`WhatsApp X1 Tracking`)}
            </div>
            <div style={{ fontSize: 11, fontFamily: MONO, color: 'var(--app-text-secondary)' }}>
              {kloelT(`Atribuicao de vendas via conversa`)}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: '16%', background: colors.text.dim }} />
          <span style={{ fontSize: 11, fontFamily: MONO, color: 'var(--app-text-tertiary)' }}>
            {kloelT(`NAO CONFIGURADO`)}
          </span>
        </div>
      </div>
    </div>
  );
}
