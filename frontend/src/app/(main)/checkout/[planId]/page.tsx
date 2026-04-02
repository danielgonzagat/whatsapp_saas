'use client';

// PULSE:OK — useCheckoutEditor hook has built-in SWR optimistic update + mutate on every config patch. setTimeout calls are UI state resets (save indicator, highlight), not fake_save facades.

export const dynamic = 'force-dynamic';

import { useState, useCallback, useRef, useEffect, type CSSProperties } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Monitor,
  Tablet,
  Smartphone,
  Copy,
  Check,
  Plus,
  Trash2,
  Star,
} from 'lucide-react';
import {
  useCheckoutEditor,
  DEFAULT_CONFIG,
  type CheckoutConfig,
  type CheckoutTestimonial,
  type CheckoutTrustBadge,
  type CheckoutOrderBump,
  type CheckoutUpsell,
  type CheckoutPixel,
} from '@/hooks/useCheckoutEditor';
import { buildDashboardHref } from '@/lib/kloel-dashboard-context';

// ════════════════════════════════════════════
// DESIGN TOKENS (inline — Kloel Monitor DNA)
// ════════════════════════════════════════════

const C = {
  void: '#0A0A0C',
  surface: '#111113',
  elevated: '#19191C',
  border: '#222226',
  ember: '#E85D30',
  text: '#E0DDD8',
  muted: '#6E6E73',
  dim: '#3A3A3F',
} as const;

const FONT = "'Sora', sans-serif";
const MONO = "'JetBrains Mono', monospace";
const R = 6;

// ════════════════════════════════════════════
// REUSABLE STYLE HELPERS
// ════════════════════════════════════════════

const sectionStyle: CSSProperties = {
  marginBottom: 24,
  padding: 20,
  backgroundColor: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: R,
};

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 500,
  color: C.muted,
  fontFamily: FONT,
  letterSpacing: '0.02em',
  textTransform: 'uppercase' as const,
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: 14,
  fontFamily: FONT,
  color: C.text,
  backgroundColor: C.elevated,
  border: `1px solid ${C.border}`,
  borderRadius: R,
  outline: 'none',
  boxSizing: 'border-box',
};

const sectionTitleStyle: CSSProperties = {
  margin: '0 0 16px 0',
  fontSize: 14,
  fontWeight: 600,
  color: C.text,
  fontFamily: FONT,
};

const toggleRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 0',
};

const smallBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 500,
  fontFamily: FONT,
  color: C.text,
  backgroundColor: C.elevated,
  border: `1px solid ${C.border}`,
  borderRadius: R,
  cursor: 'pointer',
};

const removeBtnStyle: CSSProperties = {
  ...smallBtnStyle,
  color: '#E85D30',
  backgroundColor: 'transparent',
  border: 'none',
  padding: '4px 8px',
};

// ════════════════════════════════════════════
// TOGGLE COMPONENT
// ════════════════════════════════════════════

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <div style={toggleRow}>
      <span style={{ fontSize: 13, color: C.text, fontFamily: FONT }}>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
          position: 'relative',
          width: 40,
          height: 22,
          borderRadius: 11,
          border: 'none',
          backgroundColor: checked ? C.ember : C.border,
          cursor: 'pointer',
          transition: 'background-color 150ms ease',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 20 : 2,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: '#fff',
            transition: 'left 150ms ease',
          }}
        />
      </button>
    </div>
  );
}

// ════════════════════════════════════════════
// COLOR PICKER FIELD
// ════════════════════════════════════════════

function ColorField({
  label: lbl,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>{lbl}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          aria-label={`${lbl} (seletor de cor)`}
          type="color"
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 36,
            height: 36,
            padding: 0,
            border: `1px solid ${C.border}`,
            borderRadius: R,
            backgroundColor: 'transparent',
            cursor: 'pointer',
          }}
        />
        <input
          aria-label={lbl}
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, flex: 1, fontFamily: MONO, fontSize: 13 }}
          placeholder="#000000"
        />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// TEXT FIELD
// ════════════════════════════════════════════

function Field({
  label: lbl,
  value,
  onChange,
  placeholder,
  multiline,
  type,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  type?: string;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>{lbl}</label>
      {multiline ? (
        <textarea
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
        />
      ) : (
        <input
          aria-label={lbl}
          type={type || 'text'}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={inputStyle}
        />
      )}
    </div>
  );
}

function LoadingBar({
  width = '100%',
  height = 12,
  style,
}: {
  width?: string | number;
  height?: string | number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: R,
        background:
          'linear-gradient(90deg, rgba(34,34,38,0.92) 0%, rgba(41,41,46,0.98) 50%, rgba(34,34,38,0.92) 100%)',
        ...style,
      }}
    />
  );
}

