'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors, typography } from '@/lib/design-tokens';
import { MonitorInputField } from './monitor-input-field';
import { inputProps, monitorCard } from './shared-styles';
import { APPROVAL_MODE_OPTIONS, type StepCommonProps } from './types';

export function StepAfiliacao({ form, updateForm }: StepCommonProps) {
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
        {kloelT('Programa de Afiliados')}
      </h2>

      <MonitorInputField label={kloelT('Habilitar afiliados')}>
        <button
          type="button"
          onClick={() => updateForm({ affiliatesEnabled: !form.affiliatesEnabled })}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 18px',
            borderRadius: 6,
            backgroundColor: form.affiliatesEnabled
              ? 'rgba(224, 221, 216, 0.08)'
              : colors.background.nebula,
            border: `1.5px solid ${form.affiliatesEnabled ? colors.state.success : colors.border.space}`,
            cursor: 'pointer',
            width: '100%',
            transition: 'all 150ms ease',
          }}
        >
          <div
            style={{
              width: 44,
              height: 24,
              borderRadius: 6,
              backgroundColor: form.affiliatesEnabled ? colors.state.success : colors.border.space,
              position: 'relative',
              flexShrink: 0,
              transition: 'background-color 150ms ease',
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                backgroundColor: 'var(--app-text-on-accent)',
                position: 'absolute',
                top: 3,
                left: form.affiliatesEnabled ? 23 : 3,
                transition: 'left 150ms ease',
              }}
            />
          </div>
          <span
            style={{
              fontSize: 14,
              fontFamily: typography.fontFamily.sans,
              color: form.affiliatesEnabled ? colors.state.success : colors.text.moonlight,
              fontWeight: 500,
            }}
          >
            {form.affiliatesEnabled ? 'Afiliados habilitados' : 'Afiliados desabilitados'}
          </span>
        </button>
      </MonitorInputField>

      {form.affiliatesEnabled && (
        <>
          <MonitorInputField
            label={kloelT('Comissao do afiliado (%)')}
            hint={kloelT('Percentual sobre cada venda')}
          >
            <input
              {...inputProps}
              type="number"
              min="0"
              max="100"
              value={form.affiliateCommissionPercent}
              onChange={(e) => updateForm({ affiliateCommissionPercent: e.target.value })}
              placeholder="0"
            />
          </MonitorInputField>

          <MonitorInputField label={kloelT('Modo de aprovacao')}>
            <div style={{ display: 'grid', gridTemplateColumns: 'var(--pg2)', gap: 12 }}>
              {APPROVAL_MODE_OPTIONS.map((opt) => {
                const selected = form.affiliateApprovalMode === opt.value;
                return (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => updateForm({ affiliateApprovalMode: opt.value })}
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
        </>
      )}
    </div>
  );
}
