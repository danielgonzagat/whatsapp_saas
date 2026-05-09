'use client';

import { kloelT } from '@/lib/i18n/t';
import type { CheckoutConfig } from '@/hooks/useCheckoutEditor';
import {
  ArrowLeft,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { CSSProperties, RefObject } from 'react';
import {
  C,
  ColorField,
  Field,
  sectionStyle,
  sectionTitleStyle,
  smallBtnStyle,
  Toggle,
  MONO,
  FONT,
  R,
} from './checkout-editor-shared';

export interface PlanSummarySectionProps {
  config: CheckoutConfig;
  patch: (p: Partial<CheckoutConfig>) => Promise<void>;
  isLoading: boolean;
  source: string;
  requestedFocus: string;
  productName: string;
  productReturnHref: string | null;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  appearanceRef: RefObject<HTMLDivElement | null>;
  highlightedSection: string | null;
  highlightActive: boolean;
}

function sectionCardStyle(
  key: string,
  highlightActive: boolean,
  highlightedSection: string | null,
): CSSProperties {
  return {
    ...sectionStyle,
    ...(highlightActive && highlightedSection === key
      ? { border: `1px solid ${C.ember}`, boxShadow: `0 0 0 1px ${C.ember}22 inset` }
      : null),
  };
}

export function PlanSummarySection({
  config,
  patch,
  isLoading,
  source,
  requestedFocus,
  productName: productNameProp,
  productReturnHref,
  iframeRef,
  appearanceRef,
  highlightedSection,
  highlightActive,
}: PlanSummarySectionProps) {
  const router = useRouter();

  return (
    <>
      {(source === 'products' || requestedFocus) && (
        <div
          style={{
            ...sectionStyle,
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
                {kloelT('CONTEXTO DE ACESSO')}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: FONT }}>
                {productNameProp
                  ? `Editor visual de ${productNameProp}`
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
                  'Voce abriu diretamente a aparencia comercial do checkout.'}
                {requestedFocus === 'payment-widget' &&
                  'Voce abriu diretamente o widget de pagamento para copiar o embed deste checkout.'}
                {requestedFocus === 'coupon' &&
                  'Voce abriu diretamente a configuracao de cupom e popup de recuperacao.'}
                {requestedFocus === 'urgency' &&
                  'Voce abriu diretamente os blocos de urgencia, timer e estoque.'}
                {requestedFocus === 'order-bump' &&
                  'Voce abriu diretamente a configuracao de order bump desta oferta.'}
                {!requestedFocus && 'Voce abriu o editor completo a partir do fluxo de produto.'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {productReturnHref && (
                <button
                  type="button"
                  onClick={() => router.push(productReturnHref)}
                  style={smallBtnStyle}
                >
                  <ArrowLeft style={{ width: 14, height: 14 }} aria-hidden="true" />
                  {kloelT('Produto')}
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  iframeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
                style={smallBtnStyle}
              >
                {kloelT('Ver preview')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 1. Theme ── */}
      <div ref={appearanceRef} style={sectionCardStyle('appearance', highlightActive, highlightedSection)}>
        <h3 style={sectionTitleStyle}>{kloelT('Tema')}</h3>
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
                onChange={() => void patch({ theme: t })}
                style={{ display: 'none' }}
              />
              {t}
            </label>
          ))}
        </div>
      </div>

      {/* ── 2. Colors ── */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>{kloelT('Cores')}</h3>
        <ColorField
          label={kloelT('Cor de destaque')}
          value={config.accentColor}
          onChange={(v) => void patch({ accentColor: v })}
        />
        <ColorField
          label={kloelT('Cor de destaque 2')}
          value={config.accentColor2}
          onChange={(v) => void patch({ accentColor2: v })}
        />
        <ColorField
          label={kloelT('Fundo')}
          value={config.backgroundColor}
          onChange={(v) => void patch({ backgroundColor: v })}
        />
        <ColorField
          label={kloelT('Card')}
          value={config.cardColor}
          onChange={(v) => void patch({ cardColor: v })}
        />
        <ColorField
          label={kloelT('Texto')}
          value={config.textColor}
          onChange={(v) => void patch({ textColor: v })}
        />
      </div>

      {/* ── 3. Header ── */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>{kloelT('Header')}</h3>
        <Field
          label={kloelT('Nome da marca')}
          value={config.brandName}
          onChange={(v) => void patch({ brandName: v })}
          placeholder={kloelT('Minha Marca')}
        />
        <Field
          label={kloelT('Logo URL')}
          value={config.brandLogo}
          onChange={(v) => void patch({ brandLogo: v })}
          placeholder="https://..."
        />
        <Field
          label={kloelT('Mensagem principal')}
          value={config.headerMessage}
          onChange={(v) => void patch({ headerMessage: v })}
          placeholder={kloelT('Quase la!')}
        />
        <Field
          label={kloelT('Submensagem')}
          value={config.headerSubMessage}
          onChange={(v) => void patch({ headerSubMessage: v })}
          placeholder={kloelT('Complete sua compra')}
        />
      </div>

      {/* ── 4. Product ── */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>{kloelT('Produto')}</h3>
        <Field
          label={kloelT('Imagem do produto (URL)')}
          value={config.productImage}
          onChange={(v) => void patch({ productImage: v })}
          placeholder="https://..."
        />
        <Field
          label={kloelT('Nome de exibicao')}
          value={config.productDisplayName}
          onChange={(v) => void patch({ productDisplayName: v })}
          placeholder={kloelT('Produto Premium')}
        />
      </div>

      {/* ── 5. Buttons ── */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>{kloelT('Botoes')}</h3>
        <Field
          label={kloelT('Texto etapa 1')}
          value={config.btnStep1Text}
          onChange={(v) => void patch({ btnStep1Text: v })}
          placeholder={kloelT('Continuar')}
        />
        <Field
          label={kloelT('Texto etapa 2')}
          value={config.btnStep2Text}
          onChange={(v) => void patch({ btnStep2Text: v })}
          placeholder={kloelT('Continuar')}
        />
        <Field
          label={kloelT('Texto finalizar')}
          value={config.btnFinalizeText}
          onChange={(v) => void patch({ btnFinalizeText: v })}
          placeholder={kloelT('Finalizar Compra')}
        />
      </div>

      {/* ── 6. Fields ── */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>{kloelT('Campos')}</h3>
        <Toggle
          label={kloelT('Exigir CPF')}
          checked={config.requireCPF}
          onChange={(v) => void patch({ requireCPF: v })}
        />
        <Toggle
          label={kloelT('Exigir telefone')}
          checked={config.requirePhone}
          onChange={(v) => void patch({ requirePhone: v })}
        />
        <Field
          label={kloelT('Label do telefone')}
          value={config.phoneLabel}
          onChange={(v) => void patch({ phoneLabel: v })}
          placeholder={kloelT('WhatsApp')}
        />
      </div>

      {/* ── 7. Payment Methods ── */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>{kloelT('Metodos de Pagamento')}</h3>
        <Toggle
          label={kloelT('Cartao de Credito')}
          checked={config.enableCreditCard}
          onChange={(v) => void patch({ enableCreditCard: v })}
        />
        <Toggle
          label={kloelT('Pix')}
          checked={config.enablePix}
          onChange={(v) => void patch({ enablePix: v })}
        />
        <Toggle
          label={kloelT('Boleto')}
          checked={config.enableBoleto}
          onChange={(v) => void patch({ enableBoleto: v })}
        />
      </div>
    </>
  );
}
