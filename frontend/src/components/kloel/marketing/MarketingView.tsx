'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';

// ════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════

interface MarketingViewProps {
  defaultTab?: string;
}

interface ICEntry {
  label: string;
  value: string;
  delta: string;
  up: boolean;
  render: (s: number) => React.ReactElement;
}

interface CHEntry {
  id: string;
  label: string;
  color: string;
  icon: React.ReactElement;
  route: string;
  status: 'live' | 'setup';
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  converted: number;
  revenue: number;
}

interface ADSEntry {
  id: string;
  label: string;
  color: string;
  icon: React.ReactElement;
  route: string;
  status: 'active' | 'paused' | 'setup';
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  roas: number;
}

interface FeedMessage {
  id: string;
  contactName: string;
  content: string;
  channel: string;
  direction: 'INBOUND' | 'OUTBOUND';
  ts: number;
}

// ════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════

const TABS = [
  { key: 'visao-geral', label: 'Visao Geral', route: '/marketing' },
  { key: 'whatsapp', label: 'WhatsApp', route: '/marketing/whatsapp' },
  { key: 'instagram', label: 'Instagram', route: '/marketing/instagram' },
  { key: 'tiktok', label: 'TikTok', route: '/marketing/tiktok' },
  { key: 'facebook', label: 'Facebook', route: '/marketing/facebook' },
  { key: 'email', label: 'Email', route: '/marketing/email' },
  { key: 'site', label: 'Site Builder', route: '/marketing/site' },
  { key: 'meta-ads', label: 'Meta Ads', route: '/marketing/meta-ads' },
  { key: 'tiktok-ads', label: 'TikTok Ads', route: '/marketing/tiktok-ads' },
  { key: 'google-ads', label: 'Google Ads', route: '/marketing/google-ads' },
];

const CHANNEL_TABS = ['whatsapp', 'instagram', 'tiktok', 'facebook', 'email'];
const ADS_TABS = ['meta-ads', 'tiktok-ads', 'google-ads'];

// ════════════════════════════════════════════
// IC — INTELLIGENCE CARDS (MOCK DATA)
// ════════════════════════════════════════════

function MiniSparkline({ data, color, height = 32 }: { data: number[]; color: string; height?: number }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 80;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={w} height={height} style={{ display: 'block' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const IC_DATA: ICEntry[] = [
  {
    label: 'RECEITA HOJE',
    value: 'R$ 12.847,90',
    delta: '+18.3%',
    up: true,
    render: (s: number) => <MiniSparkline data={[320, 410, 380, 520, 610, 580, 720, 810 + s * 5]} color="#25D366" />,
  },
  {
    label: 'MENSAGENS',
    value: '4.218',
    delta: '+12.1%',
    up: true,
    render: (s: number) => <MiniSparkline data={[120, 180, 210, 250, 230, 310, 340, 380 + s * 2]} color="#0084FF" />,
  },
  {
    label: 'LEADS NOVOS',
    value: '347',
    delta: '+24.6%',
    up: true,
    render: (s: number) => <MiniSparkline data={[15, 22, 28, 35, 31, 42, 48, 52 + s]} color="#E85D30" />,
  },
  {
    label: 'TAXA CONVERSAO',
    value: '8.2%',
    delta: '+1.4pp',
    up: true,
    render: (_s: number) => <MiniSparkline data={[5.1, 5.8, 6.2, 6.9, 7.1, 7.5, 7.8, 8.2]} color="#A855F7" />,
  },
  {
    label: 'GASTO ADS',
    value: 'R$ 2.340,00',
    delta: '-3.2%',
    up: false,
    render: (_s: number) => <MiniSparkline data={[340, 320, 310, 290, 300, 280, 270, 260]} color="#FE2C55" />,
  },
  {
    label: 'ROAS GERAL',
    value: '5.49x',
    delta: '+0.82x',
    up: true,
    render: (_s: number) => <MiniSparkline data={[3.2, 3.8, 4.1, 4.5, 4.7, 5.0, 5.2, 5.49]} color="#FACC15" />,
  },
];

// ════════════════════════════════════════════
// CH — CHANNELS (MOCK DATA)
// ════════════════════════════════════════════

const CH_DATA: CHEntry[] = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    color: '#25D366',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="#25D366" />
        <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.96 7.96 0 01-4.11-1.14l-.29-.174-3.01.79.8-2.93-.19-.3A7.96 7.96 0 014 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z" fill="#25D366" />
      </svg>
    ),
    route: '/marketing/whatsapp',
    status: 'live',
    sent: 2840,
    delivered: 2790,
    opened: 2104,
    clicked: 847,
    converted: 312,
    revenue: 7420.5,
  },
  {
    id: 'instagram',
    label: 'Instagram',
    color: '#E1306C',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="5" stroke="#E1306C" strokeWidth="2" />
        <circle cx="12" cy="12" r="5" stroke="#E1306C" strokeWidth="2" />
        <circle cx="18" cy="6" r="1.5" fill="#E1306C" />
      </svg>
    ),
    route: '/marketing/instagram',
    status: 'live',
    sent: 1560,
    delivered: 1520,
    opened: 980,
    clicked: 412,
    converted: 89,
    revenue: 2310.0,
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    color: '#FE2C55',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M9 12a4 4 0 104 4V4c1 2 3 3 5 3" stroke="#FE2C55" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    route: '/marketing/tiktok',
    status: 'live',
    sent: 920,
    delivered: 900,
    opened: 670,
    clicked: 310,
    converted: 62,
    revenue: 1480.0,
  },
  {
    id: 'facebook',
    label: 'Facebook',
    color: '#1877F2',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3V2z" stroke="#1877F2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    route: '/marketing/facebook',
    status: 'setup',
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    converted: 0,
    revenue: 0,
  },
  {
    id: 'email',
    label: 'Email',
    color: '#6E6E73',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="4" width="20" height="16" rx="3" stroke="#6E6E73" strokeWidth="2" />
        <path d="M2 7l10 7 10-7" stroke="#6E6E73" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    route: '/marketing/email',
    status: 'live',
    sent: 5200,
    delivered: 5080,
    opened: 1842,
    clicked: 623,
    converted: 156,
    revenue: 3890.0,
  },
];

