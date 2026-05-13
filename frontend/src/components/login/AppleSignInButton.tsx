'use client';

import { colors } from '@/lib/design-tokens';
import { AppleIcon } from '@/components/kloel/auth/kloel-auth-screen.icons';
import { useAppleDiagnostic } from '@/hooks/useAppleDiagnostic';

interface AppleSignInButtonProps {
  onClick: () => void;
  isLoading?: boolean;
}

const sora = "var(--font-sora), 'Sora', sans-serif";

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

export function AppleSignInButton({
  onClick,
  isLoading = false,
}: AppleSignInButtonProps) {
  const { ready } = useAppleDiagnostic();

  if (!ready) {
    if (typeof window !== 'undefined') {
      console.warn(
        '[AppleSignInButton] Apple Sign-In disabled: diagnostic not ready. ' +
          'Verify /auth/apple/diagnostic for configuration status.',
      );
    }
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      style={{
        ...socialBtnBase,
        cursor: isLoading ? 'not-allowed' : 'pointer',
        opacity: isLoading ? 0.6 : 1,
        width: '100%',
      }}
      onMouseEnter={(e) => {
        if (!isLoading) {
          e.currentTarget.style.borderColor = colors.border.glow;
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = colors.background.border;
      }}
    >
      <AppleIcon />
      Continuar com Apple
    </button>
  );
}
