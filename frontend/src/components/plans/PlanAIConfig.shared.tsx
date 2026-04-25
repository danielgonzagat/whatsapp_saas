'use client';
/**
 * PlanAIConfig.shared.tsx
 *
 * Canonical primitives shared across all PlanAIConfig section files.
 * Extracts the repeated card-shell, checkbox/radio-item, and checkbox-arg-row
 * patterns to eliminate clone clusters detected by Codacy.
 */

import { colors, typography } from '@/lib/design-tokens';
import type * as React from 'react';

// ---------------------------------------------------------------------------
// Shared style constants — consumed by section files directly instead of
// being drilled as props from PlanAIConfigTab.
// ---------------------------------------------------------------------------

export const PLAN_AI_LABEL_STYLE: React.CSSProperties = {
  fontFamily: typography.fontFamily.display,
  fontSize: '11px',
  fontWeight: 600,
  color: colors.text.dust,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
};

export const PLAN_AI_CARD_STYLE: React.CSSProperties = {
  background: colors.background.space,
  border: `1px solid ${colors.border.space}`,
  borderRadius: '6px',
};

export const PLAN_AI_INPUT_STYLE: React.CSSProperties = {
  background: colors.background.nebula,
  border: `1px solid ${colors.border.space}`,
  color: colors.text.starlight,
  borderRadius: '6px',
};

export const PLAN_AI_SELECT_CLASS = 'w-full rounded-lg px-3 py-2 text-sm focus:outline-none';

// ---------------------------------------------------------------------------
// PlanAIConfigSectionShell
// Wraps section body content with the canonical card chrome (rounded-xl p-5).
// ---------------------------------------------------------------------------

export function PlanAIConfigSectionShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5" style={PLAN_AI_CARD_STYLE}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CheckboxItem
// A single checkbox (or radio) with a labelled text, used heavily across
// customer-profile, positioning, upsell, and tech-info sections.
// ---------------------------------------------------------------------------

interface CheckboxItemProps {
  id: string;
  type?: 'checkbox' | 'radio';
  name?: string;
  checked: boolean;
  onChange: () => void;
  label: string;
}

export function CheckboxItem({
  id,
  type = 'checkbox',
  name,
  checked,
  onChange,
  label,
}: CheckboxItemProps) {
  return (
    <label
      htmlFor={id}
      className="flex items-center gap-1.5 text-sm cursor-pointer"
      style={{ color: colors.text.starlight }}
    >
      <input
        id={id}
        type={type}
        name={name}
        checked={checked}
        onChange={onChange}
        style={{ accentColor: colors.accent.webb }}
      />
      {label}
    </label>
  );
}

// ---------------------------------------------------------------------------
// CheckboxArgRow
// A checkbox row that optionally reveals a numeric input when an item
// containing a placeholder "X" is selected. Used 4× in SalesArgsSection.
// ---------------------------------------------------------------------------

import { B_X_B_RE } from './PlanAIConfig.data';

interface CheckboxArgRowProps {
  item: string;
  checked: boolean;
  value: string;
  onToggle: () => void;
  onValueChange: (v: string) => void;
  inputStyle: React.CSSProperties;
}

export function CheckboxArgRow({
  item,
  checked,
  value,
  onToggle,
  onValueChange,
  inputStyle,
}: CheckboxArgRowProps) {
  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <label
        className="flex items-center gap-1.5 text-sm cursor-pointer"
        style={{ color: colors.text.starlight }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          style={{ accentColor: colors.accent.webb }}
        />
        {item}
      </label>
      {checked && B_X_B_RE.test(item) && (
        <input
          aria-label={`Quantidade: ${item}`}
          type="number"
          placeholder="X"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          className="ml-2 w-20 rounded px-2 py-0.5 text-xs focus:outline-none"
          style={inputStyle}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CheckboxArgSection
// A labelled group of CheckboxArgRows — used 4× inside SalesArgsSection.
// ---------------------------------------------------------------------------

interface CheckboxArgSectionProps {
  title: string;
  items: string[];
  selected: string[];
  values: Record<string, string>;
  inputStyle: React.CSSProperties;
  onToggle: (item: string) => void;
  onValueChange: (item: string, v: string) => void;
}

export function CheckboxArgSection({
  title,
  items,
  selected,
  values,
  inputStyle,
  onToggle,
  onValueChange,
}: CheckboxArgSectionProps) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold" style={{ color: colors.accent.webb }}>
        {title}
      </p>
      {items.map((item) => (
        <CheckboxArgRow
          key={item}
          item={item}
          checked={selected.includes(item)}
          value={values[item] ?? ''}
          onToggle={() => onToggle(item)}
          onValueChange={(v) => onValueChange(item, v)}
          inputStyle={inputStyle}
        />
      ))}
    </div>
  );
}
