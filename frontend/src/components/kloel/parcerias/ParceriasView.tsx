'use client';

import { kloelT } from '@/lib/i18n/t';
import {
  createAffiliate,
  inviteCollaborator,
  markPartnerAsRead,
  revokeAffiliate,
  sendPartnerMessage,
  useAffiliateStats,
  useAffiliates,
  useCollaboratorStats,
  useCollaborators,
  usePartnerChatContacts,
  usePartnerMessages,
} from '@/hooks/usePartnerships';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { affiliateApi, partnershipsApi } from '@/lib/api/misc';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { buildPayUrl } from '@/lib/subdomains';
import { usePathname, useRouter } from 'next/navigation';
import { startTransition, useEffect, useRef, useState, useId } from 'react';
import useSWR from 'swr';
import { IC } from './ParceriasView.icons';
import { colors } from '@/lib/design-tokens';

/* ── Local view types (mirrors API shape) ── */
interface Agent {
  id?: string;
  name?: string;
  email?: string;
  status?: string;
  role?: string;
  lastActive?: string;
}

interface Invite {
  id?: string;
  email?: string;
  role?: string;
}

interface Affiliate {
  id?: string;
  name?: string;
  email?: string;
  type?: string;
  status?: string;
  revenue?: number;
  commission?: number;
  temperature?: number;
  totalSales?: number;
  products?: string[];
  joined?: string;
  monthlyPerformance?: number[];
}

interface AffiliatePerformance {
  totalSales?: number;
  totalRevenue?: number;
  commission?: number;
  monthlyPerformance?: number[];
}

interface AffiliateLink {
  id: string;
  affiliateProduct?: { productId?: string };
  url?: string;
  code?: string;
  clicks?: number;
  sales?: number;
  revenue?: number;
  commission?: number;
  commissionEarned?: number;
}

interface AffiliateSuggestion {
  id: string;
  productId?: string;
  commissionPct?: number;
  category?: string;
}

interface PartnerContact {
  id: string;
  name?: string;
  unread?: number;
  lastMessage?: string;
  avatar?: string;
  type?: string;
  online?: boolean;
  time?: string;
}

interface PartnerMessage {
  id?: string;
  text?: string;
  sender?: string;
  createdAt?: string;
  content?: string;
  time?: string;
  isMe?: boolean;
}

/* ═══════════════════════════════════════════════
   DESIGN TOKENS
   ═══════════════════════════════════════════════ */

const C = {
  bg: KLOEL_THEME.bgPrimary,
  bgOverlay: KLOEL_THEME.bgOverlay,
  card: KLOEL_THEME.bgCard,
  elevated: KLOEL_THEME.bgSecondary,
  border: KLOEL_THEME.borderPrimary,
  divider: KLOEL_THEME.borderSubtle,
  text: KLOEL_THEME.textPrimary,
  textOnAccent: KLOEL_THEME.textOnAccent,
  secondary: KLOEL_THEME.textSecondary,
  muted: KLOEL_THEME.textTertiary,
  ember: KLOEL_THEME.accent,
  emberBg: KLOEL_THEME.accentLight,
  emberGlow: KLOEL_THEME.accentLight,
  emberStrong: KLOEL_THEME.accentMedium,
  success: KLOEL_THEME.success,
  successBg: KLOEL_THEME.successBg,
  warning: KLOEL_THEME.warning,
  warningBg: KLOEL_THEME.warningBg,
  error: KLOEL_THEME.error,
  errorBg: KLOEL_THEME.errorBg,
  info: KLOEL_THEME.info,
  infoBg: KLOEL_THEME.infoBg,
};

const FONT = {
  sans: "'Sora', sans-serif",
  mono: "'JetBrains Mono', monospace",
};

const MONTH_LABELS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;

/* ═══════════════════════════════════════════════
   INLINE SVG ICONS — extracted into ParceriasView.icons.tsx
   (see the import at the top of this file)
   ═══════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════
   ROLES CONFIG
   ═══════════════════════════════════════════════ */

const ROLES: { value: string; label: string; color: string }[] = [
  { value: 'admin', label: 'Admin', color: 'colors.ember.primary' },
  { value: 'manager', label: 'Manager', color: '#3B82F6' },
  { value: 'support', label: 'Support', color: '#10B981' },
  { value: 'finance', label: 'Finance', color: '#F59E0B' },
  { value: 'viewer', label: 'Viewer', color: 'var(--app-text-secondary)' },
];

/* ═══════════════════════════════════════════════
   (mock fallback data removed – real hooks only)
   ═══════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════
   HELPER: TempBar
   ═══════════════════════════════════════════════ */

