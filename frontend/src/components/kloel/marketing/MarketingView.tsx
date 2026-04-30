'use client';

import { kloelT, kloelError } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
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
import { secureRandomFloat } from '@/lib/secure-random';

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
    color: '#25D366', // PULSE_VISUAL_OK: WhatsApp brand green
    backendKey: 'WHATSAPP',
    hasIntegration: true,
  },
  instagram: {
    icon: IC.ig,
    label: 'Instagram',
    color: '#E1306C', // PULSE_VISUAL_OK: Instagram brand gradient
    backendKey: 'INSTAGRAM',
    hasIntegration: false,
  },
  tiktok: {
    icon: IC.tt,
    label: 'TikTok',
    color: '#ff0050', // PULSE_VISUAL_OK: TikTok brand pink
    backendKey: 'TIKTOK',
    hasIntegration: false,
  },
  facebook: {
    icon: IC.fb,
    label: 'Facebook',
    color: '#1877F2', // PULSE_VISUAL_OK: Facebook brand blue
    backendKey: 'MESSENGER',
    hasIntegration: false,
  },
  email: {
    icon: IC.em,
    label: 'Email',
    color: '#F59E0B', // PULSE_VISUAL_OK: email amber indicator
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
const FmtMoney = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

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
      const spike = secureRandomFloat() > 0.97 ? (secureRandomFloat() - 0.5) * h * 0.6 : 0;
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
import "../../../__companions__/MarketingView.companion";
