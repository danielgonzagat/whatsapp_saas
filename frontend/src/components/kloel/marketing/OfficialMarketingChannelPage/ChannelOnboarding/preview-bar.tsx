/**
 * PreviewBar — canonical floating channel selector from the reference JSX.
 *
 * Sits fixed, top-center, glass-cap visual. The active pill is solid
 * `silver` (high-contrast ink) with `void` (paper) text. Inactive items are
 * mono uppercase, muted.
 *
 * Glass background and box-shadow vary per theme (the palette already
 * encodes both via the `glass` / `glassShadow` keys).
 */
import type { ChannelKey } from '../../OfficialMarketingChannelPage.helpers';
import type { OnboardingPalette } from './palette';
import { MONO, PILL_RADIUS } from './palette';

const CHANNELS: ChannelKey[] = [
  'whatsapp',
  'instagram',
  'tiktok',
  'google-ads',
  'facebook',
  'email',
];

export function PreviewBar({
  active,
  onChange,
  C,
}: {
  active: ChannelKey;
  onChange: (next: ChannelKey) => void;
  C: OnboardingPalette;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        display: 'flex',
        gap: 4,
        background: C.glass,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${C.border}`,
        borderRadius: PILL_RADIUS,
        padding: 4,
        boxShadow: C.glassShadow === 'none' ? undefined : C.glassShadow,
      }}
    >
      {CHANNELS.map((k) => (
        <button
          type="button"
          key={k}
          onClick={() => onChange(k)}
          style={{
            background: active === k ? C.silver : 'transparent',
            color: active === k ? C.void : C.muted,
            border: 'none',
            padding: '6px 14px',
            borderRadius: PILL_RADIUS,
            fontFamily: MONO,
            fontSize: 10.5,
            letterSpacing: 0.8,
            cursor: 'pointer',
            textTransform: 'uppercase',
          }}
        >
          {k}
        </button>
      ))}
    </div>
  );
}
