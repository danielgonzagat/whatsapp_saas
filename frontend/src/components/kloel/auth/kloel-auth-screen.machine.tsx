'use client';
import { kloelT } from '@/lib/i18n/t';
import { UI } from '@/lib/ui-tokens';
import { useEffect, useState } from 'react';
import { HORIZONTAL_GRID_LINES, VERTICAL_GRID_LINES, typingDelayFor } from './auth-screen-data';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion';

const sora = "var(--font-sora), 'Sora', sans-serif";
const jetbrains = "var(--font-jetbrains), 'JetBrains Mono', monospace";

/** Initial cursor index inside the typing animation. */
const TYPING_INITIAL_INDEX = 0;
/** Delay (ms) before the typing loop restarts after the phrase finishes. */
const TYPING_RESTART_DELAY_MS = 8_000;
/** Initial delay (ms) before the typing animation begins on mount. */
const TYPING_START_DELAY_MS = 220;

export function AuthManifestTyping() {
  const basePhrase = 'O Marketing Digital não sabe o que você precisa, ';
  const accentPhrase = 'o Kloel sabe.';
  const phrase = `${basePhrase}${accentPhrase}`;
  const [text, setText] = useState('');
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) {
      setText(phrase);
      return;
    }

    let timeoutId: number | null = null;
    let alive = true;

    const schedule = (fn: () => void, delay: number) => {
      timeoutId = window.setTimeout(fn, delay);
    };

    const typePhrase = (source: string) => {
      let index = TYPING_INITIAL_INDEX;
      const step = () => {
        if (!alive) {
          return;
        }
        index += 1;
        setText(source.slice(0, index));
        if (index >= source.length) {
          schedule(() => {
            if (!alive) {
              return;
            }
            setText('');
            typePhrase(source);
          }, TYPING_RESTART_DELAY_MS);
          return;
        }
        schedule(step, typingDelayFor(source[index - 1]));
      };
      schedule(step, TYPING_START_DELAY_MS);
    };

    setText('');
    typePhrase(phrase);

    return () => {
      alive = false;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [phrase, prefersReducedMotion]);

  const sharedLineStyle: React.CSSProperties = {
    fontFamily: sora,
    fontSize: 22,
    fontWeight: 700,
    lineHeight: 1.4,
    margin: 0,
    textAlign: 'center',
  };

  const cursorStyle = (active: boolean, color: string): React.CSSProperties => ({
    display: active ? 'inline-block' : 'none',
    marginLeft: 2,
    color,
    animation: 'blink 1s step-end infinite',
  });

  return (
    <div
      style={{
        marginBottom: 12,
        minHeight: 96,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <p
        style={{
          ...sharedLineStyle,
          maxWidth: 420,
          whiteSpace: 'normal',
          overflowWrap: 'break-word',
        }}
      >
        <span style={{ color: UI.text }}>
          {text.slice(0, Math.min(text.length, basePhrase.length))}
        </span>
        <span style={{ color: UI.accent }}>
          {text.length > basePhrase.length
            ? accentPhrase.slice(0, text.length - basePhrase.length)
            : ''}
        </span>
        <span
          style={cursorStyle(
            !prefersReducedMotion,
            text.length > basePhrase.length ? UI.accent : UI.text,
          )}
        >
          |
        </span>
      </p>
    </div>
  );
}

/**
 * RIGHT PANEL — "The Machine"
 *
 * Renders the right-side promotional panel with grid background,
 * the manifest typing animation, and the auth screen subtitle.
 */
export function TheMachine() {
  return (
    <div
      style={{
        alignItems: 'center',
        background: UI.bg,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        justifyContent: 'center',
        overflow: 'hidden',
        padding: '48px 40px',
        position: 'relative',
        width: '100%',
      }}
    >
      {/* grid lines */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {/* horizontal */}
        {HORIZONTAL_GRID_LINES.map((line) => (
          <div
            key={line.id}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${line.top}%`,
              height: 1,
              background: UI.text,
              opacity: 0.03,
            }}
          />
        ))}
        {/* vertical */}
        {VERTICAL_GRID_LINES.map((line) => (
          <div
            key={line.id}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${line.left}%`,
              width: 1,
              background: UI.text,
              opacity: 0.03,
            }}
          />
        ))}
      </div>

      {/* corner marks */}
      {[
        { top: 24, left: 24, rotate: '0deg' },
        { top: 24, right: 24, rotate: '90deg' },
        { bottom: 24, right: 24, rotate: '180deg' },
        { bottom: 24, left: 24, rotate: '270deg' },
      ].map((pos) => (
        <svg
          key={pos.rotate}
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          style={{
            position: 'absolute',
            ...pos,
            transform: `rotate(${pos.rotate})`,
          }}
          aria-hidden="true"
        >
          <path d={kloelT(`M0 16V0h1v15h15v1H0z`)} fill={UI.border} />
        </svg>
      ))}

      {/* content */}
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 440 }}>
        {/* eyebrow */}
        <p
          style={{
            fontFamily: jetbrains,
            fontSize: 10,
            fontWeight: 500,
            color: UI.accent,
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            marginBottom: 24,
          }}
        >
          {kloelT(`MARKETING ARTIFICIAL`)}
        </p>

        {/* manifesto */}
        <AuthManifestTyping />

        {/* subtitle */}
        <p
          style={{
            fontFamily: sora,
            fontSize: 13,
            color: UI.muted,
            lineHeight: 1.6,
            marginBottom: 40,
          }}
        >
          {kloelT(
            `A primeira e unica inteligencia comercial autonoma do mundo. Voce pensa. A IA age.`,
          )}
        </p>

        <div
          style={{
            width: 112,
            height: 1,
            margin: '0 auto 40px',
            background: UI.accentLight,
          }}
        />

        {/* stats strip */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 48,
            marginBottom: 48,
          }}
        >
          {[
            { value: '1', label: 'plataforma' },
            { value: '0', label: 'codigo' },
            { value: '∞', label: 'canais' },
          ].map((stat) => (
            <div key={stat.label} style={{ textAlign: 'center' }}>
              <p
                style={{
                  fontFamily: jetbrains,
                  fontSize: 28,
                  fontWeight: 700,
                  color: UI.accent,
                  lineHeight: 1,
                  marginBottom: 6,
                }}
              >
                {stat.value}
              </p>
              <p
                style={{
                  fontFamily: jetbrains,
                  fontSize: 10,
                  color: UI.muted,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}
              >
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        {/* version tag */}
        <p
          style={{
            fontFamily: jetbrains,
            fontSize: 10,
            color: UI.tertiary,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
          }}
        >
          {kloelT(`Kloel v1.0 &mdash; SISTEMA ATIVO`)}
        </p>
      </div>
    </div>
  );
}
