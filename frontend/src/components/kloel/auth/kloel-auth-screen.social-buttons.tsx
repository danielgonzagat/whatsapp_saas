'use client';
import { kloelT } from '@/lib/i18n/t';
import { AppleIcon, GoogleIcon } from './kloel-auth-screen.icons';

const sora = "var(--font-sora), 'Sora', sans-serif";

interface SocialButtonsProps {
  googleButtonRef: React.RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  onAppleClick: () => void;
}

const socialBtnBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  height: 44,
  background: '#111113',
  border: '1px solid #222226',
  borderRadius: 6,
  color: '#E0DDD8',
  fontSize: 13,
  fontFamily: sora,
  transition: 'border-color 150ms ease, opacity 150ms ease',
};

export function SocialButtons({ googleButtonRef, isLoading, onAppleClick }: SocialButtonsProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 12,
        marginBottom: 28,
      }}
    >
      {/* Google sign-in: custom visual underneath, real Google button on top (transparent) */}
      <div style={{ position: 'relative', height: 44, borderRadius: 6, overflow: 'hidden' }}>
        {/* Custom visual layer (underneath) */}
        <div
          style={{
            ...socialBtnBase,
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
          }}
        >
          <GoogleIcon />
          {kloelT(`Continuar com Google`)}
        </div>
        {/* Real Google button on top (transparent, receives clicks) */}
        <div
          ref={googleButtonRef}
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.01,
            cursor: 'pointer',
            zIndex: 1,
          }}
        />
      </div>

      <button
        type="button"
        onClick={onAppleClick}
        disabled={isLoading}
        style={{
          ...socialBtnBase,
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#333338';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#222226';
        }}
      >
        <AppleIcon />
        {kloelT(`Continuar com Apple`)}
      </button>
    </div>
  );
}
