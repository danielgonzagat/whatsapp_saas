'use client';

import { useId } from 'react';
import { kloelT } from '@/lib/i18n/t';
import { colors, typography } from '@/lib/design-tokens';
import { MonitorInputField } from './monitor-input-field';
import { inputProps, monitorCard, selectStyle } from './shared-styles';
import { PACKAGE_TYPES, type StepCommonProps } from './types';

export function StepEmbalagem({ form, updateForm }: StepCommonProps) {
  const uid = useId();

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
        {kloelT('Embalagem')}
      </h2>

      <MonitorInputField label={kloelT('Tipo de embalagem')}>
        <select
          style={selectStyle}
          onFocus={inputProps.onFocus}
          onBlur={inputProps.onBlur}
          value={form.packageType}
          onChange={(e) => updateForm({ packageType: e.target.value })}
        >
          <option value="">{kloelT('Selecione...')}</option>
          {PACKAGE_TYPES.map((pt) => (
            <option key={pt} value={pt}>
              {pt}
            </option>
          ))}
        </select>
      </MonitorInputField>

      <MonitorInputField label={kloelT('Dimensoes (cm)')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'var(--pg3)', gap: 12 }}>
          <div>
            <label
              htmlFor={`${uid}-width`}
              style={{
                fontSize: 11,
                color: colors.text.dust,
                marginBottom: 4,
                display: 'block',
              }}
            >
              {kloelT('Largura')}
            </label>
            <input
              id={`${uid}-width`}
              {...inputProps}
              type="number"
              min="0"
              step="0.1"
              value={form.width}
              onChange={(e) => updateForm({ width: e.target.value })}
              placeholder="0"
            />
          </div>
          <div>
            <label
              htmlFor={`${uid}-height`}
              style={{
                fontSize: 11,
                color: colors.text.dust,
                marginBottom: 4,
                display: 'block',
              }}
            >
              {kloelT('Altura')}
            </label>
            <input
              id={`${uid}-height`}
              aria-label="Altura em cm"
              {...inputProps}
              type="number"
              min="0"
              step="0.1"
              value={form.height}
              onChange={(e) => updateForm({ height: e.target.value })}
              placeholder="0"
            />
          </div>
          <div>
            <label
              htmlFor={`${uid}-depth`}
              style={{
                fontSize: 11,
                color: colors.text.dust,
                marginBottom: 4,
                display: 'block',
              }}
            >
              {kloelT('Profundidade')}
            </label>
            <input
              id={`${uid}-depth`}
              aria-label="Profundidade em cm"
              {...inputProps}
              type="number"
              min="0"
              step="0.1"
              value={form.depth}
              onChange={(e) => updateForm({ depth: e.target.value })}
              placeholder="0"
            />
          </div>
        </div>
      </MonitorInputField>

      <MonitorInputField label={kloelT('Peso (kg)')}>
        <input
          {...inputProps}
          type="number"
          min="0"
          step="0.01"
          value={form.weight}
          onChange={(e) => updateForm({ weight: e.target.value })}
          placeholder="0,00"
        />
      </MonitorInputField>
    </div>
  );
}
