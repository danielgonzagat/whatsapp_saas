'use client';

import { kloelT, kloelError } from '@/lib/i18n/t';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import InboxWorkspace from '@/components/kloel/inbox/InboxWorkspace';
import {
  useAIBrain,
  useMarketingChannels,
  useMarketingLiveFeed,
  useMarketingStats,
} from '@/hooks/useMarketing';
import { useProducts } from '@/hooks/useProducts';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { apiFetch } from '@/lib/api';
import { swrFetcher } from '@/lib/fetcher';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type React from 'react';
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR, { mutate } from 'swr';
import WhatsAppExperience from './WhatsAppExperience';

// ── Fonts ──
const SORA = "'Sora',sans-serif";
const MONO = "'JetBrains Mono',monospace";

// ── DNA Colors ──
const BG_CARD = KLOEL_THEME.bgCard;
const BG_ELEVATED = KLOEL_THEME.bgSecondary;
const BORDER = KLOEL_THEME.borderPrimary;
const EMBER = KLOEL_THEME.accent;
const META_OAUTH_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'business.facebook.com',
  'instagram.com',
  'www.instagram.com',
  'api.instagram.com',
]);

function navigateCurrentWindow(url: string) {
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function isTrustedMetaOauthUrl(value: string): boolean {
  try {
    const target = new URL(value);
    return target.protocol === 'https:' && META_OAUTH_HOSTS.has(target.hostname);
  } catch {
    return false;
  }
}

// ── Icons (SVG arrow functions) ──
const IC: Record<string, (s: number) => React.ReactElement> = {
  wa: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d={kloelT(
          `M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.05 21.785h-.01a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.981.998-3.648-.235-.374A9.86 9.86 0 012.16 12.01C2.16 6.579 6.58 2.16 12.06 2.16a9.84 9.84 0 016.982 2.892 9.84 9.84 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884zM20.52 3.449A11.8 11.8 0 0012.05.002C5.463.002.104 5.36.1 11.95a11.82 11.82 0 001.588 5.945L0 24l6.304-1.654a11.88 11.88 0 005.683 1.448h.005c6.585 0 11.946-5.36 11.95-11.95a11.84 11.84 0 00-3.498-8.395z`,
        )}
      />
    </svg>
  ),
  ig: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d={kloelT(
          `M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z`,
        )}
      />
    </svg>
  ),
  tt: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d={kloelT(
          `M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.48V13a8.28 8.28 0 005.58 2.15V11.7a4.83 4.83 0 01-3.58-1.43V6.69h3.58z`,
        )}
      />
    </svg>
  ),
  fb: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d={kloelT(
          `M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z`,
        )}
      />
    </svg>
  ),
  em: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d={kloelT(`M22 7l-10 6L2 7`)} />
    </svg>
  ),
  zap: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={kloelT(`M13 2L3 14h9l-1 8 10-12h-9l1-8z`)} />
    </svg>
  ),
  globe: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path
        d={kloelT(
          `M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z`,
        )}
      />
    </svg>
  ),
  site: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="18" rx="2" />
      <line x1="2" y1="9" x2="22" y2="9" />
      <circle cx="6" cy="6" r="1" fill="currentColor" />
      <circle cx="10" cy="6" r="1" fill="currentColor" />
    </svg>
  ),
  send: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={kloelT(`M2.01 21L23 12 2.01 3 2 10l15 2-15 2z`)} />
    </svg>
  ),
  key: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        d={kloelT(
          `M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4`,
        )}
      />
    </svg>
  ),
  check: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  pause: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  ),
  play: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={kloelT(`M8 5v14l11-7z`)} />
    </svg>
  ),
  box: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        d={kloelT(
          `M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z`,
        )}
      />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  ad: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d={kloelT(`M8 21h8M12 17v4`)} />
    </svg>
  ),
};

// ── Channels config ──
const CH_CONFIG: Record<
  string,
  {
    icon: (s: number) => React.ReactElement;
    label: string;
    color: string;
    backendKey: string;
    hasIntegration: boolean;
  }
> = {
  whatsapp: {
    icon: IC.wa,
    label: 'WhatsApp',
    color: '#25D366',
    backendKey: 'WHATSAPP',
    hasIntegration: true,
  },
  instagram: {
    icon: IC.ig,
    label: 'Instagram',
    color: '#E1306C',
    backendKey: 'INSTAGRAM',
    hasIntegration: false,
  },
  tiktok: {
    icon: IC.tt,
    label: 'TikTok',
    color: '#ff0050',
    backendKey: 'TIKTOK',
    hasIntegration: false,
  },
  facebook: {
    icon: IC.fb,
    label: 'Facebook',
    color: '#1877F2',
    backendKey: 'MESSENGER',
    hasIntegration: false,
  },
  email: {
    icon: IC.em,
    label: 'Email',
    color: '#F59E0B',
    backendKey: 'EMAIL',
    hasIntegration: true,
  },
};

interface ChannelRealData {
  messages: number;
  leads: number;
  sales: number;
  status: string;
}

interface AIBrainInfo {
  productsLoaded: number;
  activeConversations: number;
  objectionsMapped: number;
  avgResponseTime: string;
  status: string;
  [key: string]: unknown;
}

interface MarketingConnectStatus {
  meta?: {
    connected?: boolean;
    tokenExpired?: boolean;
    pageName?: string | null;
    pageId?: string | null;
    instagramUsername?: string | null;
    updatedAt?: string | null;
  };
  channels?: {
    whatsapp?: {
      provider?: string;
      connected?: boolean;
      status?: string;
      authUrl?: string;
      phoneNumberId?: string | null;
      whatsappBusinessId?: string | null;
      phoneNumber?: string | null;
      pushName?: string | null;
      degradedReason?: string | null;
    };
    instagram?: {
      connected?: boolean;
      status?: string;
      authUrl?: string;
      instagramAccountId?: string | null;
      username?: string | null;
      pageName?: string | null;
    };
    facebook?: {
      connected?: boolean;
      status?: string;
      authUrl?: string;
      pageId?: string | null;
      pageName?: string | null;
    };
    email?: {
      connected?: boolean;
      status?: string;
      enabled?: boolean;
      provider?: string;
      providerAvailable?: boolean;
      fromEmail?: string;
      fromName?: string;
      workspaceName?: string | null;
    };
  };
}

const EMAIL_TEMPLATE_PRESETS = [
  {
    id: 'boas-vindas',
    label: 'Boas-vindas',
    subject: 'Bem-vindo ao Kloel',
    html: '<h1>Bem-vindo</h1><p>Seu acesso foi liberado e sua jornada começa agora.</p>',
  },
  {
    id: 'recuperacao',
    label: 'Recuperação',
    subject: 'Seu checkout ainda está te esperando',
    html: '<h1>Seu pedido ficou salvo</h1><p>Retome a compra com um clique e finalize em poucos segundos.</p>',
  },
  {
    id: 'oferta',
    label: 'Oferta relâmpago',
    subject: 'Oferta por tempo limitado',
    html: '<h1>Oferta ativa</h1><p>Condição especial liberada hoje para a sua base.</p>',
  },
];

// ── Helpers ──
const Fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toString());
const FmtMoney = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

interface FeedMessageLike {
  text?: string;
  content?: string;
  from?: string;
  contactName?: string;
  channel?: string;
  isAI?: boolean;
  direction?: string;
  time?: string;
  createdAt?: string;
}

function formatFeedTime(value: FeedMessageLike): string {
  if (value.time) {
    return value.time;
  }
  if (!value.createdAt) {
    return '';
  }
  return new Date(value.createdAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatFeedMessage(message: FeedMessageLike): string {
  const text = message.text || message.content || '';
  const from = message.from || message.contactName || 'Lead';
  const channelLabel = (message.channel || 'WHATSAPP').toLowerCase();
  const isAI = message.isAI || message.direction === 'OUTBOUND';
  const time = formatFeedTime(message);
  return `${isAI ? '\uD83E\uDD16' : '\uD83D\uDCF1'} [${channelLabel}] ${from}: ${text} (${time})`;
}

function drawNeuralFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  color: string,
  frame: number,
): void {
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.15 + Math.sin(frame * 0.02 + i) * 0.1;
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 2) {
      const spike = Math.random() > 0.97 ? (Math.random() - 0.5) * h * 0.6 : 0;
      const y = h / 2 + Math.sin(x * 0.04 + frame * 0.03 + i * 1.5) * (h * 0.25 + i * 2) + spike;
      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

const ComingSoonOverlay = ({ title, description }: { title: string; description: string }) => (
  <div
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: KLOEL_THEME.bgOverlay,
      backdropFilter: 'blur(2px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 6,
      zIndex: 10,
    }}
  >
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          fontFamily: SORA,
          fontSize: 18,
          fontWeight: 700,
          color: 'var(--app-text-primary)',
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-secondary)' }}>
        {description}
      </div>
    </div>
  </div>
);

