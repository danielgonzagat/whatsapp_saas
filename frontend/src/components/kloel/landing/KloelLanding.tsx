// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

'use client';
import { buildAuthUrl } from '@/lib/subdomains';
import Link from 'next/link';
import { useState, useEffect, useRef, useId } from 'react';
import { KloelBrandLockup, KloelMushroomVisual, KloelWordmark } from '../KloelBrand';
import ThanosSection from './ThanosSection';

const PATTERN_RE = /[.,!?]/;

const F = "var(--font-sora), 'Sora', sans-serif";
const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";
const E = '#E85D30';
const V = '#0A0A0C';
const GC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&!?<>{}|/\\~';
const rc = () => GC[Math.floor(Math.random() * GC.length)];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

function BrandDivider({ compact = false }: { compact?: boolean }) {
  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: compact ? 120 : 'min(72vw, 600px)',
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(232,93,48,0.8), transparent)',
          opacity: compact ? 0.7 : 0.45,
        }}
      />
    </div>
  );
}

function HeroLoop() {
  const L1 = 'O Marketing Digital';
  const DEATH = ' acabou.';
  const L2 = 'O Marketing Artificial começou.';
  const [vis, setVis] = useState({ text: '', strike: 0, suffix: '', phase: 'idle' });
  const [gx, setGx] = useState({
    on: false,
    text: '',
    shk: [0, 0],
    chr: 0,
    slices: [],
    flash: false,
  });
  const [resurrected, setResurrected] = useState(false);
  const noiseRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gxRef = useRef<boolean>(false);
  const m = useRef<boolean>(true);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    gxRef.current = gx.on;
  }, [gx.on, prefersReducedMotion]);

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    const cv = noiseRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    cv.width = 600;
    cv.height = 120;
    let raf2: number;
    const drawN = () => {
      if (!gxRef.current) {
        ctx.clearRect(0, 0, 600, 120);
        raf2 = requestAnimationFrame(drawN);
        return;
      }
      const img = ctx.createImageData(600, 120);
      for (let i = 0; i < img.data.length; i += 4) {
        const v2 = Math.random() * 255;
        img.data[i] = v2;
        img.data[i + 1] = v2;
        img.data[i + 2] = v2;
        img.data[i + 3] = Math.random() * 30;
      }
      ctx.putImageData(img, 0, 0);
      for (let y = 0; y < 120; y += 3) {
        ctx.fillStyle = `rgba(0,0,0,${0.1 + Math.random() * 0.06})`;
        ctx.fillRect(0, y, 600, 1);
      }
      raf2 = requestAnimationFrame(drawN);
    };
    raf2 = requestAnimationFrame(drawN);
    return () => {
      cancelAnimationFrame(raf2);
    };
  }, [prefersReducedMotion]);

  const scramble = (src, chaos) =>
    src
      .split('')
      .map((c) => (c === ' ' ? ' ' : Math.random() < chaos ? rc() : c))
      .join('');
  const mkSlices = () =>
    Array.from({ length: 5 }, () => ({
      top: Math.random() * 100,
      h: 2 + Math.random() * 14,
      off: (Math.random() - 0.5) * 28,
    }));

  useEffect(() => {
    if (prefersReducedMotion) {
      setVis({ text: '', strike: 0, suffix: '', phase: 'hidden' });
      setGx({ on: false, text: '', shk: [0, 0], chr: 0, slices: [], flash: false });
      setResurrected(true);
      return;
    }

    const run = async () => {
      // biome-ignore lint/performance/noAwaitInLoops: sequential processing required
      while (m.current) {
        setResurrected(false);
        setGx({ on: false, text: '', shk: [0, 0], chr: 0, slices: [], flash: false });
        // TYPE
        for (let i = 0; i <= L1.length; i++) {
          if (!m.current) return;
          setVis({ text: L1.slice(0, i), strike: 0, suffix: '', phase: 'typing' });
          // biome-ignore lint/performance/noAwaitInLoops: sequential typing animation — each character renders after the previous frame's delay
          await wait(L1[i] === ' ' ? 45 : 55 + Math.random() * 35);
        }
        await wait(450);
        // STRIKE
        setVis((d) => ({ ...d, phase: 'strike' }));
        for (let i = 0; i <= 100; i += 3) {
          if (!m.current) return;
          setVis((d) => ({ ...d, strike: i }));
          // biome-ignore lint/performance/noAwaitInLoops: sequential strike animation frames — each tick paints after the previous
          await wait(7);
        }
        await wait(250);
        // MORREU
        for (let i = 0; i <= DEATH.length; i++) {
          if (!m.current) return;
          setVis((d) => ({ ...d, suffix: DEATH.slice(0, i), phase: 'death' }));
          // biome-ignore lint/performance/noAwaitInLoops: sequential death-suffix typing animation
          await wait(75 + Math.random() * 35);
        }
        await wait(700);
        // GLITCH BUILD
        const full = L1 + DEATH;
        for (let i = 0; i < 8; i++) {
          if (!m.current) return;
          setGx({
            on: true,
            text: scramble(full, i * 0.06),
            shk: [(Math.random() - 0.5) * i * 0.6, (Math.random() - 0.5) * i * 0.4],
            chr: i * 1.8,
            slices: i > 4 ? mkSlices() : [],
            flash: false,
          });
          // biome-ignore lint/performance/noAwaitInLoops: sequential glitch-build animation frames
          await wait(45);
        }
        // CHAOS
        for (let i = 0; i < 16; i++) {
          if (!m.current) return;
          setGx({
            on: true,
            text: scramble(full, Math.min(1, 0.3 + i * 0.05)),
            shk: [(Math.random() - 0.5) * 14, (Math.random() - 0.5) * 7],
            chr: 8 + Math.random() * 7,
            slices: mkSlices(),
            flash: i === 8,
          });
          // biome-ignore lint/performance/noAwaitInLoops: sequential chaos-phase animation frames
          await wait(38);
        }
        // FLASH
        setGx((g) => ({ ...g, flash: true, chr: 20 }));
        await wait(50);
        // RESOLVE
        setVis((d) => ({ ...d, phase: 'hidden' }));
        // biome-ignore lint/performance/noAwaitInLoops: resolve-phase animation — each of the 14 frames must render with its own setGx state before sleeping; Promise.all would render all frames in the same tick and skip the dissolve-to-resolve transition
        for (let i = 0; i < 14; i++) {
          if (!m.current) return;
          const p = i / 14;
          const mixed = L2.split('')
            .map((c2, _ci) => (c2 === ' ' ? ' ' : Math.random() < p ? c2 : rc()))
            .join('');
          setGx({
            on: true,
            text: mixed,
            shk: [(Math.random() - 0.5) * (7 - p * 7), (Math.random() - 0.5) * (3 - p * 3)],
            chr: (1 - p) * 10,
            slices: p > 0.6 ? [] : mkSlices(),
            flash: false,
          });
          // biome-ignore lint/performance/noAwaitInLoops: 38ms per-frame delay is the perceived animation cadence — removing the await collapses the 14-frame resolve effect into a single visual jump
          await wait(38);
        }
        // CLEAN
        setGx({ on: false, text: '', shk: [0, 0], chr: 0, slices: [], flash: false });
        setResurrected(true);
        await wait(3200);
        // GLITCH BACK
        for (let i = 0; i < 6; i++) {
          if (!m.current) return;
          setGx({
            on: true,
            text: scramble(L2, i * 0.14),
            shk: [(Math.random() - 0.5) * i * 1.8, (Math.random() - 0.5) * i],
            chr: i * 2.5,
            slices: i > 3 ? mkSlices() : [],
            flash: false,
          });
          // biome-ignore lint/performance/noAwaitInLoops: sequential glitch-back animation frames
          await wait(45);
        }
        setGx((g) => ({ ...g, flash: true }));
        await wait(40);
        setResurrected(false);
        setGx({ on: false, text: '', shk: [0, 0], chr: 0, slices: [], flash: false });
        await wait(250);
      }
    };
    run();
    return () => {
      m.current = false;
    };
  }, [prefersReducedMotion]);

  const ts = {
    fontSize: 'clamp(18px,5vw,50px)',
    fontWeight: 800,
    fontFamily: F,
    letterSpacing: '-.03em',
    lineHeight: 1.2,
    whiteSpace: 'nowrap' as const,
  };

  if (prefersReducedMotion) {
    return (
      <div
        style={{
          position: 'relative',
          textAlign: 'center',
          minHeight: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ ...ts, color: E }}>{L2}</div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        textAlign: 'center',
        minHeight: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <canvas
        ref={noiseRef}
        style={{
          position: 'absolute',
          inset: -20,
          width: 'calc(100% + 40px)',
          height: 'calc(100% + 40px)',
          pointerEvents: 'none',
          zIndex: 3,
          opacity: gx.on ? 0.55 : 0,
          mixBlendMode: 'screen',
        }}
      />
      {gx.flash && (
        <div
          style={{
            position: 'absolute',
            inset: -40,
            background: E,
            zIndex: 4,
            opacity: 0.25,
            pointerEvents: 'none',
          }}
        />
      )}
      <div
        style={{
          transform: `translate(${gx.shk[0]}px,${gx.shk[1]}px)`,
          position: 'relative',
          zIndex: 2,
        }}
      >
        {gx.chr > 0 && (
          <>
            <div
              style={{
                ...ts,
                position: 'absolute',
                left: -gx.chr,
                top: 0,
                color: '#FF000055',
                zIndex: 1,
              }}
            >
              {gx.text}
            </div>
            <div
              style={{
                ...ts,
                position: 'absolute',
                left: gx.chr,
                top: 0,
                color: '#0000FF45',
                zIndex: 1,
              }}
            >
              {gx.text}
            </div>
          </>
        )}
        {gx.slices.map((s, _i) => (
          <div
            key={`slice-${s.off}-${s.top}`}
            style={{
              position: 'absolute',
              left: s.off,
              top: `${s.top}%`,
              height: s.h,
              width: '100%',
              overflow: 'hidden',
              zIndex: 5,
            }}
          >
            <div style={{ ...ts, color: '#E0DDD8', transform: `translateY(-${s.top}%)` }}>
              {gx.text}
            </div>
          </div>
        ))}
        {vis.phase !== 'hidden' && !resurrected && (
          <div style={{ position: 'relative', display: 'inline' }}>
            <span style={{ ...ts, color: '#E0DDD8' }}>{vis.text}</span>
            <span style={{ ...ts, color: '#E0DDD8' }}>{vis.suffix}</span>
            {vis.phase === 'typing' && (
              <span style={{ ...ts, color: E, animation: 'blink 1s ease infinite', marginLeft: 2 }}>
                |
              </span>
            )}
          </div>
        )}
        {gx.on && vis.phase === 'hidden' && !resurrected && (
          <span style={{ ...ts, color: '#E0DDD8' }}>{gx.text}</span>
        )}
        {gx.on && vis.phase !== 'hidden' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 6,
            }}
          >
            <span style={{ ...ts, color: '#E0DDD8' }}>{gx.text}</span>
          </div>
        )}
        {resurrected && !gx.on && (
          <span style={{ ...ts, color: E, transition: 'opacity .4s' }}>
            O Marketing Artificial começou.
          </span>
        )}
      </div>
    </div>
  );
}

