'use client';

import { kloelT } from '@/lib/i18n/t';
import { useEffect, useRef, useState } from 'react';
import { THANOS_ICONS } from './thanos-icons';
import { colors } from '@/lib/design-tokens';
import {
  E,
  ELEVATED,
  EMPTY_MESSAGES,
  F,
  M,
  SALES_CHANNELS,
  SALES_DELAY_MS,
  SUCCESS,
  SURFACE,
  THANOS_STYLES,
  THANOS_TITLE,
  type ChannelKey,
  type SalesMessage,
} from './thanos-section.const';
import { useSalesFlow } from '@/hooks/useSalesFlow';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setPrefersReducedMotion(mediaQuery.matches);

    apply();
    mediaQuery.addEventListener?.('change', apply);
    return () => mediaQuery.removeEventListener?.('change', apply);
  }, []);

  return prefersReducedMotion;
}

function ThanosOmniSales({ runToken }: { runToken: number }) {
  const [msgs, setMsgs] = useState<Record<ChannelKey, SalesMessage[]>>(() => ({ ...EMPTY_MESSAGES, wa: [], ig: [], fb: [], em: [], sms: [], tt: [] }));
  const { messages: flowMessages } = useSalesFlow();

  useEffect(() => {
    if (!runToken) {
      return;
    }

    let cancelled = false;
    setMsgs(() => ({ wa: [], ig: [], fb: [], em: [], sms: [], tt: [] }));

    const run = async () => {
      for (const msg of flowMessages) {
        await wait(msg.f === '$' ? 520 : msg.f === 'a' ? 380 : 260);
        if (cancelled) {
          return;
        }
        setMsgs((prev) => ({ ...prev, [msg.ch]: [...prev[msg.ch], msg] }));
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [runToken]);

  return (
    <div style={{ animation: runToken ? 'thanosIn .6s cubic-bezier(.22,1,.36,1) both' : 'none' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'var(--c3)', gap: 16 }}>
        {(Object.keys(SALES_CHANNELS) as ChannelKey[]).map((key) => (
          <div
            key={key}
            style={{ background: SURFACE, borderRadius: 6, border: `1px solid ${ELEVATED}` }}
          >
            <div
              style={{
                padding: '8px 12px',
                borderBottom: `1px solid ${ELEVATED}`,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 4,
                  background: SALES_CHANNELS[key].c,
                }}
              />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: SALES_CHANNELS[key].c,
                  fontFamily: M,
                }}
              >
                {SALES_CHANNELS[key].n}
              </span>
            </div>
            <div
              style={{
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                minHeight: 60,
              }}
            >
              {(msgs[key] || []).slice(-3).map((msg) =>
                msg.f === '$' ? (
                  <div
                    key={key + '-' + msg.f + '-' + msg.t}
                    style={{ textAlign: 'center', animation: 'thanosIn .18s ease both' }}
                  >
                    <span style={{ fontSize: 9, fontWeight: 700, color: SUCCESS, fontFamily: M }}>
                      {msg.t}
                    </span>
                  </div>
                ) : (
                  <div
                    key={key + '-' + msg.f + '-' + msg.t}
                    style={{
                      alignSelf: msg.f === 'a' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                      animation: 'thanosIn .18s ease both',
                    }}
                  >
                    <div
                      style={{
                        background: msg.f === 'a' ? ELEVATED : colors.ember.bg,
                        borderRadius: 4,
                        padding: '4px 8px',
                        fontSize: 10,
                        color: colors.text.silver,
                        lineHeight: 1.4,
                        fontFamily: F,
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word',
                      }}
                    >
                      {msg.t}
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Thanos section. */
export default function ThanosSection() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const secRef = useRef<HTMLDivElement | null>(null);
  const [started, setStarted] = useState(false);
  const [showReveal, setShowReveal] = useState(false);
  const [showSales, setShowSales] = useState(false);
  const [salesRunToken, setSalesRunToken] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion) {
      setStarted(false);
      setShowReveal(true);
      setShowSales(true);
      return;
    }

    const el = secRef.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (prefersReducedMotion || !started) {
      return;
    }

    let alive = true;
    const run = async () => {
      while (alive) {
        setShowReveal(false);
        setShowSales(false);
        await wait(4200);
        if (!alive) {
          return;
        }
        setShowReveal(true);
        await wait(SALES_DELAY_MS);
        if (!alive) {
          return;
        }
        setSalesRunToken((value) => value + 1);
        setShowSales(true);
        await wait(7600);
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, [prefersReducedMotion, started]);

  return (
    <div ref={secRef} style={{ position: 'relative' }}>
      <section
        className="thanos-stage"
        style={{
          padding: '0 24px',
          maxWidth: 860,
          margin: '0 auto',
          position: 'relative',
          minHeight: '80vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <canvas
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
        {!prefersReducedMotion && (
          <div
            className={showReveal ? 'thanos-icons thanos-icons--exit' : 'thanos-icons'}
            aria-hidden={showReveal}
          >
            <h2>{kloelT(THANOS_TITLE)}</h2>
            <div>
              {THANOS_ICONS.map((icon, index) => (
                <span key={icon.id} style={{ animationDelay: index * 55 + 'ms' }}>
                  <img src={icon.d} alt="" loading="lazy" decoding="async" />
                </span>
              ))}
            </div>
          </div>
        )}
        {(prefersReducedMotion || showReveal) && (
          <div
            className="thanos-reveal"
            style={{
              position: 'relative',
              zIndex: 2,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '0 24px',
              animation: prefersReducedMotion ? 'none' : 'thanosIn .8s ease both',
            }}
          >
            <h2
              style={{
                fontSize: 'clamp(28px,4.5vw,40px)',
                fontWeight: 800,
                color: E,
                letterSpacing: 0,
                textAlign: 'center',
                marginBottom: showSales ? 52 : 0,
              }}
            >
              {kloelT('O Kloel escala.')}
            </h2>
            {(prefersReducedMotion || showSales) && (
              <div style={{ width: '100%', maxWidth: 740 }}>
                <ThanosOmniSales runToken={prefersReducedMotion ? 0 : salesRunToken} />
              </div>
            )}
          </div>
        )}
      </section>
      <style>{THANOS_STYLES}</style>
    </div>
  );
}
