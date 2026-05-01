function MultiChannel() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [msgs, setMsgs] = useState<MultiChannelState>({ wa: [], ig: [], em: [] });
  const ref = useRef<HTMLDivElement | null>(null);
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (prefersReducedMotion) {
      setGo(true);
      return;
    }

    const el = ref.current;
    if (!el) {
      return;
    }
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
  useEffect(() => {
    if (!go) {
      return;
    }
    if (prefersReducedMotion) {
      setMsgs({
        wa: MULTI_CHANNEL_FLOW.filter((message) => message.ch === 'wa'),
        ig: MULTI_CHANNEL_FLOW.filter((message) => message.ch === 'ig'),
        em: MULTI_CHANNEL_FLOW.filter((message) => message.ch === 'em'),
      });
      return;
    }

    let c = false;
    const run = async () => {
      await runSequentialList(
        MULTI_CHANNEL_FLOW,
        async (msg) => {
          await wait(msg.f === 'ai' ? 1100 : msg.f === 'ok' ? 1400 : 650);
          if (c) {
            return;
          }
          setMsgs((p) => ({ ...p, [msg.ch]: [...p[msg.ch], msg] }));
        },
        () => !c,
      );
    };
    run();
    return () => {
      c = true;
    };
  }, [go, prefersReducedMotion]);
  const channelColors: Record<MultiChannelKey, string> = { wa: '#25D366', ig: '#E1306C', em: E };
  const names: Record<MultiChannelKey, string> = {
    wa: 'WhatsApp',
    ig: 'Instagram DM',
    em: 'Email',
  };
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
            borderRadius: 3,
            background: channelColors[ch],
            boxShadow: `0 0 6px ${channelColors[ch]}50`,
          }}
        />
        <span style={{ fontSize: 10, fontWeight: 600, color: channelColors[ch], fontFamily: M }}>
          {names[ch]}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 8, color: colors.text.dim, fontFamily: M }}>
          {kloelT(`AO VIVO`)}
        </span>
      </div>
      <div style={{ padding: 8, minHeight: 120, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {msgs[ch].map((msg) =>
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
                  {kloelT(`KLOEL IA`)}
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
          {kloelT(`3 CANAIS · 3 VENDAS · ZERO INTERVENÇÃO HUMANA`)}
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
    if (!el) {
      return;
    }
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
      <span style={{ fontFamily: M, fontSize: 11, color: colors.text.muted }}>
        {kloelT(`Plataforma`)}{' '}
        <span style={{ color: '#10B981', fontWeight: 600 }}>operacional</span>{' '}
        {kloelT(`— vendas
        automáticas 24/7`)}
      </span>
    </div>
  );
}

function FinalManifestLoop() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [text, setText] = useState('');
  const [tone, setTone] = useState<'light' | 'ember'>('light');

  useEffect(() => {
    if (prefersReducedMotion) {
      setTone('ember');
      setText(FINAL_MANIFEST_SECOND);
      return;
    }

    let alive = true;

    const typePhrase = async (phrase: string, nextTone: 'light' | 'ember') => {
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

    const deletePhrase = async (phrase: string, nextTone: 'light' | 'ember') => {
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
        traceColor={kloelT(`colors.text.silver`)} // PULSE_VISUAL_OK: traceColor via i18n — stays as hex for the SVG
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

/** Kloel landing. */
import { KloelLanding } from "./KloelLanding";