function MultiChannel() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [msgs, setMsgs] = useState({ wa: [], ig: [], em: [] });
  const ref = useRef<HTMLDivElement | null>(null);
  const [go, setGo] = useState(false);
  const flow = [
    { ch: 'wa', f: 'lead', n: 'Marina C.', text: 'Vi o anuncio, quanto custa?', t: '09:02' },
    { ch: 'ig', f: 'lead', n: 'Pedro A.', text: 'Amei o produto! Como compro?', t: '09:03' },
    {
      ch: 'wa',
      f: 'ai',
      text: 'Ola Marina! R$497 a vista ou 12x. Posso enviar o link?',
      t: '09:02',
    },
    {
      ch: 'em',
      f: 'ai',
      n: 'Email',
      text: 'Assunto: Julia, seu bonus expira hoje — 30% OFF',
      t: '09:04',
    },
    {
      ch: 'ig',
      f: 'ai',
      text: 'Ola Pedro! Acesso vitalício por R$497. Cupom INSTA20 = 20% OFF!',
      t: '09:03',
    },
    { ch: 'wa', f: 'lead', n: 'Marina C.', text: 'Quero sim!', t: '09:05' },
    { ch: 'wa', f: 'ai', text: 'Link: pay.kloel.com/ck/abc — Pix, cartão ou boleto.', t: '09:05' },
    { ch: 'ig', f: 'lead', n: 'Pedro A.', text: 'Me manda o link!', t: '09:06' },
    { ch: 'em', f: 'ai', n: 'Evento', text: 'Julia clicou no link — checkout aberto', t: '09:06' },
    { ch: 'ig', f: 'ai', text: 'pay.kloel.com/ck/pedro — Cupom INSTA20 já aplicado!', t: '09:06' },
    { ch: 'wa', f: 'ok', text: 'Pagamento confirmado — R$397 via Pix', t: '09:08' },
    { ch: 'ig', f: 'ok', text: 'Pagamento confirmado — R$397,60 via cartão', t: '09:09' },
    { ch: 'em', f: 'ok', text: 'Pagamento confirmado — R$347,90 via Pix', t: '09:10' },
  ];
  useEffect(() => {
    if (prefersReducedMotion) {
      setGo(true);
      return;
    }

    const el = ref.current;
    if (!el) return;
    const o = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setGo(true);
          o.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    o.observe(el);
    return () => o.disconnect();
  }, [prefersReducedMotion]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: flow is a module-level static literal, length never changes at runtime; go/prefersReducedMotion are the real triggers
  useEffect(() => {
    if (!go) return;
    if (prefersReducedMotion) {
      setMsgs({
        wa: flow.filter((message) => message.ch === 'wa'),
        ig: flow.filter((message) => message.ch === 'ig'),
        em: flow.filter((message) => message.ch === 'em'),
      });
      return;
    }

    let c = false;
    const run = async () => {
      for (let i = 0; i < flow.length; i++) {
        if (c) return;
        // biome-ignore lint/performance/noAwaitInLoops: sequential message-drop animation — each bubble appears after its predecessor's dwell time
        await wait(flow[i].f === 'ai' ? 1100 : flow[i].f === 'ok' ? 1400 : 650);
        if (c) return;
        const msg = flow[i];
        setMsgs((p) => ({ ...p, [msg.ch]: [...p[msg.ch], msg] }));
      }
    };
    run();
    return () => {
      c = true;
    };
  }, [go, prefersReducedMotion]);
  const colors = { wa: '#25D366', ig: '#E1306C', em: E };
  const names = { wa: 'WhatsApp', ig: 'Instagram DM', em: 'Email' };
  const renderPanel = (ch: string) => (
    <div
      style={{
        background: '#111113',
        border: '1px solid #222226',
        borderRadius: 6,
        height: '100%',
      }}
    >
      <div
        style={{
          padding: '7px 11px',
          borderBottom: '1px solid #222226',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: 3,
            background: colors[ch],
            boxShadow: `0 0 6px ${colors[ch]}50`,
          }}
        />
        <span style={{ fontSize: 10, fontWeight: 600, color: colors[ch], fontFamily: M }}>
          {names[ch]}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 8, color: '#3A3A3F', fontFamily: M }}>
          AO VIVO
        </span>
      </div>
      <div style={{ padding: 8, minHeight: 120, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {(msgs[ch] || []).map((msg, _i) =>
          msg.f === 'ok' ? (
            <div
              key={`${msg.f}-${msg.ch}-${msg.t}-${msg.text}`}
              style={{ textAlign: 'center', padding: '5px 0', animation: 'fm .3s ease both' }}
            >
              <span
                style={{
                  background: 'rgba(16,185,129,.1)',
                  border: '1px solid rgba(16,185,129,.2)',
                  borderRadius: 4,
                  padding: '2px 8px',
                  fontSize: 9,
                  fontWeight: 600,
                  color: '#10B981',
                  fontFamily: M,
                }}
              >
                {msg.text}
              </span>
            </div>
          ) : (
            <div
              key={`${msg.f}-${msg.ch}-${msg.t}-${msg.text}`}
              style={{
                alignSelf: msg.f === 'ai' ? 'flex-end' : 'flex-start',
                maxWidth: '88%',
                animation: prefersReducedMotion ? 'none' : 'fm .25s ease both',
              }}
            >
              {msg.f === 'ai' && (
                <div
                  style={{
                    fontSize: 7,
                    color: E,
                    fontWeight: 700,
                    fontFamily: M,
                    letterSpacing: '.08em',
                    marginBottom: 1,
                  }}
                >
                  KLOEL IA
                </div>
              )}
              {msg.f === 'lead' && msg.n && (
                <div
                  style={{
                    fontSize: 7,
                    color: '#6E6E73',
                    fontWeight: 600,
                    fontFamily: F,
                    marginBottom: 1,
                  }}
                >
                  {msg.n}
                </div>
              )}
              <div
                style={{
                  background: msg.f === 'ai' ? '#19191C' : `${colors[ch]}12`,
                  border: `1px solid ${msg.f === 'ai' ? '#222226' : `${colors[ch]}25`}`,
                  borderRadius: 4,
                  padding: '4px 7px',
                  fontSize: 10.5,
                  color: '#E0DDD8',
                  lineHeight: 1.4,
                  fontFamily: F,
                }}
              >
                {msg.text}
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
  return (
    <div ref={ref}>
      <div style={{ display: 'grid', gridTemplateColumns: 'var(--c3)', gap: 10 }} className="grid3">
        {renderPanel('wa')}
        {renderPanel('ig')}
        {renderPanel('em')}
      </div>
      <div style={{ textAlign: 'center', marginTop: 12 }}>
        <span style={{ fontFamily: M, fontSize: 9, color: '#3A3A3F', letterSpacing: '.12em' }}>
          3 CANAIS · 3 VENDAS · ZERO INTERVENÇÃO HUMANA
        </span>
      </div>
    </div>
  );
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement | null>(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    if (prefersReducedMotion) {
      setV(true);
      return;
    }

    const el = ref.current;
    if (!el) return;
    const o = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setV(true);
          o.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    o.observe(el);
    return () => o.disconnect();
  }, [prefersReducedMotion]);
  return (
    <div
      ref={ref}
      style={{
        opacity: v ? 1 : 0,
        transform: v ? 'translateY(0)' : 'translateY(28px)',
        transition: prefersReducedMotion
          ? 'none'
          : `opacity .8s ease ${delay}ms, transform .8s ease ${delay}ms`,
      }}
    >
      {v ? children : <div style={{ minHeight: 50 }} />}
    </div>
  );
}

function LivePulse() {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          background: '#10B981',
          animation: prefersReducedMotion ? 'none' : 'pulse 2s ease infinite',
        }}
      />
      <span style={{ fontFamily: M, fontSize: 11, color: '#6E6E73' }}>
        Plataforma <span style={{ color: '#10B981', fontWeight: 600 }}>operacional</span> — vendas
        automáticas 24/7
      </span>
    </div>
  );
}