// ════════════════════════════════════════════
// ADS — AD PLATFORMS (MOCK DATA)
// ════════════════════════════════════════════

const ADS_DATA: ADSEntry[] = [
  {
    id: 'meta-ads',
    label: 'Meta Ads',
    color: '#1877F2',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3V2z" stroke="#1877F2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    route: '/marketing/meta-ads',
    status: 'active',
    spend: 1240.0,
    impressions: 84200,
    clicks: 3120,
    ctr: 3.71,
    cpc: 0.4,
    conversions: 187,
    roas: 6.12,
  },
  {
    id: 'tiktok-ads',
    label: 'TikTok Ads',
    color: '#FE2C55',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M9 12a4 4 0 104 4V4c1 2 3 3 5 3" stroke="#FE2C55" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    route: '/marketing/tiktok-ads',
    status: 'active',
    spend: 680.0,
    impressions: 52100,
    clicks: 2410,
    ctr: 4.63,
    cpc: 0.28,
    conversions: 94,
    roas: 4.81,
  },
  {
    id: 'google-ads',
    label: 'Google Ads',
    color: '#FACC15',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#FACC15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    route: '/marketing/google-ads',
    status: 'paused',
    spend: 420.0,
    impressions: 31200,
    clicks: 1640,
    ctr: 5.26,
    cpc: 0.26,
    conversions: 73,
    roas: 5.12,
  },
];

// ════════════════════════════════════════════
// LIVE FEED MOCK DATA
// ════════════════════════════════════════════