interface ChannelStatRow {
  label: string;
  value: string;
}

function ChannelStatsList({ stats, color }: { stats: ChannelStatRow[]; color: string }) {
  return (
    <>
      {stats.map((s) => (
        <div
          key={s.label}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '12px 16px 12px 20px',
            background: BG_CARD,
            borderRadius: 6,
            border: `1px solid ${BORDER}`,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 3,
              background: color,
            }}
          />
          <span
            style={{
              fontFamily: SORA,
              fontSize: 11,
              color: 'var(--app-text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.25em',
              minWidth: 120,
            }}
          >
            {s.label}
          </span>
          <span
            style={{ fontFamily: MONO, fontSize: 16, color: 'var(--app-text-primary)', flex: 1 }}
          >
            {s.value}
          </span>
          <NP w={160} h={28} color={color} />
        </div>
      ))}
    </>
  );
}

function channelDataStats(channelData: ChannelRealData | null): ChannelStatRow[] {
  return [
    { label: 'Mensagens', value: Fmt(channelData?.messages ?? 0) },
    { label: 'Leads', value: Fmt(channelData?.leads ?? 0) },
    { label: 'Vendas', value: (channelData?.sales ?? 0).toString() },
  ];
}

function ChannelInfoGridCard({ label, value }: ChannelStatRow) {
  return (
    <div
      style={{
        background: BG_CARD,
        borderRadius: 6,
        padding: '12px 14px',
        border: `1px solid ${BORDER}`,
      }}
    >
      <div
        style={{
          fontFamily: SORA,
          fontSize: 10,
          color: 'var(--app-text-tertiary)',
          marginBottom: 6,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 12,
          color: 'var(--app-text-primary)',
          wordBreak: 'break-word',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function RegisteredDataList({
  channelData,
  color,
}: {
  channelData: ChannelRealData;
  color: string;
}) {
  const rows: ChannelStatRow[] = [
    { label: 'Mensagens', value: Fmt(channelData.messages) },
    { label: 'Leads', value: Fmt(channelData.leads) },
    { label: 'Vendas', value: channelData.sales.toString() },
  ];

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 400,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        marginTop: 8,
      }}
    >
      <div
        style={{
          fontFamily: SORA,
          fontSize: 10,
          color: 'var(--app-text-tertiary)',
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
          textAlign: 'center',
        }}
      >
        {kloelT(`Dados registrados`)}
      </div>
      {rows.map((s) => (
        <div
          key={s.label}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '10px 16px 10px 20px',
            background: BG_CARD,
            borderRadius: 6,
            border: `1px solid ${BORDER}`,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 3,
              background: color,
              opacity: 0.4,
            }}
          />
          <span
            style={{
              fontFamily: SORA,
              fontSize: 11,
              color: 'var(--app-text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.25em',
              minWidth: 80,
            }}
          >
            {s.label}
          </span>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 14,
              color: 'var(--app-text-primary)',
              flex: 1,
            }}
          >
            {s.value}
          </span>
        </div>
      ))}
    </div>
  );
}

interface RawProductLike {
  name?: string;
  title?: string;
  price?: number;
  amount?: number;
  sold?: number;
  quantitySold?: number;
  sales?: number;
  img?: string;
  emoji?: string;
  image?: string;
}

interface MappedProduct {
  name: string;
  price: number;
  sold: number;
  img: string;
}

function mapTopProducts(rawProducts: unknown): MappedProduct[] {
  if (!rawProducts || !Array.isArray(rawProducts) || rawProducts.length === 0) {
    return [];
  }
  return (rawProducts as RawProductLike[]).slice(0, 3).map((p) => ({
    name: p.name || p.title || 'Produto',
    price: p.price ?? p.amount ?? 0,
    sold: p.sold ?? p.quantitySold ?? p.sales ?? 0,
    img: p.img || p.emoji || p.image || '\uD83D\uDCE6',
  }));
}

function toChannelDataMap(realChannels: unknown): Record<string, ChannelRealData> {
  if (!realChannels || typeof realChannels !== 'object') {
    return {};
  }
  const map: Record<string, ChannelRealData> = {};
  for (const [key, val] of Object.entries(realChannels as Record<string, unknown>)) {
    if (val && typeof val === 'object') {
      map[key] = val as ChannelRealData;
    }
  }
  return map;
}

function isBrainAvgResponseMeaningful(
  avgResponseTime: string | number | null | undefined,
): boolean {
  if (typeof avgResponseTime === 'number') {
    return avgResponseTime > 0;
  }
  if (typeof avgResponseTime === 'string') {
    const trimmed = avgResponseTime.trim();
    return trimmed !== '' && trimmed !== '--';
  }
  return false;
}

// ══════════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════════

// ── NeuralPulse canvas ──
function NP({ w, h, color = EMBER }: { w: number; h: number; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) {
      return;
    }
    const ctx = c.getContext('2d');
    if (!ctx) {
      return;
    }
    let frame = 0;
    let raf: number;
    let visible = true;
    const obs = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
      },
      { threshold: 0 },
    );
    obs.observe(c);
    const draw = () => {
      if (!visible) {
        return;
      }
      drawNeuralFrame(ctx, w, h, color, frame);
      frame++;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, [w, h, color]);
  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      style={{ display: 'block', opacity: 0.6, pointerEvents: 'none' }}
    />
  );
}

// ── Ticker ──
function Ticker({ items }: { items: string[] }) {
  const text = items.join('  ///  ');
  return (
    <div
      style={{
        overflow: 'hidden',
        width: '100%',
        background: BG_CARD,
        borderRadius: 6,
        padding: '8px 0',
        border: `1px solid ${BORDER}`,
      }}
    >
      <div
        style={{
          display: 'inline-block',
          whiteSpace: 'nowrap',
          animation: 'mktTickerScroll 30s linear infinite',
          fontFamily: MONO,
          fontSize: 12,
          color: EMBER,
          opacity: 0.8,
        }}
      >
        {text}
        {kloelT(`&nbsp;&nbsp;&nbsp;///&nbsp;&nbsp;&nbsp;`)}
        {text}
      </div>
    </div>
  );
}

// ── LiveStream ──
function LiveStream({ msgs, color = EMBER }: { msgs: string[]; color?: string }) {
  const [feed, setFeed] = useState<Array<{ id: string; text: string }>>([]);
  const idx = useRef(0);
  useEffect(() => {
    if (msgs.length === 0 || (msgs.length === 1 && msgs[0] === 'Aguardando mensagens...')) {
      return;
    }
    const iv = setInterval(() => {
      setFeed((p) =>
        [
          {
            id: `feed-${Date.now()}-${idx.current}`,
            text: msgs[idx.current % msgs.length],
          },
          ...p,
        ].slice(0, 8),
      );
      idx.current++;
    }, 2000);
    return () => clearInterval(iv);
  }, [msgs]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {feed.map((entry, i) => (
        <div
          key={entry.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: MONO,
            fontSize: 12,
            color: 'var(--app-text-primary)',
            padding: '6px 10px',
            background: BG_CARD,
            borderRadius: 6,
            border: `1px solid ${BORDER}`,
            opacity: 1 - i * 0.1,
          }}
        >
          <NP w={24} h={12} color={color} />
          <span>{entry.text}</span>
        </div>
      ))}
    </div>
  );
}

// ── ConnBadge ──
function ConnBadge({ connected }: { connected: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 10,
        fontFamily: MONO,
        color: connected ? '#10B981' : '#ef4444',
        background: connected ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
        padding: '2px 8px',
        borderRadius: 99,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: connected ? '#10B981' : '#ef4444',
          animation: connected ? 'mktPulse 2s infinite' : 'none',
        }}
      />
      {connected ? 'Conectado' : 'Desconectado'}
    </span>
  );
}

