'use client';

import { KLOEL_THEME } from '@/lib/kloel-theme';
import { useTheme } from './ThemeProvider';

const pillStyle = {
  width: 64,
  height: 32,
  borderRadius: 16,
} as const;

export function ThemeToggle() {
  const { isDark, theme, toggleTheme } = useTheme();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        width: '100%',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: KLOEL_THEME.textPrimary,
            fontFamily: "'Sora', sans-serif",
          }}
        >
          Aparência
        </div>
        <div
          style={{
            marginTop: 3,
            fontSize: 11,
            color: KLOEL_THEME.textTertiary,
            fontFamily: "'Sora', sans-serif",
          }}
        >
          {isDark ? 'Escuro' : 'Claro'}
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label="Alternar tema"
        onClick={toggleTheme}
        style={{
          ...pillStyle,
          position: 'relative',
          border: `1px solid ${KLOEL_THEME.borderPrimary}`,
          background: isDark ? KLOEL_THEME.bgTertiary : KLOEL_THEME.bgSecondary,
          boxShadow: `inset 0 0 0 1px ${KLOEL_THEME.borderSubtle}`,
          cursor: 'pointer',
          outline: 'none',
          flexShrink: 0,
        }}
      >
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 10px',
            color: KLOEL_THEME.textTertiary,
            opacity: 0.96,
          }}
        >
          <SunIcon visible={!isDark} />
          <MoonIcon visible={isDark} />
        </span>
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: isDark ? 36 : 2,
            width: 26,
            height: 26,
            borderRadius: 999,
            background: isDark ? KLOEL_THEME.bgPrimary : KLOEL_THEME.bgCard,
            boxShadow: isDark
              ? `0 10px 18px rgba(0,0,0,0.28), 0 0 0 1px ${KLOEL_THEME.borderPrimary}`
              : `0 8px 16px rgba(15,23,42,0.14), 0 0 0 1px ${KLOEL_THEME.borderSubtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition:
              'left 0.4s cubic-bezier(0.68,-0.15,0.27,1.15), background-color 0.25s ease, box-shadow 0.25s ease',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 20,
              height: 20,
              borderRadius: 999,
              color: isDark ? '#F5F5F7' : KLOEL_THEME.accent,
              boxShadow: isDark
                ? '0 0 8px rgba(232, 93, 48, 0.14)'
                : '0 0 8px rgba(232, 93, 48, 0.24)',
            }}
          >
            {isDark ? <MoonIcon visible /> : <SunIcon visible />}
          </span>
        </span>
      </button>
    </div>
  );
}

function SunIcon({ visible }: { visible: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        opacity: visible ? 1 : 0.35,
        transform: visible ? 'rotate(0deg) scale(1)' : 'rotate(-70deg) scale(0.72)',
        transition: 'opacity 0.25s ease, transform 0.4s ease',
      }}
    >
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v2.2" />
      <path d="M12 19.3v2.2" />
      <path d="m4.93 4.93 1.56 1.56" />
      <path d="m17.51 17.51 1.56 1.56" />
      <path d="M2.5 12h2.2" />
      <path d="M19.3 12h2.2" />
      <path d="m4.93 19.07 1.56-1.56" />
      <path d="m17.51 6.49 1.56-1.56" />
    </svg>
  );
}

function MoonIcon({ visible }: { visible: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        opacity: visible ? 1 : 0.35,
        transform: visible ? 'rotate(0deg) scale(1)' : 'rotate(70deg) scale(0.72)',
        transition: 'opacity 0.25s ease, transform 0.4s ease',
      }}
    >
      <path d="M21 12.79A8.5 8.5 0 1 1 11.21 3 6.8 6.8 0 0 0 21 12.79Z" />
      <path d="M17.8 5.4h.01" />
      <path d="M19.6 7.1h.01" />
    </svg>
  );
}