function CheckoutEditorLoadingOverlay({ showContextCard }: { showContextCard: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        padding: 20,
        background: 'linear-gradient(180deg, rgba(10,10,12,0.96) 0%, rgba(10,10,12,0.985) 100%)',
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          marginBottom: 16,
          fontSize: 11,
          fontWeight: 700,
          color: C.ember,
          fontFamily: MONO,
          letterSpacing: '0.08em',
        }}
      >
        SINCRONIZANDO EDITOR
      </div>

      {showContextCard && (
        <div style={{ ...sectionStyle, marginBottom: 20, backgroundColor: 'rgba(232,93,48,0.05)' }}>
          <LoadingBar width="38%" height={10} style={{ marginBottom: 12 }} />
          <LoadingBar width="64%" height={16} style={{ marginBottom: 10 }} />
          <LoadingBar width="92%" height={10} style={{ marginBottom: 8 }} />
          <LoadingBar width="74%" height={10} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {[0, 1, 2, 3, 4].map((index) => (
          <div key={index} style={{ ...sectionStyle, marginBottom: 0 }}>
            <LoadingBar width={`${28 + index * 7}%`} height={14} style={{ marginBottom: 16 }} />
            <LoadingBar width="100%" height={36} style={{ marginBottom: 10 }} />
            <LoadingBar width="82%" height={36} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CheckoutPreviewLoadingOverlay() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'linear-gradient(180deg, rgba(24,24,27,0.94) 0%, rgba(17,17,19,0.98) 100%)',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          padding: 20,
          borderRadius: 12,
          border: `1px solid ${C.border}`,
          backgroundColor: C.surface,
          boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
        }}
      >
        <LoadingBar width="32%" height={10} style={{ marginBottom: 16 }} />
        <LoadingBar width="68%" height={18} style={{ marginBottom: 10 }} />
        <LoadingBar width="88%" height={12} style={{ marginBottom: 24 }} />
        <LoadingBar width="100%" height={240} style={{ marginBottom: 18, borderRadius: 10 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <LoadingBar height={40} />
          <LoadingBar height={40} />
          <LoadingBar height={40} />
          <LoadingBar height={40} />
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// DEVICE WIDTHS
// ════════════════════════════════════════════

const DEVICES = [
  { id: 'desktop', icon: Monitor, width: '100%' },
  { id: 'tablet', icon: Tablet, width: '768px' },
  { id: 'mobile', icon: Smartphone, width: '375px' },
] as const;

type DeviceId = (typeof DEVICES)[number]['id'];

// ════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════

export default function CheckoutEditorPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = params?.planId as string;
  const requestedFocus = searchParams?.get('focus') || '';
  const source = searchParams?.get('source') || '';
  const productId = searchParams?.get('productId') || '';
  const productName = searchParams?.get('productName') || '';

  const { config, isLoading, updateConfig } = useCheckoutEditor(planId);

  const [device, setDevice] = useState<DeviceId>('desktop');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [copied, setCopied] = useState(false);
  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const appearanceRef = useRef<HTMLDivElement>(null);
  const couponRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<HTMLDivElement>(null);
  const stockRef = useRef<HTMLDivElement>(null);
  const orderBumpsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPreviewUrl(`${window.location.origin}/checkout/preview/${planId}?preview=true`);
  }, [planId]);

  useEffect(
    () => () => {
      if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (isLoading || !requestedFocus) return;
    const focusMap: Record<
      string,
      { ref: React.RefObject<HTMLDivElement | null>; highlight: string }
    > = {
      'checkout-appearance': { ref: appearanceRef, highlight: 'appearance' },
      coupon: { ref: couponRef, highlight: 'coupon' },
      urgency: { ref: timerRef, highlight: 'urgency' },
      'order-bump': { ref: orderBumpsRef, highlight: 'order-bump' },
    };
    const target = focusMap[requestedFocus];
    if (!target?.ref.current) return;
    const timer = setTimeout(() => {
      target.ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setHighlightedSection(target.highlight);
    }, 120);
    const clearTimer = setTimeout(() => setHighlightedSection(null), 2600);
    return () => {
      clearTimeout(timer);
      clearTimeout(clearTimer);
    };
  }, [isLoading, requestedFocus]);

  // ── Refresh preview (debounced) ──
  const refreshPreview = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      if (iframeRef.current) {
        iframeRef.current.src = iframeRef.current.src;
      }
    }, 800);
  }, []);

  // ── Patch helper ──
  const patch = useCallback(
    (p: Partial<CheckoutConfig>) => {
      setSaveStatus('saving');
      updateConfig(p).then(() => {
        setSaveStatus('saved');
        if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current);
        saveStatusTimer.current = setTimeout(() => setSaveStatus('idle'), 2000);
      });
      refreshPreview();
    },
    [updateConfig, refreshPreview],
  );

  // ── Copy link ──
  const copyLink = useCallback(() => {
    const slug = config.slug || planId;
    const baseUrl = process.env.NEXT_PUBLIC_CHECKOUT_DOMAIN || 'https://pay.kloel.com';
    navigator.clipboard.writeText(`${baseUrl}/${slug}`);
    setCopied(true);
    if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current);
    saveStatusTimer.current = setTimeout(() => setCopied(false), 2000);
  }, [config.slug, planId]);

  // ── Cleanup timers ──
  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);

  const deviceWidth = DEVICES.find((d) => d.id === device)?.width || '100%';
  const showPreviewLoading = isLoading || !previewUrl;
  const sectionCardStyle = (sectionKey: string): CSSProperties => ({
    ...sectionStyle,
    ...(highlightedSection === sectionKey
      ? { border: `1px solid ${C.ember}`, boxShadow: `0 0 0 1px ${C.ember}22 inset` }
      : null),
  });
  const productReturnHref = productId
    ? (() => {
        switch (requestedFocus) {
          case 'order-bump':
            return `/products/${productId}?tab=planos&planSub=bump&focus=order-bump`;
          case 'coupon':
            return `/products/${productId}?tab=cupons&modal=newCoupon&focus=coupon`;
          case 'urgency':
            return `/products/${productId}?tab=ia&focus=urgency`;
          case 'checkout-appearance':
          default:
            return `/products/${productId}?tab=checkouts&focus=checkout-appearance`;
        }
      })()
    : null;

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: C.void }}
    >
      {/* ═══════ TOP BAR ═══════ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          height: 52,
          borderBottom: `1px solid ${C.border}`,
          backgroundColor: C.surface,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => {
              if (productReturnHref) {
                router.push(productReturnHref);
                return;
              }
              router.back();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 13,
              color: C.muted,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: FONT,
            }}
          >
            <ArrowLeft style={{ width: 16, height: 16 }} />
            {productReturnHref ? 'Voltar para produto' : 'Voltar'}
          </button>
          <div
            style={{
              width: 1,
              height: 20,
              backgroundColor: C.border,
            }}
          />
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text, fontFamily: FONT }}>
            Editor de Checkout
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Save status */}
          <span
            style={{
              fontSize: 12,
              fontFamily: MONO,
              color: isLoading
                ? C.ember
                : saveStatus === 'saving'
                  ? C.ember
                  : saveStatus === 'saved'
                    ? '#4ADE80'
                    : C.dim,
            }}
          >
            {isLoading
              ? 'Sincronizando...'
              : saveStatus === 'saving'
                ? 'Salvando...'
                : saveStatus === 'saved'
                  ? 'Salvo \u2713'
                  : ''}
          </span>

          {/* Device switcher */}
          <div
            style={{
              display: 'flex',
              gap: 2,
              backgroundColor: C.elevated,
              borderRadius: R,
              padding: 2,
            }}
          >
            {DEVICES.map((d) => {
              const Icon = d.icon;
              const active = device === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => setDevice(d.id)}
                  title={d.id}
                  disabled={isLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 28,
                    borderRadius: R,
                    border: 'none',
                    backgroundColor: active ? C.border : 'transparent',
                    color: active ? C.text : C.muted,
                    cursor: isLoading ? 'default' : 'pointer',
                    opacity: isLoading ? 0.5 : 1,
                    transition: 'all 150ms ease',
                  }}
                >
                  <Icon style={{ width: 16, height: 16 }} />
                </button>
              );
            })}
          </div>

          {/* Copy link */}
          <button
            onClick={() =>
              router.push(
                buildDashboardHref({
                  source: source || 'checkout',
                  planId,
                  planName: config.productDisplayName || '',
                  productId: productId || '',
                  productName: productName || config.productDisplayName || '',
                  purpose: requestedFocus || 'checkout',
                }),
              )
            }
            disabled={isLoading}
            style={{
              ...smallBtnStyle,
              opacity: isLoading ? 0.5 : 1,
              cursor: isLoading ? 'default' : 'pointer',
            }}
          >
            <Star style={{ width: 14, height: 14 }} />
            Abrir com IA
          </button>

          {/* Copy link */}
          <button
            onClick={copyLink}
            disabled={isLoading}
            style={{
              ...smallBtnStyle,
              opacity: isLoading ? 0.5 : 1,
              cursor: isLoading ? 'default' : 'pointer',
            }}
          >
            {copied ? (
              <Check style={{ width: 14, height: 14, color: '#4ADE80' }} />
            ) : (
              <Copy style={{ width: 14, height: 14 }} />
            )}
            {copied ? 'Copiado!' : 'Copiar link'}
          </button>
        </div>
      </div>

      {/* ═══════ SPLIT VIEW ═══════ */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* ─── LEFT: EDIT PANEL ─── */}
        <div
          style={{
            width: 420,
            minWidth: 420,
            overflowY: 'auto',
            borderRight: `1px solid ${C.border}`,
            padding: 20,
            backgroundColor: C.void,
            position: 'relative',
          }}
        >
          <div
            style={{
              opacity: isLoading ? 0 : 1,
              pointerEvents: isLoading ? 'none' : 'auto',
              transition: 'opacity 180ms ease',
            }}
          >
            {(source === 'products' || requestedFocus) && (
              <div
                style={{
                  ...sectionCardStyle('context'),
                  marginBottom: 20,
                  backgroundColor: 'rgba(232,93,48,0.06)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div
                      style={{
                        marginBottom: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        color: C.ember,
                        fontFamily: MONO,
                        letterSpacing: '0.08em',
                      }}
                    >
                      CONTEXTO DE ACESSO
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: FONT }}>
                      {productName
                        ? `Editor visual de ${productName}`
                        : 'Editor visual do checkout'}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 11,
                        color: C.muted,
                        fontFamily: FONT,
                        lineHeight: 1.6,
                      }}
                    >
                      {requestedFocus === 'checkout-appearance' &&
                        'Você abriu diretamente a aparência comercial do checkout.'}
                      {requestedFocus === 'coupon' &&
                        'Você abriu diretamente a configuração de cupom e popup de recuperação.'}
                      {requestedFocus === 'urgency' &&
                        'Você abriu diretamente os blocos de urgência, timer e estoque.'}
                      {requestedFocus === 'order-bump' &&
                        'Você abriu diretamente a configuração de order bump desta oferta.'}
                      {!requestedFocus &&
                        'Você abriu o editor completo a partir do fluxo de produto.'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {productReturnHref && (
                      <button onClick={() => router.push(productReturnHref)} style={smallBtnStyle}>
                        <ArrowLeft style={{ width: 14, height: 14 }} />
                        Produto
                      </button>
                    )}
                    <button
                      onClick={() =>
                        iframeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      }
                      style={smallBtnStyle}
                    >
                      Ver preview
                    </button>
                  </div>
                </div>
              </div>
            )}
            {/* ── 1. Theme ── */}
            <div ref={appearanceRef} style={sectionCardStyle('appearance')}>
              <h3 style={sectionTitleStyle}>Tema</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['NOIR', 'BLANC'] as const).map((t) => (
                  <label
                    key={t}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: '10px 0',
                      borderRadius: R,
                      border: `1px solid ${config.theme === t ? C.ember : C.border}`,
                      backgroundColor: config.theme === t ? 'rgba(232,93,48,0.06)' : C.elevated,
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: FONT,
                      color: config.theme === t ? C.ember : C.muted,
                      transition: 'all 150ms ease',
                    }}
                  >
                    <input
                      type="radio"
                      name="theme"
                      value={t}
                      checked={config.theme === t}
                      onChange={() => patch({ theme: t })}
                      style={{ display: 'none' }}
                    />
                    {t}
                  </label>
                ))}
              </div>
            </div>

            {/* ── 2. Colors ── */}
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>Cores</h3>
              <ColorField
                label="Cor de destaque"
                value={config.accentColor}
                onChange={(v) => patch({ accentColor: v })}
              />
              <ColorField
                label="Cor de destaque 2"
                value={config.accentColor2}
                onChange={(v) => patch({ accentColor2: v })}
              />
              <ColorField
                label="Fundo"
                value={config.backgroundColor}
                onChange={(v) => patch({ backgroundColor: v })}
              />
              <ColorField
                label="Card"
                value={config.cardColor}
                onChange={(v) => patch({ cardColor: v })}
              />
              <ColorField
                label="Texto"
                value={config.textColor}
                onChange={(v) => patch({ textColor: v })}
              />
            </div>

            {/* ── 3. Header ── */}
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>Header</h3>
              <Field
                label="Nome da marca"
                value={config.brandName}
                onChange={(v) => patch({ brandName: v })}
                placeholder="Minha Marca"
              />
              <Field
                label="Logo URL"
                value={config.brandLogo}
                onChange={(v) => patch({ brandLogo: v })}
                placeholder="https://..."
              />
              <Field
                label="Mensagem principal"
                value={config.headerMessage}
                onChange={(v) => patch({ headerMessage: v })}
                placeholder="Quase la!"
              />
              <Field
                label="Submensagem"
                value={config.headerSubMessage}
                onChange={(v) => patch({ headerSubMessage: v })}
                placeholder="Complete sua compra"
              />
            </div>

            {/* ── 4. Product ── */}
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>Produto</h3>
              <Field
                label="Imagem do produto (URL)"
                value={config.productImage}
                onChange={(v) => patch({ productImage: v })}
                placeholder="https://..."
              />
              <Field
                label="Nome de exibicao"
                value={config.productDisplayName}
                onChange={(v) => patch({ productDisplayName: v })}
                placeholder="Produto Premium"
              />
            </div>

            {/* ── 5. Buttons ── */}
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>Botoes</h3>
              <Field
                label="Texto etapa 1"
                value={config.btnStep1Text}
                onChange={(v) => patch({ btnStep1Text: v })}
                placeholder="Continuar"
              />
              <Field
                label="Texto etapa 2"
                value={config.btnStep2Text}
                onChange={(v) => patch({ btnStep2Text: v })}
                placeholder="Continuar"
              />
              <Field
                label="Texto finalizar"
                value={config.btnFinalizeText}
                onChange={(v) => patch({ btnFinalizeText: v })}
                placeholder="Finalizar Compra"
              />
            </div>

            {/* ── 6. Fields ── */}
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>Campos</h3>
              <Toggle
                label="Exigir CPF"
                checked={config.requireCPF}
                onChange={(v) => patch({ requireCPF: v })}
              />
              <Toggle
                label="Exigir telefone"
                checked={config.requirePhone}
                onChange={(v) => patch({ requirePhone: v })}
              />
              <Field
                label="Label do telefone"
                value={config.phoneLabel}
                onChange={(v) => patch({ phoneLabel: v })}
                placeholder="WhatsApp"
              />
            </div>

            {/* ── 7. Payment Methods ── */}
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>Metodos de Pagamento</h3>
              <Toggle
                label="Cartao de Credito"
                checked={config.enableCreditCard}
                onChange={(v) => patch({ enableCreditCard: v })}
              />
              <Toggle
                label="Pix"
                checked={config.enablePix}
                onChange={(v) => patch({ enablePix: v })}
              />
              <Toggle
                label="Boleto"
                checked={config.enableBoleto}
                onChange={(v) => patch({ enableBoleto: v })}
              />
            </div>

            {/* ── 8. Coupon Popup ── */}
            <div ref={couponRef} style={sectionCardStyle('coupon')}>
              <h3 style={sectionTitleStyle}>Popup de Cupom</h3>
              <Toggle
                label="Habilitar cupom"
                checked={config.enableCoupon}
                onChange={(v) => patch({ enableCoupon: v })}
              />
              <Toggle
                label="Exibir popup de cupom"
                checked={config.showCouponPopup}
                onChange={(v) => patch({ showCouponPopup: v })}
              />
              {config.showCouponPopup && (
                <>
                  <Field
                    label="Titulo do popup"
                    value={config.couponPopupTitle}
                    onChange={(v) => patch({ couponPopupTitle: v })}
                    placeholder="Oferta Especial!"
                  />
                  <Field
                    label="Descricao do popup"
                    value={config.couponPopupDesc}
                    onChange={(v) => patch({ couponPopupDesc: v })}
                    placeholder="Use o cupom abaixo"
                    multiline
                  />
                  <Field
                    label="Codigo do cupom automatico"
                    value={config.autoCouponCode}
                    onChange={(v) => patch({ autoCouponCode: v })}
                    placeholder="DESCONTO10"
                  />
                </>
              )}
            </div>

            {/* ── 9. Timer ── */}
            <div ref={timerRef} style={sectionCardStyle('urgency')}>
              <h3 style={sectionTitleStyle}>Timer</h3>
              <Toggle
                label="Habilitar timer"
                checked={config.enableTimer}
                onChange={(v) => patch({ enableTimer: v })}
              />
              {config.enableTimer && (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>Tipo</label>
                    <select
                      value={config.timerType}
                      onChange={(e) => patch({ timerType: e.target.value })}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="countdown">Contagem regressiva</option>
                      <option value="evergreen">Evergreen</option>
                      <option value="fixed">Data fixa</option>
                    </select>
                  </div>
                  <Field
                    label="Minutos"
                    value={config.timerMinutes}
                    onChange={(v) => patch({ timerMinutes: parseInt(v) || 0 })}
                    type="number"
                  />
                  <Field
                    label="Mensagem"
                    value={config.timerMessage}
                    onChange={(v) => patch({ timerMessage: v })}
                    placeholder="Oferta expira em:"
                  />
                </>
              )}
            </div>

            {/* ── 10. Stock Counter ── */}
            <div ref={stockRef} style={sectionCardStyle('urgency')}>
              <h3 style={sectionTitleStyle}>Contador de Estoque</h3>
              <Toggle
                label="Exibir contador"
                checked={config.showStockCounter}
                onChange={(v) => patch({ showStockCounter: v })}
              />
              {config.showStockCounter && (
                <>
                  <Field
                    label="Mensagem"
                    value={config.stockMessage}
                    onChange={(v) => patch({ stockMessage: v })}
                    placeholder="Apenas {count} unidades restantes!"
                  />
                  <Field
                    label="Quantidade ficticia"
                    value={config.fakeStockCount}
                    onChange={(v) => patch({ fakeStockCount: parseInt(v) || 0 })}
                    type="number"
                  />
                </>
              )}
            </div>

            {/* ── 11. Testimonials ── */}
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>Depoimentos</h3>
              {config.testimonials.map((t, i) => (
                <div
                  key={i}
                  style={{
                    marginBottom: 12,
                    padding: 12,
                    backgroundColor: C.elevated,
                    borderRadius: R,
                    border: `1px solid ${C.border}`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{ fontSize: 12, fontWeight: 500, color: C.muted, fontFamily: FONT }}
                    >
                      Depoimento {i + 1}
                    </span>
                    <button
                      onClick={() => {
                        const next = [...config.testimonials];
                        next.splice(i, 1);
                        patch({ testimonials: next });
                      }}
                      style={removeBtnStyle}
                    >
                      <Trash2 style={{ width: 12, height: 12 }} />
                    </button>
                  </div>
                  <Field
                    label="Nome"
                    value={t.name}
                    onChange={(v) => {
                      const next = [...config.testimonials];
                      next[i] = { ...next[i], name: v };
                      patch({ testimonials: next });
                    }}
                    placeholder="Maria S."
                  />
                  <Field
                    label="Texto"
                    value={t.text}
                    onChange={(v) => {
                      const next = [...config.testimonials];
                      next[i] = { ...next[i], text: v };
                      patch({ testimonials: next });
                    }}
                    placeholder="Produto incrivel!"
                    multiline
                  />
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>Estrelas</label>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button
                          key={s}
                          onClick={() => {
                            const next = [...config.testimonials];
                            next[i] = { ...next[i], stars: s };
                            patch({ testimonials: next });
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 2,
                          }}
                        >
                          <Star
                            style={{
                              width: 18,
                              height: 18,
                              color: s <= t.stars ? '#FBBF24' : C.dim,
                              fill: s <= t.stars ? '#FBBF24' : 'transparent',
                            }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              <button
                onClick={() =>
                  patch({
                    testimonials: [...config.testimonials, { name: '', text: '', stars: 5 }],
                  })
                }
                style={smallBtnStyle}
              >
                <Plus style={{ width: 14, height: 14 }} />
                Adicionar depoimento
              </button>
            </div>

            {/* ── 12. Guarantee ── */}
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>Garantia</h3>
              <Toggle
                label="Habilitar garantia"
                checked={config.enableGuarantee}
                onChange={(v) => patch({ enableGuarantee: v })}
              />
              {config.enableGuarantee && (
                <>
                  <Field
                    label="Titulo"
                    value={config.guaranteeTitle}
                    onChange={(v) => patch({ guaranteeTitle: v })}
                    placeholder="Garantia incondicional"
                  />
                  <Field
                    label="Texto"
                    value={config.guaranteeText}
                    onChange={(v) => patch({ guaranteeText: v })}
                    placeholder="Devolvemos seu dinheiro..."
                    multiline
                  />
                  <Field
                    label="Dias"
                    value={config.guaranteeDays}
                    onChange={(v) => patch({ guaranteeDays: parseInt(v) || 0 })}
                    type="number"
                  />
                </>
              )}
            </div>

            {/* ── 13. Trust Badges ── */}
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>Selos de Confianca</h3>
              <Toggle
                label="Habilitar selos"
                checked={config.enableTrustBadges}
                onChange={(v) => patch({ enableTrustBadges: v })}
              />
              {config.enableTrustBadges && (
                <>
                  {config.trustBadges.map((b, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 8,
                      }}
                    >
                      <input
                        aria-label="Texto do selo de confianca"
                        type="text"
                        value={b.label}
                        onChange={(e) => {
                          const next = [...config.trustBadges];
                          next[i] = { ...next[i], label: e.target.value };
                          patch({ trustBadges: next });
                        }}
                        placeholder="Compra Segura"
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <button
                        onClick={() => {
                          const next = [...config.trustBadges];
                          next.splice(i, 1);
                          patch({ trustBadges: next });
                        }}
                        style={removeBtnStyle}
                      >
                        <Trash2 style={{ width: 12, height: 12 }} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() =>
                      patch({
                        trustBadges: [...config.trustBadges, { label: '' }],
                      })
                    }
                    style={smallBtnStyle}
                  >
                    <Plus style={{ width: 14, height: 14 }} />
                    Adicionar selo
                  </button>
                </>
              )}
            </div>

            {/* ── 14. Order Bumps ── */}
            <div ref={orderBumpsRef} style={sectionCardStyle('order-bump')}>
              <h3 style={sectionTitleStyle}>Order Bumps</h3>
              {config.orderBumps.map((ob, i) => (
                <div
                  key={i}
                  style={{
                    marginBottom: 12,
                    padding: 12,
                    backgroundColor: C.elevated,
                    borderRadius: R,
                    border: `1px solid ${C.border}`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{ fontSize: 12, fontWeight: 500, color: C.muted, fontFamily: FONT }}
                    >
                      Bump {i + 1}
                    </span>
                    <button
                      onClick={() => {
                        const next = [...config.orderBumps];
                        next.splice(i, 1);
                        patch({ orderBumps: next });
                      }}
                      style={removeBtnStyle}
                    >
                      <Trash2 style={{ width: 12, height: 12 }} />
                    </button>
                  </div>
                  <Field
                    label="Titulo"
                    value={ob.title}
                    onChange={(v) => {
                      const next = [...config.orderBumps];
                      next[i] = { ...next[i], title: v };
                      patch({ orderBumps: next });
                    }}
                    placeholder="Adicione tambem..."
                  />
                  <Field
                    label="Descricao"
                    value={ob.description}
                    onChange={(v) => {
                      const next = [...config.orderBumps];
                      next[i] = { ...next[i], description: v };
                      patch({ orderBumps: next });
                    }}
                    placeholder="Complemento ideal"
                    multiline
                  />
                  <Field
                    label="Nome do produto"
                    value={ob.productName}
                    onChange={(v) => {
                      const next = [...config.orderBumps];
                      next[i] = { ...next[i], productName: v };
                      patch({ orderBumps: next });
                    }}
                    placeholder="Produto Bump"
                  />
                  <Field
                    label="Preco (R$)"
                    value={ob.price}
                    onChange={(v) => {
                      const next = [...config.orderBumps];
                      next[i] = { ...next[i], price: parseFloat(v) || 0 };
                      patch({ orderBumps: next });
                    }}
                    type="number"
                  />
                </div>
              ))}
              <button
                onClick={() =>
                  patch({
                    orderBumps: [
                      ...config.orderBumps,
                      { title: '', description: '', productName: '', price: 0 },
                    ],
                  })
                }
                style={smallBtnStyle}
              >
                <Plus style={{ width: 14, height: 14 }} />
                Adicionar order bump
              </button>
            </div>

            {/* ── 15. Upsells ── */}
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>Upsells</h3>
              {config.upsells.map((us, i) => (
                <div
                  key={i}
                  style={{
                    marginBottom: 12,
                    padding: 12,
                    backgroundColor: C.elevated,
                    borderRadius: R,
                    border: `1px solid ${C.border}`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{ fontSize: 12, fontWeight: 500, color: C.muted, fontFamily: FONT }}
                    >
                      Upsell {i + 1}
                    </span>
                    <button
                      onClick={() => {
                        const next = [...config.upsells];
                        next.splice(i, 1);
                        patch({ upsells: next });
                      }}
                      style={removeBtnStyle}
                    >
                      <Trash2 style={{ width: 12, height: 12 }} />
                    </button>
                  </div>
                  <Field
                    label="Titulo"
                    value={us.title}
                    onChange={(v) => {
                      const next = [...config.upsells];
                      next[i] = { ...next[i], title: v };
                      patch({ upsells: next });
                    }}
                    placeholder="Oferta especial"
                  />
                  <Field
                    label="Descricao"
                    value={us.description}
                    onChange={(v) => {
                      const next = [...config.upsells];
                      next[i] = { ...next[i], description: v };
                      patch({ upsells: next });
                    }}
                    placeholder="Upgrade seu plano"
                    multiline
                  />
                  <Field
                    label="Nome do produto"
                    value={us.productName}
                    onChange={(v) => {
                      const next = [...config.upsells];
                      next[i] = { ...next[i], productName: v };
                      patch({ upsells: next });
                    }}
                    placeholder="Produto Upsell"
                  />
                  <Field
                    label="Preco (R$)"
                    value={us.price}
                    onChange={(v) => {
                      const next = [...config.upsells];
                      next[i] = { ...next[i], price: parseFloat(v) || 0 };
                      patch({ upsells: next });
                    }}
                    type="number"
                  />
                </div>
              ))}
              <button
                onClick={() =>
                  patch({
                    upsells: [
                      ...config.upsells,
                      { title: '', description: '', productName: '', price: 0 },
                    ],
                  })
                }
                style={smallBtnStyle}
              >
                <Plus style={{ width: 14, height: 14 }} />
                Adicionar upsell
              </button>
            </div>

            {/* ── 16. Exit Intent ── */}
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>Exit Intent</h3>
              <Toggle
                label="Habilitar exit intent"
                checked={config.enableExitIntent}
                onChange={(v) => patch({ enableExitIntent: v })}
              />
              {config.enableExitIntent && (
                <>
                  <Field
                    label="Titulo"
                    value={config.exitIntentTitle}
                    onChange={(v) => patch({ exitIntentTitle: v })}
                    placeholder="Espere! Temos uma oferta..."
                  />
                  <Field
                    label="Codigo do cupom"
                    value={config.exitIntentCouponCode}
                    onChange={(v) => patch({ exitIntentCouponCode: v })}
                    placeholder="VOLTE10"
                  />
                </>
              )}
            </div>

            {/* ── 17. Floating Bar ── */}
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>Barra Flutuante</h3>
              <Toggle
                label="Habilitar barra flutuante"
                checked={config.enableFloatingBar}
                onChange={(v) => patch({ enableFloatingBar: v })}
              />
              {config.enableFloatingBar && (
                <Field
                  label="Mensagem"
                  value={config.floatingBarMessage}
                  onChange={(v) => patch({ floatingBarMessage: v })}
                  placeholder="Oferta por tempo limitado!"
                />
              )}
            </div>

            {/* ── 18. SEO ── */}
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>SEO</h3>
              <Field
                label="Meta Title"
                value={config.metaTitle}
                onChange={(v) => patch({ metaTitle: v })}
                placeholder="Titulo da pagina"
              />
              <Field
                label="Meta Description"
                value={config.metaDescription}
                onChange={(v) => patch({ metaDescription: v })}
                placeholder="Descricao para mecanismos de busca"
                multiline
              />
              <Field
                label="Meta Image (URL)"
                value={config.metaImage}
                onChange={(v) => patch({ metaImage: v })}
                placeholder="https://..."
              />
            </div>

            {/* ── 19. Custom CSS ── */}
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>CSS Personalizado</h3>
              <textarea
                value={config.customCSS}
                onChange={(e) => patch({ customCSS: e.target.value })}
                placeholder={'.checkout-container {\n  /* seus estilos aqui */\n}'}
                rows={8}
                style={{
                  ...inputStyle,
                  fontFamily: MONO,
                  fontSize: 12,
                  resize: 'vertical',
                  minHeight: 120,
                }}
              />
            </div>

            {/* ── 20. Pixels ── */}
            <div style={sectionStyle}>
              <h3 style={sectionTitleStyle}>Pixels de Rastreamento</h3>
              {config.pixels.map((px, i) => (
                <div
                  key={i}
                  style={{
                    marginBottom: 12,
                    padding: 12,
                    backgroundColor: C.elevated,
                    borderRadius: R,
                    border: `1px solid ${C.border}`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{ fontSize: 12, fontWeight: 500, color: C.muted, fontFamily: FONT }}
                    >
                      Pixel {i + 1}
                    </span>
                    <button
                      onClick={() => {
                        const next = [...config.pixels];
                        next.splice(i, 1);
                        patch({ pixels: next });
                      }}
                      style={removeBtnStyle}
                    >
                      <Trash2 style={{ width: 12, height: 12 }} />
                    </button>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>Tipo</label>
                    <select
                      value={px.type}
                      onChange={(e) => {
                        const next = [...config.pixels];
                        next[i] = { ...next[i], type: e.target.value };
                        patch({ pixels: next });
                      }}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="facebook">Facebook Pixel</option>
                      <option value="google_analytics">Google Analytics</option>
                      <option value="google_ads">Google Ads</option>
                      <option value="tiktok">TikTok Pixel</option>
                      <option value="custom">Personalizado</option>
                    </select>
                  </div>
                  <Field
                    label="Pixel ID"
                    value={px.pixelId}
                    onChange={(v) => {
                      const next = [...config.pixels];
                      next[i] = { ...next[i], pixelId: v };
                      patch({ pixels: next });
                    }}
                    placeholder="123456789"
                  />
                  <Field
                    label="Access Token (opcional)"
                    value={px.accessToken || ''}
                    onChange={(v) => {
                      const next = [...config.pixels];
                      next[i] = { ...next[i], accessToken: v };
                      patch({ pixels: next });
                    }}
                    placeholder="EAAxxxxxx..."
                  />
                </div>
              ))}
              <button
                onClick={() =>
                  patch({
                    pixels: [...config.pixels, { type: 'facebook', pixelId: '' }],
                  })
                }
                style={smallBtnStyle}
              >
                <Plus style={{ width: 14, height: 14 }} />
                Adicionar pixel
              </button>
            </div>

            {/* Bottom spacer */}
            <div style={{ height: 40 }} />
          </div>
          {isLoading && (
            <CheckoutEditorLoadingOverlay
              showContextCard={Boolean(source === 'products' || requestedFocus)}
            />
          )}
        </div>

        {/* ─── RIGHT: LIVE PREVIEW ─── */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#18181B',
            overflow: 'hidden',
            padding: 20,
            position: 'relative',
          }}
        >
          <div
            style={{
              width: deviceWidth,
              maxWidth: '100%',
              height: '100%',
              borderRadius: R,
              overflow: 'hidden',
              border: `1px solid ${C.border}`,
              backgroundColor: '#000',
              transition: 'width 300ms ease',
              opacity: showPreviewLoading ? 0 : 1,
              pointerEvents: showPreviewLoading ? 'none' : 'auto',
            }}
          >
            <iframe
              ref={iframeRef}
              src={previewUrl}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
              }}
              title="Checkout Preview"
            />
          </div>
          {showPreviewLoading && <CheckoutPreviewLoadingOverlay />}
        </div>
      </div>
    </div>
  );
}
