'use client';

import { apiFetch } from '@/lib/api';
import { useEffect, useId, useRef, useState } from 'react';
import { mutate } from 'swr';

/* ── Design Tokens ── */
const _BG_VOID = '#0A0A0C';
const BG_SURFACE = '#111113';
const BG_ELEVATED = '#19191C';
const BORDER = '#222226';
const TEXT_PRIMARY = '#E0DDD8';
const TEXT_MUTED = '#6E6E73';
const TEXT_DIM = '#3A3A3F';
const EMBER = '#E85D30';
const GREEN = '#10B981';
const FONT_BODY = "'Sora', sans-serif";
const _FONT_MONO = "'JetBrains Mono', monospace";

/* ── Inline SVG Icons ── */
const LinkIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke={TEXT_MUTED}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const PaletteIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" />
    <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" />
    <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" />
    <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

/* ── Styles ── */
const labelStyle: React.CSSProperties = {
  fontFamily: FONT_BODY,
  fontSize: '11px',
  fontWeight: 600,
  color: TEXT_DIM,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: '6px',
  display: 'block',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: BG_ELEVATED,
  border: `1px solid ${BORDER}`,
  color: TEXT_PRIMARY,
  borderRadius: '6px',
  padding: '10px 14px',
  fontSize: '14px',
  fontFamily: FONT_BODY,
  outline: 'none',
  boxSizing: 'border-box' as const,
};

const cardStyle: React.CSSProperties = {
  background: BG_SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: '6px',
  padding: '20px',
};

export function PlanThankYouTab({ planId, productId }: { planId: string; productId: string }) {
  const uid = useId();
  const [_loading, setLoading] = useState(true);
  const [urlCard, setUrlCard] = useState('');
  const [urlBoleto, setUrlBoleto] = useState('');
  const [urlPix, setUrlPix] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (savedTimer.current) {
        clearTimeout(savedTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    apiFetch(`/products/${productId}`)
      .then((res: unknown) => {
        const envelope = res as { data?: Record<string, unknown> } | undefined;
        const p = (envelope?.data ?? envelope) as Record<string, unknown> | undefined;
        if (p) {
          setUrlCard((p.thankyouUrl as string | undefined) ?? '');
          setUrlBoleto((p.thankyouBoletoUrl as string | undefined) ?? '');
          setUrlPix((p.thankyouPixUrl as string | undefined) ?? '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [productId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch(`/products/${productId}`, {
        method: 'PUT',
        body: {
          thankyouUrl: urlCard || null,
          thankyouBoletoUrl: urlBoleto || null,
          thankyouPixUrl: urlPix || null,
        },
      });
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/products'));
      setSaved(true);
      if (savedTimer.current) {
        clearTimeout(savedTimer.current);
      }
      savedTimer.current = setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('Erro ao salvar URLs de agradecimento:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <h3
        style={{
          fontFamily: FONT_BODY,
          fontSize: '18px',
          fontWeight: 600,
          color: TEXT_PRIMARY,
          letterSpacing: '-0.01em',
          margin: 0,
        }}
      >
        Pagina de obrigado
      </h3>

      {/* Description */}
      <p
        style={{
          fontFamily: FONT_BODY,
          fontSize: '13px',
          color: TEXT_MUTED,
          margin: 0,
          lineHeight: '1.5',
        }}
      >
        Configure URLs diferentes por metodo de pagamento.
      </p>

      {/* URL Inputs */}
      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Card URL */}
        <div>
          <label htmlFor={`${uid}-url-card`} style={labelStyle}>
            URL de obrigado (cartao aprovado)
          </label>
          <div style={{ position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <LinkIcon />
            </div>
            <input
              id={`${uid}-url-card`}
              type="url"
              aria-label="URL de obrigado (cartão aprovado)"
              value={urlCard}
              onChange={(e) => setUrlCard(e.target.value)}
              placeholder="https://seusite.com/obrigado"
              style={{ ...inputStyle, paddingLeft: '36px' }}
            />
          </div>
        </div>

        {/* Boleto URL */}
        <div>
          <label htmlFor={`${uid}-url-boleto`} style={labelStyle}>
            URL de obrigado para boletos
          </label>
          <div style={{ position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <LinkIcon />
            </div>
            <input
              id={`${uid}-url-boleto`}
              type="url"
              aria-label="URL de obrigado para boletos"
              value={urlBoleto}
              onChange={(e) => setUrlBoleto(e.target.value)}
              placeholder="https://seusite.com/obrigado-boleto"
              style={{ ...inputStyle, paddingLeft: '36px' }}
            />
          </div>
        </div>

        {/* Pix URL */}
        <div>
          <label htmlFor={`${uid}-url-pix`} style={labelStyle}>
            URL de obrigado para Pix
          </label>
          <div style={{ position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <LinkIcon />
            </div>
            <input
              id={`${uid}-url-pix`}
              type="url"
              aria-label="URL de obrigado para Pix"
              value={urlPix}
              onChange={(e) => setUrlPix(e.target.value)}
              placeholder="https://seusite.com/obrigado-pix"
              style={{ ...inputStyle, paddingLeft: '36px' }}
            />
          </div>
        </div>
      </div>

      {/* Divider */}
      <div
        style={{
          height: '1px',
          background: BORDER,
          width: '100%',
        }}
      />

      {/* Checkout Customization Section */}
      <h4
        style={{
          fontFamily: FONT_BODY,
          fontSize: '14px',
          fontWeight: 600,
          color: TEXT_PRIMARY,
          margin: 0,
          letterSpacing: '-0.01em',
        }}
      >
        Personalizar Checkout Deste Plano
      </h4>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '12px' }}>
        {/* Ember: Open Editor */}
        <button
          type="button"
          onClick={() => {
            window.location.href = `/checkout/${planId}`;
          }}
          style={{
            flex: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            background: EMBER,
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '6px',
            padding: '12px 20px',
            fontSize: '13px',
            fontWeight: 600,
            fontFamily: FONT_BODY,
            cursor: 'pointer',
            transition: 'opacity 150ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.9';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
        >
          <PaletteIcon />
          Abrir Editor de Checkout
        </button>

        {/* Secondary: Preview */}
        <button
          type="button"
          onClick={() => {
            window.open(`/preview/${planId}`, '_blank');
          }}
          style={{
            flex: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            background: 'transparent',
            color: TEXT_PRIMARY,
            border: `1px solid ${BORDER}`,
            borderRadius: '6px',
            padding: '12px 20px',
            fontSize: '13px',
            fontWeight: 600,
            fontFamily: FONT_BODY,
            cursor: 'pointer',
            transition: 'border-color 150ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = TEXT_MUTED;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = BORDER;
          }}
        >
          <ExternalLinkIcon />
          Preview
        </button>
      </div>

      {/* Note */}
      <p
        style={{
          fontFamily: FONT_BODY,
          fontSize: '12px',
          color: TEXT_DIM,
          margin: 0,
          lineHeight: '1.5',
        }}
      >
        O editor visual permite customizar cores, textos, timer, depoimentos e mais.
      </p>

      {/* Save Button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '4px' }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            background: EMBER,
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '6px',
            padding: '10px 24px',
            fontSize: '13px',
            fontWeight: 600,
            fontFamily: FONT_BODY,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
            transition: 'opacity 150ms ease',
          }}
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        {saved && (
          <span
            style={{
              fontFamily: FONT_BODY,
              fontSize: '13px',
              fontWeight: 500,
              color: GREEN,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke={GREEN}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Salvo
          </span>
        )}
      </div>
    </div>
  );
}
