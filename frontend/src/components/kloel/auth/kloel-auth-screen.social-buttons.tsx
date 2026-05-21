'use client';
import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import { FacebookIcon, GoogleIcon, TikTokIcon } from './kloel-auth-screen.icons';
import { AppleSignInButton } from '@/components/login/AppleSignInButton';

const sora = "var(--font-sora), 'Sora', sans-serif";

interface SocialButtonsProps {
  googleButtonRef: React.RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  isAppleLoading?: boolean;
  onAppleClick: () => void;
  onFacebookClick?: () => void;
  facebookAvailable?: boolean;
  facebookSdkReady?: boolean;
  onTikTokClick?: () => void;
  tikTokAvailable?: boolean;
}

const socialBtnBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  height: 44,
  background: colors.background.surface,
  border: `1px solid ${colors.stroke}`,
  borderRadius: 6,
  color: colors.text.silver,
  fontSize: 13,
  fontFamily: sora,
  transition: 'border-color 150ms ease, opacity 150ms ease',
};

export function SocialButtons({
  googleButtonRef,
  isLoading,
  isAppleLoading = false,
  onAppleClick,
  onFacebookClick = () => {},
  facebookAvailable = false,
  facebookSdkReady = false,
  onTikTokClick = () => {},
  tikTokAvailable = false,
}: SocialButtonsProps) {
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

      {facebookAvailable ? (
        <button
          type="button"
          onClick={onFacebookClick}
          disabled={isLoading || !facebookSdkReady}
          style={{
            ...socialBtnBase,
            cursor: isLoading || !facebookSdkReady ? 'default' : 'pointer',
            opacity: facebookSdkReady ? 1 : 0.45,
          }}
          onMouseEnter={(e) => {
            if (!facebookSdkReady || isLoading) {
              return;
            }
            e.currentTarget.style.borderColor = colors.border.glow;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = colors.background.border;
          }}
          title={facebookSdkReady ? 'Continuar com Facebook' : 'Carregando Facebook...'}
        >
          <FacebookIcon />
          {kloelT(`Facebook`)}
        </button>
      ) : null}

      {tikTokAvailable ? (
        <button
          type="button"
          onClick={onTikTokClick}
          disabled={isLoading}
          style={{
            ...socialBtnBase,
            cursor: isLoading ? 'default' : 'pointer',
          }}
          onMouseEnter={(e) => {
            if (isLoading) {
              return;
            }
            e.currentTarget.style.borderColor = colors.border.glow;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = colors.background.border;
          }}
          title="Continuar com TikTok"
        >
          <TikTokIcon />
          {kloelT(`TikTok`)}
        </button>
      ) : null}

      <AppleSignInButton onClick={onAppleClick} isLoading={isAppleLoading} />
    </div>
  );
}
