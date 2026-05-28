'use client';

import { t } from '@/lib/i18n/t';
import type * as React from 'react';
import type {
  CheckoutThemeInputTokens,
  CheckoutThemeStepTokens,
} from './checkout-theme-shared.helpers';

export {
  buildAvatar,
  buildFooterPrimaryLine,
  clampQty,
  fmt,
  formatCnpj,
  normalizeTestimonials,
  PAYMENT_BADGES,
} from './checkout-theme-shared.helpers';
export type {
  CheckoutThemeInputTokens,
  CheckoutThemeStepTokens,
} from './checkout-theme-shared.helpers';

/** Step bubble. */
export const StepBubble = ({
  n,
  state,
  onClick,
  label,
  theme,
}: {
  n: number;
  state: 'active' | 'done' | 'locked';
  onClick?: () => void;
  label: string;
  theme: CheckoutThemeStepTokens;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={state === 'locked' || !onClick}
    aria-disabled={state === 'locked' || !onClick}
    style={{
      background: 'none',
      border: 'none',
      padding: 0,
      cursor: state === 'locked' || !onClick ? 'default' : 'pointer',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
      opacity: state === 'locked' ? 0.35 : 1,
      transition: 'opacity 0.3s',
    }}
  >
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: 16,
        background:
          state === 'done'
            ? theme.lineActive
            : state === 'active'
              ? theme.activeBubbleBg
              : theme.lockedBubbleBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.35s cubic-bezier(.4,0,.2,1)',
        boxShadow: state === 'active' ? theme.activeShadow || 'none' : 'none',
      }}
    >
      {state === 'done' ? (
        <Chk stroke="rgb(255, 255, 255)" />
      ) : (
        <span style={{ color: 'rgb(255, 255, 255)', fontSize: 14, fontWeight: 700 }}>{n}</span>
      )}
    </div>
    <span
      style={{
        fontSize: 11,
        fontWeight: state === 'active' ? 700 : 500,
        color: state === 'active' ? theme.activeLabelColor : theme.lockedLabelColor,
        textAlign: 'center',
        lineHeight: 1.3,
        maxWidth: 80,
      }}
    >
      {label}
    </span>
  </button>
);

/** Step line. */
export const StepLine = ({
  active,
  theme,
}: {
  active: boolean;
  theme: Pick<CheckoutThemeStepTokens, 'lineActive' | 'lineInactive'>;
}) => (
  <div
    style={{
      flex: 1,
      height: 2,
      background: active ? theme.lineActive : theme.lineInactive,
      transition: 'background 0.4s',
      marginTop: 17,
    }}
  />
);

/** Chk. */
export const Chk = ({ stroke = 'rgb(16, 185, 129)' }: { stroke?: string }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke={stroke}
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/** Star. */
export const Star = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="rgb(251, 191, 36)"
    stroke="none"
    aria-hidden="true"
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

/** Ed. */
export const Ed = ({ stroke }: { stroke: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke={stroke}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={t(`M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7`)} />
    <path d={t(`M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z`)} />
  </svg>
);

/** Ch down. */
export const ChDown = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

/** Ch up. */
export const ChUp = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

/** Mn. */
export const Mn = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

/** Pl. */
export const Pl = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

/** Px. */
export const Px = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={t(`M6.5 6.5L12 12m0 0l5.5 5.5M12 12l5.5-5.5M12 12L6.5 17.5`)} />
  </svg>
);

/** Bc. */
export const Bc = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d={t(`M7 8v8M10 8v8M14 8v8M17 8v8`)} />
  </svg>
);

/** Cc. */
export const Cc = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
    <line x1="1" y1="10" x2="23" y2="10" />
  </svg>
);

/** Tag. */
export const Tag = ({ stroke }: { stroke: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke={stroke}
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={t(`M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z`)} />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);

/** Validation input. */
export function ValidationInput({
  id,
  name,
  value,
  onChange,
  placeholder,
  type = 'text',
  autoComplete,
  inputMode,
  maxLength,
  disabled = false,
  style = {},
  theme,
}: {
  id?: string | undefined;
  name?: string | undefined;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  type?: string | undefined;
  autoComplete?: string | undefined;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'] | undefined;
  maxLength?: number | undefined;
  disabled?: boolean | undefined;
  style?: React.CSSProperties | undefined;
  theme: CheckoutThemeInputTokens;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '13px 38px 13px 16px',
          background: theme.background,
          border: `1px solid ${theme.border}`,
          borderRadius: theme.radius,
          color: theme.text,
          fontSize: 15,
          fontFamily: "'DM Sans', sans-serif",
          transition: 'border-color 0.2s, box-shadow 0.2s',
          outline: 'none',
          cursor: disabled ? 'not-allowed' : 'text',
          ...style,
        }}
        onFocus={(event) => {
          if (disabled) {
            return;
          }
          event.target.style.borderColor = theme.focusBorder;
          event.target.style.boxShadow = theme.focusShadow;
        }}
        onBlur={(event) => {
          event.target.style.borderColor = theme.border;
          event.target.style.boxShadow = 'none';
        }}
      />
      {value.trim() ? (
        <span
          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}
        >
          <Chk />
        </span>
      ) : null}
    </div>
  );
}