function FinalManifestLoop() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const FIRST = 'Morre o Marketing Digital.';
  const SECOND_PREFIX = 'Nasce o ';
  const SECOND_EMPHASIS = 'Marketing Artificial';
  const SECOND = `${SECOND_PREFIX}${SECOND_EMPHASIS}`;
  const [text, setText] = useState('');
  const [tone, setTone] = useState<'light' | 'ember'>('light');

  // biome-ignore lint/correctness/useExhaustiveDependencies: FIRST/SECOND/SECOND_PREFIX/SECOND_EMPHASIS are component-local constants that never change; only prefersReducedMotion should restart the typewriter loop
  useEffect(() => {
    if (prefersReducedMotion) {
      setTone('ember');
      setText(SECOND);
      return;
    }

    let alive = true;

    const delayFor = (
      character: string,
      mode: 'type' | 'delete',
      index: number,
      phrase: string,
    ) => {
      const prev = phrase[index - 1] ?? '';
      const next = phrase[index + 1] ?? '';
      // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.regex-dos-vulnerability.regex-dos-vulnerability
      // Safe: PATTERN_RE is a module-scope literal /[.,!?]/ char-class regex; `character` is a single character from a hardcoded phrase prop used for typewriter animation. No user input, no nested quantifiers.
      const isPauseMark = PATTERN_RE.test(character);

      if (mode === 'delete') {
        if (index === phrase.length - 1) return 190 + Math.random() * 90;
        if (isPauseMark) return 150 + Math.random() * 70;
        if (character === ' ') return 105 + Math.random() * 55;
        if (next === ' ') return 88 + Math.random() * 42;
        return 68 + Math.random() * 54;
      }

      if (index === 0) return 150 + Math.random() * 90;
      if (isPauseMark) return 240 + Math.random() * 150;
      if (character === ' ') return 118 + Math.random() * 78;
      if (prev === ' ') return 102 + Math.random() * 74;
      if (next === ' ') return 88 + Math.random() * 54;
      return 72 + Math.random() * 72;
    };

    const typePhrase = async (phrase: string, nextTone: 'light' | 'ember') => {
      setTone(nextTone);
      for (let i = 1; i <= phrase.length; i++) {
        if (!alive) return;
        setText(phrase.slice(0, i));
        // biome-ignore lint/performance/noAwaitInLoops: sequential typing animation — each character renders after the previous frame's delay
        await wait(delayFor(phrase[i - 1], 'type', i - 1, phrase));
        if (phrase === SECOND && i === SECOND_PREFIX.length) {
          await wait(320);
        }
      }
    };

    const deletePhrase = async (phrase: string, nextTone: 'light' | 'ember') => {
      setTone(nextTone);
      for (let i = phrase.length - 1; i >= 0; i--) {
        if (!alive) return;
        setText(phrase.slice(0, i));
        // biome-ignore lint/performance/noAwaitInLoops: sequential delete animation — characters disappear one-by-one in order
        await wait(delayFor(phrase[i], 'delete', i, phrase));
      }
    };

    const run = async () => {
      while (alive) {
        setText('');
        setTone('light');
        // biome-ignore lint/performance/noAwaitInLoops: headline cycle is intentionally sequential; each phase depends on the previous state transition
        await wait(420);
        await typePhrase(FIRST, 'light');
        await wait(1600);
        await deletePhrase(FIRST, 'light');
        await wait(720);
        await typePhrase(SECOND, 'ember');
        await wait(8000);
        await deletePhrase(SECOND, 'ember');
        await wait(900);
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, [prefersReducedMotion]);

  const renderManifest = () => {
    if (!text) return null;

    if (tone === 'light') {
      return <span style={{ color: '#E0DDD8' }}>{text}</span>;
    }

    const prefix = SECOND_PREFIX.slice(0, Math.min(text.length, SECOND_PREFIX.length));
    const emphasis = text.length > SECOND_PREFIX.length ? text.slice(SECOND_PREFIX.length) : '';

    return (
      <>
        {prefix ? <span style={{ color: '#E0DDD8' }}>{prefix}</span> : null}
        {emphasis ? <span style={{ color: E }}>{emphasis}</span> : null}
      </>
    );
  };

  const cursorColor = tone === 'ember' && text.length > SECOND_PREFIX.length ? E : '#E0DDD8';

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
        traceColor="#E0DDD8"
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

export default function KloelLanding() {
  const fid = useId();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [email, setEmail] = useState('');
  const [faq, setFaq] = useState<number | null>(null);
  const currentHost = typeof window !== 'undefined' ? window.location.host : undefined;
  return (
    <div
      className="landing-shell"
      style={{ background: V, color: '#E0DDD8', fontFamily: F, overflowX: 'hidden' }}
    >
      <style>{`*{box-sizing:border-box}:root{--c2:1fr 1fr;--c3:1fr 1fr 1fr;--c4:repeat(4,1fr);--sp:100px 24px}@media(max-width:768px){:root{--c2:1fr;--c3:1fr;--c4:1fr;--sp:48px 16px}}@keyframes fm{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}::selection{background:rgba(232,93,48,.3)}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#222226;border-radius:2px}html{scroll-behavior:smooth}input::placeholder{color:#3A3A3F!important}.landing-header-inner{padding:0 clamp(14px,4vw,24px)}.landing-hero-section,.landing-final-cta{padding-left:clamp(16px,4vw,24px)!important;padding-right:clamp(16px,4vw,24px)!important}.landing-final-cta-row{display:flex;gap:10px;justify-content:center;max-width:440px;margin:48px auto 0;flex-wrap:wrap}.landing-final-cta-input{flex:1;min-width:0;width:100%}.landing-final-cta-button{white-space:nowrap}@media(max-width:640px){.landing-header-inner{height:56px}.landing-header-actions{gap:4px!important}.landing-header-login{padding:7px 10px!important}.landing-header-cta{padding:7px 12px!important}.landing-hero-section{padding-top:72px!important;padding-bottom:36px!important}.landing-hero-sub{font-size:14px!important;line-height:1.7!important;max-width:320px!important;margin-top:32px!important;padding:0 8px}.landing-final-cta-row{gap:12px}.landing-final-cta-row>*{width:100%!important}.landing-final-cta-button{width:100%!important}.landing-final-manifest-stack{gap:22px!important}.landing-final-manifest-line{font-size:clamp(18px,5.2vw,30px)!important;line-height:1.18!important}.thanos-stage{padding:40px 16px!important;min-height:620px!important}.thanos-reveal{padding:0 8px!important}}`}</style>
      <header
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          background: 'rgba(10,10,12,.92)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid #19191C',
        }}
      >
        <div
          className="landing-header-inner"
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            display: 'flex',
            height: 52,
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
          }}
        >
          <Link
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: '#E0DDD8',
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            <KloelBrandLockup
              markSize={20}
              fontSize={15}
              fontWeight={600}
              animated={!prefersReducedMotion}
              spores={prefersReducedMotion ? 'none' : 'animated'}
            />
          </Link>
          <div
            className="landing-header-actions"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Link
              className="landing-header-login"
              href={buildAuthUrl('/login?forceAuth=1', currentHost)}
              style={{
                fontSize: 12,
                color: '#6E6E73',
                textDecoration: 'none',
                padding: '7px 12px',
              }}
            >
              Entrar
            </Link>
            <Link
              className="landing-header-cta"
              href={buildAuthUrl('/register?forceAuth=1', currentHost)}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: V,
                background: '#E0DDD8',
                padding: '7px 16px',
                borderRadius: 6,
                textDecoration: 'none',
              }}
            >
              Ativar minha IA
            </Link>
          </div>
        </div>
      </header>

      <section
        className="landing-hero-section"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          padding: '0 24px',
        }}
      >
        <div style={{ maxWidth: 820, width: '100%', zIndex: 2 }}>
          <HeroLoop />
        </div>
        <p
          className="landing-hero-sub"
          style={{
            position: 'relative',
            zIndex: 2,
            fontSize: 16,
            color: '#6E6E73',
            marginTop: 44,
            textAlign: 'center',
            maxWidth: 460,
          }}
        >
          A IA que responde, negocia e fecha vendas por você.
          <br />
          <span style={{ color: '#3A3A3F' }}>6 canais. 24/7. R$0/mês.</span>
        </p>
        <div style={{ position: 'absolute', bottom: '8%', left: 0, width: '100%', zIndex: 1 }}>
          <BrandDivider />
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 28,
            left: '50%',
            transform: 'translateX(-50%)',
            animation: 'pulse 2.5s ease infinite',
            color: '#3A3A3F',
            zIndex: 2,
          }}
        >
          <svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </section>

      <section style={{ padding: 'var(--sp)', maxWidth: 1000, margin: '0 auto' }}>
        <Reveal>
          <p
            style={{
              textAlign: 'center',
              fontSize: 15,
              color: '#6E6E73',
              maxWidth: 460,
              margin: '0 auto 40px',
            }}
          >
            Assista 3 vendas acontecendo ao mesmo tempo. Sem roteiro. Sem intervenção.
          </p>
        </Reveal>
        <Reveal delay={200}>
          <MultiChannel />
        </Reveal>
      </section>

      <section style={{ padding: 'var(--sp)', textAlign: 'center' }}>
        <Reveal>
          <p
            style={{
              fontSize: 17,
              color: '#6E6E73',
              lineHeight: 1.8,
              maxWidth: 420,
              margin: '0 auto 52px',
            }}
          >
            Isso não é automação.
            <br />
            Não é chatbot. Não é script.
            <br />
            Não é nenhuma ferramenta que você já usou.
          </p>
        </Reveal>
        <Reveal delay={500}>
          <h2
            style={{
              fontSize: 'clamp(32px,5.5vw,60px)',
              fontWeight: 800,
              color: E,
              letterSpacing: '-.04em',
              margin: 0,
            }}
          >
            Isso é Marketing Artificial.
          </h2>
        </Reveal>
      </section>

      <div style={{ background: '#111113' }}>
        <section style={{ padding: 'var(--sp)', maxWidth: 1000, margin: '0 auto' }}>
          <Reveal>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 48, textAlign: 'center' }}>
              3 passos. 10 minutos. A IA assume.
            </h2>
          </Reveal>
          <div
            className="grid3"
            style={{ display: 'grid', gridTemplateColumns: 'var(--c3)', gap: 16 }}
          >
            {[
              {
                n: '01',
                h: 'Conecte',
                d: 'Cadastre produto. Conecte WhatsApp via QR Code. Configure preço e regras.',
                t: 'A IA aprende com o produto. Quanto mais detalhes, melhor vende.',
              },
              {
                n: '02',
                h: 'Configure',
                d: 'Escolha canais. Defina limites de desconto, tom, horarios, follow-up.',
                t: 'Controle total. A IA nunca ultrapassa suas regras.',
              },
              {
                n: '03',
                h: 'A IA opera',
                d: 'Responde, qualifica, negocia, fecha, faz follow-up, recupera carrinho. 24/7.',
                t: 'Dashboard tempo real. Assuma qualquer conversa quando quiser.',
              },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 120}>
                <div
                  style={{
                    background: V,
                    border: '1px solid #222226',
                    borderRadius: 6,
                    padding: 22,
                    height: '100%',
                    boxSizing: 'border-box',
                    maxWidth: '100%',
                  }}
                >
                  <div
                    style={{
                      fontFamily: M,
                      fontSize: 26,
                      fontWeight: 800,
                      color: `${E}20`,
                      marginBottom: 8,
                    }}
                  >
                    {s.n}
                  </div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{s.h}</h3>
                  <p
                    style={{
                      fontSize: 13,
                      color: '#6E6E73',
                      lineHeight: 1.6,
                      marginBottom: 12,
                      wordBreak: 'break-word',
                    }}
                  >
                    {s.d}
                  </p>
                  <div style={{ borderTop: '1px solid #222226', paddingTop: 10 }}>
                    <p
                      style={{
                        fontSize: 11,
                        color: '#3A3A3F',
                        lineHeight: 1.5,
                        fontStyle: 'italic',
                        wordBreak: 'break-word',
                      }}
                    >
                      {s.t}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      </div>

      <div>
        <section style={{ padding: 'var(--sp)', maxWidth: 1100, margin: '0 auto' }}>
          <Reveal>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 10, textAlign: 'center' }}>
              Tudo num lugar só.
            </h2>
            <p
              style={{
                fontSize: 13,
                color: '#6E6E73',
                textAlign: 'center',
                maxWidth: 400,
                margin: '0 auto 48px',
              }}
            >
              Sem 15 assinaturas. Sem integrações quebradas.
            </p>
          </Reveal>
          <div
            className="grid4"
            style={{ display: 'grid', gridTemplateColumns: 'var(--c4)', gap: 12 }}
          >
            {[
              {
                c: 'VENDA',
                items: [
                  'Checkout inteligente',
                  'Pix, cartão, boleto',
                  'Assinaturas',
                  'Order bump / upsell',
                  'Recuperação de carrinho',
                  'Split de comissões',
                ],
              },
              {
                c: 'IA EM 6 CANAIS',
                items: [
                  'WhatsApp',
                  'Instagram DM',
                  'Facebook Messenger',
                  'Email marketing',
                  'SMS',
                  'TikTok',
                ],
              },
              {
                c: 'CONSTRUA',
                items: [
                  'Site builder com IA',
                  'Landing pages',
                  'Funis de venda',
                  'Domínio + hospedagem',
                  'SSL automático',
                  'Canva integrado',
                ],
              },
              {
                c: 'GERENCIE',
                items: [
                  'Dashboard tempo real',
                  'CRM + pipeline',
                  'Afiliados',
                  'Área de membros',
                  'Relatórios + UTM',
                  'Meta/Google/TikTok Ads',
                ],
              },
            ].map((g, gi) => (
              <Reveal key={g.c} delay={gi * 80}>
                <div
                  style={{
                    background: '#111113',
                    border: '1px solid #222226',
                    borderRadius: 6,
                    padding: 18,
                    height: '100%',
                  }}
                >
                  <div
                    style={{
                      fontFamily: M,
                      fontSize: 9,
                      color: E,
                      letterSpacing: '.1em',
                      marginBottom: 12,
                    }}
                  >
                    {g.c}
                  </div>
                  {g.items.map((it) => (
                    <div
                      key={it}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '5px 0',
                        borderBottom: '1px solid #19191C',
                      }}
                    >
                      <svg
                        width={12}
                        height={12}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#10B981"
                        strokeWidth={2}
                        style={{ flexShrink: 0 }}
                        aria-hidden="true"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span style={{ fontSize: 12, wordBreak: 'break-word' }}>{it}</span>
                    </div>
                  ))}
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      </div>

      <div>
        <section style={{ padding: 'var(--sp)', maxWidth: 860, margin: '0 auto' }}>
          <Reveal>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 48, textAlign: 'center' }}>
              Quanto você gasta hoje?
            </h2>
          </Reveal>
          <div
            className="grid2"
            style={{
              display: 'grid',
              gridTemplateColumns: 'var(--c2)',
              gap: 24,
              alignItems: 'start',
            }}
          >
            <Reveal>
              <div style={{ background: '#111113', borderRadius: 6, padding: 20 }}>
                <div
                  style={{
                    fontFamily: M,
                    fontSize: 9,
                    color: '#6E6E73',
                    letterSpacing: '.1em',
                    marginBottom: 12,
                  }}
                >
                  FERRAMENTAS SEPARADAS
                </div>
                {[
                  ['Automação email', 'R$189'],
                  ['Chatbot', 'R$75'],
                  ['Funis', 'R$500'],
                  ['Hospedagem', 'R$45'],
                  ['CRM', 'R$300'],
                  ['Chat', 'R$90'],
                  ['SMS', 'R$120'],
                  ['Afiliados', 'R$200'],
                ].map(([t, p]) => (
                  <div
                    key={t}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '5px 0',
                      borderBottom: '1px solid #19191C',
                    }}
                  >
                    <span style={{ fontSize: 11, color: '#E0DDD8' }}>{t}</span>
                    <span style={{ fontSize: 10, color: '#6E6E73', fontFamily: M }}>{p}</span>
                  </div>
                ))}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '10px 0 0',
                    marginTop: 6,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#E0DDD8' }}>Total</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#EF4444', fontFamily: M }}>
                    R$1.519+/mês
                  </span>
                </div>
              </div>
            </Reveal>
            <Reveal delay={200}>
              <div
                style={{
                  background: '#111113',
                  border: `2px solid ${E}`,
                  borderRadius: 6,
                  padding: 22,
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: -1,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: E,
                    padding: '2px 12px',
                    borderRadius: '0 0 4px 4px',
                    fontSize: 9,
                    fontWeight: 700,
                    color: V,
                    fontFamily: M,
                    letterSpacing: '.08em',
                  }}
                >
                  KLOEL
                </div>
                <div style={{ textAlign: 'center', padding: '24px 0 16px' }}>
                  <div
                    style={{
                      fontSize: 48,
                      fontWeight: 800,
                      fontFamily: M,
                      letterSpacing: '-.04em',
                    }}
                  >
                    R$ 0
                  </div>
                  <div style={{ fontSize: 14, color: '#6E6E73', marginTop: 4 }}>por mês</div>
                  <div style={{ fontSize: 12, color: E, fontWeight: 600, marginTop: 10 }}>
                    Taxa apenas sobre vendas.
                  </div>
                  <div style={{ fontSize: 11, color: '#3A3A3F', marginTop: 2 }}>
                    Sem venda, sem custo.
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </div>

      <ThanosSection />

      <div>
        <section style={{ padding: 'var(--sp)', maxWidth: 1000, margin: '0 auto' }}>
          <div
            className="grid3"
            style={{ display: 'grid', gridTemplateColumns: 'var(--c3)', gap: 14 }}
          >
            {[
              {
                n: 'Carolina M.',
                r: 'Infoprodutora',
                t: 'A IA respondeu 800 mensagens em 5 dias e fechou 23 vendas. Não toquei no celular.',
                m: '23 vendas / 5 dias',
                c: E,
              },
              {
                n: 'Ricardo T.',
                r: 'Mentor',
                t: 'Economizei R$1.400/mes. As vendas subiram porque a IA nunca esquece o follow-up.',
                m: 'R$1.400/mes economizados',
                c: '#7F66FF',
              },
              {
                n: 'Fernanda L.',
                r: 'E-commerce',
                t: 'Monitorei 3 dias. No terceiro entendi: a IA responde melhor do que eu. Mais rapido, mais consistente.',
                m: 'Conversao +40%',
                c: '#00A884',
              },
            ].map((p, i) => (
              <Reveal key={p.n} delay={i * 100}>
                <div
                  style={{
                    background: '#111113',
                    border: '1px solid #222226',
                    borderRadius: 6,
                    padding: 20,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: p.c,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#fff',
                      }}
                    >
                      {p.n
                        .split(' ')
                        .map((w) => w[0])
                        .join('')}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{p.n}</div>
                      <div style={{ fontSize: 10, color: '#3A3A3F' }}>{p.r}</div>
                    </div>
                  </div>
                  <p
                    style={{
                      fontSize: 12,
                      color: '#6E6E73',
                      lineHeight: 1.6,
                      flex: 1,
                      margin: 0,
                      wordBreak: 'break-word',
                    }}
                  >
                    &quot;{p.t}&quot;
                  </p>
                  <div
                    style={{
                      marginTop: 12,
                      paddingTop: 8,
                      borderTop: '1px solid #222226',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <div style={{ width: 4, height: 4, borderRadius: 2, background: '#10B981' }} />
                    <span
                      style={{ fontSize: 10, fontWeight: 600, color: '#10B981', fontFamily: M }}
                    >
                      {p.m}
                    </span>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      </div>

      <div id={fid}>
        <section
          className="landing-final-cta"
          style={{
            padding: '0 24px',
            textAlign: 'center',
            position: 'relative',
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ position: 'relative', zIndex: 1, maxWidth: 700 }}>
            <Reveal>
              <FinalManifestLoop />
            </Reveal>

            <Reveal delay={400}>
              <p
                style={{
                  fontSize: 15,
                  color: '#6E6E73',
                  lineHeight: 1.7,
                  maxWidth: 440,
                  margin: '48px auto 0',
                }}
              >
                Você pensa a estratégia.
                <br />A inteligência artificial executa tudo.
              </p>
            </Reveal>

            <Reveal delay={600}>
              <div
                className="landing-final-cta-row"
                style={{
                  marginTop: 48,
                  display: 'flex',
                  gap: 10,
                  justifyContent: 'center',
                  maxWidth: 440,
                  margin: '48px auto 0',
                  flexWrap: 'wrap',
                }}
              >
                <input
                  className="landing-final-cta-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Seu melhor e-mail"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    width: '100%',
                    background: '#111113',
                    border: '1px solid #222226',
                    borderRadius: 6,
                    padding: '16px 20px',
                    color: '#E0DDD8',
                    fontSize: 15,
                    fontFamily: F,
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  className="landing-final-cta-button"
                  onClick={() => {
                    if (typeof window === 'undefined') return;
                    const params = new URLSearchParams({ forceAuth: '1' });
                    if (email) {
                      params.set('email', email);
                    }
                    window.location.assign(
                      buildAuthUrl(`/register?${params.toString()}`, window.location.host),
                    );
                  }}
                  style={{
                    background: E,
                    color: V,
                    border: 'none',
                    borderRadius: 6,
                    padding: '16px 32px',
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    fontFamily: F,
                  }}
                >
                  Ativar minha IA
                </button>
              </div>
              <p style={{ fontSize: 11, color: '#3A3A3F', marginTop: 14 }}>
                R$0/mês. Taxa só quando vender.
              </p>
            </Reveal>

            <Reveal delay={800}>
              <div style={{ marginTop: 56 }}>
                <LivePulse />
              </div>
            </Reveal>
          </div>
        </section>
      </div>

      {/* Brand divider — separador entre CTA e FAQ */}
      <div style={{ padding: '20px 0', opacity: 0.35 }}>
        <BrandDivider compact />
      </div>

      <div>
        <section style={{ padding: 'var(--sp)', maxWidth: 640, margin: '0 auto' }}>
          <Reveal>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 36, textAlign: 'center' }}>
              Perguntas frequentes
            </h2>
          </Reveal>
          {[
            {
              q: 'A IA realmente vende sozinha?',
              a: 'Sim. Analisa contexto, negocia dentro das suas regras, e fecha. Você pode intervir quando quiser.',
            },
            { q: 'Quanto custa?', a: 'R$0/mês. Taxa apenas sobre vendas realizadas.' },
            {
              q: 'Preciso programar?',
              a: 'Não. Cadastre produto, conecte WhatsApp, configure regras.',
            },
            {
              q: 'Como a IA sabe o que responder?',
              a: 'Aprende com o cadastro do produto — preço, benefícios, objeções, limites.',
            },
            {
              q: 'Posso responder manualmente?',
              a: 'Sim. A IA para quando você entra e volta quando você sai.',
            },
            { q: 'É seguro?', a: 'Criptografia ponta a ponta, servidores isolados, LGPD.' },
          ].map((f, i) => (
            <Reveal key={f.q} delay={30 * i}>
              <div style={{ borderBottom: '1px solid #19191C' }}>
                <button
                  type="button"
                  onClick={() => setFaq(faq === i ? null : i)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '15px 0',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 500, color: '#E0DDD8' }}>{f.q}</span>
                  <span
                    style={{
                      color: '#3A3A3F',
                      fontSize: 16,
                      transform: faq === i ? 'rotate(45deg)' : 'none',
                      transition: 'transform .15s',
                      flexShrink: 0,
                      marginLeft: 12,
                    }}
                  >
                    +
                  </span>
                </button>
                {faq === i && (
                  <div style={{ padding: '0 0 14px', animation: 'fadeIn .3s ease both' }}>
                    <p style={{ fontSize: 13, color: '#6E6E73', lineHeight: 1.7 }}>{f.a}</p>
                  </div>
                )}
              </div>
            </Reveal>
          ))}
        </section>
      </div>

      <footer style={{ padding: '36px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 14,
              fontWeight: 700,
              color: '#E0DDD8',
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            <KloelWordmark color="#E0DDD8" fontSize={14} fontWeight={600} />
          </Link>
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center', gap: 20 }}>
            <Link href="/terms" style={{ fontSize: 11, color: '#3A3A3F', textDecoration: 'none' }}>
              Termos
            </Link>
            <Link
              href="/privacy"
              style={{ fontSize: 11, color: '#3A3A3F', textDecoration: 'none' }}
            >
              Privacidade
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
