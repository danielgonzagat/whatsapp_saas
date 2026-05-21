'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors, typography } from '@/lib/design-tokens';
import { MonitorInputField } from './monitor-input-field';
import { inputProps, monitorCard, selectStyle } from './shared-styles';
import { BILLING_TYPE_OPTIONS, type StepCommonProps } from './types';

export function StepPagamento({ form, updateForm }: StepCommonProps) {
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
        {kloelT('Pagamento')}
      </h2>

      <MonitorInputField label={kloelT('Tipo de cobranca *')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'var(--pg3)', gap: 12 }}>
          {BILLING_TYPE_OPTIONS.map((opt) => {
            const selected = form.billingType === opt.value;
            return (
              <button
                type="button"
                key={opt.value}
                onClick={() => updateForm({ billingType: opt.value })}
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

      {form.billingType !== 'free' && (
        <>
          <MonitorInputField label={kloelT('Maximo de parcelas')}>
            <select
              style={selectStyle}
              onFocus={inputProps.onFocus}
              onBlur={inputProps.onBlur}
              value={form.maxInstallments}
              onChange={(e) => updateForm({ maxInstallments: e.target.value })}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={String(n)}>
                  {n}x
                </option>
              ))}
            </select>
          </MonitorInputField>

          <MonitorInputField label={kloelT('Parcelas sem juros')}>
            <select
              style={selectStyle}
              onFocus={inputProps.onFocus}
              onBlur={inputProps.onBlur}
              value={form.interestFreeInstallments}
              onChange={(e) => updateForm({ interestFreeInstallments: e.target.value })}
            >
              {Array.from(
                { length: Number.parseInt(form.maxInstallments, 10) || 12 },
                (_, i) => i + 1,
              ).map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                  {kloelT('x sem juros')}
                </option>
              ))}
            </select>
          </MonitorInputField>
        </>
      )}
    </div>
  );
}