const FEED_TEMPLATES: FeedMessage[] = [
  { id: '1', contactName: 'Maria Silva', content: 'Oi, quero saber mais sobre o produto', channel: 'whatsapp', direction: 'INBOUND', ts: Date.now() - 120000 },
  { id: '2', contactName: 'Kloel AI', content: 'Claro! Temos opcoes incriveis pra voce.', channel: 'whatsapp', direction: 'OUTBOUND', ts: Date.now() - 90000 },
  { id: '3', contactName: 'Pedro Santos', content: 'Qual o preco?', channel: 'instagram', direction: 'INBOUND', ts: Date.now() - 60000 },
  { id: '4', contactName: 'Kloel AI', content: 'O valor e R$197 com desconto especial hoje!', channel: 'instagram', direction: 'OUTBOUND', ts: Date.now() - 45000 },
  { id: '5', contactName: 'Ana Costa', content: 'Fechado! Como faco pra pagar?', channel: 'whatsapp', direction: 'INBOUND', ts: Date.now() - 30000 },
  { id: '6', contactName: 'Kloel AI', content: 'Perfeito! Segue o link de pagamento...', channel: 'whatsapp', direction: 'OUTBOUND', ts: Date.now() - 15000 },
  { id: '7', contactName: 'Lucas Mendes', content: 'Vi o anuncio no TikTok, quero!', channel: 'tiktok', direction: 'INBOUND', ts: Date.now() - 10000 },
  { id: '8', contactName: 'Kloel AI', content: 'Que bom! Vou te enviar os detalhes agora mesmo.', channel: 'tiktok', direction: 'OUTBOUND', ts: Date.now() - 5000 },
];

// ════════════════════════════════════════════
// NeuralPulse — ANIMATED CANVAS
// ════════════════════════════════════════════

function NeuralPulse({ width, height }: { width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    const nodes: { x: number; y: number; vx: number; vy: number; r: number; color: string }[] = [];
    const colors = ['#E85D30', '#25D366', '#1877F2', '#FE2C55', '#A855F7', '#FACC15'];

    for (let i = 0; i < 30; i++) {
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        r: Math.random() * 2 + 1,
        color: colors[i % colors.length],
      });
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      // Draw connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(232, 93, 48, ${0.12 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      // Draw & move nodes
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;

        if (node.x < 0 || node.x > width) node.vx *= -1;
        if (node.y < 0 || node.y > height) node.vy *= -1;

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.globalAlpha = 0.6;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      animRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width,
        height,
        pointerEvents: 'none',
        opacity: 0.4,
      }}
    />
  );
}

// ════════════════════════════════════════════
// Ticker — REVENUE COUNTER
// ════════════════════════════════════════════

function Ticker({ baseValue }: { baseValue: number }) {
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
          transition: 'all 0.3s ease',
        }}
        key={Math.floor(display)}
      >
        {display.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  );
}

// ════════════════════════════════════════════
// LiveStream — FEED COMPONENT
// ════════════════════════════════════════════