// ── ConnectFlow — waitlist for channels not yet integrated ──
function ConnectFlow({
  channelKey,
  channelData,
}: {
  channelKey: string;
  channelData: ChannelRealData | null;
}) {
  const router = useRouter();
  const ch = CH_CONFIG[channelKey];
  if (!ch) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 400,
        gap: 20,
      }}
    >
      <div style={{ color: ch.color, opacity: 0.25 }}>{ch.icon(80)}</div>
      <div style={{ fontFamily: SORA, fontSize: 22, color: 'var(--app-text-primary)' }}>
        {kloelT(`Conectar`)} {ch.label}
      </div>
      <div
        style={{
          fontFamily: SORA,
          fontSize: 14,
          color: 'var(--app-text-secondary)',
          maxWidth: 420,
          textAlign: 'center',
          lineHeight: 1.6,
        }}
      >
        {kloelT(`Ainda nao existe operacao publicada para`)} {ch.label}{' '}
        {kloelT(`dentro do shell de Marketing. Enquanto
        essa integracao nao entra no produto ativo, use os canais ja operacionais abaixo.`)}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {[
          { label: 'Abrir Inbox', href: '/inbox' },
          { label: 'Abrir WhatsApp', href: '/marketing/whatsapp' },
          { label: 'Abrir Email', href: '/marketing/email' },
        ].map((item) => (
          <button
            type="button"
            key={item.href}
            onClick={() => router.push(item.href)}
            style={{
              fontFamily: SORA,
              fontSize: 13,
              padding: '10px 16px',
              borderRadius: 6,
              border: '1px solid var(--app-border-primary)',
              background: 'var(--app-bg-card)',
              color: 'var(--app-text-primary)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Show whatever real data IS available */}
      {channelData && (channelData.messages > 0 || channelData.leads > 0) && (
        <RegisteredDataList channelData={channelData} color={ch.color} />
      )}
    </div>
  );
}

// ── WhatsAppTab ──
function WhatsAppTab({
  channelData,
  liveFeed,
  mode,
  workspaceId,
  operator,
  connection,
  onRefreshConnectionStatus,
}: {
  channelData: ChannelRealData | null;
  liveFeed: string[];
  mode?: string;
  workspaceId?: string | null;
  operator?: string | null;
  connection?: NonNullable<MarketingConnectStatus['channels']>['whatsapp'];
  onRefreshConnectionStatus?: () => Promise<unknown> | unknown;
}) {
  if (!workspaceId) {
    return null;
  }

  return (
    <WhatsAppExperience
      workspaceId={workspaceId}
      operator={operator}
      mode={mode}
      channelData={channelData}
      liveFeed={liveFeed}
      connection={connection}
      onConnectionRefresh={onRefreshConnectionStatus}
    />
  );
}

// ── Email helpers + sub-components ──

interface EmailSendResult {
  sent: number;
  failed: number;
}

interface EmailSendResponsePayload {
  sent?: number;
  failed?: number;
  successCount?: number;
  failCount?: number;
}

async function requestEmailSend(
  subject: string,
  body: string,
  recipient: string,
): Promise<EmailSendResult> {
  const res = await apiFetch('/marketing/email/send', {
    method: 'POST',
    body: {
      subject,
      html: body,
      recipients: [{ email: recipient }],
      campaignName: subject,
    },
  });
  const data = ((res.data ?? res) as EmailSendResponsePayload) || {};
  mutate((key: unknown) => typeof key === 'string' && key.startsWith('/marketing'));
  return {
    sent: data.sent ?? data.successCount ?? 1,
    failed: data.failed ?? data.failCount ?? 0,
  };
}

interface EmailConnectionValue {
  connected?: boolean;
  providerAvailable?: boolean;
  provider?: string;
  fromName?: string;
  fromEmail?: string;
}

function EmailConnectionButtons({
  connection,
  connecting,
  testSending,
  color,
  onConnect,
  onDisconnect,
  onSendTest,
}: {
  connection?: EmailConnectionValue;
  connecting?: boolean;
  testSending?: boolean;
  color: string;
  onConnect: () => void;
  onDisconnect: () => void;
  onSendTest: () => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {connection?.connected ? (
        <button
          type="button"
          onClick={onDisconnect}
          disabled={connecting}
          style={{
            fontFamily: SORA,
            fontSize: 12,
            padding: '10px 14px',
            borderRadius: 6,
            border: `1px solid ${BORDER}`,
            background: BG_ELEVATED,
            color: 'var(--app-text-primary)',
            cursor: connecting ? 'wait' : 'pointer',
            opacity: connecting ? 0.7 : 1,
          }}
        >
          {kloelT(`Desativar email`)}
        </button>
      ) : (
        <button
          type="button"
          onClick={onConnect}
          disabled={connecting || !connection?.providerAvailable}
          style={{
            fontFamily: SORA,
            fontSize: 12,
            padding: '10px 14px',
            borderRadius: 6,
            border: 'none',
            background: connection?.providerAvailable ? color : 'var(--app-text-placeholder)',
            color: 'var(--app-text-on-accent)',
            cursor: connecting ? 'wait' : 'pointer',
            opacity: connecting ? 0.7 : 1,
          }}
        >
          {connecting ? 'Ativando...' : 'Conectar Email'}
        </button>
      )}
      <button
        type="button"
        onClick={onSendTest}
        disabled={testSending || !connection?.providerAvailable}
        style={{
          fontFamily: SORA,
          fontSize: 12,
          padding: '10px 14px',
          borderRadius: 6,
          border: `1px solid ${color}40`,
          background: `${color}10`,
          color,
          cursor: testSending ? 'wait' : 'pointer',
          opacity: !connection?.providerAvailable ? 0.45 : 1,
        }}
      >
        {testSending ? 'Enviando teste...' : 'Enviar teste'}
      </button>
    </div>
  );
}

function EmailConnectionPanel({
  connection,
  connecting,
  testSending,
  testResult,
  color,
  onConnect,
  onDisconnect,
  onSendTest,
}: {
  connection?: EmailConnectionValue;
  connecting?: boolean;
  testSending?: boolean;
  testResult?: string | null;
  color: string;
  onConnect: () => void;
  onDisconnect: () => void;
  onSendTest: () => void;
}) {
  return (
    <div
      style={{
        background: BG_CARD,
        borderRadius: 6,
        padding: 18,
        border: `1px solid ${BORDER}`,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: SORA,
              fontSize: 10,
              color: 'var(--app-text-tertiary)',
              marginBottom: 8,
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
            }}
          >
            {kloelT(`Conexao de email`)}
          </div>
          <div
            style={{
              fontFamily: SORA,
              fontSize: 15,
              color: 'var(--app-text-primary)',
              marginBottom: 4,
            }}
          >
            {connection?.providerAvailable
              ? 'Provider detectado e pronto para ativacao'
              : 'Nenhum provider de email configurado no backend'}
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 12,
              color: 'var(--app-text-secondary)',
              lineHeight: 1.6,
            }}
          >
            {kloelT(`Provider:`)} {connection?.provider || 'log'} {kloelT(`&middot; Remetente:`)}{' '}
            {connection?.fromName || 'KLOEL'} {kloelT(`&lt;`)}
            {connection?.fromEmail || 'noreply@kloel.com'}
            {kloelT(`&gt;`)}
          </div>
        </div>
        <EmailConnectionButtons
          connection={connection}
          connecting={connecting}
          testSending={testSending}
          color={color}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
          onSendTest={onSendTest}
        />
      </div>
      {testResult && (
        <div
          style={{
            marginTop: 12,
            fontFamily: MONO,
            fontSize: 12,
            color: 'var(--app-text-primary)',
            padding: '10px 12px',
            borderRadius: 6,
            background: BG_ELEVATED,
            border: `1px solid ${BORDER}`,
          }}
        >
          {testResult}
        </div>
      )}
    </div>
  );
}

function EmailStatsRow({ channelData }: { channelData: ChannelRealData | null }) {
  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 24 }}
    >
      {channelDataStats(channelData).map((s) => (
        <div
          key={s.label}
          style={{
            background: BG_CARD,
            borderRadius: 6,
            padding: 14,
            border: `1px solid ${BORDER}`,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: SORA,
              fontSize: 10,
              color: 'var(--app-text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              marginBottom: 4,
            }}
          >
            {s.label}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 20, color: 'var(--app-text-primary)' }}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmailTemplatesPanel({
  onSelect,
}: {
  onSelect: (template: (typeof EMAIL_TEMPLATE_PRESETS)[number]) => void;
}) {
  return (
    <div
      style={{
        background: BG_CARD,
        borderRadius: 6,
        padding: 20,
        border: `1px solid ${BORDER}`,
      }}
    >
      <div
        style={{
          fontFamily: SORA,
          fontSize: 10,
          color: 'var(--app-text-tertiary)',
          marginBottom: 16,
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
        }}
      >
        {kloelT(`Templates de Mensagem`)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {EMAIL_TEMPLATE_PRESETS.map((template) => (
          <button
            type="button"
            key={template.id}
            onClick={() => onSelect(template)}
            style={{
              textAlign: 'left',
              background: BG_ELEVATED,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              padding: '12px 14px',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                fontFamily: SORA,
                fontSize: 12,
                color: 'var(--app-text-primary)',
                marginBottom: 4,
              }}
            >
              {template.label}
            </div>
            <div
              style={{
                fontFamily: SORA,
                fontSize: 11,
                color: 'var(--app-text-secondary)',
                marginBottom: 6,
              }}
            >
              {template.subject}
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                color: 'var(--app-text-tertiary)',
                lineHeight: 1.5,
              }}
            >
              {template.html}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── EmailTab — campaign send form ──
function EmailTab({
  channelData,
  mode,
  connection,
  onConnect,
  onDisconnect,
  onSendTest,
  connecting,
  testSending,
  testResult,
  defaultRecipientEmail,
}: {
  channelData: ChannelRealData | null;
  mode?: string;
  connection?: NonNullable<MarketingConnectStatus['channels']>['email'];
  onConnect: () => void;
  onDisconnect: () => void;
  onSendTest: () => void;
  connecting?: boolean;
  testSending?: boolean;
  testResult?: string | null;
  defaultRecipientEmail?: string | null;
}) {
  const ch = CH_CONFIG.email;
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<EmailSendResult | null>(null);
  const templateFocused = mode === 'templates';

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
      const result = await requestEmailSend(emailSubject.trim(), emailBody, defaultRecipientEmail);
      setEmailResult(result);
    } catch {
      setEmailResult({ sent: 0, failed: 1 });
    }
    setEmailSending(false);
  }, [defaultRecipientEmail, emailBody, emailSubject]);

  const handleSelectTemplate = useCallback((template: (typeof EMAIL_TEMPLATE_PRESETS)[number]) => {
    setEmailSubject(template.subject);
    setEmailBody(template.html);
  }, []);

  return (
    <div>
      {templateFocused && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            borderRadius: 6,
            border: `1px solid ${ch.color}40`,
            background: `${ch.color}10`,
            color: 'var(--app-text-primary)',
            fontSize: 12,
            fontFamily: SORA,
          }}
        >
          {kloelT(`Biblioteca de templates aberta. Escolha um modelo pronto para preencher o assunto e o
          corpo do email antes de enviar.`)}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <span style={{ color: ch.color }}>{ch.icon(24)}</span>
        <span style={{ fontFamily: SORA, fontSize: 18, color: 'var(--app-text-primary)' }}>
          {ch.label}
        </span>
        <ConnBadge connected={connection?.connected === true} />
      </div>

      <EmailConnectionPanel
        connection={connection}
        connecting={connecting}
        testSending={testSending}
        testResult={testResult}
        color={ch.color}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        onSendTest={onSendTest}
      />

      {/* Stats row */}
      <EmailStatsRow channelData={channelData} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1.1fr) minmax(260px,0.9fr)',
          gap: 16,
        }}
      >
        {/* Campaign send form */}
        <div
          style={{
            background: BG_CARD,
            borderRadius: 6,
            padding: 20,
            border: `1px solid ${BORDER}`,
          }}
        >
          <div
            style={{
              fontFamily: SORA,
              fontSize: 10,
              color: 'var(--app-text-tertiary)',
              marginBottom: 16,
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
            }}
          >
            {kloelT(`Enviar Campanha`)}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div
                style={{
                  fontFamily: SORA,
                  fontSize: 12,
                  color: 'var(--app-text-secondary)',
                  marginBottom: 6,
                }}
              >
                {kloelT(`Assunto`)}
              </div>
              <input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder={kloelT(`Assunto do email...`)}
                style={{
                  fontFamily: SORA,
                  fontSize: 13,
                  padding: '10px 14px',
                  width: '100%',
                  borderRadius: 6,
                  border: `1px solid ${BORDER}`,
                  background: BG_ELEVATED,
                  color: 'var(--app-text-primary)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = ch.color;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = BORDER;
                }}
              />
            </div>

            <div>
              <div
                style={{
                  fontFamily: SORA,
                  fontSize: 12,
                  color: 'var(--app-text-secondary)',
                  marginBottom: 6,
                }}
              >
                {kloelT(`Corpo HTML`)}
              </div>
              <textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                placeholder={kloelT(`<h1>Seu HTML aqui...</h1>`)}
                rows={8}
                style={{
                  fontFamily: MONO,
                  fontSize: 13,
                  padding: '10px 14px',
                  width: '100%',
                  borderRadius: 6,
                  border: `1px solid ${BORDER}`,
                  background: BG_ELEVATED,
                  color: 'var(--app-text-primary)',
                  outline: 'none',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = ch.color;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = BORDER;
                }}
              />
            </div>

            <button
              type="button"
              onClick={handleSend}
              disabled={!canSubmit}
              style={{
                fontFamily: SORA,
                fontSize: 14,
                padding: '12px 32px',
                borderRadius: 6,
                border: 'none',
                background: canSubmit ? EMBER : 'var(--app-text-placeholder)',
                color: 'var(--app-text-on-accent)',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                alignSelf: 'flex-start',
              }}
            >
              {emailSending ? (
                'Enviando...'
              ) : (
                <>
                  {IC.send(16)} {kloelT(`Enviar`)}
                </>
              )}
            </button>

            {emailResult && (
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 13,
                  padding: '10px 16px',
                  borderRadius: 6,
                  background:
                    emailResult.failed === 0 ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                  border: `1px solid ${emailResult.failed === 0 ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`,
                  color: emailResult.failed === 0 ? '#10B981' : '#F59E0B',
                }}
              >
                {emailResult.sent} {kloelT(`enviados,`)} {emailResult.failed} falharam
              </div>
            )}
          </div>
        </div>

        <EmailTemplatesPanel onSelect={handleSelectTemplate} />
      </div>
    </div>
  );
}

