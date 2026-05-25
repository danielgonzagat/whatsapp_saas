import type { CSSProperties, ReactNode } from 'react';
import type { OnboardingPalette } from './palette';
import { SORA, MONO, PILL_RADIUS } from './palette';

interface StepBarProps {
  step: number;
  C: OnboardingPalette;
  onStepClick?: (step: number) => void;
}

const STEP_BAR_COUNT = 4;

/** Step bar — four abstract traces, no visible numbers (spec §5). */
export function StepBar({ step, C, onStepClick }: StepBarProps) {
  const interactive = typeof onStepClick === 'function';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
      {Array.from({ length: STEP_BAR_COUNT }, (_, i) => i).map((i) => {
        const traceStyle: CSSProperties = {
          width: 28,
          height: 2,
          display: 'block',
          background: i <= step ? C.ember : C.hi,
          opacity: i === step ? 1 : i < step ? 0.6 : 1,
          transition: 'all .4s ease',
        };

        if (interactive) {
          const buttonStyle: CSSProperties = {
            width: 28,
            height: 12,
            display: 'flex',
            alignItems: 'center',
            background: 'transparent',
            border: 0,
            padding: 0,
            borderRadius: 0,
            cursor: 'pointer',
          };

          return (
            <button
              key={i}
              type="button"
              aria-current={i === step ? 'step' : undefined}
              aria-label={`Passo ${i + 1}`}
              onClick={() => onStepClick(i)}
              style={buttonStyle}
            >
              <span aria-hidden style={traceStyle} />
            </button>
          );
        }

        return <div key={i} style={traceStyle} />;
      })}
    </div>
  );
}

/** Mono uppercase micro-label (provider chip, step subtitle). */
export function Chip({
  children,
  dim,
  C,
}: {
  children: ReactNode;
  dim?: boolean;
  C: OnboardingPalette;
}) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 11,
        color: dim ? C.dim : C.muted,
        letterSpacing: 1.8,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </span>
  );
}

type CTAVariant = 'primary' | 'ember' | 'ghost';

/** The single button of the screen (spec §7 / §9). */
export function CTA({
  children,
  onClick,
  variant = 'primary',
  disabled,
  small,
  C,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: CTAVariant;
  disabled?: boolean;
  small?: boolean;
  C: OnboardingPalette;
}) {
  const tones: Record<CTAVariant, { bg: string; color: string; hover: string }> = {
    primary: { bg: C.silver, color: C.void, hover: C.primaryHover },
    ember: { bg: C.ember, color: C.void, hover: C.emberHi },
    ghost: { bg: 'transparent', color: C.muted, hover: 'transparent' },
  };
  const v = tones[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: v.bg,
        color: v.color,
        border: 'none',
        height: small ? 36 : 48,
        padding: small ? '0 18px' : '0 30px',
        fontSize: small ? 12 : 13.5,
        fontFamily: SORA,
        fontWeight: 500,
        letterSpacing: 0.1,
        borderRadius: 6,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        transition: 'background .15s ease',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        outline: 'none',
      }}
      onMouseEnter={(e) => {
        if (!disabled && variant !== 'ghost') {
          e.currentTarget.style.background = v.hover;
        }
      }}
      onMouseLeave={(e) => {
        if (variant !== 'ghost') {
          e.currentTarget.style.background = v.bg;
        }
      }}
      onFocus={(e) => {
        if (!disabled) {
          e.currentTarget.style.boxShadow = `0 0 0 2px ${C.ember}`;
        }
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {children}
    </button>
  );
}

export function Arrow({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

export function Back({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

/** Three-point dial — minimal art instead of an HTML slider (spec §7). */
export function Dial({
  label,
  value,
  onChange,
  labels,
  C,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  labels: readonly string[];
  C: OnboardingPalette;
}) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            color: C.dim,
            letterSpacing: 1.6,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        <span style={{ fontFamily: SORA, fontSize: 12.5, color: C.silver }}>
          {labels[value]}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {labels.map((segLabel, i) => (
          <button
            type="button"
            key={segLabel}
            aria-label={segLabel}
            onClick={() => onChange(i)}
            style={{
              flex: 1,
              height: 6,
              padding: 0,
              background: i === value ? C.ember : C.hi,
              border: 'none',
              borderRadius: PILL_RADIUS,
              cursor: 'pointer',
              transition: 'background .2s ease',
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Vignette — the skeleton shared by every step (spec §7). */
export function Vinheta({
  head,
  sub,
  footer,
  action,
  C,
}: {
  head: ReactNode;
  sub?: ReactNode;
  footer?: ReactNode;
  action: ReactNode;
  C: OnboardingPalette;
}) {
  const headStyle: CSSProperties = {
    margin: 0,
    fontFamily: SORA,
    fontWeight: 300,
    fontSize: 38,
    lineHeight: 1.1,
    letterSpacing: -1.2,
    color: C.silver,
    maxWidth: 480,
  };
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 28,
      }}
    >
      <h1 style={headStyle}>{head}</h1>
      {sub ? (
        <div
          style={{
            fontFamily: MONO,
            fontSize: 11,
            color: C.muted,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            marginTop: -14,
          }}
        >
          {sub}
        </div>
      ) : null}
      {footer ? (
        <div style={{ width: '100%', maxWidth: 380, textAlign: 'left' }}>{footer}</div>
      ) : null}
      <div style={{ marginTop: 8 }}>{action}</div>
    </div>
  );
}

export function NavRow({ back, next }: { back: ReactNode; next: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      {back}
      {next}
    </div>
  );
}
