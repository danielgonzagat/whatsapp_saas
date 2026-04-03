'use client';

import { useState, useRef, useEffect, startTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { buildPayUrl } from '@/lib/subdomains';
import {
  useCollaborators,
  useCollaboratorStats,
  useAffiliates,
  useAffiliateStats,
  usePartnerChatContacts,
  usePartnerMessages,
  inviteCollaborator,
  sendPartnerMessage,
  markPartnerAsRead,
  revokeAffiliate,
} from '@/hooks/usePartnerships';
import { affiliateApi, partnershipsApi } from '@/lib/api/misc';

/* ── Local view types (mirrors API shape) ── */
interface Agent {
  id?: string;
  name?: string;
  email?: string;
  status?: string;
  role?: string;
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
}

interface PartnerContact {
  id: string;
  name?: string;
  unread?: number;
  lastMessage?: string;
  avatar?: string;
}

interface PartnerMessage {
  id?: string;
  text?: string;
  sender?: string;
  createdAt?: string;
}

/* ═══════════════════════════════════════════════
   DESIGN TOKENS
   ═══════════════════════════════════════════════ */

const C = {
  bg: '#0A0A0C',
  card: '#111113',
  elevated: '#19191C',
  border: '#222226',
  divider: '#19191C',
  text: '#E0DDD8',
  secondary: '#6E6E73',
  muted: '#3A3A3F',
  ember: '#E85D30',
  emberBg: 'rgba(232,93,48,0.06)',
  emberGlow: 'rgba(232,93,48,0.10)',
  emberStrong: 'rgba(232,93,48,0.15)',
};

const FONT = {
  sans: "'Sora', sans-serif",
  mono: "'JetBrains Mono', monospace",
};

/* ═══════════════════════════════════════════════
   INLINE SVG ICONS (IC object)
   ═══════════════════════════════════════════════ */

const IC = {
  users: (s: number): React.ReactElement => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  user: (s: number): React.ReactElement => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  send: (s: number): React.ReactElement => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
  search: (s: number): React.ReactElement => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  plus: (s: number): React.ReactElement => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  x: (s: number): React.ReactElement => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  check: (s: number): React.ReactElement => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  star: (s: number): React.ReactElement => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  shield: (s: number): React.ReactElement => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  link: (s: number): React.ReactElement => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  copy: (s: number): React.ReactElement => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  dollar: (s: number): React.ReactElement => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  trend: (s: number): React.ReactElement => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  mail: (s: number): React.ReactElement => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  clock: (s: number): React.ReactElement => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  ban: (s: number): React.ReactElement => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  ),
  edit: (s: number): React.ReactElement => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  chat: (s: number): React.ReactElement => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  box: (s: number): React.ReactElement => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  ext: (s: number): React.ReactElement => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  ),
};

/* ═══════════════════════════════════════════════
   ROLES CONFIG
   ═══════════════════════════════════════════════ */

