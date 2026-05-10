'use client';
import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import type { ChannelRealData, ChannelStatRow } from './MarketingTypes';
import { NP } from './MarketingShared.canvas';
import { ConnBadge } from './MarketingShared.canvas';
import { Fmt, SORA, MONO, BG_CARD, BORDER } from './MarketingShared.channels';

export {
  SORA,
  MONO,
  BG_CARD,
  BG_ELEVATED,
  BORDER,
  EMBER,
  META_OAUTH_HOSTS,
  navigateCurrentWindow,
  isTrustedMetaOauthUrl,
  Fmt,
  FmtMoney,
  formatFeedTime,
  formatFeedMessage,
  channelDataStats,
  IC,
  CH_CONFIG,
} from './MarketingShared.channels';

export { NP, Ticker, LiveStream, ConnBadge } from './MarketingShared.canvas';

export function ChannelStatsList({ stats, color }: { stats: ChannelStatRow[]; color: string }) {
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

export function ChannelInfoGridCard({ label, value }: ChannelStatRow) {
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

export function RegisteredDataList({
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
            style={{ fontFamily: MONO, fontSize: 14, color: 'var(--app-text-primary)', flex: 1 }}
          >
            {s.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ChannelConnectBadge({
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
        color: colors.semantic.warning,
        background: 'rgba(245,158,11,0.1)',
        padding: '2px 8px',
        borderRadius: 99,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors.semantic.warning }} />
      {kloelT(`Conectar`)}
    </span>
  );
}
