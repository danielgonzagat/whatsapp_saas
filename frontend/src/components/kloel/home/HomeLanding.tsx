import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';

function SendIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

interface HomeLandingProps {
  phase: 'home' | 'transitioning';
  homeInput: string;
  onHomeInputChange: (value: string) => void;
  onSubmit: () => void;
}

export function HomeLanding({ phase, homeInput, onHomeInputChange, onSubmit }: HomeLandingProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        position: 'relative',
        background: 'var(--app-bg-primary)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          width: '100%',
          position: 'relative',
          ...(phase === 'transitioning'
            ? { animation: 'homeExit 800ms ease-in-out forwards' }
            : {}),
        }}
      >
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            textAlign: 'center',
            maxWidth: 620,
            padding: '0 24px',
          }}
        >
          <div style={{ animation: 'fadeIn 1s ease forwards' }}>
            <p
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                color: colors.ember.primary,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                marginBottom: 28,
              }}
            >
              KLOEL
            </p>

            <h1
              style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: 36,
                fontWeight: 700,
                color: 'var(--app-text-primary)',
                lineHeight: 1.3,
                margin: '0 0 48px',
                letterSpacing: '-0.02em',
              }}
            >
              {kloelT(`O Marketing morreu`)}{' '}
              <span style={{ color: colors.ember.primary }}>{kloelT(`Digital`)}</span>
              <br />
              {kloelT(`e ressuscitou`)}{' '}
              <span style={{ color: colors.ember.primary }}>{kloelT(`Artificial.`)}</span>
            </h1>
          </div>

          <div style={{ animation: 'fadeIn 1s ease 400ms forwards' }}>
            <div
              style={{
                background: 'var(--app-bg-card)',
                border: '1px solid var(--app-border-primary)',
                borderRadius: 6,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <input
                value={homeInput}
                onChange={(e) => onHomeInputChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                placeholder={kloelT(`Pergunte qualquer coisa...`)}
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--app-text-primary)',
                  fontSize: 14,
                  fontFamily: "'Sora', sans-serif",
                }}
              />
              <button
                type="button"
                onClick={onSubmit}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 6,
                  background: homeInput.trim() ? colors.ember.primary : colors.background.elevated,
                  border: 'none',
                  cursor: homeInput.trim() ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: homeInput.trim() ? colors.background.void : colors.text.dim,
                  transition: 'all 150ms ease',
                }}
              >
                <SendIcon size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
