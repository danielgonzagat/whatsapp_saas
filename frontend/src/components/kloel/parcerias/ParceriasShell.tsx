'use client';

import { kloelT } from '@/lib/i18n/t';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { usePathname, useRouter } from 'next/navigation';
import { startTransition, useState } from 'react';
import { IC } from './ParceriasView.icons';
import { C, FONT } from './ParceriasDesignTokens';
import ColaboratorRoster from './ColaboratorRoster';
import ColaboratorInvitationForm from './ColaboratorInvitationForm';
import AffiliateRegistrationForm from './AffiliateRegistrationForm';
import AffiliateDirectory from './AffiliateDirectory';
import PartnerChatRoom from './PartnerChatRoom';

const TABS: { key: string; label: string; icon: (s: number) => React.ReactElement }[] = [
  { key: 'colaboradores', label: 'Central de Colaboradores', icon: IC.shield },
  { key: 'afiliados', label: 'Afiliados e Produtores', icon: IC.users },
  { key: 'chat', label: 'Chat', icon: IC.chat },
];

export default function ParceriasShell({ defaultTab = 'colaboradores' }: { defaultTab?: string }) {
  const { isMobile } = useResponsiveViewport();
  const router = useRouter();
  const pathname = usePathname();

  const [tab, setTab] = useState(defaultTab);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showAffiliateInviteModal, setShowAffiliateInviteModal] = useState(false);

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
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${C.muted}; }
      `}</style>

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

      <div
        style={{
          padding: isMobile ? '20px 16px 40px' : '24px 32px 48px',
          maxWidth: 1200,
          margin: '0 auto',
        }}
      >
        {tab === 'colaboradores' && (
          <ColaboratorRoster setShowInviteModal={setShowInviteModal} />
        )}
        {tab === 'afiliados' && (
          <AffiliateDirectory setShowAffiliateInviteModal={setShowAffiliateInviteModal} />
        )}
        {tab === 'chat' && <PartnerChatRoom />}
      </div>

      {showInviteModal && (
        <ColaboratorInvitationForm onClose={() => setShowInviteModal(false)} />
      )}
      {showAffiliateInviteModal && (
        <AffiliateRegistrationForm onClose={() => setShowAffiliateInviteModal(false)} />
      )}
    </div>
  );
}
