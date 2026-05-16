'use client';

import { useEffect, useRef, useState } from 'react';
import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';
import { runSequentialList } from './KloelLanding.helpers';
import {
  DEFAULT_LANDING_CONTENT,
  type MultiChannelKey,
  type MultiChannelMessage,
} from './landing-data';

const E = colors.ember.primary;
const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";
const F = "var(--font-sora), 'Sora', sans-serif";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type MultiChannelState = Record<MultiChannelKey, MultiChannelMessage[]>;

const channelColors: Record<MultiChannelKey, string> = {
  wa: colors.canvas.lime,
  ig: colors.canvas.pink,
  em: E,
};
const channelNames: Record<MultiChannelKey, string> = {
  wa: 'WhatsApp',
  ig: 'Instagram DM',
  em: 'Email',
};

function groupMultiChannelMessages(messages: MultiChannelMessage[]): MultiChannelState {
  return {
    wa: messages.filter((message) => message.ch === 'wa'),
    ig: messages.filter((message) => message.ch === 'ig'),
    em: messages.filter((message) => message.ch === 'em'),
  };
}

export function MultiChannel({
  messages = DEFAULT_LANDING_CONTENT.multiChannelFlow,
}: {
  messages?: MultiChannelMessage[];
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [msgs, setMsgs] = useState<MultiChannelState>({ wa: [], ig: [], em: [] });
  const visibleMsgs = prefersReducedMotion ? groupMultiChannelMessages(messages) : msgs;
  const ref = useRef<HTMLDivElement | null>(null);
  const [enteredViewport, setEnteredViewport] = useState(false);
  const go = prefersReducedMotion || enteredViewport;

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    const el = ref.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setEnteredViewport(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (!go) {
      return;
    }
    if (prefersReducedMotion) {
      return;
    }

    let cancelled = false;
    const run = async () => {
      await runSequentialList(
        messages,
        async (msg) => {
          await wait(msg.f === 'ai' ? 1100 : msg.f === 'ok' ? 1400 : 650);
          if (cancelled) {
            return;
          }
          setMsgs((prev) => ({ ...prev, [msg.ch]: [...prev[msg.ch], msg] }));
        },
        () => !cancelled,
      );
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [go, prefersReducedMotion, messages]);

  const renderPanel = (ch: MultiChannelKey) => (
    <div
      style={{
        background: colors.background.surface,
        border: `1px solid ${colors.border.space}`,
        borderRadius: 6,
        height: '100%',
      }}
    >
      <div
        style={{
          padding: '7px 11px',
          borderBottom: `1px solid ${colors.border.space}`,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: 4,
            background: channelColors[ch],
            boxShadow: `0 0 6px ${channelColors[ch]}50`,
          }}
        />
        <span style={{ fontSize: 10, fontWeight: 600, color: channelColors[ch], fontFamily: M }}>
          {channelNames[ch]}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 8, color: colors.text.dim, fontFamily: M }}>
          {kloelT('AO VIVO')}
        </span>
      </div>
      <div style={{ padding: 8, minHeight: 120, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {visibleMsgs[ch].map((msg) =>
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
                  color: colors.semantic.success,
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
                  {kloelT('KLOEL IA')}
                </div>
              )}
              {msg.f === 'lead' && msg.n && (
                <div
                  style={{
                    fontSize: 7,
                    color: colors.text.muted,
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
                  background:
                    msg.f === 'ai' ? colors.background.elevated : `${channelColors[ch]}12`,
                  border: `1px solid ${msg.f === 'ai' ? colors.border.space : `${channelColors[ch]}25`}`,
                  borderRadius: 4,
                  padding: '4px 7px',
                  fontSize: 10.5,
                  color: colors.text.silver,
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
        <span
          style={{ fontFamily: M, fontSize: 9, color: colors.text.dim, letterSpacing: '.12em' }}
        >
          {kloelT('3 CANAIS · 3 VENDAS · ZERO INTERVENÇÃO HUMANA')}
        </span>
      </div>
    </div>
  );
}
