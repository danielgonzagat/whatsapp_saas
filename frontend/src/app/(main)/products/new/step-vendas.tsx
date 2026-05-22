'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors, typography } from '@/lib/design-tokens';
import { MonitorInputField } from './monitor-input-field';
import { inputProps, monitorCard, selectStyle, monitorInput } from './shared-styles';
import {
  CHECKOUT_TYPE_OPTIONS,
  GUARANTEE_OPTIONS,
  PAYMENT_TYPE_OPTIONS,
  type StepCommonProps,
} from './types';

export function StepVendas({ form, updateForm }: StepCommonProps) {
  return (
    <div style={monitorCard}>
      <h2
        style={{
          fontSize: 18,
          fontWeight: 600,
          fontFamily: typography.fontFamily.display,
          color: colors.text.starlight,
          margin: '0 0 24px 0',
        }}
      >
        {kloelT('Configuracao de Vendas')}
      </h2>

      <MonitorInputField label={kloelT('Preco (R$) *')}>
        <div style={{ position: 'relative' }}>
          <span
            style={{
              position: 'absolute',
              left: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 14,
              fontWeight: 600,
              color: colors.text.dust,
            }}
          >
            {kloelT('R$')}
          </span>
          <input
            aria-label="Preco em reais"
            {...inputProps}
            style={{ ...monitorInput, paddingLeft: 44 }}
            type="number"
            step="0.01"
            min="0"
            value={form.price}
            onChange={(e) => updateForm({ price: e.target.value })}
            placeholder="0,00"
          />
        </div>
      </MonitorInputField>

      <MonitorInputField label={kloelT('Tipo de pagamento *')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'var(--pg3)', gap: 12 }}>
          {PAYMENT_TYPE_OPTIONS.map((opt) => {
            const selected = form.paymentType === opt.value;
            return (
              <button
                type="button"
                key={opt.value}
                onClick={() => updateForm({ paymentType: opt.value })}
                style={{
                  background: selected ? 'rgba(232, 93, 48, 0.08)' : colors.background.nebula,
                  border: `1.5px solid ${selected ? colors.accent.webb : colors.border.space}`,
                  borderRadius: 6,
                  padding: '14px 12px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 150ms ease',
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: typography.fontFamily.display,
                    color: selected ? colors.accent.webb : colors.text.moonlight,
                    display: 'block',
                  }}
                >
                  {opt.label}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: colors.text.dust,
                    display: 'block',
                    marginTop: 2,
                  }}
                >
                  {opt.desc}
                </span>
              </button>
            );
          })}
        </div>
      </MonitorInputField>

      <MonitorInputField
        label={kloelT('Comissao de afiliado (%)')}
        hint={kloelT('De 0 a 100%')}
      >
        <input
          {...inputProps}
          type="number"
          min="0"
          max="100"
          value={form.affiliateCommission}
          onChange={(e) => updateForm({ affiliateCommission: e.target.value })}
          placeholder="0"
        />
      </MonitorInputField>

      <MonitorInputField label={kloelT('URL da pagina de vendas')}>
        <input
          {...inputProps}
          value={form.salesPageUrl}
          onChange={(e) => updateForm({ salesPageUrl: e.target.value })}
          placeholder="https://..."
        />
      </MonitorInputField>

      <MonitorInputField label={kloelT('Periodo de garantia')}>
        <select
          style={selectStyle}
          onFocus={inputProps.onFocus}
          onBlur={inputProps.onBlur}
          value={form.guaranteeDays}
          onChange={(e) => updateForm({ guaranteeDays: e.target.value })}
        >
          {GUARANTEE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </MonitorInputField>

      <MonitorInputField label={kloelT('Tipo de checkout')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'var(--pg2)', gap: 12 }}>
          {CHECKOUT_TYPE_OPTIONS.map((opt) => {
            const selected = form.checkoutType === opt.value;
            return (
              <button
                type="button"
                key={opt.value}
                onClick={() => updateForm({ checkoutType: opt.value })}
                style={{
                  background: selected ? 'rgba(232, 93, 48, 0.08)' : colors.background.nebula,
                  border: `1.5px solid ${selected ? colors.accent.webb : colors.border.space}`,
                  borderRadius: 6,
                  padding: '14px 12px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 150ms ease',
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: typography.fontFamily.display,
                    color: selected ? colors.accent.webb : colors.text.moonlight,
                  }}
                >
                  {opt.label}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: colors.text.dust,
                    display: 'block',
                    marginTop: 2,
                  }}
                >
                  {opt.desc}
                </span>
              </button>
            );
          })}
        </div>
      </MonitorInputField>

      <div
        style={{
          marginTop: 20,
          padding: 20,
          borderRadius: 6,
          backgroundColor: colors.background.nebula,
          border: `1px solid ${colors.border.space}`,
        }}
      >
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            fontFamily: typography.fontFamily.display,
            color: colors.text.starlight,
            marginBottom: 16,
          }}
        >
          {kloelT('Pixels de rastreamento')}
        </h3>

        <MonitorInputField label={kloelT('Facebook Pixel ID')}>
          <input
            {...inputProps}
            value={form.facebookPixelId}
            onChange={(e) => updateForm({ facebookPixelId: e.target.value })}
            placeholder="123456789012345"
          />
        </MonitorInputField>

        <MonitorInputField label={kloelT('Google Tag Manager ID')}>
          <input
            {...inputProps}
            value={form.googleTagManagerId}
            onChange={(e) => updateForm({ googleTagManagerId: e.target.value })}
            placeholder={kloelT('GTM-XXXXXXX')}
          />
        </MonitorInputField>
      </div>
    </div>
  );
}
