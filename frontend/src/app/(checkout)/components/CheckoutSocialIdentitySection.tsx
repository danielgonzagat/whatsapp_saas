'use client';

import { kloelT } from '@/lib/i18n/t';
import { useMemo, useState } from 'react';
import type { RefObject } from 'react';
import type {
  CheckoutSocialIdentitySnapshot,
  CheckoutSocialProvider,
} from '../hooks/useCheckoutSocialIdentity';
import type { CheckoutVisualTheme } from './checkout-theme-tokens';

type Props = {
  theme: CheckoutVisualTheme;
  facebookAvailable: boolean;
  facebookSdkReady: boolean;
  googleAvailable: boolean;
  googleButtonRef: RefObject<HTMLDivElement | null>;
  onFacebookClick: () => Promise<void>;
  socialIdentity: CheckoutSocialIdentitySnapshot | null;
  loadingProvider: CheckoutSocialProvider | null;
  error?: string;
};

/** Checkout social identity section. */
export function CheckoutSocialIdentitySection({
  theme,
  facebookAvailable,
  facebookSdkReady,
  googleAvailable,
  googleButtonRef,
  onFacebookClick,
  socialIdentity: _socialIdentity,
  loadingProvider,
  error,
}: Props) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 18,
        }}
      >
        <div style={{ flex: 1, height: 1, background: theme.socialDivider }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px' }}>
          <GoogleIconButton
            available={googleAvailable}
            buttonRef={googleButtonRef}
            loading={loadingProvider === 'google'}
          />
          <ActionSocialButton
            icon={<FacebookIcon />}
            label={facebookSdkReady ? 'Continuar com Facebook' : 'Carregando Facebook'}
            available={facebookAvailable}
            loading={loadingProvider === 'facebook'}
            onClick={onFacebookClick}
          />
          <StaticSocialButton
            icon={<AppleIcon color={theme.socialApple} />}
            label={kloelT(`Apple em breve`)}
            loading={loadingProvider === 'apple'}
          />
        </div>
        <div style={{ flex: 1, height: 1, background: theme.socialDivider }} />
      </div>
      {error ? (
        <div style={{ marginBottom: 14, fontSize: 13, color: theme.errorText }}>{error}</div>
      ) : null}
      <ManualDivider theme={theme} />
    </div>
  );
}

function ManualDivider({ theme }: { theme: CheckoutVisualTheme }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1, height: 1, background: theme.socialDivider }} />
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: theme.softMutedText,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        {kloelT(`Identificação manual`)}
      </span>
      <div style={{ flex: 1, height: 1, background: theme.socialDivider }} />
    </div>
  );
}

function GoogleIconButton({
  available,
  buttonRef,
  loading,
}: {
  available: boolean;
  buttonRef: RefObject<HTMLDivElement | null>;
  loading: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const opacity = hovered ? 1 : 0.7;
  const transform = hovered ? 'scale(1.12)' : 'scale(1)';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        width: 48,
        height: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      title={available ? 'Continuar com Google' : 'Google indisponível'}
    >
      {loading ? (
        <Spinner color="rgb(66, 133, 244)" trackColor={kloelT(`rgba(58, 58, 63, 0.12)`)} />
      ) : (
        <div style={{ transform, opacity, transition: 'transform 0.2s ease, opacity 0.2s ease' }}>
          <GoogleIcon />
        </div>
      )}
      <div
        ref={buttonRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          opacity: available && !loading ? 0.015 : 0,
          overflow: 'hidden',
          pointerEvents: available && !loading ? 'auto' : 'none',
        }}
      />
    </div>
  );
}

function StaticSocialButton({
  icon,
  label,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  loading: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const state = useMemo(
    () => ({
      opacity: hovered ? 0.55 : 0.35,
      transform: hovered ? 'scale(1.06)' : 'scale(1)',
    }),
    [hovered],
  );

  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={label}
      style={{
        width: 48,
        height: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 'none',
        cursor: 'not-allowed',
        padding: 0,
      }}
    >
      {loading ? (
        <Spinner color="rgba(58, 58, 63, 0.52)" trackColor={kloelT(`rgba(58, 58, 63, 0.12)`)} />
      ) : (
        <div
          style={{
            opacity: state.opacity,
            transform: state.transform,
            transition: 'transform 0.2s ease, opacity 0.2s ease',
          }}
        >
          {icon}
        </div>
      )}
    </button>
  );
}

function ActionSocialButton({
  icon,
  label,
  loading,
  available,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  loading: boolean;
  available: boolean;
  onClick: () => Promise<void>;
}) {
  const [hovered, setHovered] = useState(false);
  const state = useMemo(
    () => ({
      opacity: hovered ? 1 : 0.8,
      transform: hovered ? 'scale(1.06)' : 'scale(1)',
    }),
    [hovered],
  );

  return (
    <button
      type="button"
      disabled={!available || loading}
      onClick={() => void onClick()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={label}
      style={{
        width: 48,
        height: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 'none',
        cursor: !available || loading ? 'default' : 'pointer',
        padding: 0,
        opacity: available ? 1 : 0.35,
      }}
    >
      {loading ? (
        <Spinner color="rgb(24, 119, 242)" trackColor={kloelT(`rgba(58, 58, 63, 0.12)`)} />
      ) : (
        <div
          style={{
            opacity: state.opacity,
            transform: state.transform,
            transition: 'transform 0.2s ease, opacity 0.2s ease',
          }}
        >
          {icon}
        </div>
      )}
    </button>
  );
}

function Spinner({ color, trackColor }: { color: string; trackColor: string }) {
  return (
    <div
      style={{
        width: 20,
        height: 20,
        border: `2px solid ${trackColor}`,
        borderTopColor: color,
        borderRadius: 16,
        animation: 'spin 0.6s linear infinite',
      }}
    />
  );
}

function GoogleIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={kloelT(
          `M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z`,
        )}
        fill="rgb(66, 133, 244)"
      />
      <path
        d={kloelT(
          `M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z`,
        )}
        fill="rgb(52, 168, 83)"
      />
      <path
        d={kloelT(
          `M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z`,
        )}
        fill="rgb(251, 188, 5)"
      />
      <path
        d={kloelT(
          `M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z`,
        )}
        fill="rgb(234, 67, 53)"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="rgb(24, 119, 242)" aria-hidden="true">
      <path
        d={kloelT(
          `M24 12.073c0-6.627-5.373-12-12-12S0 .073 0 12.073c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z`,
        )}
      />
    </svg>
  );
}

function AppleIcon({ color }: { color: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path
        d={kloelT(
          `M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z`,
        )}
      />
    </svg>
  );
}
