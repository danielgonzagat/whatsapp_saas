'use client';

import { kloelT } from '@/lib/i18n/t';
import { PulseLoader } from '@/components/kloel/PulseLoader';
import { colors } from '@/lib/design-tokens';
import Icons from './ContaIcons';
import { SORA, MONO, EMBER } from './ContaConstants';
import { StatusBadge } from './ContaShared';
import { ConnectAccountStatusCard } from './ContaConnectAccountCard';
import { getKycGateNotice } from './ContaView.helpers';
import type { useSellerConnectAccount } from '@/hooks/useConnectAccounts';

interface ContaTopSectionProps {
  isMobile: boolean;
  kycStatus: string;
  pct: number;
  isBlocked: boolean;
  profileLoading: boolean;
  sellerAccount: ReturnType<typeof useSellerConnectAccount>['sellerAccount'];
  connectAccountLoading: boolean;
  connectAccountError: ReturnType<typeof useSellerConnectAccount>['error'];
}

export function ContaTopSection({
  isMobile,
  kycStatus,
  pct,
  isBlocked,
  profileLoading,
  sellerAccount,
  connectAccountLoading,
  connectAccountError,
}: ContaTopSectionProps) {
  const kycGateNotice = getKycGateNotice(pct, kycStatus);
  const kycGateNoticeColor =
    kycGateNotice.tone === 'info'
      ? colors.semantic.info
      : kycGateNotice.tone === 'error'
        ? colors.semantic.error
        : colors.semantic.warning;
  const kycGateNoticeBackground =
    kycGateNotice.tone === 'info'
      ? 'rgba(59,130,246,.04)'
      : kycGateNotice.tone === 'error'
        ? 'rgba(239,68,68,.04)'
        : 'rgba(245,158,11,.04)';
  const kycGateNoticeBorder =
    kycGateNotice.tone === 'info'
      ? '1px solid rgba(59,130,246,.15)'
      : kycGateNotice.tone === 'error'
        ? '1px solid rgba(239,68,68,.15)'
        : '1px solid rgba(245,158,11,.15)';

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: isMobile ? 'flex-start' : 'center',
          justifyContent: 'space-between',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{kloelT('Minha conta')}</h1>
          <p style={{ fontSize: 12, color: 'var(--app-text-secondary)', margin: '4px 0 0' }}>
            {kloelT('Preencha todos os campos obrigatorios para utilizar a plataforma')}
          </p>
        </div>
        <StatusBadge status={kycStatus} />
      </div>

      {isBlocked && (
        <div
          style={{
            background: kycGateNoticeBackground,
            border: kycGateNoticeBorder,
            borderRadius: 6,
            padding: '14px 18px',
            marginBottom: 20,
            display: 'flex',
            alignItems: isMobile ? 'flex-start' : 'center',
            flexDirection: isMobile ? 'column' : 'row',
            gap: 12,
          }}
        >
          <span style={{ color: kycGateNoticeColor }}>
            {kycGateNotice.tone === 'info' ? Icons.clock(20) : Icons.alert(20)}
          </span>
          <div style={{ flex: 1 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
                display: 'block',
              }}
            >
              {kloelT(kycGateNotice.title)}
            </span>
            <span style={{ fontSize: 11, color: 'var(--app-text-secondary)' }}>
              {kloelT(kycGateNotice.description)}
            </span>
          </div>
          <div style={{ textAlign: isMobile ? ('left' as const) : ('right' as const) }}>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 24,
                fontWeight: 700,
                color: pct === 100 ? colors.semantic.success : colors.semantic.warning,
              }}
            >
              {pct}%
            </span>
            <span style={{ fontSize: 9, color: 'var(--app-text-tertiary)', display: 'block' }}>
              completo
            </span>
          </div>
        </div>
      )}

      {profileLoading && (
        <div
          style={{
            background: 'rgba(59,130,246,.04)',
            border: '1px solid rgba(59,130,246,.15)',
            borderRadius: 6,
            padding: '14px 18px',
            marginBottom: 20,
            display: 'flex',
            alignItems: isMobile ? 'flex-start' : 'center',
            flexDirection: isMobile ? 'column' : 'row',
            gap: 12,
          }}
        >
          <span style={{ color: colors.semantic.info, flexShrink: 0 }}>{Icons.clock(18)}</span>
          <div style={{ flex: 1 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
                display: 'block',
              }}
            >
              {kloelT('Sincronizando dados da conta')}
            </span>
            <span style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA }}>
              {kloelT(
                'O painel continua disponível enquanto perfil, workspace e status regulatório são revalidados.',
              )}
            </span>
          </div>
          <PulseLoader width={84} height={18} />
        </div>
      )}

      <ConnectAccountStatusCard
        isMobile={isMobile}
        sellerAccount={sellerAccount}
        kycStatus={kycStatus}
        isLoading={connectAccountLoading}
        error={connectAccountError}
      />

      <div
        style={{
          height: 4,
          background: 'var(--app-bg-secondary)',
          borderRadius: 4,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: pct === 100 ? colors.semantic.success : EMBER,
            borderRadius: 4,
            transition: 'width .3s',
          }}
        />
      </div>
    </>
  );
}