const ROLES: { value: string; label: string; color: string }[] = [
  { value: 'admin', label: 'Admin', color: '#E85D30' },
  { value: 'manager', label: 'Manager', color: '#3B82F6' },
  { value: 'support', label: 'Support', color: '#10B981' },
  { value: 'finance', label: 'Finance', color: '#F59E0B' },
  { value: 'viewer', label: 'Viewer', color: '#6E6E73' },
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
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState(defaultTab);
  const [search, setSearch] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
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
    if (pathname === nextRoute) return;
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
      <div style={{ padding: '28px 32px 0', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
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
            Parcerias
          </h1>
        </div>
        <p
          style={{ fontFamily: FONT.sans, fontSize: 13, color: C.secondary, margin: '4px 0 20px' }}
        >
          Gerencie colaboradores, afiliados e comunicacao com parceiros
        </p>

        {/* Tab Bar */}
        <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.divider}` }}>
          {TABS.map((t) => {
            const isActive = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => handleTabChange(t.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 20px',
                  background: 'none',
                  border: 'none',
                  borderBottom: isActive ? `2px solid ${C.ember}` : '2px solid transparent',
                  color: isActive ? C.text : C.secondary,
                  fontFamily: FONT.sans,
                  fontSize: 13,
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
      <div style={{ padding: '24px 32px 48px', maxWidth: 1200, margin: '0 auto' }}>
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
    </div>
  );
}

/* ═══════════════════════════════════════════════
   INVITE MODAL
   ═══════════════════════════════════════════════ */

function InviteModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('manager');
  const [sending, setSending] = useState(false);

  const inviteRoles = ROLES.filter((r) => r.value !== 'admin');

  const handleSubmit = async () => {
    if (!email.trim()) return;
    setSending(true);
    try {
      await inviteCollaborator({ email, role });
      onClose();
    } catch (e) {
      console.error('Failed to invite', e);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
        }}
      />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 440,
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          padding: 28,
          animation: 'slideIn 200ms ease',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          <span style={{ color: C.secondary }}>{IC.x(16)}</span>
        </button>
        <h2
          style={{
            fontFamily: FONT.sans,
            fontSize: 18,
            fontWeight: 700,
            color: C.text,
            margin: '0 0 4px',
          }}
        >
          Convidar Colaborador
        </h2>
        <p style={{ fontFamily: FONT.sans, fontSize: 13, color: C.secondary, margin: '0 0 24px' }}>
          Envie um convite por email para adicionar um novo membro a equipe.
        </p>

        {/* Email */}
        <label
          style={{
            fontFamily: FONT.sans,
            fontSize: 12,
            fontWeight: 500,
            color: C.secondary,
            display: 'block',
            marginBottom: 6,
          }}
        >
          Email
        </label>
        <input
          aria-label="Email do colaborador"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="colaborador@email.com"
          style={{
            width: '100%',
            padding: '10px 14px',
            background: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            color: C.text,
            fontFamily: FONT.sans,
            fontSize: 13,
            outline: 'none',
            marginBottom: 16,
            boxSizing: 'border-box' as const,
          }}
        />

        {/* Role selector (4 roles, no admin) */}
        <label
          style={{
            fontFamily: FONT.sans,
            fontSize: 12,
            fontWeight: 500,
            color: C.secondary,
            display: 'block',
            marginBottom: 6,
          }}
        >
          Funcao
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
          {inviteRoles.map((r) => (
            <button
              key={r.value}
              onClick={() => setRole(r.value)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                background: role === r.value ? C.emberBg : C.bg,
                border: `1px solid ${role === r.value ? C.ember : C.border}`,
                borderRadius: 6,
                cursor: 'pointer',
                textAlign: 'left' as const,
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.color }} />
              <span style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 500, color: C.text }}>
                {r.label}
              </span>
              {role === r.value && (
                <span style={{ marginLeft: 'auto', color: C.ember }}>{IC.check(14)}</span>
              )}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 18px',
              background: 'none',
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              color: C.secondary,
              fontFamily: FONT.sans,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={sending || !email.trim()}
            style={{
              padding: '9px 22px',
              background: C.ember,
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontFamily: FONT.sans,
              fontSize: 13,
              fontWeight: 600,
              cursor: sending ? 'wait' : 'pointer',
              opacity: !email.trim() ? 0.5 : 1,
            }}
          >
            {sending ? 'Enviando...' : 'Enviar Convite'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   AFFILIATE DETAIL MODAL
   ═══════════════════════════════════════════════ */

function AffiliateDetailModal({
  affiliate,
  onClose,
  onChat,
  onRevoke,
}: {
  affiliate: any;
  onClose: () => void;
  onChat: () => void;
  onRevoke: () => void;
}) {
  const router = useRouter();
  const a = affiliate || {};
  const [perfData, setPerfData] = useState<any>(null);
  const [perfLoading, setPerfLoading] = useState(false);

  useEffect(() => {
    if (!a.id) return;
    setPerfLoading(true);
    partnershipsApi
      .affiliatePerformance(a.id)
      .then((res) => {
        if (!res.error && res.data) setPerfData(res.data);
      })
      .catch(() => {})
      .finally(() => setPerfLoading(false));
  }, [a.id]);

  const totalSales = perfData?.totalSales ?? a.totalSales ?? 0;
  const totalRevenue = perfData?.totalRevenue ?? a.revenue ?? 0;
  const commission = perfData?.commission ?? a.commission ?? 0;

  const statCards = [
    { label: 'Vendas', value: totalSales, icon: IC.box, color: C.text },
    { label: 'Comissao', value: `${commission}%`, icon: IC.dollar, color: C.ember },
    {
      label: 'Receita',
      value: `R$ ${Number(totalRevenue).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`,
      icon: IC.trend,
      color: C.text,
    },
    {
      label: 'Temperatura',
      value: `${a.temperature || 0}`,
      icon: IC.star,
      color: (a.temperature || 0) > 70 ? '#10B981' : '#F59E0B',
    },
  ];

  // Performance chart — use real data from performance endpoint or fall back to empty
  const chartData =
    perfData?.monthlyPerformance || (a as any).monthlyPerformance || new Array(12).fill(0);
  const chartMax = Math.max(...chartData, 1);

  const handleCopyLink = () => {
    navigator.clipboard
      .writeText(
        `${process.env.NEXT_PUBLIC_SITE_URL || 'https://kloel.com'}/ref/${a.id || 'unknown'}`,
      )
      .catch(() => {});
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
        }}
      />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 560,
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          padding: 28,
          maxHeight: '85vh',
          overflowY: 'auto' as const,
          animation: 'slideIn 200ms ease',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          <span style={{ color: C.secondary }}>{IC.x(16)}</span>
        </button>

        {/* Profile header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: a.type === 'producer' ? 'rgba(139,92,246,0.12)' : C.emberBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: FONT.sans,
              fontSize: 22,
              fontWeight: 700,
              color: a.type === 'producer' ? '#8B5CF6' : C.ember,
            }}
          >
            {(a.name || '?')[0].toUpperCase()}
          </div>
          <div>
            <h2
              style={{
                fontFamily: FONT.sans,
                fontSize: 18,
                fontWeight: 700,
                color: C.text,
                margin: 0,
              }}
            >
              {a.name}
            </h2>
            <p
              style={{
                fontFamily: FONT.sans,
                fontSize: 13,
                color: C.secondary,
                margin: '2px 0 6px',
              }}
            >
              {a.email}
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: FONT.sans,
                  color: a.type === 'producer' ? '#8B5CF6' : C.ember,
                  background: a.type === 'producer' ? 'rgba(139,92,246,0.15)' : C.emberStrong,
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase' as const,
                }}
              >
                {a.type === 'producer' ? 'Produtor' : 'Afiliado'}
              </span>
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: FONT.sans,
                  color: a.status === 'active' ? '#10B981' : '#F59E0B',
                  background:
                    a.status === 'active' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase' as const,
                }}
              >
                {a.status === 'active' ? 'Ativo' : 'Pendente'}
              </span>
            </div>
          </div>
        </div>

        {/* TempBar */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontFamily: FONT.sans, fontSize: 11, color: C.secondary }}>
              Temperatura
            </span>
            <span
              style={{
                fontFamily: FONT.mono,
                fontSize: 11,
                color: (a.temperature || 0) > 70 ? '#10B981' : '#F59E0B',
                fontWeight: 600,
              }}
            >
              {a.temperature || 0}%
            </span>
          </div>
          <TempBar
            value={a.temperature || 0}
            max={100}
            color={(a.temperature || 0) > 70 ? '#10B981' : '#F59E0B'}
          />
        </div>

        {/* 4 stat cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 10,
            marginBottom: 20,
            opacity: perfLoading ? 0.5 : 1,
            transition: 'opacity 200ms ease',
          }}
        >
          {statCards.map((sc, i) => (
            <div
              key={i}
              style={{
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                padding: '14px 12px',
                textAlign: 'center' as const,
              }}
            >
              <span style={{ color: C.muted }}>{sc.icon(14)}</span>
              <div
                style={{
                  fontFamily: FONT.mono,
                  fontSize: 18,
                  fontWeight: 700,
                  color: sc.color,
                  marginTop: 4,
                }}
              >
                {sc.value}
              </div>
              <div style={{ fontFamily: FONT.sans, fontSize: 10, color: C.muted, marginTop: 2 }}>
                {sc.label}
              </div>
            </div>
          ))}
        </div>

        {/* Performance chart (simple bar chart) */}
        <div style={{ marginBottom: 20 }}>
          <h4
            style={{
              fontFamily: FONT.sans,
              fontSize: 12,
              fontWeight: 600,
              color: C.secondary,
              marginBottom: 10,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.04em',
            }}
          >
            Performance (12 meses)
          </h4>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 4,
              height: 80,
              background: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: '12px 14px',
            }}
          >
            {chartData.map((v: any, i: number) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: `${(v / chartMax) * 56}px`,
                    background: C.ember,
                    borderRadius: 2,
                    opacity: 0.6 + (v / chartMax) * 0.4,
                    transition: 'height 300ms ease',
                  }}
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontFamily: FONT.sans, fontSize: 9, color: C.muted }}>Jan</span>
            <span style={{ fontFamily: FONT.sans, fontSize: 9, color: C.muted }}>Jun</span>
            <span style={{ fontFamily: FONT.sans, fontSize: 9, color: C.muted }}>Dez</span>
          </div>
        </div>

        {/* Products list */}
        <div style={{ marginBottom: 20 }}>
          <h4
            style={{
              fontFamily: FONT.sans,
              fontSize: 12,
              fontWeight: 600,
              color: C.secondary,
              marginBottom: 10,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.04em',
            }}
          >
            Produtos
          </h4>
          {a.products && a.products.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
              {a.products.map((p: string, i: number) => (
                <span
                  key={i}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    background: C.bg,
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    fontFamily: FONT.sans,
                    fontSize: 12,
                    color: C.text,
                  }}
                >
                  <span style={{ color: C.muted }}>{IC.box(12)}</span>
                  {p}
                </span>
              ))}
            </div>
          ) : (
            <p style={{ fontFamily: FONT.sans, fontSize: 12, color: C.muted }}>
              Nenhum produto vinculado
            </p>
          )}
        </div>

        {/* Details */}
        <div style={{ borderTop: `1px solid ${C.divider}`, paddingTop: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontFamily: FONT.sans, fontSize: 12, color: C.secondary }}>
              Membro desde
            </span>
            <span style={{ fontFamily: FONT.sans, fontSize: 12, color: C.text }}>
              {a.joined ? new Date(a.joined).toLocaleDateString('pt-BR') : '--'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontFamily: FONT.sans, fontSize: 12, color: C.secondary }}>
              Comissao efetiva
            </span>
            <span style={{ fontFamily: FONT.mono, fontSize: 12, color: C.ember, fontWeight: 600 }}>
              R${' '}
              {(((a.revenue || 0) * (a.commission || 0)) / 100).toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <h4
            style={{
              fontFamily: FONT.sans,
              fontSize: 12,
              fontWeight: 600,
              color: C.secondary,
              marginBottom: 10,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.04em',
            }}
          >
            Operacao
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              {
                label: 'Produtos',
                sub: 'Coproducoes e comissoes',
                action: () => router.push('/products?feature=coproducoes'),
              },
              {
                label: 'Vendas',
                sub: 'Estrategias e pipeline',
                action: () => router.push('/vendas?tab=estrategias'),
              },
              {
                label: 'Carteira',
                sub: 'Repasses e saque',
                action: () => router.push('/carteira/saldo'),
              },
            ].map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                style={{
                  textAlign: 'left' as const,
                  padding: '12px 14px',
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, color: C.text }}
                >
                  {item.label}
                </div>
                <div
                  style={{ fontFamily: FONT.sans, fontSize: 10, color: C.secondary, marginTop: 4 }}
                >
                  {item.sub}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onChat}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '10px 16px',
              background: C.ember,
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontFamily: FONT.sans,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <span style={{ color: '#fff' }}>{IC.chat(14)}</span>
            Abrir chat
          </button>
          <button
            onClick={handleCopyLink}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '10px 16px',
              background: 'none',
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              color: C.text,
              fontFamily: FONT.sans,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <span style={{ color: C.secondary }}>{IC.copy(14)}</span>
            Copiar link
          </button>
          <button
            onClick={onRevoke}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '10px 16px',
              background: 'none',
              border: `1px solid rgba(239,68,68,0.3)`,
              borderRadius: 6,
              color: '#EF4444',
              fontFamily: FONT.sans,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <span style={{ color: '#EF4444' }}>{IC.ban(14)}</span>
            Revogar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB: COLABORADORES
   ═══════════════════════════════════════════════ */

function TabColaboradores({
  search,
  setSearch,
  showInviteModal,
  setShowInviteModal,
}: {
  search: string;
  setSearch: (s: string) => void;
  showInviteModal: boolean;
  setShowInviteModal: (v: boolean) => void;
}) {
  const { agents, invites, mutate } = useCollaborators();
  const { stats } = useCollaboratorStats();
  const displayAgents = agents as Agent[];

  const total = stats?.total || displayAgents.length;
  const online = stats?.online || displayAgents.filter((a: any) => a.status === 'online').length;
  const pendingInvites = stats?.pendingInvites || (invites as Invite[]).length || 0;
  const rolesUsed = [...new Set(displayAgents.map((a: any) => a.role))].length;

  const filtered = displayAgents.filter((c: any) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      (c.name || '').toLowerCase().includes(term) || (c.email || '').toLowerCase().includes(term)
    );
  });

  return (
    <div style={{ animation: 'fadeIn 300ms ease' }}>
      {/* 4 stat cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '20px 20px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{ fontFamily: FONT.sans, fontSize: 12, color: C.secondary, fontWeight: 500 }}
            >
              Total Colaboradores
            </span>
            <span style={{ color: C.muted }}>{IC.users(16)}</span>
          </div>
          <span
            style={{
              fontFamily: FONT.mono,
              fontSize: 24,
              fontWeight: 700,
              color: C.text,
              letterSpacing: '-0.02em',
            }}
          >
            {total}
          </span>
        </div>
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '20px 20px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{ fontFamily: FONT.sans, fontSize: 12, color: C.secondary, fontWeight: 500 }}
            >
              Online Agora
            </span>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
          </div>
          <span
            style={{
              fontFamily: FONT.mono,
              fontSize: 24,
              fontWeight: 700,
              color: C.text,
              letterSpacing: '-0.02em',
            }}
          >
            {online}
          </span>
          <span style={{ fontFamily: FONT.sans, fontSize: 11, color: C.muted }}>
            ativos no momento
          </span>
        </div>
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '20px 20px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{ fontFamily: FONT.sans, fontSize: 12, color: C.secondary, fontWeight: 500 }}
            >
              Convites Pendentes
            </span>
            <span style={{ color: C.muted }}>{IC.mail(16)}</span>
          </div>
          <span
            style={{
              fontFamily: FONT.mono,
              fontSize: 24,
              fontWeight: 700,
              color: C.text,
              letterSpacing: '-0.02em',
            }}
          >
            {pendingInvites}
          </span>
        </div>
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '20px 20px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{ fontFamily: FONT.sans, fontSize: 12, color: C.secondary, fontWeight: 500 }}
            >
              Funcoes Ativas
            </span>
            <span style={{ color: C.muted }}>{IC.shield(16)}</span>
          </div>
          <span
            style={{
              fontFamily: FONT.mono,
              fontSize: 24,
              fontWeight: 700,
              color: C.text,
              letterSpacing: '-0.02em',
            }}
          >
            {rolesUsed}
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
          gap: 12,
        }}
      >
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <div
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: C.muted,
            }}
          >
            {IC.search(14)}
          </div>
          <input
            aria-label="Buscar colaborador"
            type="text"
            placeholder="Buscar colaborador..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 14px 9px 34px',
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              color: C.text,
              fontFamily: FONT.sans,
              fontSize: 13,
              outline: 'none',
              boxSizing: 'border-box' as const,
            }}
          />
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '9px 18px',
            background: C.ember,
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            fontFamily: FONT.sans,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <span style={{ color: '#fff' }}>{IC.plus(14)}</span>
          Convidar
        </button>
      </div>

      {/* Table header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '44px 1fr 160px 100px 100px 120px',
          gap: 14,
          padding: '10px 18px',
          marginBottom: 4,
        }}
      >
        <span />
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 11,
            color: C.muted,
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
          }}
        >
          Nome
        </span>
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 11,
            color: C.muted,
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
          }}
        >
          Email
        </span>
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 11,
            color: C.muted,
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
          }}
        >
          Funcao
        </span>
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 11,
            color: C.muted,
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
          }}
        >
          Status
        </span>
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 11,
            color: C.muted,
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
          }}
        >
          Ultimo acesso
        </span>
      </div>

      {/* Collaborators list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.map((c: any) => {
          const roleConf = ROLES.find((r) => r.value === c.role) || ROLES[ROLES.length - 1];
          return (
            <div
              key={c.id || c.email}
              style={{
                display: 'grid',
                gridTemplateColumns: '44px 1fr 160px 100px 100px 120px',
                gap: 14,
                alignItems: 'center',
                padding: '14px 18px',
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                transition: 'border-color 150ms ease',
              }}
            >
              {/* Avatar */}
              <div style={{ position: 'relative' }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: C.elevated,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: FONT.sans,
                    fontSize: 15,
                    fontWeight: 600,
                    color: C.text,
                  }}
                >
                  {(c.name || c.email || '?')[0].toUpperCase()}
                </div>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: c.status === 'online' ? '#10B981' : C.muted,
                    border: `2px solid ${C.card}`,
                    position: 'absolute' as const,
                    bottom: 0,
                    right: 0,
                  }}
                />
              </div>

              {/* Name */}
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: FONT.sans,
                    fontSize: 14,
                    fontWeight: 600,
                    color: C.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap' as const,
                  }}
                >
                  {c.name}
                </div>
              </div>

              {/* Email */}
              <div
                style={{
                  fontFamily: FONT.sans,
                  fontSize: 12,
                  color: C.secondary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap' as const,
                }}
              >
                {c.email}
              </div>

              {/* Role badge */}
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: FONT.sans,
                  color: roleConf.color,
                  background: `${roleConf.color}15`,
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase' as const,
                  width: 'fit-content',
                }}
              >
                {roleConf.label}
              </span>

              {/* Status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: c.status === 'online' ? '#10B981' : C.muted,
                  }}
                />
                <span
                  style={{
                    fontFamily: FONT.sans,
                    fontSize: 12,
                    color: c.status === 'online' ? '#10B981' : C.muted,
                  }}
                >
                  {c.status === 'online' ? 'Online' : 'Offline'}
                </span>
              </div>

              {/* Date */}
              <span
                style={{
                  fontFamily: FONT.sans,
                  fontSize: 11,
                  color: C.muted,
                  whiteSpace: 'nowrap' as const,
                }}
              >
                {c.lastActive || ''}
              </span>
            </div>
          );
        })}

        {filtered.length === 0 && displayAgents.length === 0 && (
          <div
            style={{
              background: '#111113',
              border: '1px solid #222226',
              borderRadius: 6,
              padding: '60px 20px',
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: 14, color: '#3A3A3F', display: 'block', marginBottom: 8 }}>
              Nenhum colaborador cadastrado
            </span>
            <span style={{ fontSize: 12, color: '#3A3A3F' }}>
              Convide colaboradores para gerenciar seu workspace
            </span>
          </div>
        )}
        {filtered.length === 0 && displayAgents.length > 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: 48,
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
            }}
          >
            <span style={{ color: C.muted }}>{IC.users(32)}</span>
            <p style={{ fontFamily: FONT.sans, fontSize: 14, color: C.secondary, marginTop: 12 }}>
              Nenhum colaborador encontrado
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB: AFILIADOS
   ═══════════════════════════════════════════════ */

function TabAfiliados({
  search,
  setSearch,
  filterType,
  setFilterType,
  detailId,
  setDetailId,
}: {
  search: string;
  setSearch: (s: string) => void;
  filterType: string;
  setFilterType: (s: string) => void;
  detailId: string | null;
  setDetailId: (id: string | null) => void;
}) {
  const router = useRouter();
  const { affiliates, mutate: mutateAffiliates } = useAffiliates({ type: filterType, search });
  const { stats: affStats } = useAffiliateStats();
  const displayAffiliates = affiliates as Affiliate[];

  const activeAffiliates =
    affStats?.activeAffiliates ||
    displayAffiliates.filter((a: any) => a.status === 'active' && a.type === 'affiliate').length;
  const producers =
    affStats?.producers || displayAffiliates.filter((a: any) => a.type === 'producer').length;
  const totalRevenue =
    affStats?.totalRevenue ||
    displayAffiliates.reduce((sum: number, a: any) => sum + (a.revenue || 0), 0);
  const totalCommissions =
    affStats?.totalCommissions ||
    displayAffiliates.reduce(
      (sum: number, a: any) => sum + ((a.revenue || 0) * (a.commission || 0)) / 100,
      0,
    );
  const topPartner =
    affStats?.topPartner ||
    displayAffiliates.reduce(
      (top: any, a: any) => (!top || (a.revenue || 0) > (top.revenue || 0) ? a : top),
      null,
    )?.name ||
    null;

  const filtered = displayAffiliates.filter((a: any) => {
    if (filterType !== 'todos' && a.type !== filterType) return false;
    if (search) {
      const term = search.toLowerCase();
      return (
        (a.name || '').toLowerCase().includes(term) || (a.email || '').toLowerCase().includes(term)
      );
    }
    return true;
  });

  const maxRevenue = Math.max(...filtered.map((a: any) => a.revenue || 0), 1);

  const FILTER_OPTIONS = [
    { value: 'todos', label: 'Todos' },
    { value: 'affiliate', label: 'Afiliados' },
    { value: 'producer', label: 'Produtores' },
  ];

  const detailAffiliate = detailId ? displayAffiliates.find((a: any) => a.id === detailId) : null;

  const handleRevoke = async (id: string) => {
    try {
      await revokeAffiliate(id);
      mutateAffiliates();
      setDetailId(null);
    } catch (e) {
      console.error('Failed to revoke', e);
    }
  };

  return (
    <div style={{ animation: 'fadeIn 300ms ease' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 20,
        }}
      >
        {[
          {
            title: 'Ativar coproducoes',
            desc: 'Configure reparticao e alinhamento comercial no produto certo.',
            cta: 'Abrir Produtos',
            action: () => router.push('/products?feature=coproducoes'),
          },
          {
            title: 'Revisar estrategia',
            desc: 'Use Vendas para enxergar o impacto comercial das parcerias.',
            cta: 'Abrir Vendas',
            action: () => router.push('/vendas?tab=estrategias'),
          },
          {
            title: 'Acompanhar repasses',
            desc: 'Visualize saldo, saque e antecipacao do que entrou via parceiros.',
            cta: 'Abrir Carteira',
            action: () => router.push('/carteira/saldo'),
          },
          {
            title: 'Ajustar banco e billing',
            desc: 'Garanta conta destino e configuracao de repasse antes de escalar.',
            cta: 'Abrir Configuracoes',
            action: () => router.push('/settings?section=bank'),
          },
        ].map((card) => (
          <div
            key={card.title}
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: '16px 16px 14px',
            }}
          >
            <div
              style={{
                fontFamily: FONT.sans,
                fontSize: 13,
                fontWeight: 600,
                color: C.text,
                marginBottom: 6,
              }}
            >
              {card.title}
            </div>
            <div
              style={{
                fontFamily: FONT.sans,
                fontSize: 11,
                color: C.secondary,
                lineHeight: 1.5,
                minHeight: 34,
              }}
            >
              {card.desc}
            </div>
            <button
              onClick={card.action}
              style={{
                marginTop: 12,
                padding: '8px 14px',
                background: 'none',
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                color: C.text,
                fontFamily: FONT.sans,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {card.cta}
            </button>
          </div>
        ))}
      </div>

      {/* 5 stat cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 14,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '18px 16px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{ fontFamily: FONT.sans, fontSize: 11, color: C.secondary, fontWeight: 500 }}
            >
              Afiliados Ativos
            </span>
            <span style={{ color: C.muted }}>{IC.users(14)}</span>
          </div>
          <span style={{ fontFamily: FONT.mono, fontSize: 22, fontWeight: 700, color: C.text }}>
            {activeAffiliates}
          </span>
        </div>
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '18px 16px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{ fontFamily: FONT.sans, fontSize: 11, color: C.secondary, fontWeight: 500 }}
            >
              Produtores
            </span>
            <span style={{ color: C.muted }}>{IC.shield(14)}</span>
          </div>
          <span style={{ fontFamily: FONT.mono, fontSize: 22, fontWeight: 700, color: C.text }}>
            {producers}
          </span>
        </div>
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '18px 16px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{ fontFamily: FONT.sans, fontSize: 11, color: C.secondary, fontWeight: 500 }}
            >
              Receita Total
            </span>
            <span style={{ color: C.ember }}>{IC.trend(14)}</span>
          </div>
          <span style={{ fontFamily: FONT.mono, fontSize: 22, fontWeight: 700, color: C.text }}>
            R$ {Number(totalRevenue).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
          </span>
        </div>
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '18px 16px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{ fontFamily: FONT.sans, fontSize: 11, color: C.secondary, fontWeight: 500 }}
            >
              Comissoes Pagas
            </span>
            <span style={{ color: C.ember }}>{IC.dollar(14)}</span>
          </div>
          <span style={{ fontFamily: FONT.mono, fontSize: 22, fontWeight: 700, color: C.text }}>
            R$ {Number(totalCommissions).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
          </span>
        </div>
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '18px 16px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{ fontFamily: FONT.sans, fontSize: 11, color: C.secondary, fontWeight: 500 }}
            >
              Top Parceiro
            </span>
            <span style={{ color: C.ember }}>{IC.star(14)}</span>
          </div>
          <span
            style={{
              fontFamily: FONT.sans,
              fontSize: 14,
              fontWeight: 600,
              color: C.ember,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap' as const,
            }}
          >
            {topPartner || '--'}
          </span>
        </div>
      </div>

      {/* Filters + search */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
          gap: 12,
          flexWrap: 'wrap' as const,
        }}
      >
        <div style={{ display: 'flex', gap: 6 }}>
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilterType(opt.value)}
              style={{
                padding: '7px 14px',
                background: filterType === opt.value ? C.ember : C.card,
                border: `1px solid ${filterType === opt.value ? C.ember : C.border}`,
                borderRadius: 6,
                color: filterType === opt.value ? '#fff' : C.secondary,
                fontFamily: FONT.sans,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', width: 280 }}>
          <div
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: C.muted,
            }}
          >
            {IC.search(14)}
          </div>
          <input
            aria-label="Buscar parceiro"
            type="text"
            placeholder="Buscar parceiro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 14px 9px 34px',
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              color: C.text,
              fontFamily: FONT.sans,
              fontSize: 13,
              outline: 'none',
              boxSizing: 'border-box' as const,
            }}
          />
        </div>
      </div>

      {/* Table header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '46px 1fr 90px 70px 110px 90px 60px 100px',
          gap: 10,
          padding: '10px 18px',
          marginBottom: 4,
        }}
      >
        <span />
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 11,
            color: C.muted,
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
          }}
        >
          Parceiro
        </span>
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 11,
            color: C.muted,
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
          }}
        >
          Tipo
        </span>
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 11,
            color: C.muted,
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
            textAlign: 'right' as const,
          }}
        >
          Vendas
        </span>
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 11,
            color: C.muted,
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
            textAlign: 'right' as const,
          }}
        >
          Receita
        </span>
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 11,
            color: C.muted,
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
            textAlign: 'right' as const,
          }}
        >
          Comissao
        </span>
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 11,
            color: C.muted,
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
            textAlign: 'right' as const,
          }}
        >
          Taxa
        </span>
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 11,
            color: C.muted,
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
          }}
        >
          Temperatura
        </span>
      </div>

      {/* Affiliates list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.map((a: any) => (
          <div
            key={a.id || a.email}
            onClick={() => setDetailId(a.id)}
            style={{
              display: 'grid',
              gridTemplateColumns: '46px 1fr 90px 70px 110px 90px 60px 100px',
              gap: 10,
              alignItems: 'center',
              padding: '14px 18px',
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              cursor: 'pointer',
              transition: 'border-color 150ms ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = C.ember + '40';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = C.border;
            }}
          >
            {/* Avatar */}
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: a.type === 'producer' ? 'rgba(139,92,246,0.12)' : C.emberBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: FONT.sans,
                fontSize: 16,
                fontWeight: 600,
                color: a.type === 'producer' ? '#8B5CF6' : C.ember,
                flexShrink: 0,
              }}
            >
              {(a.name || '?')[0].toUpperCase()}
            </div>

            {/* Name + email */}
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: FONT.sans,
                  fontSize: 14,
                  fontWeight: 600,
                  color: C.text,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap' as const,
                }}
              >
                {a.name}
              </div>
              <div
                style={{
                  fontFamily: FONT.sans,
                  fontSize: 11,
                  color: C.secondary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap' as const,
                }}
              >
                {a.email}
              </div>
            </div>

            {/* Type badge */}
            <span
              style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 600,
                fontFamily: FONT.sans,
                width: 'fit-content',
                color: a.type === 'producer' ? '#8B5CF6' : C.ember,
                background: a.type === 'producer' ? 'rgba(139,92,246,0.15)' : C.emberStrong,
                letterSpacing: '0.02em',
                textTransform: 'uppercase' as const,
              }}
            >
              {a.type === 'producer' ? 'Produtor' : 'Afiliado'}
            </span>

            {/* Sales */}
            <div style={{ textAlign: 'right' as const }}>
              <span style={{ fontFamily: FONT.mono, fontSize: 14, fontWeight: 600, color: C.text }}>
                {a.totalSales || 0}
              </span>
            </div>

            {/* Revenue */}
            <div style={{ textAlign: 'right' as const }}>
              <span style={{ fontFamily: FONT.mono, fontSize: 13, fontWeight: 600, color: C.text }}>
                R$ {(a.revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
              </span>
            </div>

            {/* Commission value */}
            <div style={{ textAlign: 'right' as const }}>
              <span
                style={{ fontFamily: FONT.mono, fontSize: 12, color: C.ember, fontWeight: 600 }}
              >
                R${' '}
                {(((a.revenue || 0) * (a.commission || 0)) / 100).toLocaleString('pt-BR', {
                  minimumFractionDigits: 0,
                })}
              </span>
            </div>

            {/* Rate */}
            <div style={{ textAlign: 'right' as const }}>
              <span style={{ fontFamily: FONT.mono, fontSize: 13, fontWeight: 600, color: C.text }}>
                {a.commission || 0}%
              </span>
            </div>

            {/* Temperature */}
            <div style={{ width: 100 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span
                  style={{
                    fontFamily: FONT.mono,
                    fontSize: 10,
                    fontWeight: 600,
                    color:
                      (a.temperature || 0) > 70
                        ? '#10B981'
                        : (a.temperature || 0) > 40
                          ? '#F59E0B'
                          : C.muted,
                  }}
                >
                  {a.temperature || 0}%
                </span>
              </div>
              <TempBar
                value={a.temperature || 0}
                max={100}
                color={
                  (a.temperature || 0) > 70
                    ? '#10B981'
                    : (a.temperature || 0) > 40
                      ? '#F59E0B'
                      : C.muted
                }
              />
            </div>
          </div>
        ))}

        {filtered.length === 0 && displayAffiliates.length === 0 && (
          <div
            style={{
              background: '#111113',
              border: '1px solid #222226',
              borderRadius: 6,
              padding: '60px 20px',
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: 14, color: '#3A3A3F', display: 'block', marginBottom: 8 }}>
              Nenhum afiliado cadastrado
            </span>
            <span style={{ fontSize: 12, color: '#3A3A3F' }}>
              Convide afiliados para promover seus produtos
            </span>
          </div>
        )}
        {filtered.length === 0 && displayAffiliates.length > 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: 48,
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
            }}
          >
            <span style={{ color: C.muted }}>{IC.users(32)}</span>
            <p style={{ fontFamily: FONT.sans, fontSize: 14, color: C.secondary, marginTop: 12 }}>
              Nenhum parceiro encontrado
            </p>
          </div>
        )}
      </div>

      {/* ── Meus Links de Afiliado (produtos que este workspace promove) ── */}
      <MyAffiliateLinks />

      {/* Affiliate Detail Modal */}
      {detailId && detailAffiliate && (
        <AffiliateDetailModal
          affiliate={detailAffiliate}
          onClose={() => setDetailId(null)}
          onChat={() => {
            setDetailId(null);
          }}
          onRevoke={() => handleRevoke(detailId)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MY AFFILIATE LINKS PANEL
   — shows links from GET /affiliate/my-links
   — includes AI suggestions from POST /affiliate/suggest
   ═══════════════════════════════════════════════ */

function MyAffiliateLinks() {
  const { data: linksData, isLoading: linksLoading } = useSWR(
    '/affiliate/my-links',
    () => affiliateApi.myLinks().then((r) => r.data),
    { revalidateOnFocus: false },
  );

  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const links: any[] = linksData?.links || [];
  const totals = linksData?.totals || { clicks: 0, sales: 0, revenue: 0, commission: 0 };

  const handleSuggest = async () => {
    setSuggestLoading(true);
    try {
      const res = await affiliateApi.suggest();
      setSuggestions(res.data?.products || []);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const res = await affiliateApi.aiSearch(searchQuery.trim());
      setSearchResults(res.data?.products || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSave = async (productId: string) => {
    setSaving((prev) => ({ ...prev, [productId]: true }));
    try {
      await affiliateApi.saveProduct(productId);
    } catch {
      // ignore
    } finally {
      setSaving((prev) => ({ ...prev, [productId]: false }));
    }
  };

  const fmtMoney = (n: number) =>
    'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

  return (
    <div style={{ marginTop: 32, borderTop: `1px solid ${C.divider}`, paddingTop: 28 }}>
      <h3
        style={{
          fontFamily: FONT.sans,
          fontSize: 15,
          fontWeight: 600,
          color: C.text,
          margin: '0 0 6px',
        }}
      >
        Meus Links de Afiliado
      </h3>
      <p style={{ fontFamily: FONT.sans, fontSize: 12, color: C.secondary, margin: '0 0 20px' }}>
        Produtos de outros produtores que voce esta promovendo
      </p>

      {/* Totals */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 20,
        }}
      >
        {[
          { label: 'Cliques', value: totals.clicks },
          { label: 'Vendas', value: totals.sales },
          { label: 'Receita', value: fmtMoney(totals.revenue) },
          { label: 'Comissao', value: fmtMoney(totals.commission) },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: '14px 16px',
            }}
          >
            <div
              style={{ fontFamily: FONT.sans, fontSize: 11, color: C.secondary, marginBottom: 4 }}
            >
              {s.label}
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: C.text }}>
              {typeof s.value === 'number' ? s.value : s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Links list */}
      {linksLoading ? (
        <div style={{ color: C.secondary, fontFamily: FONT.sans, fontSize: 13, padding: '20px 0' }}>
          Carregando links...
        </div>
      ) : links.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
          {links.map((link: any) => (
            <div
              key={link.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 80px 80px 110px 100px 160px',
                gap: 12,
                alignItems: 'center',
                padding: '12px 16px',
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
              }}
            >
              <div>
                <div
                  style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: C.text }}
                >
                  {link.affiliateProduct?.productId || link.id}
                </div>
                <div
                  style={{ fontFamily: FONT.mono, fontSize: 10, color: C.secondary, marginTop: 2 }}
                >
                  {link.code || link.id}
                </div>
              </div>
              <div style={{ textAlign: 'right' as const }}>
                <div style={{ fontFamily: FONT.sans, fontSize: 10, color: C.secondary }}>
                  Cliques
                </div>
                <div style={{ fontFamily: FONT.mono, fontSize: 14, color: C.text }}>
                  {link.clicks || 0}
                </div>
              </div>
              <div style={{ textAlign: 'right' as const }}>
                <div style={{ fontFamily: FONT.sans, fontSize: 10, color: C.secondary }}>
                  Vendas
                </div>
                <div style={{ fontFamily: FONT.mono, fontSize: 14, color: C.text }}>
                  {link.sales || 0}
                </div>
              </div>
              <div style={{ textAlign: 'right' as const }}>
                <div style={{ fontFamily: FONT.sans, fontSize: 10, color: C.secondary }}>
                  Receita
                </div>
                <div style={{ fontFamily: FONT.mono, fontSize: 13, color: C.text }}>
                  {fmtMoney(link.revenue || 0)}
                </div>
              </div>
              <div style={{ textAlign: 'right' as const }}>
                <div style={{ fontFamily: FONT.sans, fontSize: 10, color: C.secondary }}>
                  Comissao
                </div>
                <div
                  style={{ fontFamily: FONT.mono, fontSize: 13, color: C.ember, fontWeight: 600 }}
                >
                  {fmtMoney(link.commissionEarned || 0)}
                </div>
              </div>
              <button
                onClick={() =>
                  navigator.clipboard
                    .writeText(buildPayUrl(`/${link.code || link.id}`, window.location.host))
                    .catch(() => {})
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '7px 12px',
                  background: 'none',
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  color: C.secondary,
                  fontFamily: FONT.sans,
                  fontSize: 12,
                  cursor: 'pointer',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap' as const,
                }}
              >
                {IC.copy(12)} Copiar link
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '40px 20px',
            textAlign: 'center',
            marginBottom: 20,
          }}
        >
          <span style={{ color: C.muted }}>{IC.link(32)}</span>
          <p style={{ fontFamily: FONT.sans, fontSize: 14, color: C.secondary, marginTop: 12 }}>
            Voce nao tem links de afiliado ainda
          </p>
          <p style={{ fontFamily: FONT.sans, fontSize: 12, color: C.muted }}>
            Use a busca abaixo para encontrar produtos para promover
          </p>
        </div>
      )}

      {/* AI Suggest + Search */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* AI Suggestions */}
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: 16,
          }}
        >
          <div
            style={{
              fontFamily: FONT.sans,
              fontSize: 12,
              fontWeight: 600,
              color: C.secondary,
              marginBottom: 12,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.05em',
            }}
          >
            Sugestoes por IA
          </div>
          <button
            onClick={handleSuggest}
            disabled={suggestLoading}
            style={{
              width: '100%',
              padding: '10px 0',
              background: C.ember,
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontFamily: FONT.sans,
              fontSize: 13,
              fontWeight: 600,
              cursor: suggestLoading ? 'wait' : 'pointer',
              marginBottom: 12,
              opacity: suggestLoading ? 0.7 : 1,
            }}
          >
            {suggestLoading ? 'Buscando...' : 'Ver sugestoes para meu nicho'}
          </button>
          {suggestions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {suggestions.map((p: any) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    background: C.elevated,
                    borderRadius: 6,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: FONT.sans,
                        fontSize: 12,
                        fontWeight: 600,
                        color: C.text,
                      }}
                    >
                      {p.productId}
                    </div>
                    <div style={{ fontFamily: FONT.mono, fontSize: 11, color: C.ember }}>
                      {p.commissionPct}% comissao
                    </div>
                  </div>
                  <button
                    onClick={() => handleSave(p.id)}
                    disabled={saving[p.id]}
                    style={{
                      padding: '6px 12px',
                      background: 'none',
                      border: `1px solid ${C.ember}`,
                      borderRadius: 6,
                      color: C.ember,
                      fontFamily: FONT.sans,
                      fontSize: 11,
                      cursor: saving[p.id] ? 'wait' : 'pointer',
                    }}
                  >
                    {saving[p.id] ? '...' : 'Salvar'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI Search */}
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: 16,
          }}
        >
          <div
            style={{
              fontFamily: FONT.sans,
              fontSize: 12,
              fontWeight: 600,
              color: C.secondary,
              marginBottom: 12,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.05em',
            }}
          >
            Buscar no Marketplace
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              aria-label="Buscar no marketplace por categoria ou tag"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch();
              }}
              placeholder="Buscar por categoria ou tag..."
              style={{
                flex: 1,
                padding: '10px 12px',
                background: C.elevated,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                color: C.text,
                fontFamily: FONT.sans,
                fontSize: 13,
                outline: 'none',
              }}
              onFocus={(e) => {
                (e.target as HTMLInputElement).style.borderColor = C.ember;
              }}
              onBlur={(e) => {
                (e.target as HTMLInputElement).style.borderColor = C.border;
              }}
            />
            <button
              onClick={handleSearch}
              disabled={!searchQuery.trim() || searchLoading}
              style={{
                padding: '10px 14px',
                background: C.ember,
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                fontFamily: FONT.sans,
                fontSize: 13,
                fontWeight: 600,
                cursor: !searchQuery.trim() || searchLoading ? 'not-allowed' : 'pointer',
                opacity: !searchQuery.trim() || searchLoading ? 0.5 : 1,
              }}
            >
              {IC.search(14)}
            </button>
          </div>
          {searchResults !== null &&
            (searchResults.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {searchResults.map((p: any) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      background: C.elevated,
                      borderRadius: 6,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontFamily: FONT.sans,
                          fontSize: 12,
                          fontWeight: 600,
                          color: C.text,
                        }}
                      >
                        {p.productId}
                      </div>
                      <div style={{ fontFamily: FONT.mono, fontSize: 11, color: C.ember }}>
                        {p.commissionPct}% — {p.category || 'Geral'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleSave(p.id)}
                      disabled={saving[p.id]}
                      style={{
                        padding: '6px 12px',
                        background: 'none',
                        border: `1px solid ${C.ember}`,
                        borderRadius: 6,
                        color: C.ember,
                        fontFamily: FONT.sans,
                        fontSize: 11,
                        cursor: saving[p.id] ? 'wait' : 'pointer',
                      }}
                    >
                      {saving[p.id] ? '...' : 'Salvar'}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  fontFamily: FONT.sans,
                  fontSize: 13,
                  color: C.muted,
                  textAlign: 'center',
                  padding: '16px 0',
                }}
              >
                Nenhum produto encontrado para &quot;{searchQuery}&quot;
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB: CHAT
   ═══════════════════════════════════════════════ */

function TabChat({
  selectedChat,
  setSelectedChat,
  chatInput,
  setChatInput,
  messages,
  setMessages,
  search,
  setSearch,
}: {
  selectedChat: any;
  setSelectedChat: (c: any) => void;
  chatInput: string;
  setChatInput: (s: string) => void;
  messages: any[];
  setMessages: (m: any[]) => void;
  search: string;
  setSearch: (s: string) => void;
}) {
  const { contacts, mutate: mutateContacts } = usePartnerChatContacts();
  const { messages: realMsgs, mutate: mutateMsgs } = usePartnerMessages(selectedChat?.id || null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const displayContacts = contacts as PartnerContact[];
  const displayMessages: any[] =
    (realMsgs as PartnerMessage[]).length > 0 ? (realMsgs as PartnerMessage[]) : messages;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages.length]);

  const handleSelectContact = async (contact: any) => {
    setSelectedChat(contact);
    if (contact.unread > 0) {
      try {
        await markPartnerAsRead(contact.id);
        mutateContacts();
      } catch {
        // silent
      }
    }
  };

  const handleSend = async () => {
    if (!chatInput.trim() || !selectedChat) return;
    const content = chatInput.trim();
    setChatInput('');
    try {
      await sendPartnerMessage(selectedChat.id, content);
      mutateMsgs();
    } catch (e) {
      console.error('Failed to send message', e);
    }
    // Also append locally for immediate feedback
    const newMsg = {
      id: `local-${Date.now()}`,
      sender: 'Voce',
      content,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      isMe: true,
    };
    setMessages([...messages, newMsg]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const filteredContacts = displayContacts.filter((c: any) => {
    if (!search) return true;
    return (c.name || '').toLowerCase().includes(search.toLowerCase());
  });

  const totalUnread = displayContacts.reduce((sum: number, c: any) => sum + (c.unread || 0), 0);

  return (
    <div
      style={{
        display: 'flex',
        height: 'calc(100vh - 180px)',
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        overflow: 'hidden',
        animation: 'fadeIn 300ms ease',
      }}
    >
      {/* Contact List - 280px */}
      <div
        style={{
          width: 280,
          borderRight: `1px solid ${C.divider}`,
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${C.divider}` }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: C.ember }}>{IC.chat(16)}</span>
              <span style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: C.text }}>
                Conversas
              </span>
            </div>
            {totalUnread > 0 && (
              <span
                style={{
                  padding: '2px 8px',
                  background: C.ember,
                  borderRadius: 10,
                  fontFamily: FONT.mono,
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#fff',
                }}
              >
                {totalUnread}
              </span>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: C.muted,
              }}
            >
              {IC.search(13)}
            </div>
            <input
              aria-label="Buscar conversa"
              type="text"
              placeholder="Buscar conversa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 30px',
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                color: C.text,
                fontFamily: FONT.sans,
                fontSize: 12,
                outline: 'none',
                boxSizing: 'border-box' as const,
              }}
            />
          </div>
        </div>

        {/* Contact List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredContacts.map((contact: any) => {
            const isSelected = selectedChat?.id === contact.id;
            return (
              <div
                key={contact.id}
                onClick={() => handleSelectContact(contact)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  cursor: 'pointer',
                  background: isSelected ? C.emberBg : 'transparent',
                  borderLeft: isSelected ? `2px solid ${C.ember}` : '2px solid transparent',
                  transition: 'background 150ms ease',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.background = C.elevated;
                }}
                onMouseLeave={(e) => {
                  if (!isSelected)
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                {/* Avatar */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background:
                        contact.type === 'producer' ? 'rgba(139,92,246,0.12)' : C.elevated,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: FONT.sans,
                      fontSize: 14,
                      fontWeight: 600,
                      color: contact.type === 'producer' ? '#8B5CF6' : C.text,
                    }}
                  >
                    {(contact.name || '?')[0].toUpperCase()}
                  </div>
                  {contact.online && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: '#10B981',
                        border: `2px solid ${C.card}`,
                      }}
                    />
                  )}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 2,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: FONT.sans,
                        fontSize: 13,
                        fontWeight: contact.unread ? 600 : 500,
                        color: C.text,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap' as const,
                      }}
                    >
                      {contact.name}
                    </span>
                    <span
                      style={{
                        fontFamily: FONT.sans,
                        fontSize: 10,
                        color: C.muted,
                        flexShrink: 0,
                        marginLeft: 8,
                      }}
                    >
                      {contact.time}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        fontFamily: FONT.sans,
                        fontSize: 12,
                        color: contact.unread ? C.secondary : C.muted,
                        fontWeight: contact.unread ? 500 : 400,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap' as const,
                        flex: 1,
                      }}
                    >
                      {contact.lastMessage}
                    </span>
                    {contact.unread > 0 && (
                      <span
                        style={{
                          minWidth: 18,
                          height: 18,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 9,
                          background: C.ember,
                          fontFamily: FONT.mono,
                          fontSize: 10,
                          fontWeight: 600,
                          color: '#fff',
                          padding: '0 4px',
                          flexShrink: 0,
                        }}
                      >
                        {contact.unread}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {filteredContacts.length === 0 && displayContacts.length === 0 && (
            <div
              style={{
                background: '#111113',
                border: '1px solid #222226',
                borderRadius: 6,
                padding: '60px 20px',
                textAlign: 'center',
              }}
            >
              <span style={{ fontSize: 14, color: '#3A3A3F', display: 'block', marginBottom: 8 }}>
                Nenhum contato
              </span>
              <span style={{ fontSize: 12, color: '#3A3A3F' }}>
                Conversas com parceiros aparecerao aqui
              </span>
            </div>
          )}
          {filteredContacts.length === 0 && displayContacts.length > 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: C.muted }}>
              <span style={{ color: C.muted }}>{IC.chat(24)}</span>
              <p style={{ fontFamily: FONT.sans, fontSize: 13, marginTop: 8 }}>
                Nenhuma conversa encontrada
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.bg }}>
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 20px',
                borderBottom: `1px solid ${C.divider}`,
                background: C.card,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background:
                    selectedChat.type === 'producer' ? 'rgba(139,92,246,0.12)' : C.elevated,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: FONT.sans,
                  fontSize: 14,
                  fontWeight: 600,
                  color: selectedChat.type === 'producer' ? '#8B5CF6' : C.text,
                }}
              >
                {(selectedChat.name || '?')[0].toUpperCase()}
              </div>
              <div>
                <div
                  style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: C.text }}
                >
                  {selectedChat.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 600,
                      fontFamily: FONT.sans,
                      color: selectedChat.type === 'producer' ? '#8B5CF6' : C.ember,
                      background:
                        selectedChat.type === 'producer' ? 'rgba(139,92,246,0.15)' : C.emberStrong,
                      letterSpacing: '0.02em',
                      textTransform: 'uppercase' as const,
                    }}
                  >
                    {selectedChat.type === 'producer' ? 'Produtor' : 'Afiliado'}
                  </span>
                  {selectedChat.online && (
                    <span style={{ fontFamily: FONT.sans, fontSize: 11, color: '#10B981' }}>
                      online
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {displayMessages.length === 0 && (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ color: C.muted }}>{IC.chat(24)}</span>
                  <p style={{ fontFamily: FONT.sans, fontSize: 13, color: C.muted, margin: 0 }}>
                    Nenhuma mensagem ainda
                  </p>
                </div>
              )}
              {displayMessages.map((msg: any) => (
                <div
                  key={msg.id}
                  style={{ display: 'flex', justifyContent: msg.isMe ? 'flex-end' : 'flex-start' }}
                >
                  <div
                    style={{
                      maxWidth: '70%',
                      padding: '10px 14px',
                      borderRadius: 6,
                      background: msg.isMe ? C.ember : C.card,
                      border: msg.isMe ? 'none' : `1px solid ${C.border}`,
                    }}
                  >
                    {!msg.isMe && (
                      <div
                        style={{
                          fontFamily: FONT.sans,
                          fontSize: 11,
                          fontWeight: 600,
                          color: C.ember,
                          marginBottom: 4,
                        }}
                      >
                        {msg.sender}
                      </div>
                    )}
                    <div
                      style={{
                        fontFamily: FONT.sans,
                        fontSize: 13,
                        color: msg.isMe ? '#fff' : C.text,
                        lineHeight: 1.5,
                      }}
                    >
                      {msg.content}
                    </div>
                    <div
                      style={{
                        fontFamily: FONT.sans,
                        fontSize: 10,
                        color: msg.isMe ? 'rgba(255,255,255,0.6)' : C.muted,
                        textAlign: 'right' as const,
                        marginTop: 4,
                      }}
                    >
                      {msg.time}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 20px',
                borderTop: `1px solid ${C.divider}`,
                background: C.card,
              }}
            >
              <input
                aria-label="Mensagem"
                type="text"
                placeholder="Digite sua mensagem..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  color: C.text,
                  fontFamily: FONT.sans,
                  fontSize: 13,
                  outline: 'none',
                }}
              />
              <button
                onClick={handleSend}
                disabled={!chatInput.trim()}
                style={{
                  width: 40,
                  height: 40,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: chatInput.trim() ? C.ember : C.elevated,
                  border: 'none',
                  borderRadius: 6,
                  cursor: chatInput.trim() ? 'pointer' : 'default',
                  transition: 'background 150ms ease',
                  flexShrink: 0,
                }}
              >
                <span style={{ color: chatInput.trim() ? '#fff' : C.muted }}>{IC.send(16)}</span>
              </button>
            </div>
          </>
        ) : (
          /* Empty State */
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: C.card,
                border: `1px solid ${C.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ color: C.muted }}>{IC.chat(28)}</span>
            </div>
            <h3
              style={{
                fontFamily: FONT.sans,
                fontSize: 16,
                fontWeight: 600,
                color: C.secondary,
                margin: 0,
              }}
            >
              Selecione uma conversa
            </h3>
            <p
              style={{
                fontFamily: FONT.sans,
                fontSize: 13,
                color: C.muted,
                margin: 0,
                maxWidth: 300,
                textAlign: 'center' as const,
              }}
            >
              Escolha um parceiro na lista ao lado para iniciar ou continuar uma conversa
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
