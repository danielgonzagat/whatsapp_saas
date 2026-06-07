'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors, typography } from '@/lib/design-tokens';
import { MonitorInputField } from './monitor-input-field';
import { inputProps, monitorCard, selectStyle } from './shared-styles';
import { PACKAGE_TYPES, type StepCommonProps } from './types';

export function StepEmbalagem({ form, updateForm }: StepCommonProps) {
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
          id="product-package-type"
          name="productPackageType"
          aria-label={kloelT('Tipo de embalagem')}
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
              htmlFor="product-package-width"
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
              id="product-package-width"
              name="productPackageWidth"
              {...inputProps}
              type="text"
              inputMode="decimal"
              value={form.width}
              onChange={(e) => updateForm({ width: e.target.value })}
              placeholder="0"
            />
          </div>
          <div>
            <label
              htmlFor="product-package-height"
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
              id="product-package-height"
              name="productPackageHeight"
              aria-label="Altura em cm"
              {...inputProps}
              type="text"
              inputMode="decimal"
              value={form.height}
              onChange={(e) => updateForm({ height: e.target.value })}
              placeholder="0"
            />
          </div>
          <div>
            <label
              htmlFor="product-package-depth"
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
              id="product-package-depth"
              name="productPackageDepth"
              aria-label="Profundidade em cm"
              {...inputProps}
              type="text"
              inputMode="decimal"
              value={form.depth}
              onChange={(e) => updateForm({ depth: e.target.value })}
              placeholder="0"
            />
          </div>
        </div>
      </MonitorInputField>

      <MonitorInputField label={kloelT('Peso (kg)')}>
        <input
          id="product-package-weight"
          name="productPackageWeight"
          aria-label={kloelT('Peso em kg')}
          {...inputProps}
          type="text"
          inputMode="decimal"
          value={form.weight}
          onChange={(e) => updateForm({ weight: e.target.value })}
          placeholder="0,00"
        />
      </MonitorInputField>
    </div>
  );
}
