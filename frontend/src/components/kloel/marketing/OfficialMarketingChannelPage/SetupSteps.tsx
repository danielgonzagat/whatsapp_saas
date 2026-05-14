import { useEffect, useState } from 'react';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import type { ChannelKey } from '../OfficialMarketingChannelPage.helpers';
import { CHANNEL_META } from '../OfficialMarketingChannelPage.helpers';

export const SETUP_STEPS = ['Conexão', 'Produtos', 'Arsenal', 'Configuração'] as const;

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

    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const apply = () => setIsMobile(mediaQuery.matches);
    apply();
    mediaQuery.addEventListener?.('change', apply);
    return () => mediaQuery.removeEventListener?.('change', apply);
  }, []);

  return isMobile;
}

export function SetupSteps({ currentStep, setupLoaded, channel, onStepClick }: Props) {
  const meta = CHANNEL_META[channel];
  const isMobile = useMobileViewport();

  return (
    <ol
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile
          ? 'repeat(2, minmax(0, 1fr))'
          : 'repeat(4, minmax(0, 1fr))',
        gap: 10,
        margin: '0 0 22px',
        padding: 0,
        listStyle: 'none',
        overflowX: 'auto',
      }}
    >
      {SETUP_STEPS.map((step, index) => (
        <li
          key={step}
          aria-current={currentStep === index ? 'step' : undefined}
          style={{
            minHeight: 72,
            minWidth: isMobile ? 0 : 170,
          }}
        >
          <button
            type="button"
            aria-label={`Passo ${index + 1}`}
            disabled={!setupLoaded}
            onClick={() => onStepClick(index)}
            style={{
              width: '100%',
              minHeight: 72,
              borderRadius: 6,
              border: `1px solid ${KLOEL_THEME.borderPrimary}`,
              display: 'grid',
              gridTemplateColumns: '32px 1fr',
              gap: 10,
              alignItems: 'center',
              background:
                currentStep === index ? 'rgba(232,93,48,.14)' : KLOEL_THEME.bgSecondary,
              padding: 14,
              cursor: setupLoaded ? 'pointer' : 'not-allowed',
              opacity: setupLoaded ? 1 : 0.62,
              textAlign: 'left',
            }}
          >
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: meta.color,
                color: KLOEL_THEME.textOnAccent,
                fontWeight: 800,
                fontFamily: "'JetBrains Mono', monospace",
                flexShrink: 0,
              }}
            >
              {index + 1}
            </span>
            <span
              style={{
                color: KLOEL_THEME.textPrimary,
                lineHeight: 1.45,
                fontSize: isMobile ? 14 : 16,
              }}
            >
              {step}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
