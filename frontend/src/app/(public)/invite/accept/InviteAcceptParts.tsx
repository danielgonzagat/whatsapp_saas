'use client';

import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';

/** Shared font stack for the accept-invite surfaces. */
export const sora = "var(--font-sora), 'Sora', sans-serif";

/** Open-eye glyph — toggles a password field to plaintext. */
export function EyeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={colors.text.dim}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={kloelT(`M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z`)} />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Struck-through-eye glyph — toggles a password field back to masked. */
export function EyeOffIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={colors.text.dim}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d={kloelT(
          `M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94`,
        )}
      />
      <path d={kloelT(`M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19`)} />
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d={kloelT(`M14.12 14.12a3 3 0 1 1-4.24-4.24`)} />
    </svg>
  );
}

/** Honest state shown when the invite token is missing/expired. */
export function InviteInvalidToken({ onBack }: { readonly onBack: () => void }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: colors.background.void,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: sora,
        padding: 24,
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: colors.text.silver,
            marginBottom: 12,
          }}
        >
          {kloelT(`Convite invalido`)}
        </h1>
        <p
          style={{
            fontSize: 14,
            color: colors.text.muted,
            marginBottom: 24,
            lineHeight: 1.5,
          }}
        >
          {kloelT(`O link de convite esta invalido ou expirado. Solicite um novo convite ao
          administrador do workspace.`)}
        </p>
        <button
          type="button"
          onClick={onBack}
          style={{
            height: 44,
            padding: '0 24px',
            background: colors.ember.primary,
            color: colors.text.inverted,
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            fontFamily: sora,
            cursor: 'pointer',
          }}
        >
          {kloelT(`Voltar ao login`)}
        </button>
      </div>
    </div>
  );
}
