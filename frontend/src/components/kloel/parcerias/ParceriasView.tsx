'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  useCollaborators, useCollaboratorStats,
  useAffiliates, useAffiliateStats, useAffiliateDetail,
  usePartnerChatContacts, usePartnerMessages,
  inviteCollaborator, revokeInvite, removeCollaborator,
  createAffiliate, approveAffiliate, revokeAffiliate,
  sendPartnerMessage, markPartnerAsRead,
} from '@/hooks/usePartnerships';

// ════════════════════════════════════════════
// DESIGN TOKENS (inline for self-contained)
// ════════════════════════════════════════════

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

// ════════════════════════════════════════════
// ICONS (inline SVGs)
// ════════════════════════════════════════════

function IcUsers({ size = 18, color = C.secondary }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IcSend({ size = 18, color = C.text }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function IcSearch({ size = 16, color = C.muted }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IcPlus({ size = 16, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IcX({ size = 16, color = C.secondary }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IcChat({ size = 18, color = C.secondary }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IcShield({ size = 16, color = C.secondary }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IcTrendUp({ size = 16, color = C.ember }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

function IcDollar({ size = 16, color = C.ember }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

// ════════════════════════════════════════════
// ROLES CONFIG
// ════════════════════════════════════════════

const ROLES = [
  { value: 'admin', label: 'Admin', color: C.ember },
  { value: 'editor', label: 'Editor', color: '#8B5CF6' },
  { value: 'moderator', label: 'Moderador', color: '#3B82F6' },
  { value: 'analyst', label: 'Analista', color: '#10B981' },
  { value: 'finance', label: 'Financeiro', color: '#F59E0B' },
  { value: 'viewer', label: 'Visualizador', color: C.secondary },
];

// ════════════════════════════════════════════
// MOCK DATA (fallback when API returns empty)
// ════════════════════════════════════════════

const MOCK_COLLABORATORS = [
  { id: 'c1', name: 'Ana Beatriz', email: 'ana@kloel.com', role: 'admin', status: 'online', avatar: null, lastActive: '2 min atras' },
  { id: 'c2', name: 'Carlos Mendes', email: 'carlos@kloel.com', role: 'editor', status: 'online', avatar: null, lastActive: '15 min atras' },
  { id: 'c3', name: 'Juliana Santos', email: 'juliana@kloel.com', role: 'moderator', status: 'offline', avatar: null, lastActive: '2h atras' },
  { id: 'c4', name: 'Rafael Lima', email: 'rafael@kloel.com', role: 'analyst', status: 'offline', avatar: null, lastActive: '1 dia atras' },
];

const MOCK_INVITES = [
  { id: 'i1', email: 'novo@kloel.com', role: 'editor', sentAt: '2024-03-25T10:00:00Z', status: 'pending' },
  { id: 'i2', email: 'designer@kloel.com', role: 'viewer', sentAt: '2024-03-24T14:00:00Z', status: 'pending' },
];

const MOCK_AFFILIATES = [
  { id: 'a1', name: 'Pedro Afonso', email: 'pedro@email.com', type: 'affiliate', status: 'active', commission: 25, totalSales: 47, revenue: 12450.00, joined: '2024-01-15' },
  { id: 'a2', name: 'Maria Clara', email: 'maria@email.com', type: 'producer', status: 'active', commission: 30, totalSales: 128, revenue: 45800.00, joined: '2023-11-20' },
  { id: 'a3', name: 'Lucas Ferreira', email: 'lucas@email.com', type: 'affiliate', status: 'active', commission: 20, totalSales: 23, revenue: 5670.00, joined: '2024-02-10' },
  { id: 'a4', name: 'Camila Rocha', email: 'camila@email.com', type: 'producer', status: 'pending', commission: 35, totalSales: 0, revenue: 0, joined: '2024-03-20' },
  { id: 'a5', name: 'Bruno Silva', email: 'bruno@email.com', type: 'affiliate', status: 'active', commission: 22, totalSales: 89, revenue: 23100.00, joined: '2023-09-05' },
];

const MOCK_CHAT_CONTACTS = [
  { id: 'ch1', name: 'Pedro Afonso', type: 'affiliate', lastMessage: 'Oi, tudo bem? Queria saber sobre a nova campanha...', time: '14:32', unread: 2, online: true },
  { id: 'ch2', name: 'Maria Clara', type: 'producer', lastMessage: 'Enviei o relatorio de vendas do mes', time: '12:15', unread: 0, online: true },
  { id: 'ch3', name: 'Lucas Ferreira', type: 'affiliate', lastMessage: 'Quando sai o pagamento das comissoes?', time: 'Ontem', unread: 1, online: false },
  { id: 'ch4', name: 'Bruno Silva', type: 'affiliate', lastMessage: 'Obrigado pela atualizacao!', time: 'Ontem', unread: 0, online: false },
];

const MOCK_CHAT_MESSAGES: Record<string, Array<{ id: string; sender: string; content: string; time: string; isMe: boolean }>> = {
  ch1: [
    { id: 'm1', sender: 'Pedro Afonso', content: 'Oi, tudo bem?', time: '14:20', isMe: false },
    { id: 'm2', sender: 'Voce', content: 'Oi Pedro! Tudo sim, e voce?', time: '14:22', isMe: true },
    { id: 'm3', sender: 'Pedro Afonso', content: 'Tudo otimo! Queria saber sobre a nova campanha que voces estao preparando.', time: '14:25', isMe: false },
    { id: 'm4', sender: 'Pedro Afonso', content: 'Vi que tem novos materiais de divulgacao disponiveis.', time: '14:32', isMe: false },
  ],
  ch2: [
    { id: 'm5', sender: 'Voce', content: 'Oi Maria, pode me enviar o relatorio?', time: '11:00', isMe: true },
    { id: 'm6', sender: 'Maria Clara', content: 'Claro! Enviei o relatorio de vendas do mes', time: '12:15', isMe: false },
  ],
  ch3: [
    { id: 'm7', sender: 'Lucas Ferreira', content: 'Oi! Quando sai o pagamento das comissoes?', time: '16:40', isMe: false },
  ],
  ch4: [
    { id: 'm8', sender: 'Voce', content: 'As comissoes foram atualizadas no painel.', time: '10:00', isMe: true },
    { id: 'm9', sender: 'Bruno Silva', content: 'Obrigado pela atualizacao!', time: '10:05', isMe: false },
  ],
};

// ════════════════════════════════════════════
// SMALL HELPERS
// ════════════════════════════════════════════

function TempBar({ value, max, color = C.ember }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ width: '100%', height: 4, background: C.elevated, borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 300ms ease' }} />
    </div>
  );
}

function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon?: React.ReactNode }) {
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 6,
      padding: '20px 20px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: FONT.sans, fontSize: 12, color: C.secondary, fontWeight: 500 }}>{label}</span>
        {icon}
      </div>
      <span style={{ fontFamily: FONT.mono, fontSize: 24, fontWeight: 700, color: C.text, letterSpacing: '-0.02em' }}>{value}</span>
      {sub && <span style={{ fontFamily: FONT.sans, fontSize: 11, color: C.muted }}>{sub}</span>}
    </div>
  );
}

function Badge({ text, color = C.ember }: { text: string; color?: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 600,
      fontFamily: FONT.sans,
      color,
      background: `${color}15`,
      letterSpacing: '0.02em',
      textTransform: 'uppercase' as const,
    }}>
      {text}
    </span>
  );
}

function OnlineDot({ online }: { online: boolean }) {
  return (
    <div style={{
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: online ? '#10B981' : C.muted,
      border: `2px solid ${C.card}`,
      position: 'absolute' as const,
      bottom: 0,
      right: 0,
    }} />
  );
}

// ════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════

type TabKey = 'colaboradores' | 'afiliados' | 'chat';

interface ParceriasViewProps {
  defaultTab?: TabKey;
}

// ════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════

export default function ParceriasView({ defaultTab = 'colaboradores' }: ParceriasViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);

  // ── Tab switching with URL sync ──
  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    const routes: Record<TabKey, string> = {
      colaboradores: '/parcerias/colaboradores',
      afiliados: '/parcerias/afiliados',
      chat: '/parcerias/chat',
    };
    router.push(routes[tab]);
  };

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'colaboradores', label: 'Central de Colaboradores' },
    { key: 'afiliados', label: 'Afiliados e Produtores' },
    { key: 'chat', label: 'Chat' },
  ];

  return (
    <div style={{
      width: '100%',
      minHeight: '100vh',
      background: C.bg,
      color: C.text,
      fontFamily: FONT.sans,
      overflow: 'auto',
    }}>
      {/* Header */}
      <div style={{ padding: '28px 32px 0', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <IcUsers size={22} color={C.ember} />
          <h1 style={{ fontFamily: FONT.sans, fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: '-0.01em', margin: 0 }}>
            Parcerias
          </h1>
        </div>
        <p style={{ fontFamily: FONT.sans, fontSize: 13, color: C.secondary, margin: '4px 0 20px' }}>
          Gerencie colaboradores, afiliados e comunicacao com parceiros
        </p>

        {/* Tab Bar */}
        <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.divider}` }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                style={{
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
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ padding: '24px 32px 48px', maxWidth: 1200, margin: '0 auto' }}>
        {activeTab === 'colaboradores' && <TabColaboradores />}
        {activeTab === 'afiliados' && <TabAfiliados />}
        {activeTab === 'chat' && <TabChat />}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// TAB: COLABORADORES
// ════════════════════════════════════════════

function TabColaboradores() {
  const { agents, invites, isLoading: dataLoading, mutate } = useCollaborators();
  const { stats, isLoading: statsLoading } = useCollaboratorStats();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const collaborators = agents.length > 0 ? agents : MOCK_COLLABORATORS;
  const pendingInvites = invites.length > 0 ? invites : MOCK_INVITES;
  const collabStats: any = stats.total > 0 ? stats : { total: MOCK_COLLABORATORS.length, online: 2, pendingInvites: MOCK_INVITES.length };

  const filtered = collaborators.filter((c: any) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (c.name || '').toLowerCase().includes(term) || (c.email || '').toLowerCase().includes(term);
  });

  const handleInvite = async (email: string, role: string) => {
    try {
      await inviteCollaborator({ email, role });
      mutate();
      setShowInviteModal(false);
    } catch (e) {
      console.error('Failed to invite', e);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await removeCollaborator(id);
      mutate();
    } catch (e) {
      console.error('Failed to remove', e);
    }
  };

  const handleRevokeInvite = async (id: string) => {
    try {
      await revokeInvite(id);
      mutate();
    } catch (e) {
      console.error('Failed to revoke invite', e);
    }
  };

  return (
    <div>
      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Colaboradores" value={collabStats.total} icon={<IcUsers size={16} color={C.muted} />} />
        <StatCard label="Online Agora" value={collabStats.online} sub="ativos no momento" icon={<div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />} />
        <StatCard label="Convites Pendentes" value={collabStats.pendingInvites} icon={<IcShield size={16} color={C.muted} />} />
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
            <IcSearch size={14} color={C.muted} />
          </div>
          <input
            type="text"
            placeholder="Buscar colaborador..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
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
          <IcPlus size={14} color="#fff" />
          Convidar
        </button>
      </div>

      {/* Collaborators List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map((c: any) => {
          const roleConf = ROLES.find((r) => r.value === c.role) || ROLES[ROLES.length - 1];
          return (
            <div
              key={c.id || c.email}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 18px',
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                transition: 'border-color 150ms ease',
              }}
            >
              {/* Avatar */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{
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
                }}>
                  {(c.name || c.email || '?')[0].toUpperCase()}
                </div>
                <OnlineDot online={c.status === 'online'} />
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: C.text }}>{c.name}</div>
                <div style={{ fontFamily: FONT.sans, fontSize: 12, color: C.secondary }}>{c.email}</div>
              </div>

              {/* Role badge */}
              <Badge text={roleConf.label} color={roleConf.color} />

              {/* Last active */}
              <span style={{ fontFamily: FONT.sans, fontSize: 11, color: C.muted, whiteSpace: 'nowrap' as const }}>
                {c.lastActive || ''}
              </span>

              {/* Remove button */}
              <button
                onClick={() => handleRemove(c.id)}
                title="Remover colaborador"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  opacity: 0.5,
                  transition: 'opacity 150ms ease',
                }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '1'; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '0.5'; }}
              >
                <IcX size={14} color={C.secondary} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Pending Invites Section */}
      {pendingInvites.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h3 style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: C.secondary, marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
            Convites Pendentes
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pendingInvites.map((inv: any) => (
              <div
                key={inv.id || inv.email}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '12px 18px',
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  borderLeft: `3px solid ${C.ember}`,
                }}
              >
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: C.emberBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <IcShield size={16} color={C.ember} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 500, color: C.text }}>{inv.email}</div>
                  <div style={{ fontFamily: FONT.sans, fontSize: 11, color: C.muted }}>
                    {inv.role} &middot; Enviado em {new Date(inv.sentAt).toLocaleDateString('pt-BR')}
                  </div>
                </div>
                <button
                  onClick={() => handleRevokeInvite(inv.id)}
                  style={{
                    padding: '5px 12px',
                    background: 'none',
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    color: C.secondary,
                    fontFamily: FONT.sans,
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Revogar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && <InviteModal onClose={() => setShowInviteModal(false)} onInvite={handleInvite} />}
    </div>
  );
}

// ════════════════════════════════════════════
// INVITE MODAL
// ════════════════════════════════════════════

function InviteModal({ onClose, onInvite }: { onClose: () => void; onInvite: (email: string, role: string) => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) return;
    setSending(true);
    await onInvite(email, role);
    setSending(false);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      />

      {/* Modal */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 440,
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: 28,
      }}>
        {/* Close */}
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
        >
          <IcX size={16} color={C.secondary} />
        </button>

        <h2 style={{ fontFamily: FONT.sans, fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>
          Convidar Colaborador
        </h2>
        <p style={{ fontFamily: FONT.sans, fontSize: 13, color: C.secondary, margin: '0 0 24px' }}>
          Envie um convite por email para adicionar um novo membro a equipe.
        </p>

        {/* Email */}
        <label style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 500, color: C.secondary, display: 'block', marginBottom: 6 }}>
          Email
        </label>
        <input
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

        {/* Role */}
        <label style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 500, color: C.secondary, display: 'block', marginBottom: 6 }}>
          Funcao
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
          {ROLES.filter((r) => r.value !== 'admin').map((r) => (
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
              <span style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 500, color: C.text }}>{r.label}</span>
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

// ════════════════════════════════════════════
// TAB: AFILIADOS
// ════════════════════════════════════════════

function TabAfiliados() {
  const [filterType, setFilterType] = useState('todos');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { affiliates, isLoading: affLoading, mutate } = useAffiliates({ type: filterType, search });
  const { stats, isLoading: statsLoading } = useAffiliateStats();
  const { affiliate: detail, isLoading: detailLoading } = useAffiliateDetail(selectedId);

  const affList = affiliates.length > 0 ? affiliates : MOCK_AFFILIATES;
  const affStats: any = stats.activeAffiliates > 0 ? stats : {
    activeAffiliates: 4,
    producers: 2,
    totalRevenue: 87020,
    totalCommissions: 21755,
    topPartner: 'Maria Clara',
  };

  const filtered = affList.filter((a: any) => {
    if (filterType !== 'todos' && a.type !== filterType) return false;
    if (search) {
      const term = search.toLowerCase();
      return (a.name || '').toLowerCase().includes(term) || (a.email || '').toLowerCase().includes(term);
    }
    return true;
  });

  const maxRevenue = Math.max(...filtered.map((a: any) => a.revenue || 0), 1);

  const handleApprove = async (id: string) => {
    try {
      await approveAffiliate(id);
      mutate();
    } catch (e) {
      console.error('Failed to approve', e);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await revokeAffiliate(id);
      mutate();
    } catch (e) {
      console.error('Failed to revoke', e);
    }
  };

  const FILTER_OPTIONS = [
    { value: 'todos', label: 'Todos' },
    { value: 'affiliate', label: 'Afiliados' },
    { value: 'producer', label: 'Produtores' },
  ];

  return (
    <div>
      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <StatCard label="Afiliados Ativos" value={affStats.activeAffiliates} icon={<IcUsers size={16} color={C.muted} />} />
        <StatCard label="Produtores" value={affStats.producers} icon={<IcShield size={16} color={C.muted} />} />
        <StatCard
          label="Receita Total"
          value={`R$ ${Number(affStats.totalRevenue).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`}
          icon={<IcTrendUp size={16} color={C.ember} />}
        />
        <StatCard
          label="Comissoes Pagas"
          value={`R$ ${Number(affStats.totalCommissions).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`}
          icon={<IcDollar size={16} color={C.ember} />}
        />
      </div>

      {/* Top Partner */}
      {affStats.topPartner && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 18px',
          background: C.emberBg,
          border: `1px solid ${C.ember}20`,
          borderRadius: 6,
          marginBottom: 24,
        }}>
          <IcTrendUp size={16} color={C.ember} />
          <span style={{ fontFamily: FONT.sans, fontSize: 13, color: C.secondary }}>
            Melhor parceiro:
          </span>
          <span style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: C.ember }}>
            {affStats.topPartner}
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' as const }}>
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
          <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
            <IcSearch size={14} color={C.muted} />
          </div>
          <input
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

      {/* Affiliates List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map((a: any) => (
          <div
            key={a.id || a.email}
            onClick={() => setSelectedId(a.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '16px 18px',
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              cursor: 'pointer',
              transition: 'border-color 150ms ease',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = C.ember + '40'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = C.border; }}
          >
            {/* Avatar */}
            <div style={{
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
            }}>
              {(a.name || '?')[0].toUpperCase()}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: C.text }}>{a.name}</span>
                <Badge
                  text={a.type === 'producer' ? 'Produtor' : 'Afiliado'}
                  color={a.type === 'producer' ? '#8B5CF6' : C.ember}
                />
                {a.status === 'pending' && <Badge text="Pendente" color="#F59E0B" />}
              </div>
              <div style={{ fontFamily: FONT.sans, fontSize: 12, color: C.secondary }}>{a.email}</div>
            </div>

            {/* Metrics */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexShrink: 0 }}>
              <div style={{ textAlign: 'right' as const }}>
                <div style={{ fontFamily: FONT.mono, fontSize: 14, fontWeight: 600, color: C.text }}>
                  {a.totalSales || 0}
                </div>
                <div style={{ fontFamily: FONT.sans, fontSize: 10, color: C.muted }}>vendas</div>
              </div>
              <div style={{ textAlign: 'right' as const }}>
                <div style={{ fontFamily: FONT.mono, fontSize: 14, fontWeight: 600, color: C.text }}>
                  {a.commission || 0}%
                </div>
                <div style={{ fontFamily: FONT.sans, fontSize: 10, color: C.muted }}>comissao</div>
              </div>
              <div style={{ width: 120 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: 600, color: C.text }}>
                    R$ {(a.revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                  </span>
                </div>
                <TempBar value={a.revenue || 0} max={maxRevenue} />
              </div>

              {/* Actions */}
              {a.status === 'pending' ? (
                <button
                  onClick={(e) => { e.stopPropagation(); handleApprove(a.id); }}
                  style={{
                    padding: '6px 14px',
                    background: C.ember,
                    border: 'none',
                    borderRadius: 6,
                    color: '#fff',
                    fontFamily: FONT.sans,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Aprovar
                </button>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); handleRevoke(a.id); }}
                  title="Revogar afiliado"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 4,
                    opacity: 0.4,
                    transition: 'opacity 150ms ease',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.4'; }}
                >
                  <IcX size={14} color={C.secondary} />
                </button>
              )}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: 48,
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
          }}>
            <IcUsers size={32} color={C.muted} />
            <p style={{ fontFamily: FONT.sans, fontSize: 14, color: C.secondary, marginTop: 12 }}>
              Nenhum parceiro encontrado
            </p>
          </div>
        )}
      </div>

      {/* Affiliate Detail Modal */}
      {selectedId && (
        <AffiliateDetailModal
          affiliate={detail || affList.find((a: any) => a.id === selectedId)}
          isLoading={detailLoading}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════
// AFFILIATE DETAIL MODAL
// ════════════════════════════════════════════

function AffiliateDetailModal({ affiliate, isLoading, onClose }: { affiliate: any; isLoading: boolean; onClose: () => void }) {
  if (!affiliate && !isLoading) return null;

  const a = affiliate || {};

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 520,
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: 28,
        maxHeight: '80vh',
        overflowY: 'auto' as const,
      }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
        >
          <IcX size={16} color={C.secondary} />
        </button>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ width: 20, height: 20, border: '2px solid transparent', borderTopColor: C.ember, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
              <div style={{
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
              }}>
                {(a.name || '?')[0].toUpperCase()}
              </div>
              <div>
                <h2 style={{ fontFamily: FONT.sans, fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>{a.name}</h2>
                <p style={{ fontFamily: FONT.sans, fontSize: 13, color: C.secondary, margin: '2px 0 6px' }}>{a.email}</p>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Badge text={a.type === 'producer' ? 'Produtor' : 'Afiliado'} color={a.type === 'producer' ? '#8B5CF6' : C.ember} />
                  <Badge text={a.status === 'active' ? 'Ativo' : 'Pendente'} color={a.status === 'active' ? '#10B981' : '#F59E0B'} />
                </div>
              </div>
            </div>

            {/* Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
              <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 16, textAlign: 'center' as const }}>
                <div style={{ fontFamily: FONT.mono, fontSize: 22, fontWeight: 700, color: C.text }}>{a.totalSales || 0}</div>
                <div style={{ fontFamily: FONT.sans, fontSize: 11, color: C.muted, marginTop: 4 }}>Vendas</div>
              </div>
              <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 16, textAlign: 'center' as const }}>
                <div style={{ fontFamily: FONT.mono, fontSize: 22, fontWeight: 700, color: C.ember }}>{a.commission || 0}%</div>
                <div style={{ fontFamily: FONT.sans, fontSize: 11, color: C.muted, marginTop: 4 }}>Comissao</div>
              </div>
              <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 16, textAlign: 'center' as const }}>
                <div style={{ fontFamily: FONT.mono, fontSize: 22, fontWeight: 700, color: C.text }}>
                  R$ {(a.revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                </div>
                <div style={{ fontFamily: FONT.sans, fontSize: 11, color: C.muted, marginTop: 4 }}>Receita</div>
              </div>
            </div>

            {/* Details */}
            <div style={{ borderTop: `1px solid ${C.divider}`, paddingTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontFamily: FONT.sans, fontSize: 12, color: C.secondary }}>Membro desde</span>
                <span style={{ fontFamily: FONT.sans, fontSize: 12, color: C.text }}>
                  {a.joined ? new Date(a.joined).toLocaleDateString('pt-BR') : '--'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontFamily: FONT.sans, fontSize: 12, color: C.secondary }}>Comissao efetiva</span>
                <span style={{ fontFamily: FONT.mono, fontSize: 12, color: C.ember, fontWeight: 600 }}>
                  R$ {((a.revenue || 0) * (a.commission || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// TAB: CHAT
// ════════════════════════════════════════════

function TabChat() {
  const { contacts: apiContacts, isLoading: contactsLoading, mutate: mutateContacts } = usePartnerChatContacts();
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const { messages: apiMessages, isLoading: messagesLoading, mutate: mutateMessages } = usePartnerMessages(selectedChat?.id || null);
  const [msgInput, setMsgInput] = useState('');
  const [searchChat, setSearchChat] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const contacts = apiContacts.length > 0 ? apiContacts : MOCK_CHAT_CONTACTS;
  const currentMessages = apiMessages.length > 0
    ? apiMessages
    : (selectedChat ? (MOCK_CHAT_MESSAGES[selectedChat.id] || []) : []);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages.length]);

  const handleSelectContact = async (contact: any) => {
    setSelectedChat(contact);
    if (contact.unread > 0) {
      try {
        await markPartnerAsRead(contact.id);
        mutateContacts();
      } catch (e) {
        // silent
      }
    }
  };

  const handleSend = async () => {
    if (!msgInput.trim() || !selectedChat) return;
    const content = msgInput.trim();
    setMsgInput('');
    try {
      await sendPartnerMessage(selectedChat.id, content);
      mutateMessages();
    } catch (e) {
      console.error('Failed to send message', e);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const filteredContacts = contacts.filter((c: any) => {
    if (!searchChat) return true;
    return (c.name || '').toLowerCase().includes(searchChat.toLowerCase());
  });

  const totalUnread = contacts.reduce((sum: number, c: any) => sum + (c.unread || 0), 0);

  return (
    <div style={{
      display: 'flex',
      height: 'calc(100vh - 180px)',
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 6,
      overflow: 'hidden',
    }}>
      {/* Contact List */}
      <div style={{
        width: 320,
        borderRight: `1px solid ${C.divider}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        {/* Header */}
        <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${C.divider}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <IcChat size={16} color={C.ember} />
              <span style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: C.text }}>Conversas</span>
            </div>
            {totalUnread > 0 && (
              <span style={{
                padding: '2px 8px',
                background: C.ember,
                borderRadius: 10,
                fontFamily: FONT.mono,
                fontSize: 11,
                fontWeight: 600,
                color: '#fff',
              }}>
                {totalUnread}
              </span>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
              <IcSearch size={13} color={C.muted} />
            </div>
            <input
              type="text"
              placeholder="Buscar conversa..."
              value={searchChat}
              onChange={(e) => setSearchChat(e.target.value)}
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
        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin' as const, scrollbarColor: `${C.border} transparent` }}>
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
                onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = C.elevated; }}
                onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {/* Avatar */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    background: contact.type === 'producer' ? 'rgba(139,92,246,0.12)' : C.elevated,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: FONT.sans,
                    fontSize: 14,
                    fontWeight: 600,
                    color: contact.type === 'producer' ? '#8B5CF6' : C.text,
                  }}>
                    {(contact.name || '?')[0].toUpperCase()}
                  </div>
                  {contact.online && (
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#10B981',
                      border: `2px solid ${C.card}`,
                    }} />
                  )}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: contact.unread ? 600 : 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                      {contact.name}
                    </span>
                    <span style={{ fontFamily: FONT.sans, fontSize: 10, color: C.muted, flexShrink: 0, marginLeft: 8 }}>
                      {contact.time}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontFamily: FONT.sans,
                      fontSize: 12,
                      color: contact.unread ? C.secondary : C.muted,
                      fontWeight: contact.unread ? 500 : 400,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap' as const,
                      flex: 1,
                    }}>
                      {contact.lastMessage}
                    </span>
                    {contact.unread > 0 && (
                      <span style={{
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
                      }}>
                        {contact.unread}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {filteredContacts.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: C.muted }}>
              <IcChat size={24} color={C.muted} />
              <p style={{ fontFamily: FONT.sans, fontSize: 13, marginTop: 8 }}>Nenhuma conversa encontrada</p>
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.bg }}>
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 20px',
              borderBottom: `1px solid ${C.divider}`,
              background: C.card,
            }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: selectedChat.type === 'producer' ? 'rgba(139,92,246,0.12)' : C.elevated,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: FONT.sans,
                fontSize: 14,
                fontWeight: 600,
                color: selectedChat.type === 'producer' ? '#8B5CF6' : C.text,
              }}>
                {(selectedChat.name || '?')[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: C.text }}>{selectedChat.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Badge text={selectedChat.type === 'producer' ? 'Produtor' : 'Afiliado'} color={selectedChat.type === 'producer' ? '#8B5CF6' : C.ember} />
                  {selectedChat.online && (
                    <span style={{ fontFamily: FONT.sans, fontSize: 11, color: '#10B981' }}>online</span>
                  )}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              scrollbarWidth: 'thin' as const,
              scrollbarColor: `${C.border} transparent`,
            }}>
              {currentMessages.map((msg: any) => (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    justifyContent: msg.isMe ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div style={{
                    maxWidth: '70%',
                    padding: '10px 14px',
                    borderRadius: 6,
                    background: msg.isMe ? C.ember : C.card,
                    border: msg.isMe ? 'none' : `1px solid ${C.border}`,
                  }}>
                    {!msg.isMe && (
                      <div style={{ fontFamily: FONT.sans, fontSize: 11, fontWeight: 600, color: C.ember, marginBottom: 4 }}>
                        {msg.sender}
                      </div>
                    )}
                    <div style={{
                      fontFamily: FONT.sans,
                      fontSize: 13,
                      color: msg.isMe ? '#fff' : C.text,
                      lineHeight: 1.5,
                    }}>
                      {msg.content}
                    </div>
                    <div style={{
                      fontFamily: FONT.sans,
                      fontSize: 10,
                      color: msg.isMe ? 'rgba(255,255,255,0.6)' : C.muted,
                      textAlign: 'right' as const,
                      marginTop: 4,
                    }}>
                      {msg.time}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 20px',
              borderTop: `1px solid ${C.divider}`,
              background: C.card,
            }}>
              <input
                type="text"
                placeholder="Digite sua mensagem..."
                value={msgInput}
                onChange={(e) => setMsgInput(e.target.value)}
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
                disabled={!msgInput.trim()}
                style={{
                  width: 40,
                  height: 40,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: msgInput.trim() ? C.ember : C.elevated,
                  border: 'none',
                  borderRadius: 6,
                  cursor: msgInput.trim() ? 'pointer' : 'default',
                  transition: 'background 150ms ease',
                  flexShrink: 0,
                }}
              >
                <IcSend size={16} color={msgInput.trim() ? '#fff' : C.muted} />
              </button>
            </div>
          </>
        ) : (
          /* Empty State */
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
          }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: C.card,
              border: `1px solid ${C.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <IcChat size={28} color={C.muted} />
            </div>
            <h3 style={{ fontFamily: FONT.sans, fontSize: 16, fontWeight: 600, color: C.secondary, margin: 0 }}>
              Selecione uma conversa
            </h3>
            <p style={{ fontFamily: FONT.sans, fontSize: 13, color: C.muted, margin: 0, maxWidth: 300, textAlign: 'center' as const }}>
              Escolha um parceiro na lista ao lado para iniciar ou continuar uma conversa
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