// ── InstagramTab — real data when Meta connected ──
function InstagramTab({
  channelData,
  igProfile,
  igInsights,
  connection,
  onConnect,
  connecting,
}: {
  channelData: ChannelRealData | null;
  igProfile: {
    username?: string;
    name?: string;
    followers?: number;
    followersCount?: number;
    followers_count?: number;
    posts?: number;
    mediaCount?: number;
    media_count?: number;
    bio?: string;
  } | null;
  igInsights: {
    impressions?: number;
    reach?: number;
    engagement?: number;
    follower_count?: number;
    followersCount?: number;
  } | null;
  connection?: NonNullable<MarketingConnectStatus['channels']>['instagram'];
  onConnect: (channelKey: 'instagram') => void;
  connecting?: boolean;
}) {
  const ch = CH_CONFIG.instagram;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: ch.color }}>{ch.icon(24)}</span>
          <span style={{ fontFamily: SORA, fontSize: 18, color: 'var(--app-text-primary)' }}>
            {ch.label}
          </span>
          <ConnBadge connected={true} />
        </div>
        <button
          type="button"
          onClick={() => onConnect('instagram')}
          disabled={connecting}
          style={{
            fontFamily: SORA,
            fontSize: 12,
            padding: '6px 14px',
            borderRadius: 6,
            border: `1px solid ${ch.color}40`,
            background: `${ch.color}10`,
            color: ch.color,
            cursor: connecting ? 'wait' : 'pointer',
            opacity: connecting ? 0.7 : 1,
          }}
        >
          {connecting ? 'Abrindo Meta...' : 'Reconectar Instagram'}
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
          gap: 10,
          marginBottom: 16,
        }}
      >
        {[
          {
            label: 'Conta vinculada',
            value: connection?.username ? `@${connection.username}` : 'Nao resolvida',
          },
          { label: 'Conta Meta', value: connection?.pageName || 'Nao resolvida' },
          { label: 'Instagram ID', value: connection?.instagramAccountId || 'Pendente' },
        ].map((item) => (
          <ChannelInfoGridCard key={item.label} label={item.label} value={item.value} />
        ))}
      </div>

      {igProfile && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: 16,
            background: BG_CARD,
            borderRadius: 6,
            border: `1px solid ${BORDER}`,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: `${ch.color}20`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: ch.color,
            }}
          >
            {ch.icon(24)}
          </div>
          <div>
            <div
              style={{
                fontFamily: SORA,
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
              }}
            >
              @{igProfile.username || igProfile.name || 'instagram'}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--app-text-secondary)' }}>
              {igProfile.followers_count ?? igProfile.followersCount ?? 0}{' '}
              {kloelT(`seguidores &#183;`)} {igProfile.media_count ?? igProfile.mediaCount ?? 0}{' '}
              publicacoes
            </div>
          </div>
        </div>
      )}

      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}
      >
        {[
          {
            label: 'Impressoes',
            value: Fmt(igInsights?.impressions ?? channelData?.messages ?? 0),
          },
          { label: 'Alcance', value: Fmt(igInsights?.reach ?? 0) },
          {
            label: 'Seguidores',
            value: Fmt(
              igInsights?.follower_count ??
                igProfile?.followers_count ??
                igProfile?.followersCount ??
                0,
            ),
          },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: BG_CARD,
              borderRadius: 6,
              padding: 14,
              border: `1px solid ${BORDER}`,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: SORA,
                fontSize: 10,
                color: 'var(--app-text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.2em',
                marginBottom: 4,
              }}
            >
              {s.label}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 20, color: 'var(--app-text-primary)' }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
        <ChannelStatsList stats={channelDataStats(channelData)} color={ch.color} />
      </div>
    </div>
  );
}

