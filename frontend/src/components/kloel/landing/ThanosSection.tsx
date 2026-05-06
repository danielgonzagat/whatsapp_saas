'use client';

import { kloelT } from '@/lib/i18n/t';
import { useEffect, useRef, useState } from 'react';
import { THANOS_ICONS } from './thanos-icons';
import { colors } from '@/lib/design-tokens';

const F = "var(--font-sora), 'Sora', sans-serif";
const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";
const E = colors.ember.primary;
const SURFACE = colors.background.surface;
const ELEVATED = colors.background.elevated;
const SUCCESS = colors.state.success;
const THANOS_TITLE = 'Elas não escalam por você.';
const SALES_DELAY_MS = 1400;
const THANOS_STYLES = [
  '@keyframes thanosIn{from{opacity:0;transform:translate3d(0,8px,0)}to{opacity:1;transform:translate3d(0,0,0)}}',
  '@keyframes thanosIconExit{to{opacity:0;transform:translate3d(var(--x,0),28px,0) scale(.72);filter:blur(2px)}}',
  '.thanos-icons{position:absolute;inset:0;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px;pointer-events:none;contain:layout paint;transition:opacity .45s ease,transform .45s ease}',
  ".thanos-icons h2{margin:0;color:rgba(224,221,216,.75);font-family:var(--font-sora), 'Sora', sans-serif;font-size:clamp(18px,4.5vw,38px);font-weight:800;letter-spacing:0;text-align:center}",
  '.thanos-icons>div{display:grid;grid-template-columns:repeat(5,minmax(72px,1fr));gap:22px;width:min(100%,760px)}',
  '.thanos-icons span{display:grid;place-items:center;aspect-ratio:1;border-radius:16px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.06);box-shadow:0 14px 38px rgba(0,0,0,.2);will-change:transform,opacity;transform:translate3d(0,0,0)}',
  '.thanos-icons span:nth-child(odd){--x:-18px}.thanos-icons span:nth-child(even){--x:18px}.thanos-icons img{width:72%;height:72%;object-fit:contain;display:block;opacity:.68;filter:saturate(.88)}',
  '.thanos-icons--exit span{animation:thanosIconExit .72s cubic-bezier(.22,1,.36,1) both}.thanos-icons--exit{opacity:0;transform:translate3d(0,-6px,0)}',
  '@media(max-width:640px){.thanos-icons{gap:28px}.thanos-icons>div{grid-template-columns:repeat(2,minmax(86px,1fr));gap:14px;max-width:260px}.thanos-icons span{border-radius:14px}.thanos-icons img{width:68%;height:68%}}',
  '@media(prefers-reduced-motion:reduce){.thanos-icons,.thanos-icons span,.thanos-reveal{animation:none;transition:none}.thanos-icons{display:none}}',
].join('\n');

type ChannelKey = 'wa' | 'ig' | 'fb' | 'em' | 'sms' | 'tt';

type SalesMessage = {
  ch: ChannelKey;
  f: 'l' | 'a' | '$';
  t: string;
};

const SALES_CHANNELS: Record<ChannelKey, { n: string; c: string }> = {
  wa: { n: 'WhatsApp', c: E },
  ig: { n: 'Instagram', c: E },
  fb: { n: 'Messenger', c: E },
  em: { n: 'Email', c: E },
  sms: { n: 'SMS', c: E },
  tt: { n: 'TikTok', c: E },
};

const SALES_FLOW: SalesMessage[] = [
  { ch: 'wa', f: 'l', t: 'Oi, vi o anúncio!' },
  { ch: 'ig', f: 'l', t: 'Amei o produto!' },
  { ch: 'wa', f: 'a', t: 'Olá! R$497 ou 12x.' },
  { ch: 'fb', f: 'l', t: 'Tem disponível?' },
  { ch: 'em', f: 'a', t: 'Julia, bônus expira - 30% OFF' },
  { ch: 'ig', f: 'a', t: 'Cupom INSTA20 = 20% OFF!' },
  { ch: 'sms', f: 'a', t: 'Carrinho aberto!' },
  { ch: 'tt', f: 'l', t: 'Vi no TikTok!' },
  { ch: 'fb', f: 'a', t: 'R$497, acesso vitalício.' },
  { ch: 'wa', f: 'l', t: 'Quero!' },
  { ch: 'tt', f: 'a', t: 'Últimas vagas!' },
  { ch: 'wa', f: 'a', t: 'pay.kloel.com/ck/abc' },
  { ch: 'ig', f: 'l', t: 'Me manda!' },
  { ch: 'ig', f: 'a', t: 'pay.kloel.com/ck/pedro' },
  { ch: 'wa', f: '$', t: 'R$397 Pix' },
  { ch: 'em', f: '$', t: 'R$347 Pix' },
  { ch: 'ig', f: '$', t: 'R$397 cartão' },
  { ch: 'fb', f: '$', t: 'R$497 Pix' },
  { ch: 'sms', f: '$', t: 'R$297 recuperado' },
  { ch: 'tt', f: '$', t: 'R$397 Pix' },
];

const EMPTY_MESSAGES: Record<ChannelKey, SalesMessage[]> = {
  wa: [],
  ig: [],
  fb: [],
  em: [],
  sms: [],
  tt: [],
};

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
  const [msgs, setMsgs] = useState<Record<ChannelKey, SalesMessage[]>>(EMPTY_MESSAGES);

  useEffect(() => {
    if (!runToken) {
      return;
    }

    let cancelled = false;
    setMsgs(EMPTY_MESSAGES);

    const run = async () => {
      for (const msg of SALES_FLOW) {
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
