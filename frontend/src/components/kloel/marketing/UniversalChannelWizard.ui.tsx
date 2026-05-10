import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { UI } from '@/lib/ui-tokens';
import { B, E, F, G, M, S } from './UniversalChannelWizard.styles';

export function StepDot({ active, done }: { active: boolean; done: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: UI.radiusFull,
        background: done ? G : active ? E : 'var(--app-text-placeholder)',
        opacity: done ? 0.6 : 1,
        transition: 'all .2s',
      }}
    />
  );
}

export function SecondaryButton({
  onClick,
  disabled = false,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: F,
        fontSize: 13,
        padding: '10px 20px',
        borderRadius: UI.radiusSm,
        border: `1px solid ${B}`,
        background: 'transparent',
        color: KLOEL_THEME.textPrimary,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 500,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function PrimaryButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: F,
        fontSize: 13,
        padding: '10px 28px',
        borderRadius: UI.radiusSm,
        border: 'none',
        background: disabled ? 'var(--app-text-placeholder)' : E,
        color: 'var(--app-text-on-accent)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 600,
        opacity: disabled ? 0.6 : 1,
        transition: 'all .2s',
      }}
    >
      {children}
    </button>
  );
}

export function WizardNav({
  stepLabel,
  onPrev,
  onNext,
}: {
  stepLabel: string;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  return (
    <div
      style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}
    >
      <span style={{ fontSize: 11, color: S, fontFamily: M }}>{kloelT(stepLabel)}</span>
      <div style={{ display: 'flex', gap: 8 }}>
        {onPrev ? <SecondaryButton onClick={onPrev}>{kloelT('Voltar')}</SecondaryButton> : null}
        {onNext ? <SecondaryButton onClick={onNext}>{kloelT('Proximo')}</SecondaryButton> : null}
      </div>
    </div>
  );
}
