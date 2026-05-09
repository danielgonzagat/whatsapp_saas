'use client';

import { kloelT } from '@/lib/i18n/t';
import type { CheckoutConfig } from '@/hooks/useCheckoutEditor';
import {
  Plus,
  Trash2,
} from 'lucide-react';
import { type CSSProperties, type RefObject, useId } from 'react';
import {
  C,
  Field,
  FONT,
  inputStyle,
  labelStyle,
  MONO,
  removeBtnStyle,
  sectionStyle,
  sectionTitleStyle,
  smallBtnStyle,
  Toggle,
} from './checkout-editor-shared';

export interface OrderConfirmationSectionProps {
  config: CheckoutConfig;
  patch: (p: Partial<CheckoutConfig>) => Promise<void>;
  highlightedSection: string | null;
  highlightActive: boolean;
  orderBumpsRef: RefObject<HTMLDivElement | null>;
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

export function OrderConfirmationSection({
  config,
  patch,
  highlightedSection,
  highlightActive,
  orderBumpsRef,
}: OrderConfirmationSectionProps) {
  const localFid = useId();

  return (
    <>
      {/* ── 14. Order Bumps ── */}
      <div ref={orderBumpsRef} style={sectionCardStyle('order-bump', highlightActive, highlightedSection)}>
        <h3 style={sectionTitleStyle}>{kloelT('Order Bumps')}</h3>
        {config.orderBumps.map((ob, i) => (
          <div
            key={ob.id}
            style={{
              marginBottom: 12,
              padding: 12,
              backgroundColor: C.elevated,
              borderRadius: 6,
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
                {kloelT('Bump')} {i + 1}
              </span>
              <button
                type="button"
                onClick={() => {
                  const next = [...config.orderBumps];
                  next.splice(i, 1);
                  void patch({ orderBumps: next });
                }}
                style={removeBtnStyle}
              >
                <Trash2 style={{ width: 12, height: 12 }} aria-hidden="true" />
              </button>
            </div>
            <Field
              label={kloelT('Titulo')}
              value={ob.title}
              onChange={(v) => {
                const next = [...config.orderBumps];
                next[i] = { ...next[i], title: v };
                void patch({ orderBumps: next });
              }}
              placeholder={kloelT('Adicione tambem...')}
            />
            <Field
              label={kloelT('Descricao')}
              value={ob.description}
              onChange={(v) => {
                const next = [...config.orderBumps];
                next[i] = { ...next[i], description: v };
                void patch({ orderBumps: next });
              }}
              placeholder={kloelT('Complemento ideal')}
              multiline
            />
            <Field
              label={kloelT('Nome do produto')}
              value={ob.productName}
              onChange={(v) => {
                const next = [...config.orderBumps];
                next[i] = { ...next[i], productName: v };
                void patch({ orderBumps: next });
              }}
              placeholder={kloelT('Produto Bump')}
            />
            <Field
              label={kloelT('Preco (R$)')}
              value={ob.price}
              onChange={(v) => {
                const next = [...config.orderBumps];
                next[i] = { ...next[i], price: Number.parseFloat(v) || 0 };
                void patch({ orderBumps: next });
              }}
              type="number"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            void patch({
              orderBumps: [
                ...config.orderBumps,
                { title: '', description: '', productName: '', price: 0 },
              ],
            })
          }
          style={smallBtnStyle}
        >
          <Plus style={{ width: 14, height: 14 }} aria-hidden="true" />
          {kloelT('Adicionar order bump')}
        </button>
      </div>

      {/* ── 15. Upsells ── */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>{kloelT('Upsells')}</h3>
        {config.upsells.map((us, i) => (
          <div
            key={us.id}
            style={{
              marginBottom: 12,
              padding: 12,
              backgroundColor: C.elevated,
              borderRadius: 6,
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
                {kloelT('Upsell')} {i + 1}
              </span>
              <button
                type="button"
                onClick={() => {
                  const next = [...config.upsells];
                  next.splice(i, 1);
                  void patch({ upsells: next });
                }}
                style={removeBtnStyle}
              >
                <Trash2 style={{ width: 12, height: 12 }} aria-hidden="true" />
              </button>
            </div>
            <Field
              label={kloelT('Titulo')}
              value={us.title}
              onChange={(v) => {
                const next = [...config.upsells];
                next[i] = { ...next[i], title: v };
                void patch({ upsells: next });
              }}
              placeholder={kloelT('Oferta especial')}
            />
            <Field
              label={kloelT('Descricao')}
              value={us.description}
              onChange={(v) => {
                const next = [...config.upsells];
                next[i] = { ...next[i], description: v };
                void patch({ upsells: next });
              }}
              placeholder={kloelT('Upgrade seu plano')}
              multiline
            />
            <Field
              label={kloelT('Nome do produto')}
              value={us.productName}
              onChange={(v) => {
                const next = [...config.upsells];
                next[i] = { ...next[i], productName: v };
                void patch({ upsells: next });
              }}
              placeholder={kloelT('Produto Upsell')}
            />
            <Field
              label={kloelT('Preco (R$)')}
              value={us.price}
              onChange={(v) => {
                const next = [...config.upsells];
                next[i] = { ...next[i], price: Number.parseFloat(v) || 0 };
                void patch({ upsells: next });
              }}
              type="number"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            void patch({
              upsells: [
                ...config.upsells,
                { title: '', description: '', productName: '', price: 0 },
              ],
            })
          }
          style={smallBtnStyle}
        >
          <Plus style={{ width: 14, height: 14 }} aria-hidden="true" />
          {kloelT('Adicionar upsell')}
        </button>
      </div>

      {/* ── 16. Exit Intent ── */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>{kloelT('Exit Intent')}</h3>
        <Toggle
          label={kloelT('Habilitar exit intent')}
          checked={config.enableExitIntent}
          onChange={(v) => void patch({ enableExitIntent: v })}
        />
        {config.enableExitIntent && (
          <>
            <Field
              label={kloelT('Titulo')}
              value={config.exitIntentTitle}
              onChange={(v) => void patch({ exitIntentTitle: v })}
              placeholder={kloelT('Espere! Temos uma oferta...')}
            />
            <Field
              label={kloelT('Codigo do cupom')}
              value={config.exitIntentCouponCode}
              onChange={(v) => void patch({ exitIntentCouponCode: v })}
              placeholder="VOLTE10"
            />
          </>
        )}
      </div>

      {/* ── 17. Floating Bar ── */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>{kloelT('Barra Flutuante')}</h3>
        <Toggle
          label={kloelT('Habilitar barra flutuante')}
          checked={config.enableFloatingBar}
          onChange={(v) => void patch({ enableFloatingBar: v })}
        />
        {config.enableFloatingBar && (
          <Field
            label={kloelT('Mensagem')}
            value={config.floatingBarMessage}
            onChange={(v) => void patch({ floatingBarMessage: v })}
            placeholder={kloelT('Oferta por tempo limitado!')}
          />
        )}
      </div>

      {/* ── 18. SEO ── */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>SEO</h3>
        <Field
          label={kloelT('Meta Title')}
          value={config.metaTitle}
          onChange={(v) => void patch({ metaTitle: v })}
          placeholder={kloelT('Titulo da pagina')}
        />
        <Field
          label={kloelT('Meta Description')}
          value={config.metaDescription}
          onChange={(v) => void patch({ metaDescription: v })}
          placeholder={kloelT('Descricao para mecanismos de busca')}
          multiline
        />
        <Field
          label={kloelT('Meta Image (URL)')}
          value={config.metaImage}
          onChange={(v) => void patch({ metaImage: v })}
          placeholder="https://..."
        />
      </div>

      {/* ── 19. Custom CSS ── */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>{kloelT('CSS Personalizado')}</h3>
        <textarea
          value={config.customCSS}
          onChange={(e) => void patch({ customCSS: e.target.value })}
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
        <h3 style={sectionTitleStyle}>{kloelT('Pixels de Rastreamento')}</h3>
        {config.pixels.map((px, i) => (
          <div
            key={px.id}
            style={{
              marginBottom: 12,
              padding: 12,
              backgroundColor: C.elevated,
              borderRadius: 6,
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
                {kloelT('Pixel')} {i + 1}
              </span>
              <button
                type="button"
                onClick={() => {
                  const next = [...config.pixels];
                  next.splice(i, 1);
                  void patch({ pixels: next });
                }}
                style={removeBtnStyle}
              >
                <Trash2 style={{ width: 12, height: 12 }} aria-hidden="true" />
              </button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle} htmlFor={`${localFid}-pixel-type-${i}`}>
                {kloelT('Tipo')}
              </label>
              <select
                value={px.type}
                onChange={(e) => {
                  const next = [...config.pixels];
                  next[i] = { ...next[i], type: e.target.value };
                  void patch({ pixels: next });
                }}
                style={{ ...inputStyle, cursor: 'pointer' }}
                id={`${localFid}-pixel-type-${i}`}
              >
                <option value="facebook">{kloelT('Facebook Pixel')}</option>
                <option value="google_analytics">{kloelT('Google Analytics')}</option>
                <option value="google_ads">{kloelT('Google Ads')}</option>
                <option value="tiktok">{kloelT('TikTok Pixel')}</option>
                <option value="custom">{kloelT('Personalizado')}</option>
              </select>
            </div>
            <Field
              label={kloelT('Pixel ID')}
              value={px.pixelId}
              onChange={(v) => {
                const next = [...config.pixels];
                next[i] = { ...next[i], pixelId: v };
                void patch({ pixels: next });
              }}
              placeholder="123456789"
            />
            <Field
              label={kloelT('Access Token (opcional)')}
              value={px.accessToken || ''}
              onChange={(v) => {
                const next = [...config.pixels];
                next[i] = { ...next[i], accessToken: v };
                void patch({ pixels: next });
              }}
              placeholder={kloelT('EAAxxxxxx...')}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            void patch({
              pixels: [...config.pixels, { type: 'facebook', pixelId: '' }],
            })
          }
          style={smallBtnStyle}
        >
          <Plus style={{ width: 14, height: 14 }} aria-hidden="true" />
          {kloelT('Adicionar pixel')}
        </button>
      </div>

      {/* Bottom spacer */}
      <div style={{ height: 40 }} />
    </>
  );
}
