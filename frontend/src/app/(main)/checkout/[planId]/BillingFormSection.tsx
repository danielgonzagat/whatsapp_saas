'use client';

import { kloelT } from '@/lib/i18n/t';
import type { CheckoutConfig } from '@/hooks/useCheckoutEditor';
import {
  Plus,
  Star,
  Trash2,
} from 'lucide-react';
import { type CSSProperties, type RefObject, useId } from 'react';
import {
  C,
  Field,
  FONT,
  inputStyle,
  labelStyle,
  removeBtnStyle,
  sectionStyle,
  sectionTitleStyle,
  smallBtnStyle,
  Toggle,
} from './checkout-editor-shared';

export interface BillingFormSectionProps {
  config: CheckoutConfig;
  patch: (p: Partial<CheckoutConfig>) => Promise<void>;
  highlightedSection: string | null;
  highlightActive: boolean;
  couponRef: RefObject<HTMLDivElement | null>;
  timerRef: RefObject<HTMLDivElement | null>;
  stockRef: RefObject<HTMLDivElement | null>;
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

export function BillingFormSection({
  config,
  patch,
  highlightedSection,
  highlightActive,
  couponRef,
  timerRef,
  stockRef,
}: BillingFormSectionProps) {
  const localFid = useId();

  return (
    <>
      {/* ── 8. Coupon Popup ── */}
      <div ref={couponRef} style={sectionCardStyle('coupon', highlightActive, highlightedSection)}>
        <h3 style={sectionTitleStyle}>{kloelT('Popup de Cupom')}</h3>
        <Toggle
          label={kloelT('Habilitar cupom')}
          checked={config.enableCoupon}
          onChange={(v) => void patch({ enableCoupon: v })}
        />
        <Toggle
          label={kloelT('Exibir popup de cupom')}
          checked={config.showCouponPopup}
          onChange={(v) => void patch({ showCouponPopup: v })}
        />
        {config.showCouponPopup && (
          <>
            <Field
              label={kloelT('Titulo do popup')}
              value={config.couponPopupTitle}
              onChange={(v) => void patch({ couponPopupTitle: v })}
              placeholder={kloelT('Oferta Especial!')}
            />
            <Field
              label={kloelT('Descricao do popup')}
              value={config.couponPopupDesc}
              onChange={(v) => void patch({ couponPopupDesc: v })}
              placeholder={kloelT('Use o cupom abaixo')}
              multiline
            />
            <Field
              label={kloelT('Codigo do cupom automatico')}
              value={config.autoCouponCode}
              onChange={(v) => void patch({ autoCouponCode: v })}
              placeholder="DESCONTO10"
            />
          </>
        )}
      </div>

      {/* ── 9. Timer ── */}
      <div ref={timerRef} style={sectionCardStyle('urgency', highlightActive, highlightedSection)}>
        <h3 style={sectionTitleStyle}>{kloelT('Timer')}</h3>
        <Toggle
          label={kloelT('Habilitar timer')}
          checked={config.enableTimer}
          onChange={(v) => void patch({ enableTimer: v })}
        />
        {config.enableTimer && (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle} htmlFor={`${localFid}-timer-type`}>
                {kloelT('Tipo')}
              </label>
              <select
                value={config.timerType}
                onChange={(e) => void patch({ timerType: e.target.value })}
                style={{ ...inputStyle, cursor: 'pointer' }}
                id={`${localFid}-timer-type`}
              >
                <option value="countdown">{kloelT('Contagem regressiva')}</option>
                <option value="evergreen">{kloelT('Evergreen')}</option>
                <option value="fixed">{kloelT('Data fixa')}</option>
              </select>
            </div>
            <Field
              label={kloelT('Minutos')}
              value={config.timerMinutes}
              onChange={(v) => void patch({ timerMinutes: Number.parseInt(v, 10) || 0 })}
              type="number"
            />
            <Field
              label={kloelT('Mensagem')}
              value={config.timerMessage}
              onChange={(v) => void patch({ timerMessage: v })}
              placeholder={kloelT('Oferta expira em:')}
            />
          </>
        )}
      </div>

      {/* ── 10. Stock Counter ── */}
      <div ref={stockRef} style={sectionCardStyle('urgency', highlightActive, highlightedSection)}>
        <h3 style={sectionTitleStyle}>{kloelT('Contador de Estoque')}</h3>
        <Toggle
          label={kloelT('Exibir contador')}
          checked={config.showStockCounter}
          onChange={(v) => void patch({ showStockCounter: v })}
        />
        {config.showStockCounter && (
          <>
            <Field
              label={kloelT('Mensagem')}
              value={config.stockMessage}
              onChange={(v) => void patch({ stockMessage: v })}
              placeholder={kloelT('Apenas {count} unidades restantes!')}
            />
            <Field
              label={kloelT('Quantidade ficticia')}
              value={config.fakeStockCount}
              onChange={(v) => void patch({ fakeStockCount: Number.parseInt(v, 10) || 0 })}
              type="number"
            />
          </>
        )}
      </div>

      {/* ── 11. Testimonials ── */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>{kloelT('Depoimentos')}</h3>
        {config.testimonials.map((t, i) => (
          <div
            key={t.name}
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
                {kloelT('Depoimento')} {i + 1}
              </span>
              <button
                type="button"
                onClick={() => {
                  const next = [...config.testimonials];
                  next.splice(i, 1);
                  void patch({ testimonials: next });
                }}
                style={removeBtnStyle}
              >
                <Trash2 style={{ width: 12, height: 12 }} aria-hidden="true" />
              </button>
            </div>
            <Field
              label={kloelT('Nome')}
              value={t.name}
              onChange={(v) => {
                const next = [...config.testimonials];
                next[i] = { ...next[i], name: v };
                void patch({ testimonials: next });
              }}
              placeholder={kloelT('Maria S.')}
            />
            <Field
              label={kloelT('Texto')}
              value={t.text}
              onChange={(v) => {
                const next = [...config.testimonials];
                next[i] = { ...next[i], text: v };
                void patch({ testimonials: next });
              }}
              placeholder={kloelT('Produto incrivel!')}
              multiline
            />
            <div style={{ marginBottom: 12 }}>
              <span style={labelStyle}>{kloelT('Estrelas')}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => {
                      const next = [...config.testimonials];
                      next[i] = { ...next[i], stars: s };
                      void patch({ testimonials: next });
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
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            void patch({
              testimonials: [...config.testimonials, { name: '', text: '', stars: 5 }],
            })
          }
          style={smallBtnStyle}
        >
          <Plus style={{ width: 14, height: 14 }} aria-hidden="true" />
          {kloelT('Adicionar depoimento')}
        </button>
      </div>

      {/* ── 12. Guarantee ── */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>{kloelT('Garantia')}</h3>
        <Toggle
          label={kloelT('Habilitar garantia')}
          checked={config.enableGuarantee}
          onChange={(v) => void patch({ enableGuarantee: v })}
        />
        {config.enableGuarantee && (
          <>
            <Field
              label={kloelT('Titulo')}
              value={config.guaranteeTitle}
              onChange={(v) => void patch({ guaranteeTitle: v })}
              placeholder={kloelT('Garantia incondicional')}
            />
            <Field
              label={kloelT('Texto')}
              value={config.guaranteeText}
              onChange={(v) => void patch({ guaranteeText: v })}
              placeholder={kloelT('Devolvemos seu dinheiro...')}
              multiline
            />
            <Field
              label={kloelT('Dias')}
              value={config.guaranteeDays}
              onChange={(v) => void patch({ guaranteeDays: Number.parseInt(v, 10) || 0 })}
              type="number"
            />
          </>
        )}
      </div>

      {/* ── 13. Trust Badges ── */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>{kloelT('Selos de Confianca')}</h3>
        <Toggle
          label={kloelT('Habilitar selos')}
          checked={config.enableTrustBadges}
          onChange={(v) => void patch({ enableTrustBadges: v })}
        />
        {config.enableTrustBadges && (
          <>
            {config.trustBadges.map((b, i) => (
              <div
                key={`trust-badge-${b.label.trim()}`}
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
                    void patch({ trustBadges: next });
                  }}
                  placeholder={kloelT('Compra Segura')}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = [...config.trustBadges];
                    next.splice(i, 1);
                    void patch({ trustBadges: next });
                  }}
                  style={removeBtnStyle}
                >
                  <Trash2 style={{ width: 12, height: 12 }} aria-hidden="true" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                void patch({
                  trustBadges: [...config.trustBadges, { label: '' }],
                })
              }
              style={smallBtnStyle}
            >
              <Plus style={{ width: 14, height: 14 }} aria-hidden="true" />
              {kloelT('Adicionar selo')}
            </button>
          </>
        )}
      </div>
    </>
  );
}
