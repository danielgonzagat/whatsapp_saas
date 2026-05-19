'use client';

import { useEffect, useState } from 'react';
import { colors } from '@/lib/design-tokens';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';
import { delayForTypewriter, runSequentialRange } from './KloelLanding.helpers';
import { KloelMushroomVisual } from '../KloelBrand';
import { kloelT } from '@/lib/i18n/t';

const E = colors.ember.primary;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const FINAL_MANIFEST_FIRST = 'Morre o Marketing Digital.';
const FINAL_MANIFEST_SECOND_PREFIX = 'Nasce o ';
const FINAL_MANIFEST_SECOND_EMPHASIS = 'Marketing Artificial';
const FINAL_MANIFEST_SECOND = `${FINAL_MANIFEST_SECOND_PREFIX}${FINAL_MANIFEST_SECOND_EMPHASIS}`;

type Tone = 'light' | 'ember';

export function FinalManifestLoop() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [text, setText] = useState('');
  const [tone, setTone] = useState<Tone>('light');

  useEffect(() => {
    if (prefersReducedMotion) {
      queueMicrotask(() => setTone('ember'));
      queueMicrotask(() => setText(FINAL_MANIFEST_SECOND));
      return;
    }

    let alive = true;

    const typePhrase = async (phrase: string, nextTone: Tone) => {
      setTone(nextTone);
      await runSequentialRange(
        1,
        phrase.length,
        1,
        async (index) => {
          setText(phrase.slice(0, index));
          await wait(delayForTypewriter(phrase[index - 1], 'type', index - 1, phrase));
          if (phrase === FINAL_MANIFEST_SECOND && index === FINAL_MANIFEST_SECOND_PREFIX.length) {
            await wait(320);
          }
        },
        () => alive,
      );
    };

    const deletePhrase = async (phrase: string, nextTone: Tone) => {
      setTone(nextTone);
      await runSequentialRange(
        phrase.length - 1,
        0,
        -1,
        async (index) => {
          setText(phrase.slice(0, index));
          await wait(delayForTypewriter(phrase[index], 'delete', index, phrase));
        },
        () => alive,
      );
    };

    const run = async (): Promise<void> => {
      if (!alive) {
        return;
      }

      const cycle = async (): Promise<void> => {
        if (!alive) {
          return;
        }

        setText('');
        setTone('light');
        await wait(420);
        await typePhrase(FINAL_MANIFEST_FIRST, 'light');
        if (!alive) {
          return;
        }
        await wait(1600);
        await deletePhrase(FINAL_MANIFEST_FIRST, 'light');
        if (!alive) {
          return;
        }
        await wait(720);
        await typePhrase(FINAL_MANIFEST_SECOND, 'ember');
        if (!alive) {
          return;
        }
        await wait(8000);
        await deletePhrase(FINAL_MANIFEST_SECOND, 'ember');
        if (!alive) {
          return;
        }
        await wait(900);
        await cycle();
      };

      await cycle();
    };

    void run();
    return () => {
      alive = false;
    };
  }, [prefersReducedMotion]);

  const renderManifest = () => {
    if (!text) {
      return null;
    }

    if (tone === 'light') {
      return <span style={{ color: colors.text.silver }}>{text}</span>;
    }

    const prefix = FINAL_MANIFEST_SECOND_PREFIX.slice(
      0,
      Math.min(text.length, FINAL_MANIFEST_SECOND_PREFIX.length),
    );
    const emphasis =
      text.length > FINAL_MANIFEST_SECOND_PREFIX.length
        ? text.slice(FINAL_MANIFEST_SECOND_PREFIX.length)
        : '';

    return (
      <>
        {prefix ? <span style={{ color: colors.text.silver }}>{prefix}</span> : null}
        {emphasis ? <span style={{ color: E }}>{emphasis}</span> : null}
      </>
    );
  };

  const cursorColor =
    tone === 'ember' && text.length > FINAL_MANIFEST_SECOND_PREFIX.length ? E : colors.text.silver;

  return (
    <div
      className="landing-final-manifest-stack"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 28,
      }}
    >
      <KloelMushroomVisual
        size={136}
        traceColor={kloelT('colors.text.silver')}
        animated={!prefersReducedMotion}
        spores={prefersReducedMotion ? 'none' : 'animated'}
        ariaHidden
        style={{
          width: 'clamp(92px, 12vw, 136px)',
          height: 'clamp(92px, 12vw, 136px)',
          display: 'block',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          minHeight: 'clamp(74px, 12vw, 120px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          padding: '0 12px',
        }}
      >
        <h2
          className="landing-final-manifest-line"
          style={{
            fontSize: 'clamp(22px,3.8vw,40px)',
            fontWeight: 800,
            lineHeight: 1.12,
            letterSpacing: '-.03em',
            margin: 0,
            whiteSpace: 'normal',
            textAlign: 'center',
            maxWidth: '100%',
            textWrap: 'balance',
          }}
        >
          {renderManifest()}
          <span
            style={{
              color: cursorColor,
              animation: prefersReducedMotion ? 'none' : 'blink 1s ease infinite',
            }}
          >
            |
          </span>
        </h2>
      </div>
    </div>
  );
}
