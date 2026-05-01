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
export default function KloelLanding() {
  const fid = useId();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [email, setEmail] = useState('');
  const [faq, setFaq] = useState<number | null>(null);
  const currentHost = typeof window !== 'undefined' ? window.location.host : undefined;
  return (
    <div
      className="landing-shell"
      style={{ background: V, color: colors.text.silver, fontFamily: F, overflowX: 'hidden' }}
    >
      <style>{`*{box-sizing:border-box}:root{--c2:1fr 1fr;--c3:1fr 1fr 1fr;--c4:repeat(4,1fr);--sp:100px 24px}@media(max-width:768px){:root{--c2:1fr;--c3:1fr;--c4:1fr;--sp:48px 16px}}@keyframes fm{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}::selection{background:rgba(232,93,48,.3)}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:colors.border.space;border-radius:2px}/* PULSE_VISUAL_OK: scrollbar, placeholder below — CSS pseudo-elements, no token access */html{scroll-behavior:smooth}input::placeholder{color:colors.text.dim!important}/* PULSE_VISUAL_OK: CSS pseudo-element, no token access */.landing-header-inner{padding:0 clamp(14px,4vw,24px)}.landing-hero-section,.landing-final-cta{padding-left:clamp(16px,4vw,24px)!important;padding-right:clamp(16px,4vw,24px)!important}.landing-final-cta-row{display:flex;gap:10px;justify-content:center;max-width:440px;margin:48px auto 0;flex-wrap:wrap}.landing-final-cta-input{flex:1;min-width:0;width:100%}.landing-final-cta-button{white-space:nowrap}@media(max-width:640px){.landing-header-inner{height:56px}.landing-header-actions{gap:4px!important}.landing-header-login{padding:7px 10px!important}.landing-header-cta{padding:7px 12px!important}.landing-hero-section{padding-top:72px!important;padding-bottom:36px!important}.landing-hero-sub{font-size:14px!important;line-height:1.7!important;max-width:320px!important;margin-top:32px!important;padding:0 8px}.landing-final-cta-row{gap:12px}.landing-final-cta-row>*{width:100%!important}.landing-final-cta-button{width:100%!important}.landing-final-manifest-stack{gap:22px!important}.landing-final-manifest-line{font-size:clamp(18px,5.2vw,30px)!important;line-height:1.18!important}.thanos-stage{padding:40px 16px!important;min-height:620px!important}.thanos-reveal{padding:0 8px!important}}`}</style>
      <header
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          background: 'rgba(10,10,12,.92)',
          backdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${colors.border.void}`,
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
              color: colors.text.silver,
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
                color: colors.text.muted,
                textDecoration: 'none',
                padding: '7px 12px',
              }}
            >
              {kloelT(`Entrar`)}
            </Link>
            <Link
              className="landing-header-cta"
              href={buildAuthUrl('/register?forceAuth=1', currentHost)}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: V,
                background: colors.text.silver,
                padding: '7px 16px',
                borderRadius: 6,
                textDecoration: 'none',
              }}
            >
              {kloelT(`Ativar minha IA`)}
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
            color: colors.text.muted,
            marginTop: 44,
            textAlign: 'center',
            maxWidth: 460,
          }}
        >
          {kloelT(`A IA que responde, negocia e fecha vendas por você.`)}
          <br />
          <span style={{ color: colors.text.dim }}>{kloelT(`6 canais. 24/7. R$0/mês.`)}</span>
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
            color: colors.text.dim,
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
              color: colors.text.muted,
              maxWidth: 460,
              margin: '0 auto 40px',
            }}
          >
            {kloelT(`Assista 3 vendas acontecendo ao mesmo tempo. Sem roteiro. Sem intervenção.`)}
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
              color: colors.text.muted,
              lineHeight: 1.8,
              maxWidth: 420,
              margin: '0 auto 52px',
            }}
          >
            {kloelT(`Isso não é automação.`)}
            <br />

            {kloelT(`Não é chatbot. Não é script.`)}
            <br />

            {kloelT(`Não é nenhuma ferramenta que você já usou.`)}
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
            {kloelT(`Isso é Marketing Artificial.`)}
          </h2>
        </Reveal>
      </section>

      <div style={{ background: colors.background.surface }}>
        <section style={{ padding: 'var(--sp)', maxWidth: 1000, margin: '0 auto' }}>
          <Reveal>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 48, textAlign: 'center' }}>
              {kloelT(`3 passos. 10 minutos. A IA assume.`)}
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
                d: 'Cadastre produto. Conecte WhatsApp oficial pela Meta. Configure preço e regras.',
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
                    border: `1px solid ${colors.border.space}`,
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
                      color: colors.text.muted,
                      lineHeight: 1.6,
                      marginBottom: 12,
                      wordBreak: 'break-word',
                    }}
                  >
                    {s.d}
                  </p>
                  <div style={{ borderTop: `1px solid ${colors.border.space}`, paddingTop: 10 }}>
                    <p
                      style={{
                        fontSize: 11,
                        color: colors.text.dim,
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
              {kloelT(`Tudo num lugar só.`)}
            </h2>
            <p
              style={{
                fontSize: 13,
                color: colors.text.muted,
                textAlign: 'center',
                maxWidth: 400,
                margin: '0 auto 48px',
              }}
            >
              {kloelT(`Sem 15 assinaturas. Sem integrações quebradas.`)}
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
                    background: colors.background.surface,
                    border: `1px solid ${colors.border.space}`,
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
                        borderBottom: `1px solid ${colors.border.void}`,
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
              {kloelT(`Quanto você gasta hoje?`)}
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
              <div style={{ background: colors.background.surface, borderRadius: 6, padding: 20 }}>
                <div
                  style={{
                    fontFamily: M,
                    fontSize: 9,
                    color: colors.text.muted,
                    letterSpacing: '.1em',
                    marginBottom: 12,
                  }}
                >
                  {kloelT(`FERRAMENTAS SEPARADAS`)}
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
                      borderBottom: `1px solid ${colors.border.void}`,
                    }}
                  >
                    <span style={{ fontSize: 11, color: colors.text.silver }}>{t}</span>
                    <span style={{ fontSize: 10, color: colors.text.muted, fontFamily: M }}>
                      {p}
                    </span>
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
                  <span style={{ fontSize: 12, fontWeight: 600, color: colors.text.silver }}>
                    {kloelT(`Total`)}
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#EF4444', fontFamily: M }}>
                    {kloelT(`R$1.519+/mês`)}
                  </span>
                </div>
              </div>
            </Reveal>
            <Reveal delay={200}>
              <div
                style={{
                  background: colors.background.surface,
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
                    {kloelT(`R$ 0`)}
                  </div>
                  <div style={{ fontSize: 14, color: colors.text.muted, marginTop: 4 }}>
                    {kloelT(`por mês`)}
                  </div>
                  <div style={{ fontSize: 12, color: E, fontWeight: 600, marginTop: 10 }}>
                    {kloelT(`Taxa apenas sobre vendas.`)}
                  </div>
                  <div style={{ fontSize: 11, color: colors.text.dim, marginTop: 2 }}>
                    {kloelT(`Sem venda, sem custo.`)}
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
                    background: colors.background.surface,
                    border: `1px solid ${colors.border.space}`,
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
                      <div style={{ fontSize: 10, color: colors.text.dim }}>{p.r}</div>
                    </div>
                  </div>
                  <p
                    style={{
                      fontSize: 12,
                      color: colors.text.muted,
                      lineHeight: 1.6,
                      flex: 1,
                      margin: 0,
                      wordBreak: 'break-word',
                    }}
                  >
                    {'"'}
                    {p.t}
                    {'"'}
                  </p>
                  <div
                    style={{
                      marginTop: 12,
                      paddingTop: 8,
                      borderTop: `1px solid ${colors.border.space}`,
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
                  color: colors.text.muted,
                  lineHeight: 1.7,
                  maxWidth: 440,
                  margin: '48px auto 0',
                }}
              >
                {kloelT(`Você pensa a estratégia.`)}
                <br />
                {kloelT(`A inteligência artificial executa tudo.`)}
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
                  placeholder={kloelT(`Seu melhor e-mail`)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    width: '100%',
                    background: colors.background.surface,
                    border: `1px solid ${colors.border.space}`,
                    borderRadius: 6,
                    padding: '16px 20px',
                    color: colors.text.silver,
                    fontSize: 15,
                    fontFamily: F,
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  className="landing-final-cta-button"
                  onClick={() => {
                    if (typeof window === 'undefined') {
                      return;
                    }
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
                  {kloelT(`Ativar minha IA`)}
                </button>
              </div>
              <p style={{ fontSize: 11, color: colors.text.dim, marginTop: 14 }}>
                {kloelT(`R$0/mês. Taxa só quando vender.`)}
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
              {kloelT(`Perguntas frequentes`)}
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
              <div style={{ borderBottom: `1px solid ${colors.border.void}` }}>
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
                  <span style={{ fontSize: 14, fontWeight: 500, color: colors.text.silver }}>
                    {f.q}
                  </span>
                  <span
                    style={{
                      color: colors.text.dim,
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
                    <p style={{ fontSize: 13, color: colors.text.muted, lineHeight: 1.7 }}>{f.a}</p>
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
              color: colors.text.silver,
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            <KloelWordmark color={colors.text.silver} fontSize={14} fontWeight={600} />
          </Link>
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center', gap: 20 }}>
            <Link
              href="/terms"
              style={{ fontSize: 11, color: colors.text.dim, textDecoration: 'none' }}
            >
              {kloelT(`Termos`)}
            </Link>
            <Link
              href="/privacy"
              style={{ fontSize: 11, color: colors.text.dim, textDecoration: 'none' }}
            >
              {kloelT(`Privacidade`)}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

