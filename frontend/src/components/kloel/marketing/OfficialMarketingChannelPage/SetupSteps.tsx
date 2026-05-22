import { useEffect, useState } from 'react';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import type { ChannelKey } from '../OfficialMarketingChannelPage.helpers';
import { CHANNEL_META } from '../OfficialMarketingChannelPage.helpers';
import { FULL_ROUND_RADIUS } from './shared-styles';

export const SETUP_STEPS = Object.freeze([
  'Conectar',
  'Produtos',
  'Arsenal',
  'Configurar',
] as const);

interface Props {
  currentStep: number;
  setupLoaded: boolean;
  channel: ChannelKey;
  onStepClick: (step: number) => void;
}

const MOBILE_BREAKPOINT = 640;

function useMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);
  return isMobile;
}

/**
 * Circular numbered step indicator with connectors (Conectar → Produtos →
 * Arsenal → Configurar). Theme-token based so it adapts to light/dark
 * automatically. Steps are clickable once the real setup has loaded.
 */
export function SetupSteps({ currentStep, setupLoaded, channel, onStepClick }: Props) {
  const accent = CHANNEL_META[channel].color;
  const isMobile = useMobileViewport();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 0,
        margin: '0 0 28px',
        padding: 0,
      }}
    >
      {SETUP_STEPS.map((label, index) => {
        const done = index < currentStep;
        const active = index === currentStep;
        const reached = index <= currentStep;
        return (
          <div
            key={label}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              flex: index < SETUP_STEPS.length - 1 ? 1 : 'none',
              minWidth: 0,
            }}
          >
            <button
              type="button"
              aria-current={active ? 'step' : undefined}
              aria-label={`Passo ${index + 1}: ${label}`}
              disabled={!setupLoaded}
              onClick={() => onStepClick(index)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: setupLoaded ? 'pointer' : 'not-allowed',
                opacity: setupLoaded ? 1 : 0.55,
                flexShrink: 0,
                width: isMobile ? 56 : 92,
              }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: FULL_ROUND_RADIUS,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 800,
                  fontFamily: "'JetBrains Mono', monospace",
                  background: reached ? accent : KLOEL_THEME.bgSecondary,
                  color: reached ? KLOEL_THEME.textOnAccent : KLOEL_THEME.textSecondary,
                  border: active
                    ? `2px solid ${accent}`
                    : `2px solid ${reached ? accent : KLOEL_THEME.borderPrimary}`,
                  boxShadow: active ? `0 0 0 4px ${KLOEL_THEME.accentLight}` : 'none',
                  transition: 'all .25s',
                }}
              >
                {done ? '✓' : index + 1}
              </span>
              <span
                style={{
                  fontSize: isMobile ? 10 : 12,
                  textAlign: 'center',
                  color: active ? KLOEL_THEME.textPrimary : KLOEL_THEME.textSecondary,
                  fontWeight: active ? 700 : 500,
                  lineHeight: 1.3,
                }}
              >
                {label}
              </span>
            </button>
            {index < SETUP_STEPS.length - 1 ? (
              <span
                aria-hidden
                style={{
                  flex: 1,
                  height: 2,
                  marginTop: 17,
                  minWidth: 12,
                  background: index < currentStep ? accent : KLOEL_THEME.borderPrimary,
                  transition: 'background .25s',
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