function LiveStream({ messages }: { messages: FeedMessage[] }) {
  const channelColors: Record<string, string> = {
    whatsapp: '#25D366',
    instagram: '#E1306C',
    tiktok: '#FE2C55',
    facebook: '#1877F2',
    email: '#6E6E73',
  };

  return (
    <div
      style={{
        height: 340,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {messages.length === 0 && (
        <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: '40px 20px', textAlign: 'center' }}>
          <span style={{ fontSize: 13, color: '#3A3A3F' }}>Nenhuma atividade recente</span>
        </div>
      )}
      {messages.map((msg, i) => {
        const chColor = channelColors[msg.channel] || '#6E6E73';
        const isOut = msg.direction === 'OUTBOUND';
        return (
          <div
            key={msg.id}
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
                background: chColor,
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
                  {msg.contactName}
                </span>
                <span style={{ fontSize: 10, color: '#3A3A3F', fontFamily: 'var(--font-mono)' }}>
                  {new Date(msg.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    color: chColor,
                    fontFamily: 'var(--font-mono)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {msg.channel}
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

// ════════════════════════════════════════════
// SiteBuilder — PLACEHOLDER
// ════════════════════════════════════════════

function SiteBuilder() {
  return (
    <div style={{ padding: 32 }}>
      <div style={{ maxWidth: 960 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              background: 'rgba(232,93,48,0.08)',
              border: '1px solid rgba(232,93,48,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="2" stroke="#E85D30" strokeWidth="2" />
              <path d="M3 9h18M9 21V9" stroke="#E85D30" strokeWidth="2" />
            </svg>
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: '#E0DDD8', fontFamily: 'var(--font-display)', margin: 0 }}>
              Criacao de Site
            </h2>
            <span style={{ fontSize: 12, color: '#6E6E73', fontFamily: 'var(--font-body)' }}>
              Construa paginas de vendas com IA
            </span>
          </div>
        </div>

        {/* Template Grid */}
        <div style={{ fontSize: 11, color: '#3A3A3F', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
          TEMPLATES
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
          {[
            { name: 'Landing Page', desc: 'Pagina de captura otimizada', color: '#E85D30' },
            { name: 'Pagina de Vendas', desc: 'Conversao maxima com copy IA', color: '#25D366' },
            { name: 'Obrigado', desc: 'Pagina pos-compra com upsell', color: '#A855F7' },
          ].map((tpl) => (
            <div
              key={tpl.name}
              style={{
                background: '#111113',
                border: '1px solid #222226',
                borderRadius: 8,
                padding: 20,
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = tpl.color;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = '#222226';
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: 120,
                  borderRadius: 6,
                  background: `linear-gradient(135deg, ${tpl.color}11, ${tpl.color}05)`,
                  border: `1px solid ${tpl.color}22`,
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="18" height="18" rx="2" stroke={tpl.color} strokeWidth="1.5" opacity="0.5" />
                  <path d="M3 9h18" stroke={tpl.color} strokeWidth="1.5" opacity="0.5" />
                </svg>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#E0DDD8', fontFamily: 'var(--font-display)', marginBottom: 4 }}>
                {tpl.name}
              </div>
              <div style={{ fontSize: 12, color: '#6E6E73', fontFamily: 'var(--font-body)' }}>
                {tpl.desc}
              </div>
            </div>
          ))}
        </div>

        {/* Active Sites */}
        <div style={{ fontSize: 11, color: '#3A3A3F', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
          SITES ATIVOS
        </div>
        <div
          style={{
            background: '#111113',
            border: '1px solid #222226',
            borderRadius: 8,
            padding: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120, color: '#3A3A3F', fontSize: 13, fontFamily: 'var(--font-body)' }}>
            Nenhum site publicado ainda. Escolha um template acima para comecar.
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// CHANNEL DETAIL VIEW
// ════════════════════════════════════════════

function ChannelDetailView({ channel }: { channel: CHEntry }) {
  const isLive = channel.status === 'live';

  return (
    <div style={{ padding: 32 }}>
      <div style={{ maxWidth: 960 }}>
        {/* Channel Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              background: '#111113',
              border: '1px solid #222226',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {channel.icon}
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: '#E0DDD8', fontFamily: 'var(--font-display)', margin: 0 }}>
              {channel.label}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 6,
                  background: isLive ? channel.color : '#3A3A3F',
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  color: isLive ? channel.color : '#3A3A3F',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                {isLive ? 'LIVE' : 'SETUP'}
              </span>
            </div>
          </div>
        </div>

        {isLive ? (
          <>
            {/* Funnel Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 32 }}>
              {[
                { label: 'ENVIADOS', value: channel.sent.toLocaleString('pt-BR') },
                { label: 'ENTREGUES', value: channel.delivered.toLocaleString('pt-BR') },
                { label: 'ABERTOS', value: channel.opened.toLocaleString('pt-BR') },
                { label: 'CLICADOS', value: channel.clicked.toLocaleString('pt-BR') },
                { label: 'CONVERTIDOS', value: channel.converted.toLocaleString('pt-BR') },
                { label: 'RECEITA', value: `R$ ${channel.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
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
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#E0DDD8', fontFamily: 'var(--font-mono)' }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Funnel Visualization */}
            <div
              style={{
                background: '#111113',
                border: '1px solid #222226',
                borderRadius: 8,
                padding: 24,
                marginBottom: 24,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', fontFamily: 'var(--font-display)', marginBottom: 16 }}>
                Funil de Conversao
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
                {[
                  { label: 'Enviados', value: channel.sent, max: channel.sent },
                  { label: 'Entregues', value: channel.delivered, max: channel.sent },
                  { label: 'Abertos', value: channel.opened, max: channel.sent },
                  { label: 'Clicados', value: channel.clicked, max: channel.sent },
                  { label: 'Convertidos', value: channel.converted, max: channel.sent },
                ].map((bar) => (
                  <div key={bar.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div
                      style={{
                        width: '80%',
                        height: `${Math.max((bar.value / (bar.max || 1)) * 100, 4)}%`,
                        background: channel.color,
                        borderRadius: '4px 4px 0 0',
                        opacity: 0.7 + (bar.value / (bar.max || 1)) * 0.3,
                        minHeight: 4,
                        transition: 'height 0.5s ease',
                      }}
                    />
                    <span style={{ fontSize: 9, color: '#3A3A3F', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                      {bar.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Config Panel */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 8, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', fontFamily: 'var(--font-display)', marginBottom: 16 }}>
                  Conversas Recentes
                </div>
                <div style={{ color: '#6E6E73', fontSize: 13, fontFamily: 'var(--font-body)' }}>
                  {channel.converted} conversas convertidas neste canal
                </div>
              </div>
              <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 8, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', fontFamily: 'var(--font-display)', marginBottom: 16 }}>
                  Configuracao IA
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
                { step: 1, label: 'Conectar Conta', desc: `Vincule sua conta do ${channel.label}` },
                { step: 2, label: 'Configurar IA', desc: 'Defina tom de voz e respostas' },
                { step: 3, label: 'Ativar Canal', desc: 'Comece a receber e responder' },
              ].map((s) => (
                <div
                  key={s.step}
                  style={{
                    width: 200,
                    background: '#111113',
                    border: '1px solid #222226',
                    borderRadius: 8,
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
              Conectar {channel.label}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// ADS DETAIL VIEW
// ════════════════════════════════════════════

function AdsDetailView({ ad }: { ad: ADSEntry }) {
  const statusColors: Record<string, { bg: string; text: string; label: string }> = {
    active: { bg: 'rgba(37,211,102,0.08)', text: '#25D366', label: 'ATIVO' },
    paused: { bg: 'rgba(250,204,21,0.08)', text: '#FACC15', label: 'PAUSADO' },
    setup: { bg: 'rgba(58,58,63,0.1)', text: '#3A3A3F', label: 'SETUP' },
  };
  const st = statusColors[ad.status] || statusColors.setup;

  return (
    <div style={{ padding: 32 }}>
      <div style={{ maxWidth: 960 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              background: '#111113',
              border: '1px solid #222226',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {ad.icon}
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: '#E0DDD8', fontFamily: 'var(--font-display)', margin: 0 }}>
              {ad.label}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: st.text,
                  background: st.bg,
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.08em',
                }}
              >
                {st.label}
              </span>
            </div>
          </div>
        </div>

        {/* KPI Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
          {[
            { label: 'GASTO', value: `R$ ${ad.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
            { label: 'IMPRESSOES', value: ad.impressions.toLocaleString('pt-BR') },
            { label: 'CLIQUES', value: ad.clicks.toLocaleString('pt-BR') },
            { label: 'CTR', value: `${ad.ctr.toFixed(2)}%` },
          ].map((kpi) => (
            <div
              key={kpi.label}
              style={{
                background: '#111113',
                border: '1px solid #222226',
                borderRadius: 6,
                padding: '16px 14px',
              }}
            >
              <div style={{ fontSize: 10, color: '#3A3A3F', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', marginBottom: 8, textTransform: 'uppercase' }}>
                {kpi.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#E0DDD8', fontFamily: 'var(--font-mono)' }}>
                {kpi.value}
              </div>
            </div>
          ))}
        </div>

        {/* Second KPI Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 32 }}>
          {[
            { label: 'CPC MEDIO', value: `R$ ${ad.cpc.toFixed(2)}` },
            { label: 'CONVERSOES', value: ad.conversions.toLocaleString('pt-BR') },
            { label: 'ROAS', value: `${ad.roas.toFixed(2)}x` },
          ].map((kpi) => (
            <div
              key={kpi.label}
              style={{
                background: '#111113',
                border: '1px solid #222226',
                borderRadius: 6,
                padding: '16px 14px',
              }}
            >
              <div style={{ fontSize: 10, color: '#3A3A3F', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', marginBottom: 8, textTransform: 'uppercase' }}>
                {kpi.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#E0DDD8', fontFamily: 'var(--font-mono)' }}>
                {kpi.value}
              </div>
            </div>
          ))}
        </div>

        {/* Campaigns Table */}
        <div
          style={{
            background: '#111113',
            border: '1px solid #222226',
            borderRadius: 8,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', fontFamily: 'var(--font-display)', marginBottom: 16 }}>
            Campanhas Ativas
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 8, padding: '8px 0', borderBottom: '1px solid #222226' }}>
            {['CAMPANHA', 'GASTO', 'CLIQUES', 'CONV.', 'ROAS'].map((h) => (
              <span key={h} style={{ fontSize: 10, color: '#3A3A3F', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>{h}</span>
            ))}
          </div>
          {[
            { name: 'Remarketing - Carrinho', spend: 'R$ 340', clicks: '820', conv: '42', roas: '7.2x' },
            { name: 'Prospeccao - Lookalike', spend: 'R$ 520', clicks: '1.240', conv: '68', roas: '5.8x' },
            { name: 'Retargeting - Viewers', spend: 'R$ 380', clicks: '1.060', conv: '77', roas: '6.4x' },
          ].map((row) => (
            <div
              key={row.name}
              style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 8, padding: '12px 0', borderBottom: '1px solid #19191C' }}
            >
              <span style={{ fontSize: 13, color: '#E0DDD8', fontFamily: 'var(--font-display)' }}>{row.name}</span>
              <span style={{ fontSize: 13, color: '#6E6E73', fontFamily: 'var(--font-mono)' }}>{row.spend}</span>
              <span style={{ fontSize: 13, color: '#6E6E73', fontFamily: 'var(--font-mono)' }}>{row.clicks}</span>
              <span style={{ fontSize: 13, color: '#25D366', fontFamily: 'var(--font-mono)' }}>{row.conv}</span>
              <span style={{ fontSize: 13, color: '#E85D30', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{row.roas}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// OVERVIEW — WAR ROOM MAIN VIEW
// ════════════════════════════════════════════

function OverviewView() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: 32 }}>
      <div style={{ maxWidth: 1120 }}>

        {/* ── Header with Neural Pulse ── */}
        <div style={{ position: 'relative', marginBottom: 32, overflow: 'hidden', borderRadius: 8 }}>
          <NeuralPulse width={1120} height={140} />
          <div style={{ position: 'relative', zIndex: 1, padding: '24px 0' }}>
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
                War Room
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
                  LIVE
                </span>
              </div>
            </div>

            {/* Revenue Ticker */}
            <Ticker baseValue={12847.9} />
            <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
              {[
                { label: 'Mensagens', value: '4.218' },
                { label: 'Leads', value: '347' },
                { label: 'Vendas', value: '89' },
              ].map((m) => (
                <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 18, fontWeight: 600, color: '#E0DDD8', fontFamily: 'var(--font-mono)' }}>
                    {m.value}
                  </span>
                  <span style={{ fontSize: 11, color: '#3A3A3F', fontFamily: 'var(--font-body)' }}>
                    {m.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── IC — Intelligence Cards ── */}
        <div style={{ fontSize: 11, color: '#3A3A3F', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
          INTELIGENCIA
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 32 }}>
          {IC_DATA.map((ic, i) => (
            <div
              key={ic.label}
              style={{
                background: '#111113',
                border: '1px solid #222226',
                borderRadius: 8,
                padding: '14px 12px',
                animation: `slideIn 0.3s ease ${i * 0.05}s both`,
              }}
            >
              <div style={{ fontSize: 10, color: '#3A3A3F', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', marginBottom: 6, textTransform: 'uppercase' }}>
                {ic.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#E0DDD8', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                {ic.value}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: ic.up ? '#25D366' : '#FE2C55',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {ic.up ? '\u2191' : '\u2193'} {ic.delta}
                </span>
                {ic.render(tick)}
              </div>
            </div>
          ))}
        </div>

        {/* ── Channel Cards ── */}
        <div style={{ fontSize: 11, color: '#3A3A3F', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
          CANAIS
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 32 }}>
          {CH_DATA.map((ch, i) => {
            const isLive = ch.status === 'live';
            return (
              <div
                key={ch.id}
                style={{
                  background: '#111113',
                  border: `1px solid ${isLive ? 'rgba(232,93,48,0.15)' : '#222226'}`,
                  borderRadius: 8,
                  padding: '16px 14px',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                  animation: `slideIn 0.3s ease ${i * 0.06}s both`,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = ch.color;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = isLive ? 'rgba(232,93,48,0.15)' : '#222226';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  {ch.icon}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 5,
                        background: isLive ? ch.color : '#3A3A3F',
                      }}
                    />
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        color: isLive ? ch.color : '#3A3A3F',
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
                  {ch.label}
                </div>
                {isLive ? (
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#E0DDD8', fontFamily: 'var(--font-mono)' }}>
                        {ch.converted}
                      </span>
                      <span style={{ fontSize: 10, color: '#3A3A3F', fontFamily: 'var(--font-body)', marginLeft: 3 }}>vendas</span>
                    </div>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#E0DDD8', fontFamily: 'var(--font-mono)' }}>
                        R$ {(ch.revenue / 1000).toFixed(1)}k
                      </span>
                      <span style={{ fontSize: 10, color: '#3A3A3F', fontFamily: 'var(--font-body)', marginLeft: 3 }}>receita</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: '#3A3A3F', fontFamily: 'var(--font-body)' }}>
                    Clique para configurar
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Ads Cards ── */}
        <div style={{ fontSize: 11, color: '#3A3A3F', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
          ANUNCIOS
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 32 }}>
          {ADS_DATA.map((ad, i) => {
            const isActive = ad.status === 'active';
            return (
              <div
                key={ad.id}
                style={{
                  background: '#111113',
                  border: `1px solid ${isActive ? 'rgba(232,93,48,0.15)' : '#222226'}`,
                  borderRadius: 8,
                  padding: '16px 14px',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                  animation: `slideIn 0.3s ease ${i * 0.06}s both`,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = ad.color;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = isActive ? 'rgba(232,93,48,0.15)' : '#222226';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  {ad.icon}
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: isActive ? '#25D366' : ad.status === 'paused' ? '#FACC15' : '#3A3A3F',
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      background: isActive ? 'rgba(37,211,102,0.08)' : ad.status === 'paused' ? 'rgba(250,204,21,0.08)' : 'transparent',
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}
                  >
                    {isActive ? 'ATIVO' : ad.status === 'paused' ? 'PAUSADO' : 'SETUP'}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', fontFamily: 'var(--font-display)', marginBottom: 8 }}>
                  {ad.label}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#3A3A3F', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>GASTO</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#E0DDD8', fontFamily: 'var(--font-mono)' }}>
                      R$ {ad.spend.toLocaleString('pt-BR')}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#3A3A3F', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>ROAS</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#E85D30', fontFamily: 'var(--font-mono)' }}>
                      {ad.roas.toFixed(2)}x
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Bottom Grid: Live Feed + AI Brain ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>

          {/* Live Feed */}
          <div
            style={{
              background: '#111113',
              border: '1px solid #222226',
              borderRadius: 8,
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
                {FEED_TEMPLATES.length} msgs
              </span>
            </div>
            <LiveStream messages={FEED_TEMPLATES} />
          </div>

          {/* Right Column: AI Brain + Quick Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* AI Brain Panel */}
            <div
              style={{
                background: '#111113',
                border: '1px solid #222226',
                borderRadius: 8,
                padding: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2a4 4 0 014 4v1h1a3 3 0 013 3v4a3 3 0 01-3 3h-1v1a4 4 0 01-8 0v-1H7a3 3 0 01-3-3v-4a3 3 0 013-3h1V6a4 4 0 014-4z" stroke="#E85D30" strokeWidth="1.5" />
                  <circle cx="9" cy="12" r="1" fill="#E85D30" />
                  <circle cx="15" cy="12" r="1" fill="#E85D30" />
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
                    color: '#25D366',
                    background: 'rgba(37,211,102,0.08)',
                  }}
                >
                  ATIVO
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'Produtos carregados', value: '12' },
                  { label: 'Objecoes mapeadas', value: '47' },
                  { label: 'Conversas ativas', value: '23' },
                  { label: 'Tempo de resposta', value: '1.2s' },
                ].map((item) => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#6E6E73', fontFamily: 'var(--font-body)' }}>
                      {item.label}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', fontFamily: 'var(--font-mono)' }}>
                      {item.value}
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
                borderRadius: 8,
                padding: 16,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
                Acoes Rapidas
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { label: 'Nova Campanha', icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#E85D30" strokeWidth="2" strokeLinecap="round" /></svg>
                  )},
                  { label: 'Envio em Massa', icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="#E85D30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  )},
                  { label: 'Criar Anuncio', icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#E85D30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  )},
                  { label: 'Configurar Fluxo', icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2 2-2 2M18 13l2 2-2 2M21 3l-8.5 8.5M14 14l7 7" stroke="#E85D30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  )},
                ].map((action) => (
                  <button
                    key={action.label}
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

// ════════════════════════════════════════════
// CSS KEYFRAMES INJECTION
// ════════════════════════════════════════════

function StyleInjector() {
  return (
    <style>{`
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
      @keyframes slideIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      @keyframes glow {
        0%, 100% { filter: brightness(1); }
        50% { filter: brightness(1.05); }
      }
    `}</style>
  );
}

// ════════════════════════════════════════════
// MAIN COMPONENT — MarketingView
// ════════════════════════════════════════════

export default function MarketingView({ defaultTab = 'visao-geral' }: MarketingViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Sync tab from prop (URL-driven)
  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  const handleTabChange = useCallback(
    (tabKey: string) => {
      setActiveTab(tabKey);
      const tab = TABS.find((t) => t.key === tabKey);
      if (tab) {
        router.push(tab.route);
      }
    },
    [router],
  );

  // Find active channel / ad data
  const activeChannel = useMemo(() => CH_DATA.find((c) => c.id === activeTab), [activeTab]);
  const activeAd = useMemo(() => ADS_DATA.find((a) => a.id === activeTab), [activeTab]);

  // Determine which content to render
  const renderContent = useCallback(() => {
    if (activeTab === 'visao-geral') return <OverviewView />;
    if (activeTab === 'site') return <SiteBuilder />;
    if (activeChannel) return <ChannelDetailView channel={activeChannel} />;
    if (activeAd) return <AdsDetailView ad={activeAd} />;
    return <OverviewView />;
  }, [activeTab, activeChannel, activeAd]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0A0A0C',
        fontFamily: "'Sora', sans-serif",
        color: '#E0DDD8',
        overflowY: 'auto',
      }}
    >
      <StyleInjector />

      {/* ── Tab Bar ── */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: '#0A0A0C',
          borderBottom: '1px solid #19191C',
          padding: '0 32px',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 0,
            overflowX: 'auto',
            maxWidth: 1120,
          }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const isChannel = CHANNEL_TABS.includes(tab.key);
            const isAds = ADS_TABS.includes(tab.key);

            // Separator dots between sections
            const showSep =
              (tab.key === 'whatsapp') ||
              (tab.key === 'meta-ads');

            return (
              <React.Fragment key={tab.key}>
                {showSep && (
                  <div
                    style={{
                      width: 1,
                      height: 20,
                      background: '#222226',
                      alignSelf: 'center',
                      margin: '0 4px',
                      flexShrink: 0,
                    }}
                  />
                )}
                <button
                  onClick={() => handleTabChange(tab.key)}
                  style={{
                    padding: '12px 16px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: isActive ? '2px solid #E85D30' : '2px solid transparent',
                    color: isActive ? '#E0DDD8' : '#6E6E73',
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 500,
                    fontFamily: 'var(--font-display)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 150ms ease',
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.color = '#E0DDD8';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.color = '#6E6E73';
                  }}
                >
                  {tab.label}
                  {isChannel && (
                    <span
                      style={{
                        marginLeft: 6,
                        width: 5,
                        height: 5,
                        borderRadius: 5,
                        display: 'inline-block',
                        background: CH_DATA.find((c) => c.id === tab.key)?.status === 'live'
                          ? CH_DATA.find((c) => c.id === tab.key)?.color || '#3A3A3F'
                          : '#3A3A3F',
                      }}
                    />
                  )}
                  {isAds && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 9,
                        fontFamily: 'var(--font-mono)',
                        color: ADS_DATA.find((a) => a.id === tab.key)?.status === 'active' ? '#25D366' : '#3A3A3F',
                      }}
                    >
                      {ADS_DATA.find((a) => a.id === tab.key)?.status === 'active' ? 'ON' : 'OFF'}
                    </span>
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* ── Content ── */}
      {renderContent()}
    </div>
  );
}