function TempBar({ value, max, color = C.ember }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div
      style={{
        width: '100%',
        height: 4,
        background: C.elevated,
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          borderRadius: 2,
          transition: 'width 300ms ease',
        }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════ */

export default function ParceriasView({ defaultTab = 'colaboradores' }: { defaultTab?: string }) {
  const { isMobile } = useResponsiveViewport();
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState(defaultTab);
  const [search, setSearch] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showAffiliateInviteModal, setShowAffiliateInviteModal] = useState(false);
  const [selectedChat, setSelectedChat] = useState<PartnerContact | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<PartnerMessage[]>([]);
  const [filterType, setFilterType] = useState('todos');
  const [detailId, setDetailId] = useState<string | null>(null);

  const handleTabChange = (t: string) => {
    setTab(t);
    const routes: Record<string, string> = {
      colaboradores: '/parcerias/colaboradores',
      afiliados: '/parcerias/afiliados',
      chat: '/parcerias/chat',
    };
    const nextRoute = routes[t] || '/parcerias';
    if (pathname === nextRoute) {
      return;
    }
    startTransition(() => {
      router.push(nextRoute);
    });
  };

  const TABS: { key: string; label: string; icon: (s: number) => React.ReactElement }[] = [
    { key: 'colaboradores', label: 'Central de Colaboradores', icon: IC.shield },
    { key: 'afiliados', label: 'Afiliados e Produtores', icon: IC.users },
    { key: 'chat', label: 'Chat', icon: IC.chat },
  ];

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        background: C.bg,
        color: C.text,
        fontFamily: FONT.sans,
        overflow: 'auto',
      }}
    >
      {/* CSS keyframes + scrollbar styles */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${C.muted}; }
      `}</style>

      {/* Header */}
      <div
        style={{
          padding: isMobile ? '20px 16px 0' : '28px 32px 0',
          maxWidth: 1200,
          margin: '0 auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: isMobile ? 'flex-start' : 'center',
            flexDirection: isMobile ? 'column' : 'row',
            gap: 12,
            marginBottom: 4,
          }}
        >
          <span style={{ color: C.ember }}>{IC.users(22)}</span>
          <h1
            style={{
              fontFamily: FONT.sans,
              fontSize: 22,
              fontWeight: 700,
              color: C.text,
              letterSpacing: '-0.01em',
              margin: 0,
            }}
          >
            {kloelT(`Parcerias`)}
          </h1>
        </div>
        <p
          style={{ fontFamily: FONT.sans, fontSize: 13, color: C.secondary, margin: '4px 0 20px' }}
        >
          {kloelT(`Gerencie colaboradores, afiliados e comunicacao com parceiros`)}
        </p>

        {/* Tab Bar */}
        <div
          style={{
            display: 'flex',
            gap: 0,
            borderBottom: `1px solid ${C.divider}`,
            overflowX: 'auto',
            paddingBottom: 2,
          }}
        >
          {TABS.map((t) => {
            const isActive = tab === t.key;
            return (
              <button
                type="button"
                key={t.key}
                onClick={() => handleTabChange(t.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: isMobile ? '10px 14px' : '10px 20px',
                  background: 'none',
                  border: 'none',
                  borderBottom: isActive ? `2px solid ${C.ember}` : '2px solid transparent',
                  color: isActive ? C.text : C.secondary,
                  fontFamily: FONT.sans,
                  fontSize: isMobile ? 12 : 13,
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                  marginBottom: -1,
                }}
              >
                <span style={{ color: isActive ? C.ember : C.secondary }}>{t.icon(15)}</span>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div
        style={{
          padding: isMobile ? '20px 16px 40px' : '24px 32px 48px',
          maxWidth: 1200,
          margin: '0 auto',
        }}
      >
        {tab === 'colaboradores' && (
          <TabColaboradores
            search={search}
            setSearch={setSearch}
            showInviteModal={showInviteModal}
            setShowInviteModal={setShowInviteModal}
          />
        )}
        {tab === 'afiliados' && (
          <TabAfiliados
            search={search}
            setSearch={setSearch}
            filterType={filterType}
            setFilterType={setFilterType}
            detailId={detailId}
            setDetailId={setDetailId}
            setShowAffiliateInviteModal={setShowAffiliateInviteModal}
          />
        )}
        {tab === 'chat' && (
          <TabChat
            selectedChat={selectedChat}
            setSelectedChat={setSelectedChat}
            chatInput={chatInput}
            setChatInput={setChatInput}
            messages={messages}
            setMessages={setMessages}
            search={search}
            setSearch={setSearch}
          />
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && <InviteModal onClose={() => setShowInviteModal(false)} />}
      {showAffiliateInviteModal && (
        <AffiliateInviteModal onClose={() => setShowAffiliateInviteModal(false)} />
      )}
    </div>
  );
}