// ── FacebookTab — Messenger real data when Meta connected ──
function FacebookTab({
  channelData,
  connection,
  onConnect,
  connecting,
}: {
  channelData: ChannelRealData | null;
  connection?: NonNullable<MarketingConnectStatus['channels']>['facebook'];
  onConnect: (channelKey: 'facebook') => void;
  connecting?: boolean;
}) {
  const ch = CH_CONFIG.facebook;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: ch.color }}>{ch.icon(24)}</span>
          <span style={{ fontFamily: SORA, fontSize: 18, color: 'var(--app-text-primary)' }}>
            {kloelT(`Messenger`)}
          </span>
          <ConnBadge connected={true} />
        </div>
        <button
          type="button"
          onClick={() => onConnect('facebook')}
          disabled={connecting}
          style={{
            fontFamily: SORA,
            fontSize: 12,
            padding: '6px 14px',
            borderRadius: 6,
            border: `1px solid ${ch.color}40`,
            background: `${ch.color}10`,
            color: ch.color,
            cursor: connecting ? 'wait' : 'pointer',
            opacity: connecting ? 0.7 : 1,
          }}
        >
          {connecting ? 'Abrindo Meta...' : 'Reconectar Facebook'}
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
          gap: 10,
          marginBottom: 16,
        }}
      >
        {[
          { label: 'Pagina vinculada', value: connection?.pageName || 'Nao resolvida' },
          { label: 'Page ID', value: connection?.pageId || 'Pendente' },
          { label: 'Canal', value: 'Messenger do Facebook' },
        ].map((item) => (
          <ChannelInfoGridCard key={item.label} label={item.label} value={item.value} />
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
        <ChannelStatsList stats={channelDataStats(channelData)} color={ch.color} />
      </div>
    </div>
  );
}

// ── MetaConnectPrompt — shown when Meta not connected for IG/FB channels ──
function MetaConnectPrompt({
  channelKey,
  channelData,
  onConnect,
  connecting,
}: {
  channelKey: string;
  channelData: ChannelRealData | null;
  onConnect: (channelKey: 'instagram' | 'facebook' | 'whatsapp') => void;
  connecting?: boolean;
}) {
  const ch = CH_CONFIG[channelKey];
  if (!ch) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 400,
        gap: 20,
      }}
    >
      <div style={{ color: ch.color, opacity: 0.25 }}>{ch.icon(80)}</div>
      <div style={{ fontFamily: SORA, fontSize: 22, color: 'var(--app-text-primary)' }}>
        {kloelT(`Conectar`)} {ch.label}
      </div>
      <div
        style={{
          fontFamily: SORA,
          fontSize: 14,
          color: 'var(--app-text-secondary)',
          maxWidth: 420,
          textAlign: 'center',
          lineHeight: 1.6,
        }}
      >
        {kloelT(`Conecte sua conta Meta para liberar`)} {ch.label}{' '}
        {kloelT(`dentro do Marketing da KLOEL. O fluxo abre a
        autorizacao oficial da Meta e retorna para este canal.`)}
      </div>
      <button
        type="button"
        onClick={() => onConnect(channelKey as 'instagram' | 'facebook' | 'whatsapp')}
        disabled={connecting}
        style={{
          fontFamily: SORA,
          fontSize: 14,
          padding: '12px 32px',
          borderRadius: 6,
          border: 'none',
          background: ch.color,
          color: '#fff',
          cursor: connecting ? 'wait' : 'pointer',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          opacity: connecting ? 0.7 : 1,
        }}
      >
        {connecting ? 'Abrindo Meta...' : `Conectar ${ch.label}`}
      </button>

      {channelData && (channelData.messages > 0 || channelData.leads > 0) && (
        <RegisteredDataList channelData={channelData} color={ch.color} />
      )}
    </div>
  );
}

// ── ChannelTab router ──
function ChannelTab({
  channelKey,
  channelData,
  liveFeed,
  metaConnected,
  igProfile,
  igInsights,
  mode,
  workspaceId,
  operator,
  connectionStatus,
  onConnectMeta,
  onConnectEmail,
  onDisconnectEmail,
  onSendEmailTest,
  onRefreshConnectionStatus,
  connectingKey,
  emailTestSending,
  emailTestResult,
}: {
  channelKey: string;
  channelData: ChannelRealData | null;
  liveFeed: string[];
  metaConnected?: boolean;
  igProfile?: {
    username?: string;
    name?: string;
    followers?: number;
    followersCount?: number;
    followers_count?: number;
    posts?: number;
    mediaCount?: number;
    media_count?: number;
    bio?: string;
  } | null;
  igInsights?: {
    impressions?: number;
    reach?: number;
    engagement?: number;
    follower_count?: number;
    followersCount?: number;
  } | null;
  mode?: string;
  workspaceId?: string | null;
  operator?: string | null;
  connectionStatus?: MarketingConnectStatus | null;
  onConnectMeta?: (channelKey: 'whatsapp' | 'instagram' | 'facebook') => void;
  onConnectEmail?: () => void;
  onDisconnectEmail?: () => void;
  onSendEmailTest?: () => void;
  onRefreshConnectionStatus?: () => Promise<unknown> | unknown;
  connectingKey?: string | null;
  emailTestSending?: boolean;
  emailTestResult?: string | null;
}) {
  const ch = CH_CONFIG[channelKey];
  if (!ch) {
    return null;
  }
  if (channelKey === 'whatsapp') {
    return (
      <WhatsAppTab
        channelData={channelData}
        liveFeed={liveFeed}
        mode={mode}
        workspaceId={workspaceId}
        operator={operator}
        connection={connectionStatus?.channels?.whatsapp}
        onRefreshConnectionStatus={onRefreshConnectionStatus}
      />
    );
  }
  if (channelKey === 'email') {
    return (
      <EmailTab
        channelData={channelData}
        mode={mode}
        connection={connectionStatus?.channels?.email}
        onConnect={() => onConnectEmail?.()}
        onDisconnect={() => onDisconnectEmail?.()}
        onSendTest={() => onSendEmailTest?.()}
        connecting={connectingKey === 'email'}
        testSending={emailTestSending}
        testResult={emailTestResult}
        defaultRecipientEmail={operator || null}
      />
    );
  }
  if (channelKey === 'instagram') {
    if (metaConnected) {
      return (
        <InstagramTab
          channelData={channelData}
          igProfile={igProfile ?? null}
          igInsights={igInsights ?? null}
          connection={connectionStatus?.channels?.instagram}
          onConnect={(key) => onConnectMeta?.(key)}
          connecting={connectingKey === 'instagram'}
        />
      );
    }
    return (
      <MetaConnectPrompt
        channelKey={channelKey}
        channelData={channelData}
        onConnect={(key) => onConnectMeta?.(key)}
        connecting={connectingKey === 'instagram'}
      />
    );
  }
  if (channelKey === 'facebook') {
    if (metaConnected) {
      return (
        <FacebookTab
          channelData={channelData}
          connection={connectionStatus?.channels?.facebook}
          onConnect={(key) => onConnectMeta?.(key)}
          connecting={connectingKey === 'facebook'}
        />
      );
    }
    return (
      <MetaConnectPrompt
        channelKey={channelKey}
        channelData={channelData}
        onConnect={(key) => onConnectMeta?.(key)}
        connecting={connectingKey === 'facebook'}
      />
    );
  }
  return <ConnectFlow channelKey={channelKey} channelData={channelData} />;
}

