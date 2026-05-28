import { colors } from '@/lib/design-tokens';
import { MONO } from './MarketingShared';

/**
 * Small "Conectado" pill rendered next to a connected marketing channel.
 *
 * Identical JSX was duplicated in SmsMarketingTab and TikTokMarketingTab;
 * canonicalizing here keeps the pulse animation, color, and copy in sync
 * across every channel tab.
 */
export function ConnectedBadge() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 10,
        fontFamily: MONO,
        color: colors.semantic.success,
        background: 'rgba(16,185,129,0.1)',
        padding: '2px 8px',
        borderRadius: 16,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '16%',
          background: colors.semantic.success,
          animation: 'mktPulse 2s infinite',
        }}
      />
      Conectado
    </span>
  );
}
