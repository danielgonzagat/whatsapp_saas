'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors, typography } from '@/lib/design-tokens';
import { MonitorInputField } from './monitor-input-field';
import { monitorCard, selectStyle } from './shared-styles';
import {
  CARRIERS,
  DISPATCH_TIMES,
  SHIPPING_RESPONSIBLE_OPTIONS,
  type StepCommonProps,
} from './types';

interface StepEntregaProps extends StepCommonProps {
  onCarrierToggle: (carrier: string) => void;
}

export function StepEntrega({ form, updateForm, onCarrierToggle }: StepEntregaProps) {
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
        {kloelT('Entrega')}
      </h2>

      <MonitorInputField label={kloelT('Quem realiza o envio? *')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'var(--pg2)', gap: 12 }}>
          {SHIPPING_RESPONSIBLE_OPTIONS.map((opt) => {
            const selected = form.shippingResponsible === opt.value;
            return (
              <button
                type="button"
                key={opt.value}
                onClick={() => updateForm({ shippingResponsible: opt.value })}
                style={{
                  background: selected ? 'rgba(232, 93, 48, 0.08)' : colors.background.nebula,
                  border: `1.5px solid ${selected ? colors.accent.webb : colors.border.space}`,
                  borderRadius: 6,
                  padding: '14px 12px',
                  cursor: 'pointer',
                  textAlign: 'left',
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

      <MonitorInputField label={kloelT('Prazo de despacho')}>
        <select
          style={selectStyle}
          onFocus={(e) => {
            e.target.style.borderColor = colors.accent.webb;
          }}
          onBlur={(e) => {
            e.target.style.borderColor = colors.border.space;
            e.target.style.boxShadow = 'none';
          }}
          value={form.dispatchTime}
          onChange={(e) => updateForm({ dispatchTime: e.target.value })}
        >
          {DISPATCH_TIMES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </MonitorInputField>

      <MonitorInputField label={kloelT('Transportadoras disponiveis')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'var(--pg2)', gap: 8 }}>
          {CARRIERS.map((carrier) => {
            const checked = form.carriers.includes(carrier);
            return (
              <label
                key={carrier}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  borderRadius: 6,
                  backgroundColor: checked
                    ? 'rgba(232, 93, 48, 0.06)'
                    : colors.background.nebula,
                  border: `1px solid ${checked ? colors.accent.webb : colors.border.space}`,
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                <input
                  aria-label={carrier}
                  type="checkbox"
                  checked={checked}
                  onChange={() => onCarrierToggle(carrier)}
                  style={{ accentColor: colors.accent.webb }}
                />
                <span
                  style={{
                    fontSize: 13,
                    fontFamily: typography.fontFamily.sans,
                    color: checked ? colors.text.starlight : colors.text.moonlight,
                    fontWeight: checked ? 500 : 400,
                  }}
                >
                  {carrier}
                </span>
              </label>
            );
          })}
        </div>
      </MonitorInputField>
    </div>
  );
}