// ── Revenue Bar Chart ──
function RevenueBarChart({ channelDataMap }: { channelDataMap: Record<string, ChannelRealData> }) {
  const bars = Object.entries(CH_CONFIG).map(([key, ch]) => {
    const data = channelDataMap[ch.backendKey];
    return { key, label: ch.label, color: ch.color, sales: data?.sales ?? 0 };
  });
  const maxSales = Math.max(1, ...bars.map((b) => b.sales));

  return (
    <div
      style={{ background: BG_CARD, borderRadius: 6, padding: 16, border: `1px solid ${BORDER}` }}
    >
      <div
        style={{
          fontFamily: SORA,
          fontSize: 10,
          color: 'var(--app-text-tertiary)',
          marginBottom: 14,
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
        }}
      >
        {kloelT(`Receita por Canal`)}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 120 }}>
        {bars.map((b) => (
          <div
            key={b.key}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ fontFamily: MONO, fontSize: 11, color: b.color }}>{b.sales}</span>
            <div
              style={{
                width: '100%',
                maxWidth: 40,
                background: `${b.color}30`,
                borderRadius: '4px 4px 0 0',
                height: Math.max(4, (b.sales / maxSales) * 90),
                transition: 'height .5s',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: b.color,
                  opacity: 0.6,
                  borderRadius: '4px 4px 0 0',
                }}
              />
            </div>
            <span
              style={{
                fontFamily: SORA,
                fontSize: 9,
                color: 'var(--app-text-secondary)',
                textAlign: 'center',
              }}
            >
              {b.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChannelConnectBadge({
  isLive,
  hasIntegration,
}: {
  isLive: boolean;
  hasIntegration: boolean;
}) {
  if (hasIntegration) {
    return <ConnBadge connected={isLive} />;
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 10,
        fontFamily: MONO,
        color: '#F59E0B',
        background: 'rgba(245,158,11,0.1)',
        padding: '2px 8px',
        borderRadius: 99,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B' }} />

      {kloelT(`Conectar`)}
    </span>
  );
}

interface ChannelNerveRowProps {
  channelKey: string;
  cfg: (typeof CH_CONFIG)[string];
  data: ChannelRealData | undefined;
  isMobile: boolean;
  onOpen: (id: string) => void;
}

function ChannelNerveRow({ channelKey, cfg, data, isMobile, onOpen }: ChannelNerveRowProps) {
  const isLive = data?.status === 'live';
  const intensity = data?.sales ?? 0;
  return (
    <button
      type="button"
      onClick={() => onOpen(channelKey)}
      aria-label={`Abrir canal ${cfg.label ?? channelKey}`}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'flex-start' : 'center',
        gap: 14,
        padding: '14px 16px 14px 20px',
        background: BG_CARD,
        borderRadius: 6,
        border: `1px solid ${BORDER}`,
        cursor: 'pointer',
        transition: 'all .2s',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: cfg.color,
        }}
      />
      <span style={{ color: cfg.color }}>{cfg.icon(18)}</span>
      <span
        style={{
          fontFamily: SORA,
          fontSize: 14,
          color: 'var(--app-text-primary)',
          minWidth: 90,
        }}
      >
        {cfg.label}
      </span>
      <ChannelConnectBadge isLive={isLive} hasIntegration={cfg.hasIntegration} />
      <div
        style={{
          flex: 1,
          width: isMobile ? '100%' : undefined,
          display: 'flex',
          gap: isMobile ? 8 : 16,
          justifyContent: isMobile ? 'flex-start' : 'flex-end',
          flexWrap: 'wrap',
          fontFamily: MONO,
          fontSize: 12,
        }}
      >
        <span style={{ color: 'var(--app-text-secondary)' }}>{Fmt(data?.messages ?? 0)} msgs</span>
        <span style={{ color: 'var(--app-text-secondary)' }}>{Fmt(data?.leads ?? 0)} leads</span>
        <span style={{ color: cfg.color }}>{intensity} vendas</span>
      </div>
      <NP w={160} h={28} color={cfg.color} />
    </button>
  );
}

