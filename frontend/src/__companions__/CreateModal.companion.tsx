/* ═══ Format Grid (for most categories) ═══ */
function FormatGrid({
  cat,
  sf,
  setSf,
  fmts,
  openEditor,
}: {
  cat: string;
  sf: string;
  setSf: (v: string) => void;
  fmts: FormatItem[];
  openEditor: (fmt: FormatItem) => void;
}) {
  return (
    <div>
      {cat === 'redes-sociais' && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {SOCIAL_PLATFORMS.map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => setSf(s)}
              style={{
                padding: '5px 12px',
                background: sf === s ? 'colors.ember.glow10' : 'none',
                border: `1px solid ${sf === s ? 'colors.ember.glow30' : '#1C1C1F'}`,
                borderRadius: 4,
                color: sf === s ? colors.ember.primary : colors.text.muted,
                fontSize: 11,
                fontWeight: sf === s ? 600 : 400,
                fontFamily: "var(--font-sora), 'Sora', sans-serif",
                cursor: 'pointer',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {cat === 'para-voce' && (
        <div style={{ marginBottom: 16 }}>
          <p
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: colors.text.muted,
              fontFamily: "var(--font-sora), 'Sora', sans-serif",
              marginBottom: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {kloelT(`Acoes rapidas`)}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            {QUICK_ACTIONS.map((a) => (
              <button
                type="button"
                key={a.l}
                onClick={() =>
                  openEditor({
                    l: a.l,
                    w: 1080,
                    h: 1080,
                    c: a.c,
                    m: 'square',
                    s: '1080x1080',
                  } as FormatItem)
                }
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = `${a.c[0]}40`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor =
                    '#1C1C1F' /* PULSE_VISUAL_OK: intermediate surface tone, near elevated */;
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 12px',
                  background: colors.background.surface,
                  border: '1px solid #1C1C1F',
                  borderRadius: 6,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  minWidth: 85,
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                    background: `linear-gradient(135deg,${a.c[0]},${a.c[1]})`,
                    opacity: 0.8,
                  }}
                />
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 500,
                    color: colors.text.muted,
                    fontFamily: "var(--font-sora), 'Sora', sans-serif",
                    textAlign: 'center',
                  }}
                >
                  {a.l}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <p
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: colors.text.muted,
          fontFamily: "var(--font-sora), 'Sora', sans-serif",
          marginBottom: 12,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {sf !== 'Populares'
          ? sf
          : cat === 'para-voce'
            ? 'Populares'
            : CATEGORIES.find((c) => c.id === cat)?.label}
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill,minmax(148px,1fr))',
          gap: 10,
        }}
      >
        {fmts.map((f) => (
          <FormatCard key={`${f.l}-${f.w}-${f.h}`} item={f} onClick={openEditor} />
        ))}
      </div>

      {fmts.length > 0 && cat !== 'redes-sociais' && (
        <div style={{ marginTop: 20 }}>
          <p
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: colors.text.muted,
              fontFamily: "var(--font-sora), 'Sora', sans-serif",
              marginBottom: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {kloelT(`Outras formas de comecar`)}
          </p>
          <button
            type="button"
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'colors.ember.glow40';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor =
                '#1C1C1F' /* PULSE_VISUAL_OK: intermediate surface tone, near elevated */;
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: colors.background.surface,
              border: '1px solid #1C1C1F',
              borderRadius: 6,
              padding: '12px 16px',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 4,
                background: 'linear-gradient(135deg,colors.ember.glow10,colors.ember.bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ color: colors.ember.primary }}>{IC.grid(15)}</span>
            </div>
            <div style={{ textAlign: 'left' }}>
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: colors.text.silver,
                  fontFamily: "var(--font-sora), 'Sora', sans-serif",
                }}
              >
                {kloelT(`Explorar modelos`)}
              </p>
              <p
                style={{
                  fontSize: 10,
                  color: colors.text.dim,
                  fontFamily: "var(--font-sora), 'Sora', sans-serif",
                }}
              >
                {kloelT(`Templates prontos pra usar`)}
              </p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