// ── VisaoGeral ──
function VisaoGeral({
  realStats,
  switchTab,
  channelDataMap,
  feedMsgs,
  realBrain,
  products,
}: {
  realStats: {
    totalMessages: number;
    totalLeads: number;
    totalSales: number;
    totalRevenue: number;
  };
  switchTab: (id: string) => void;
  channelDataMap: Record<string, ChannelRealData>;
  feedMsgs: string[];
  realBrain: AIBrainInfo | null;
  products: { name: string; price: number; sold: number; img: string }[];
}) {
  const { isMobile } = useResponsiveViewport();
  const tickerItems = feedMsgs.length > 0 ? feedMsgs : ['Aguardando mensagens...'];

  return (
    <div>
      {/* Revenue Hero */}
      <div
        style={{
          textAlign: 'center',
          padding: isMobile ? '24px 18px' : '32px 24px',
          marginBottom: 24,
          borderRadius: 6,
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 10,
            color: 'var(--app-text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.25em',
          }}
        >
          {kloelT(`RECEITA TOTAL GERADA PELA IA`)}
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: isMobile ? 44 : 80,
            fontWeight: 700,
            color: EMBER,
            marginTop: 8,
          }}
        >
          <span>{FmtMoney(realStats.totalRevenue)}</span>
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: isMobile ? 11 : 12,
            color: 'var(--app-text-secondary)',
            marginTop: 4,
            lineHeight: 1.5,
            padding: isMobile ? '0 12px' : 0,
          }}
        >
          {Fmt(realStats.totalMessages)} {kloelT(`msgs &middot;`)} {Fmt(realStats.totalLeads)}{' '}
          {kloelT(`leads &middot;`)} {realStats.totalSales} vendas
        </div>
      </div>

      {/* Sale Ticker */}
      <Ticker items={tickerItems} />

      {/* Channel nerve fibers with NP per channel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 20 }}>
        {Object.entries(CH_CONFIG).map(([key, ch]) => (
          <ChannelNerveRow
            key={key}
            channelKey={key}
            cfg={ch}
            data={channelDataMap[ch.backendKey]}
            isMobile={isMobile}
            onOpen={switchTab}
          />
        ))}
      </div>

      {/* Revenue per channel bar chart */}
      <div style={{ marginTop: 20 }}>
        <RevenueBarChart channelDataMap={channelDataMap} />
      </div>

      {/* Products */}
      <div
        style={{
          marginTop: 24,
          background: BG_CARD,
          borderRadius: 6,
          padding: 16,
          border: `1px solid ${BORDER}`,
        }}
      >
        <div
          style={{
            fontFamily: SORA,
            fontSize: 10,
            color: 'var(--app-text-tertiary)',
            marginBottom: 12,
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
          }}
        >
          {kloelT(`Produtos Mais Vendidos`)}
        </div>
        <div style={{ display: 'flex', gap: 12, flexDirection: isMobile ? 'column' : 'row' }}>
          {products.length === 0 ? (
            <div
              style={{
                fontFamily: MONO,
                fontSize: 12,
                color: 'var(--app-text-secondary)',
                padding: 14,
              }}
            >
              {kloelT(`Nenhum produto cadastrado`)}
            </div>
          ) : (
            products.map((p) => (
              <div
                key={p.name}
                style={{
                  flex: 1,
                  background: BG_ELEVATED,
                  borderRadius: 6,
                  padding: 14,
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  border: `1px solid ${BORDER}`,
                }}
              >
                <div style={{ fontSize: 28 }}>{p.img}</div>
                <div>
                  <div style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-primary)' }}>
                    {p.name}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 13, color: EMBER }}>
                    {FmtMoney(p.price)}
                  </div>
                  <div
                    style={{ fontFamily: MONO, fontSize: 11, color: 'var(--app-text-secondary)' }}
                  >
                    {p.sold} vendidos
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Cerebro IA + Feed */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: 16,
          marginTop: 20,
        }}
      >
        {/* Cerebro IA box */}
        <div
          style={{
            background: BG_CARD,
            borderRadius: 6,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 200,
            border: `1px solid ${BORDER}`,
          }}
        >
          <div style={{ color: EMBER, animation: 'mktPulse 3s infinite', marginBottom: 12 }}>
            {IC.zap(40)}
          </div>
          <div
            style={{
              fontFamily: SORA,
              fontSize: 16,
              color: 'var(--app-text-primary)',
              marginBottom: 4,
            }}
          >
            {kloelT(`Cerebro IA`)} {realBrain?.status === 'active' ? 'Ativo' : 'Inativo'}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: EMBER }}>
            {realBrain?.activeConversations ?? 0} {kloelT(`conversas ativas`)}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: MONO, fontSize: 18, color: 'var(--app-text-primary)' }}>
                {realBrain?.productsLoaded ?? 0}
              </div>
              <div
                style={{
                  fontFamily: SORA,
                  fontSize: 9,
                  color: 'var(--app-text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.15em',
                }}
              >
                {kloelT(`Produtos`)}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: MONO, fontSize: 18, color: 'var(--app-text-primary)' }}>
                {realBrain?.objectionsMapped ?? 0}
              </div>
              <div
                style={{
                  fontFamily: SORA,
                  fontSize: 9,
                  color: 'var(--app-text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.15em',
                }}
              >
                {kloelT(`Objecoes`)}
              </div>
            </div>
          </div>
          {isBrainAvgResponseMeaningful(
            realBrain?.avgResponseTime as string | number | null | undefined,
          ) ? (
            <div
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: 'var(--app-text-secondary)',
                marginTop: 6,
              }}
            >
              {kloelT(`Tempo medio:`)} {String(realBrain?.avgResponseTime)}
            </div>
          ) : null}
          <NP w={200} h={24} color={EMBER} />
        </div>

        {/* Feed em Tempo Real */}
        <div
          style={{
            background: BG_CARD,
            borderRadius: 6,
            padding: 16,
            border: `1px solid ${BORDER}`,
          }}
        >
          <div
            style={{
              fontFamily: SORA,
              fontSize: 10,
              color: 'var(--app-text-tertiary)',
              marginBottom: 12,
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
            }}
          >
            {kloelT(`Feed em Tempo Real`)}
          </div>
          {feedMsgs.length === 0 ? (
            <div
              style={{
                fontFamily: MONO,
                fontSize: 12,
                color: 'var(--app-text-secondary)',
                padding: 14,
              }}
            >
              {kloelT(`Aguardando mensagens...`)}
            </div>
          ) : (
            <LiveStream msgs={feedMsgs} color={EMBER} />
          )}
        </div>
      </div>
    </div>
  );
}

function ConversationsHub({
  realStats,
  switchTab,
  channelDataMap,
  feedMsgs,
  realBrain,
  products,
}: {
  realStats: {
    totalMessages: number;
    totalLeads: number;
    totalSales: number;
    totalRevenue: number;
  };
  switchTab: (id: string) => void;
  channelDataMap: Record<string, ChannelRealData>;
  feedMsgs: string[];
  realBrain: AIBrainInfo | null;
  products: { name: string; price: number; sold: number; img: string }[];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <section>
        <VisaoGeral
          realStats={realStats}
          switchTab={switchTab}
          channelDataMap={channelDataMap}
          feedMsgs={feedMsgs}
          realBrain={realBrain}
          products={products}
        />
      </section>

      <section>
        <InboxWorkspace embedded showHeader={false} showContextBanner={false} />
      </section>
    </div>
  );
}

// ══════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════

export default function MarketingView({ defaultTab = 'conversas' }: { defaultTab?: string }) {
  const { isMobile } = useResponsiveViewport();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { workspace, userEmail, userName } = useAuth();
  const [tab, setTab] = useState(defaultTab);
  const prevDefault = useRef(defaultTab);
  useEffect(() => {
    if (prevDefault.current !== defaultTab) {
      setTab(defaultTab);
      prevDefault.current = defaultTab;
    }
  }, [defaultTab]);
  const [feed, setFeed] = useState<string[]>([]);
  const requestedMode = searchParams?.get('mode') || searchParams?.get('focus') || undefined;
  const metaQueryState = searchParams?.get('meta') || null;
  const metaQueryReason = searchParams?.get('reason') || null;
  const [connectingKey, setConnectingKey] = useState<string | null>(null);
  const [emailTestSending, setEmailTestSending] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<string | null>(null);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);

  const { data: connectionStatus, mutate: mutateConnectionStatus } = useSWR<MarketingConnectStatus>(
    '/marketing/connect/status',
    swrFetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  // ── Meta connection status ──
  const { data: metaStatus } = useSWR<{ connected?: boolean }>('/meta/auth/status', swrFetcher);
  const metaConnected =
    connectionStatus?.meta?.connected === true || metaStatus?.connected === true;

  // ── Instagram/Facebook profile data when Meta connected ──
  interface IgProfileData {
    username?: string;
    name?: string;
    followers?: number;
    followersCount?: number;
    followers_count?: number;
    posts?: number;
    mediaCount?: number;
    media_count?: number;
    bio?: string;
  }
  interface IgInsightsData {
    impressions?: number;
    reach?: number;
    engagement?: number;
    follower_count?: number;
    followersCount?: number;
  }
  const { data: igProfile } = useSWR<IgProfileData>(
    connectionStatus?.channels?.instagram?.connected ? '/meta/instagram/profile' : null,
    swrFetcher,
  );
  const { data: igInsights } = useSWR<IgInsightsData>(
    connectionStatus?.channels?.instagram?.connected ? '/meta/instagram/insights/account' : null,
    swrFetcher,
  );

  // Update CH_CONFIG dynamically based on Meta connection
  useEffect(() => {
    CH_CONFIG.whatsapp.hasIntegration = connectionStatus?.channels?.whatsapp?.connected === true;
    CH_CONFIG.instagram.hasIntegration = connectionStatus?.channels?.instagram?.connected === true;
    CH_CONFIG.facebook.hasIntegration = connectionStatus?.channels?.facebook?.connected === true;
    CH_CONFIG.email.hasIntegration = connectionStatus?.channels?.email?.connected === true;
  }, [connectionStatus]);

  const handleConnectMeta = useCallback(
    async (channelKey: 'whatsapp' | 'instagram' | 'facebook') => {
      setConnectingKey(channelKey);
      try {
        const returnTo = `/marketing/${channelKey}`;
        const res = await apiFetch<{ url?: string }>(
          `/meta/auth/url?channel=${encodeURIComponent(channelKey)}&returnTo=${encodeURIComponent(returnTo)}`,
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
    try {
      await apiFetch('/marketing/connect/email', { method: 'POST', body: { enabled: true } });
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
    try {
      await apiFetch('/marketing/connect/email', { method: 'POST', body: { enabled: false } });
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
    try {
      const res = await apiFetch<{ toEmail?: string; provider?: string }>(
        '/marketing/connect/email/test',
        {
          method: 'POST',
          body: { toEmail: userEmail || undefined },
        },
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

  useEffect(() => {
    if (metaQueryState === 'success') {
      setConnectionMessage(
        'Conta Meta conectada com sucesso. O canal ja voltou para o Marketing no contexto certo.',
      );
    } else if (metaQueryState === 'error') {
      setConnectionMessage(
        `Falha na conexao Meta${metaQueryReason ? `: ${metaQueryReason}` : '.'}`,
      );
    }
  }, [metaQueryReason, metaQueryState]);

  // ── Real data hooks ──
  const { stats: realStats } = useMarketingStats();
  const { channels: realChannels } = useMarketingChannels();
  const { messages: realFeed } = useMarketingLiveFeed();
  const { brain: realBrain } = useAIBrain();
  const { products: rawProducts } = useProducts();

  // Map raw products to display format (top 3)
  const mappedProducts = useMemo(() => mapTopProducts(rawProducts), [rawProducts]);

  // Build channelDataMap from backend
  const channelDataMap: Record<string, ChannelRealData> = useMemo(
    () => toChannelDataMap(realChannels),
    [realChannels],
  );

  // Merge real feed messages
  useEffect(() => {
    if (realFeed?.length > 0) {
      const mapped = (realFeed as FeedMessageLike[]).map(formatFeedMessage);
      setFeed(mapped.slice(0, 30));
    }
  }, [realFeed]);

  // Helper
  const getChannelData = useCallback(
    (channelKey: string): ChannelRealData | null => {
      const cfg = CH_CONFIG[channelKey];
      if (!cfg) {
        return null;
      }
      return channelDataMap[cfg.backendKey] || null;
    },
    [channelDataMap],
  );

  const TABS = [
    { id: 'conversas', label: 'Conversas', icon: IC.zap },
    { id: 'whatsapp', label: 'WhatsApp', icon: IC.wa },
    { id: 'instagram', label: 'Instagram', icon: IC.ig, soon: true },
    { id: 'tiktok', label: 'TikTok', icon: IC.tt, soon: true },
    { id: 'facebook', label: 'Facebook', icon: IC.fb, soon: true },
    { id: 'email', label: 'Email', icon: IC.em, soon: true },
  ];

  const switchTab = useCallback(
    (id: string) => {
      setTab(id);
      const nextRoute = id === 'conversas' ? '/marketing' : `/marketing/${id}`;
      if (pathname === nextRoute) {
        return;
      }
      startTransition(() => {
        router.push(nextRoute);
      });
    },
    [pathname, router],
  );

  return (
    <div
      style={{
        fontFamily: SORA,
        color: 'var(--app-text-primary)',
        minHeight: '100vh',
        padding: isMobile ? 16 : 24,
      }}
    >
      {/* CSS Keyframes */}
      <style>{`
        @keyframes mktFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes mktPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes mktSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes mktGlowText { 0%, 100% { text-shadow: 0 0 20px rgba(232,93,48,0.3); } 50% { text-shadow: 0 0 40px rgba(232,93,48,0.8), 0 0 80px rgba(232,93,48,0.4); } }
        @keyframes mktTickerScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
      `}</style>

      {/* Tab Navigation */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 24,
          overflowX: 'auto',
          paddingBottom: 8,
          maxWidth: 1240,
          marginInline: 'auto',
        }}
      >
        {TABS.map((t) => (
          <button
            type="button"
            key={t.id}
            onClick={() => switchTab(t.id)}
            style={{
              fontFamily: SORA,
              fontSize: isMobile ? 11 : 12,
              padding: isMobile ? '8px 12px' : '8px 14px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'transparent',
              color: tab === t.id ? EMBER : KLOEL_THEME.textSecondary,
              transition: 'all .2s',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center' }}>{t.icon(14)}</span>
            {t.label}
            {t.soon && (
              <span
                style={{
                  fontSize: 8,
                  color: 'var(--app-text-tertiary)',
                  fontFamily: MONO,
                  marginLeft: 2,
                }}
              >
                soon
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        {connectionMessage && (
          <div
            style={{
              marginBottom: 20,
              padding: '12px 16px',
              borderRadius: 6,
              border: `1px solid ${EMBER}30`,
              background: `${EMBER}12`,
              color: 'var(--app-text-primary)',
              fontSize: 12,
              fontFamily: SORA,
            }}
          >
            {connectionMessage}
          </div>
        )}

        {/* Tab Content */}
        {tab === 'conversas' && (
          <ConversationsHub
            realStats={realStats}
            switchTab={switchTab}
            channelDataMap={channelDataMap}
            feedMsgs={feed}
            realBrain={realBrain}
            products={mappedProducts}
          />
        )}
        {tab === 'whatsapp' && (
          <ChannelTab
            channelKey="whatsapp"
            channelData={getChannelData('whatsapp')}
            liveFeed={feed.filter((m) => m.includes('[whatsapp]'))}
            mode={requestedMode}
            workspaceId={workspace?.id || null}
            operator={userEmail || userName || null}
            connectionStatus={connectionStatus}
            onConnectMeta={handleConnectMeta}
            onConnectEmail={handleConnectEmail}
            onDisconnectEmail={handleDisconnectEmail}
            onSendEmailTest={handleSendEmailTest}
            onRefreshConnectionStatus={() => mutateConnectionStatus()}
            connectingKey={connectingKey}
            emailTestSending={emailTestSending}
            emailTestResult={emailTestResult}
          />
        )}
        {tab === 'instagram' && (
          <div style={{ position: 'relative' }}>
            <ChannelTab
              channelKey="instagram"
              channelData={getChannelData('instagram')}
              liveFeed={feed.filter((m) => m.includes('[instagram]'))}
              metaConnected={metaConnected}
              igProfile={igProfile}
              igInsights={igInsights}
              connectionStatus={connectionStatus}
              onConnectMeta={handleConnectMeta}
              onConnectEmail={handleConnectEmail}
              onDisconnectEmail={handleDisconnectEmail}
              onSendEmailTest={handleSendEmailTest}
              connectingKey={connectingKey}
              emailTestSending={emailTestSending}
              emailTestResult={emailTestResult}
            />
            <ComingSoonOverlay
              title={kloelT(`Em breve`)}
              description={kloelT(`Instagram Marketing esta sendo finalizado.`)}
            />
          </div>
        )}
        {tab === 'tiktok' && (
          <div style={{ position: 'relative' }}>
            <ChannelTab
              channelKey="tiktok"
              channelData={getChannelData('tiktok')}
              liveFeed={feed.filter((m) => m.includes('[tiktok]'))}
            />
            <ComingSoonOverlay
              title={kloelT(`Em breve`)}
              description={kloelT(`TikTok Marketing esta sendo finalizado.`)}
            />
          </div>
        )}
        {tab === 'facebook' && (
          <div style={{ position: 'relative' }}>
            <ChannelTab
              channelKey="facebook"
              channelData={getChannelData('facebook')}
              liveFeed={feed.filter((m) => m.includes('[facebook]'))}
              metaConnected={metaConnected}
              connectionStatus={connectionStatus}
              onConnectMeta={handleConnectMeta}
              onConnectEmail={handleConnectEmail}
              onDisconnectEmail={handleDisconnectEmail}
              onSendEmailTest={handleSendEmailTest}
              connectingKey={connectingKey}
              emailTestSending={emailTestSending}
              emailTestResult={emailTestResult}
            />
            <ComingSoonOverlay
              title={kloelT(`Em breve`)}
              description={kloelT(`Facebook Messenger esta sendo finalizado.`)}
            />
          </div>
        )}
        {tab === 'email' && (
          <div style={{ position: 'relative' }}>
            <ChannelTab
              channelKey="email"
              channelData={getChannelData('email')}
              liveFeed={feed.filter((m) => m.includes('[email]'))}
              mode={requestedMode}
              operator={userEmail || null}
              connectionStatus={connectionStatus}
              onConnectMeta={handleConnectMeta}
              onConnectEmail={handleConnectEmail}
              onDisconnectEmail={handleDisconnectEmail}
              onSendEmailTest={handleSendEmailTest}
              connectingKey={connectingKey}
              emailTestSending={emailTestSending}
              emailTestResult={emailTestResult}
            />
            <ComingSoonOverlay
              title={kloelT(`Em breve`)}
              description={kloelT(`Email Marketing esta sendo finalizado.`)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
